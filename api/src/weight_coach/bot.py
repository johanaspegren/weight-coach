"""Discord bot for weight-coach.

Runs as its own process. Talks to the SQLite DB and the meal estimator
directly (same codebase, no HTTP round-trip). Restricts every interaction
to a single Discord user ID; ignores everyone else.

Slash commands:
  /weight <kg> [waist_cm]
  /workout <kind> <duration_min> [kcal] [notes]
  /status
  /log <freetext>

Meal logs get parsed by the estimator; the bot posts the numbers with
Confirm / Edit buttons before writing.
"""
from __future__ import annotations

# TLS trust must be patched BEFORE aiohttp / discord.py are imported, otherwise
# aiohttp caches an ssl.SSLContext that doesn't know about Zscaler's CA.
from . import http as _http

_http.install()

import asyncio
import json
import logging
import ssl
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo

import aiohttp
import discord
import truststore
from discord import app_commands
from discord.ext import tasks

from .config import settings
from .db import connect, migrate
from .providers import estimator
from .routes.meals import _resum_daily_kcal_in
from .routes.workouts import _refresh_kcal_out_if_no_oura

log = logging.getLogger(__name__)

TZ = ZoneInfo("Europe/Stockholm")
CHECKIN_HOUR = settings.checkin_hour
CHECKIN_MINUTE = settings.checkin_minute


def _authorised(interaction: discord.Interaction) -> bool:
    """Only the whitelisted user may use the bot."""
    return str(interaction.user.id) == settings.discord_user_id


async def _deny(interaction: discord.Interaction) -> None:
    await interaction.response.send_message(
        "This bot is single-user. Not for you.", ephemeral=True
    )


# ─────────────────────── DB helpers (reused by commands) ───────────────────────


def _today_iso() -> str:
    return datetime.now(TZ).date().isoformat()


def _summary() -> dict:
    """Compute today's headline numbers without spinning up the API."""
    with connect() as c:
        rows = c.execute(
            "SELECT * FROM daily WHERE date >= ? ORDER BY date ASC",
            (settings.program_start,),
        ).fetchall()
        wo_rows = c.execute(
            "SELECT date, COALESCE(SUM(kcal_burn), 0) AS s FROM workouts "
            "WHERE date >= ? GROUP BY date",
            (settings.program_start,),
        ).fetchall()
    workouts_by_date = {r["date"]: int(r["s"]) for r in wo_rows}

    def kcal_out(r):
        stored = r["kcal_out_est"]
        if stored is not None:
            return stored
        wo = workouts_by_date.get(r["date"], 0)
        return settings.bmr_kcal + wo if wo else None

    if not rows:
        return {"days": 0}
    today = rows[-1]
    today_out = kcal_out(today)
    today_in = today["kcal_in_est"]
    today_net = None if (today_in is None or today_out is None) else today_in - today_out
    cum = 0
    for r in rows:
        out = kcal_out(r)
        if r["kcal_in_est"] is not None and out is not None:
            cum += r["kcal_in_est"] - out
    return {
        "days": len(rows),
        "weight_kg": today["weight_kg"],
        "kcal_in": today_in,
        "kcal_out": today_out,
        "net": today_net,
        "cum": cum,
        "predicted_kg": round(cum / 7700.0, 2),
    }


def _upsert_weight(day: str, kg: float, waist_cm: float | None) -> None:
    with connect() as c:
        c.execute(
            """
            INSERT INTO daily (date, weight_kg, waist_cm)
            VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                weight_kg = excluded.weight_kg,
                waist_cm = COALESCE(excluded.waist_cm, daily.waist_cm)
            """,
            (day, kg, waist_cm),
        )


def _insert_workout(day: str, kind: str, minutes: int, kcal: int | None, notes: str | None) -> None:
    with connect() as c:
        c.execute(
            """
            INSERT INTO workouts (date, source, kind, duration_min, kcal_burn, avg_hr, notes, created_at)
            VALUES (?, 'discord', ?, ?, ?, NULL, ?, ?)
            """,
            (day, kind, minutes, kcal, notes, datetime.utcnow().isoformat()),
        )
        _refresh_kcal_out_if_no_oura(c, day)


