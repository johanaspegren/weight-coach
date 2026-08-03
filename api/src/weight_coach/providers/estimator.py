"""Meal macro estimator: template lookup first, Ollama fallback."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import TypedDict

import httpx

from ..config import settings
from ..db import connect

log = logging.getLogger(__name__)


class MealEstimate(TypedDict):
    kcal: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    food_groups: str | None
    source: str  # 'template' | 'llm'
    template_id: int | None
    model: str | None


_WORD_RE = re.compile(r"[a-zåäö0-9]+", re.IGNORECASE)


def signature_for(description: str) -> str:
    """Normalize a meal description into a stable lookup key."""
    words = sorted(w.lower() for w in _WORD_RE.findall(description))
    # Drop 1-char noise but keep short meaningful tokens like "ml", "g".
    return " ".join(w for w in words if len(w) > 1)


def find_template(description: str) -> dict | None:
    sig = signature_for(description)
    if not sig:
        return None
    with connect() as c:
        row = c.execute(
            "SELECT * FROM meal_templates WHERE signature = ?", (sig,)
        ).fetchone()
    return dict(row) if row else None


def bump_template(
    description: str,
    kcal: int | None,
    protein_g: float | None,
    carbs_g: float | None,
    fat_g: float | None,
    food_groups: str | None,
) -> int | None:
    """Insert or update a template row for this description. Returns template id."""
    sig = signature_for(description)
    if not sig:
        return None
    now = datetime.utcnow().isoformat()
    with connect() as c:
        c.execute(
            """
            INSERT INTO meal_templates
                (signature, display_name, kcal, protein_g, carbs_g, fat_g, food_groups, day_type, occurrences, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'any', 1, ?)
            ON CONFLICT(signature) DO UPDATE SET
                occurrences = meal_templates.occurrences + 1,
                last_seen = excluded.last_seen,
                -- refresh macros only if they're currently NULL
                kcal = COALESCE(meal_templates.kcal, excluded.kcal),
                protein_g = COALESCE(meal_templates.protein_g, excluded.protein_g),
                carbs_g = COALESCE(meal_templates.carbs_g, excluded.carbs_g),
                fat_g = COALESCE(meal_templates.fat_g, excluded.fat_g),
                food_groups = COALESCE(meal_templates.food_groups, excluded.food_groups)
            """,
            (sig, description[:120], kcal, protein_g, carbs_g, fat_g, food_groups, now),
        )
        row = c.execute("SELECT id FROM meal_templates WHERE signature = ?", (sig,)).fetchone()
    return row["id"] if row else None


PROMPT = """Output ONE JSON object and NOTHING else. No thinking, no reasoning, no preamble, no code fences, no explanation. Just the JSON.

Schema:
{"kcal": integer, "protein_g": number, "carbs_g": number, "fat_g": number, "food_groups": "comma-separated tags from: protein, grain, veg, fruit, dairy, fat, alcohol, sweets, other"}

Give realistic estimates for a typical adult portion of the meal below. Use the quantity if given, otherwise assume a standard portion. Be realistic, not generous.

