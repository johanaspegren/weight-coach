"""Oura v2 API poller — sleep, readiness, activity (calories) for a date range."""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta

import httpx

from ..config import settings
from ..db import connect

log = logging.getLogger(__name__)

BASE = "https://api.ouraring.com/v2/usercollection"


def _minutes_from_seconds(v) -> int | None:
    """Oura returns high-stress / high-recovery durations in seconds."""
    if v is None:
        return None
    try:
        return int(round(float(v) / 60))
    except (TypeError, ValueError):
        return None


def _client() -> httpx.Client:
    if not settings.oura_token:
        raise RuntimeError("OURA_TOKEN not configured")
    return httpx.Client(
        headers={"Authorization": f"Bearer {settings.oura_token}"},
        timeout=20,
    )


def _fetch(client: httpx.Client, endpoint: str, start: date, end: date) -> list[dict]:
    r = client.get(
        f"{BASE}/{endpoint}",
        params={"start_date": start.isoformat(), "end_date": end.isoformat()},
    )
    r.raise_for_status()
    return r.json().get("data", [])


def _fetch_soft(client: httpx.Client, endpoint: str, start: date, end: date) -> list[dict]:
    """Same as _fetch but returns [] if the endpoint 404s or 403s — some Oura
    accounts don't have data for every collection (e.g. vO2 max needs recent
    workouts, resilience takes weeks to compute)."""
    try:
        return _fetch(client, endpoint, start, end)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (403, 404, 422):
            log.info("Oura %s unavailable: HTTP %s", endpoint, e.response.status_code)
            return []
        raise


def sync(days: int = 7) -> int:
    """Pull the last `days` days from Oura and upsert into oura_raw. Returns rows written."""
    end = date.today()
    start = end - timedelta(days=days)

    with _client() as c:
        readiness_data = _fetch(c, "daily_readiness", start, end)
        sleep_data = _fetch(c, "daily_sleep", start, end)
        activity_data = _fetch(c, "daily_activity", start, end)
        workouts_raw = _fetch(c, "workout", start, end)
        stress_data = _fetch_soft(c, "daily_stress", start, end)
        resilience_data = _fetch_soft(c, "daily_resilience", start, end)
        vo2_data = _fetch_soft(c, "vO2_max", start, end)
        tags_raw = _fetch_soft(c, "enhanced_tag", start, end)

    log.info(
        "Oura fetch counts — readiness=%d sleep=%d activity=%d workout=%d stress=%d resilience=%d vo2=%d tags=%d (range %s..%s)",
        len(readiness_data), len(sleep_data), len(activity_data), len(workouts_raw),
        len(stress_data), len(resilience_data), len(vo2_data), len(tags_raw),
        start, end,
    )
    if activity_data:
        log.info("Oura activity sample keys: %s", sorted((activity_data[0] or {}).keys()))

    readiness = {d["day"]: d for d in readiness_data if d.get("day")}
    sleep = {d["day"]: d for d in sleep_data if d.get("day")}
    activity = {d["day"]: d for d in activity_data if d.get("day")}
    stress = {d["day"]: d for d in stress_data if d.get("day")}
    resilience = {d["day"]: d for d in resilience_data if d.get("day")}
    vo2 = {d["day"]: d for d in vo2_data if d.get("day")}

    # group workouts by day
    workouts_by_day: dict[str, list[dict]] = {}
    for w in workouts_raw:
        day = (w.get("day") or w.get("start_datetime", "")[:10])
        workouts_by_day.setdefault(day, []).append(w)

    # group tags by start_day
    tags_by_day: dict[str, list[dict]] = {}
    for t in tags_raw:
        day = t.get("start_day") or (t.get("start_time") or "")[:10]
        if day:
            tags_by_day.setdefault(day, []).append({
                "type": t.get("tag_type_code"),
                "name": t.get("custom_name"),
                "comment": t.get("comment"),
            })

    now = datetime.utcnow().isoformat()
    all_days = (
        set(readiness) | set(sleep) | set(activity) | set(workouts_by_day)
        | set(stress) | set(resilience) | set(vo2) | set(tags_by_day)
    )
    written = 0

    with connect() as db:
        for day in sorted(all_days):
            r = readiness.get(day, {})
            s = sleep.get(day, {})
            a = activity.get(day, {})
            st = stress.get(day, {})
            res = resilience.get(day, {})
            v = vo2.get(day, {})
            db.execute(
                """
                INSERT INTO oura_raw (
                    date, readiness, sleep_score, hrv_avg,
                    total_burn, active_burn, workouts_json,
                    stress_high_min, recovery_high_min, resilience_level, vo2_max, tags_json,
                    fetched_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    readiness = excluded.readiness,
                    sleep_score = excluded.sleep_score,
                    hrv_avg = excluded.hrv_avg,
                    total_burn = excluded.total_burn,
                    active_burn = excluded.active_burn,
                    workouts_json = excluded.workouts_json,
                    stress_high_min = excluded.stress_high_min,
                    recovery_high_min = excluded.recovery_high_min,
                    resilience_level = excluded.resilience_level,
                    vo2_max = excluded.vo2_max,
                    tags_json = excluded.tags_json,
                    fetched_at = excluded.fetched_at
                """,
                (
                    day,
                    r.get("score"),
                    s.get("score"),
                    (r.get("contributors") or {}).get("hrv_balance"),
                    a.get("total_calories"),
                    a.get("active_calories"),
                    json.dumps(workouts_by_day.get(day, [])),
                    _minutes_from_seconds(st.get("stress_high")),
                    _minutes_from_seconds(st.get("recovery_high")),
                    res.get("level"),
                    v.get("vo2_max"),
                    json.dumps(tags_by_day.get(day, [])) if day in tags_by_day else None,
                    now,
                ),
            )
            # roll kcal_out into daily so the deficit calc has both sides
            db.execute(
                """
                INSERT INTO daily (date, kcal_out_est)
                VALUES (?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    kcal_out_est = excluded.kcal_out_est
                """,
                (day, a.get("total_calories")),
            )
            written += 1

    log.info("Oura sync: %d days", written)
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(f"Wrote {sync()} rows")