def _insert_meal(day: str, category: str, description: str, est: dict) -> int:
    template_id = estimator.bump_template(
        description, est.get("kcal"), est.get("protein_g"),
        est.get("carbs_g"), est.get("fat_g"), est.get("food_groups"),
    )
    with connect() as c:
        cur = c.execute(
            """
            INSERT INTO meals
                (date, source, category, raw_text, kcal, protein_g, carbs_g, fat_g,
                 food_groups, template_id, created_at)
            VALUES (?, 'discord', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (day, category, description, est.get("kcal"), est.get("protein_g"),
             est.get("carbs_g"), est.get("fat_g"), est.get("food_groups"),
             template_id, datetime.utcnow().isoformat()),
        )
        meal_id = cur.lastrowid
        _resum_daily_kcal_in(c, day)
    return meal_id


# ─────────────────────────── Meal confirmation UI ──────────────────────────────


class MealConfirmView(discord.ui.View):
    def __init__(self, user_id: int, day: str, description: str, est: dict, category: str):
        super().__init__(timeout=300)
        self.user_id = user_id
        self.day = day
        self.description = description
        self.est = est
        self.category = category

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        return interaction.user.id == self.user_id

    @discord.ui.button(label="Confirm", style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        _insert_meal(self.day, self.category, self.description, self.est)
        for b in self.children:
            b.disabled = True
        s = _summary()
        await interaction.response.edit_message(
            content=f"✅ Logged **{self.est.get('kcal','?')} kcal** — today's In: {s.get('kcal_in') or '—'} kcal.",
            view=self,
        )

    @discord.ui.button(label="Edit kcal", style=discord.ButtonStyle.secondary)
    async def edit(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(MealEditModal(self))


class MealEditModal(discord.ui.Modal, title="Adjust meal"):
    def __init__(self, view: MealConfirmView):
        super().__init__()
        self.view = view
        self.kcal = discord.ui.TextInput(
            label="kcal", default=str(view.est.get("kcal") or ""), required=True, max_length=5,
        )
        self.protein = discord.ui.TextInput(
            label="Protein (g)", default=str(view.est.get("protein_g") or ""), required=False, max_length=5,
        )
        self.add_item(self.kcal)
        self.add_item(self.protein)

    async def on_submit(self, interaction: discord.Interaction):
        try:
            self.view.est["kcal"] = int(self.kcal.value)
            if self.protein.value:
                self.view.est["protein_g"] = float(self.protein.value)
        except ValueError:
            await interaction.response.send_message("Numbers only.", ephemeral=True)
            return
        _insert_meal(self.view.day, self.view.category, self.view.description, self.view.est)
        for b in self.view.children:
            b.disabled = True
        s = _summary()
        await interaction.response.edit_message(
            content=f"✅ Logged **{self.view.est['kcal']} kcal** (edited) — today's In: {s.get('kcal_in') or '—'} kcal.",
            view=self.view,
        )


# ─────────────────────────────── Bot & commands ────────────────────────────────


intents = discord.Intents.default()
intents.message_content = False  # only slash commands

client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)


def _guild() -> discord.Object | None:
    return discord.Object(id=int(settings.discord_guild_id)) if settings.discord_guild_id else None


@tree.command(name="weight", description="Log today's weight (kg)")
@app_commands.describe(kg="Weight in kg", waist_cm="Optional waist in cm")
async def cmd_weight(interaction: discord.Interaction, kg: float, waist_cm: float | None = None):
    if not _authorised(interaction):
        return await _deny(interaction)
    if not (20 < kg < 300):
        return await interaction.response.send_message("That's not a plausible weight.", ephemeral=True)
    _upsert_weight(_today_iso(), kg, waist_cm)
    s = _summary()
    await interaction.response.send_message(
        f"⚖️ **{kg} kg** logged for today. Cumulative predicted: **{-s.get('predicted_kg', 0)} kg**."
    )


@tree.command(name="workout", description="Log a workout")
@app_commands.describe(
    kind="x-trainer, run, walk, other",
    minutes="Duration in minutes",
    kcal="Optional kcal burned",
    notes="Optional notes",
)
async def cmd_workout(
    interaction: discord.Interaction,
    kind: str,
    minutes: int,
    kcal: int | None = None,
    notes: str | None = None,
):
    if not _authorised(interaction):
        return await _deny(interaction)
    if kind not in ("x-trainer", "run", "walk", "other"):
        return await interaction.response.send_message(
            "kind must be one of: x-trainer, run, walk, other", ephemeral=True
        )
    _insert_workout(_today_iso(), kind, minutes, kcal, notes)
    await interaction.response.send_message(
        f"🏃 {kind} · {minutes} min{f' · {kcal} kcal' if kcal else ''} logged."
    )


@tree.command(name="status", description="Today's In/Out/Net + cumulative")
async def cmd_status(interaction: discord.Interaction):
    if not _authorised(interaction):
        return await _deny(interaction)
    s = _summary()
    if not s.get("days"):
        return await interaction.response.send_message("No data yet.")
    embed = discord.Embed(title="Today", color=0x34d399)
    embed.add_field(name="Weight", value=f"{s['weight_kg']} kg" if s.get("weight_kg") else "—", inline=True)
    embed.add_field(name="In", value=f"{s['kcal_in'] or '—'} kcal", inline=True)
    embed.add_field(name="Out", value=f"{s['kcal_out'] or '—'} kcal", inline=True)
    net = s.get("net")
    net_str = ("—" if net is None
               else f"{'−' if net < 0 else '+'}{abs(net):,} kcal")
    embed.add_field(name="Net", value=net_str, inline=True)
    embed.add_field(name="Cumulative", value=f"{s['cum']:,} kcal", inline=True)
    embed.add_field(name="Predicted loss", value=f"{-s['predicted_kg']} kg over {s['days']}d", inline=True)
    await interaction.response.send_message(embed=embed)


@tree.command(name="log", description="Log a meal (freetext, LLM estimates macros)")
@app_commands.describe(
    text="What you ate, e.g. 'chicken salad, feta, olive oil'",
    category="lunch, dinner, snack, breakfast",
)
@app_commands.choices(category=[
    app_commands.Choice(name="lunch", value="lunch"),
    app_commands.Choice(name="dinner", value="dinner"),
    app_commands.Choice(name="snack", value="snack"),
    app_commands.Choice(name="breakfast", value="breakfast"),
])
async def cmd_log(
    interaction: discord.Interaction,
    text: str,
    category: app_commands.Choice[str] = None,
):
    if not _authorised(interaction):
        return await _deny(interaction)
    cat = category.value if category else "lunch"
    await interaction.response.defer(thinking=True)
    est = await asyncio.to_thread(estimator.estimate, text, caller="discord.log")
    kcal = est.get("kcal")
    src = est.get("source")
    body = (f"**{text}**\n"
            f"~{kcal or '?'} kcal"
            f" · P {est.get('protein_g') or '?'}g"
            f" · C {est.get('carbs_g') or '?'}g"
            f" · F {est.get('fat_g') or '?'}g"
            f"\n_({src}"
            f"{' — ' + (est.get('model') or '') if est.get('model') else ''})_")
    view = MealConfirmView(interaction.user.id, _today_iso(), text, dict(est), cat)
    if kcal is None:
        body += "\n⚠️ No LLM available. Tap **Edit kcal** to fill in manually."
    await interaction.followup.send(body, view=view)


# ─────────────────────────────── 23:00 nudge ───────────────────────────────────


@tasks.loop(minutes=1)
async def checkin_nudge():
    now = datetime.now(TZ)
    if now.hour == CHECKIN_HOUR and now.minute == CHECKIN_MINUTE:
        try:
            user = await client.fetch_user(int(settings.discord_user_id))
            s = _summary()
            summary_line = (
                f"Today so far: **{s.get('kcal_in') or '—'} kcal in**, "
                f"weight {s.get('weight_kg') or '—'} kg."
            )
            await user.send(
                f"🌙 **Nightly check-in.**\n{summary_line}\n"
                f"Use `/log <what you ate>` — each meal separately.\n"
                f"Skip breakfast unless you actually had one."
            )
        except Exception:
            log.exception("Checkin DM failed")


# ───────────────────────────────── boot ────────────────────────────────────────


@client.event
async def on_ready():
    log.info("Discord bot ready as %s", client.user)
    log.info("Bot is in these guilds: %s", [(g.id, g.name) for g in client.guilds])
    log.info("DISCORD_GUILD_ID configured as: %s", settings.discord_guild_id or "(none — global sync)")
    g = _guild()
    if g:
        if not any(gg.id == g.id for gg in client.guilds):
            log.error("Bot is NOT a member of guild %s — invite it there first, or clear DISCORD_GUILD_ID for global sync", g.id)
        else:
            tree.copy_global_to(guild=g)
            await tree.sync(guild=g)
            log.info("Synced commands to guild %s", g.id)
    else:
        await tree.sync()
        log.info("Synced commands globally (may take up to 1h to appear)")
    if not checkin_nudge.is_running():
        checkin_nudge.start()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if not settings.discord_token:
        raise SystemExit("DISCORD_TOKEN not configured in .env")
    if not settings.discord_user_id:
        raise SystemExit("DISCORD_USER_ID not configured in .env")
    migrate()
    client.run(settings.discord_token, log_handler=None)


if __name__ == "__main__":
    main()