Meal: {description}
JSON:"""


_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json_object(raw: str) -> str | None:
    """Grab the first {...} substring if the model wrapped it in prose."""
    m = _JSON_OBJ_RE.search(raw)
    return m.group(0) if m else None


def _parse_llm_json(raw: str, model_name: str) -> MealEstimate | None:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        salvaged = _extract_json_object(raw)
        if not salvaged:
            log.warning("estimator returned unparseable output from %s: %r", model_name, raw[:200])
            return None
        try:
            data = json.loads(salvaged)
        except (json.JSONDecodeError, ValueError):
            log.warning("estimator salvage failed from %s: %r", model_name, salvaged[:200])
            return None
    if data.get("kcal") is None:
        return None

    def _num(k, cast):
        v = data.get(k)
        try:
            return cast(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    fg = data.get("food_groups")
    return MealEstimate(
        kcal=_num("kcal", int),
        protein_g=_num("protein_g", float),
        carbs_g=_num("carbs_g", float),
        fat_g=_num("fat_g", float),
        food_groups=fg if isinstance(fg, str) else None,
        source="llm",
        template_id=None,
        model=model_name,
    )


def _ollama_estimate(description: str) -> MealEstimate | None:
    for base in settings.ollama_url_candidates:
        url = f"{base}/api/generate"
        try:
            r = httpx.post(
                url,
                json={
                    "model": settings.ollama_model,
                    "prompt": PROMPT.replace("{description}", description),
                    "stream": False,
                    "format": "json",
                    "think": False,  # disable reasoning for models that support it
                    "options": {"temperature": 0.2, "num_predict": 256},
                },
                timeout=120,
            )
        except httpx.HTTPError as e:
            log.warning("ollama connect failed at %s: %s", url, e)
            continue
        if r.status_code != 200:
            log.warning("ollama %s @ %s → HTTP %s: %s", settings.ollama_model, base, r.status_code, r.text[:300])
            continue
        raw = r.json().get("response", "").strip()
        log.info("ollama %s @ %s raw response: %s", settings.ollama_model, base, raw[:200])
        parsed = _parse_llm_json(raw, settings.ollama_model)
        if parsed is not None:
            return parsed
    return None


def _openai_estimate(description: str) -> MealEstimate | None:
    if not settings.openai_api_key:
        return None
    try:
        r = httpx.post(
            f"{settings.openai_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "Return only the JSON object requested."},
                    {"role": "user", "content": PROMPT.replace("{description}", description)},
                ],
            },
            timeout=30,
        )
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError) as e:
        log.warning("openai estimate failed: %s", e)
        return None
    return _parse_llm_json(raw, settings.openai_model)


def _pending_shell() -> MealEstimate:
    return MealEstimate(
        kcal=None, protein_g=None, carbs_g=None, fat_g=None,
        food_groups=None, source="pending", template_id=None, model=None,
    )


def estimate(description: str) -> MealEstimate:
    """Try template → Ollama → OpenAI. If all fail, return a 'pending' shell
    so the caller can save the meal now and retry later from the worker."""
    tpl = find_template(description)
    if tpl and tpl.get("kcal") is not None:
        return MealEstimate(
            kcal=tpl["kcal"],
            protein_g=tpl["protein_g"],
            carbs_g=tpl["carbs_g"],
            fat_g=tpl["fat_g"],
            food_groups=tpl["food_groups"],
            source="template",
            template_id=tpl["id"],
            model=None,
        )

    for provider in (_ollama_estimate, _openai_estimate):
        est = provider(description)
        if est is not None:
            return est

    return _pending_shell()


def retry_pending() -> int:
    """Estimate every meal with kcal IS NULL. Returns count filled in."""
    from ..routes.meals import _resum_daily_kcal_in  # avoid import cycle at module load

    with connect() as c:
        rows = c.execute(
            "SELECT id, date, raw_text FROM meals WHERE kcal IS NULL AND raw_text IS NOT NULL"
        ).fetchall()

    filled = 0
    dates_touched: set[str] = set()

    for row in rows:
        est = estimate(row["raw_text"] or "")
        if est["kcal"] is None:
            continue
        tid = bump_template(
            row["raw_text"],
            est["kcal"], est["protein_g"], est["carbs_g"], est["fat_g"], est["food_groups"],
        )
        with connect() as c:
            c.execute(
                """
                UPDATE meals
                SET kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
                    food_groups = ?, source = 'manual', template_id = COALESCE(template_id, ?)
                WHERE id = ?
                """,
                (est["kcal"], est["protein_g"], est["carbs_g"], est["fat_g"],
                 est["food_groups"], tid, row["id"]),
            )
        dates_touched.add(row["date"])
        filled += 1

    with connect() as c:
        for d in dates_touched:
            _resum_daily_kcal_in(c, d)

    if filled:
        log.info("Backfilled %d pending meal(s)", filled)
    return filled
