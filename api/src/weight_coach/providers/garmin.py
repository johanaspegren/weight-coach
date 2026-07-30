"""Garmin Connect poller.

Uses the community `garminconnect` library. Reads daily stats, sleep, HRV,
body battery, stress, workouts. Writes into `garmin_raw` and, critically,
`daily.kcal_out_est` — which replaces Oura as the source for the "Out"
number on the dashboard.

Auth model
----------
`garminconnect` uses `garth` under the hood, which caches OAuth tokens to
disk after the first successful login. First login often triggers MFA that
must be entered interactively; run `python -m weight_coach.providers.garmin_login`
once from a terminal to seed the token store. Subsequent runs read from it.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone

from garminconnect import Garmin, GarminConnectAuthenticationError, GarminConnectConnectionError

from ..config import settings
from ..db import connect

log = logging.getLogger(__name__)


def _tokenstore() -> str:
    return os.path.expanduser(settings.garmin_tokenstore)


def _client() -> Garmin | None:
    """Return an authenticated client, or None if credentials/tokens missing."""
    if not settings.garmin_email:
        log.info("GARMIN_EMAIL empty — skipping Garmin sync")
        return None
    g = Garmin(email=settings.garmin_email, password=settings.garmin_password or None)
    try:
        # Load cached tokens first (fast, no MFA)
        g.login(_tokenstore())
        return g
    except (FileNotFoundError, GarminConnectAuthenticationError):
        pass
    # Fallback: full re-login (may prompt for MFA in a terminal; won't work from systemd)
    try:
        g.login(_tokenstore())
        return g
    except (GarminConnectAuthenticationError, GarminConnectConnectionError) as e:
        log.warning("Garmin login failed: %s — run garmin_login once", e)
        return None


def _int(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _fetch_day(g: Garmin, day: date) -> dict:
    """Aggregate one day's numbers. Every sub-fetch is defensive; Garmin returns
    partial data (or empty dicts) when metrics haven't computed yet."""
    ds = day.isoformat()
    out = {}
    try:
        stats = g.get_stats(ds) or {}
        out["total_burn"] = _int(stats.get("totalKilocalories"))
        out["active_burn"] = _int(stats.get("activeKilocalories"))
        out["steps"] = _int(stats.get("totalSteps"))
        out["resting_hr"] = _int(stats.get("restingHeartRate"))
    except Exception as e:
        log.info("garmin stats %s failed: %s", ds, e)

    try:
        sleep = g.get_sleep_data(ds) or {}
        summary = sleep.get("dailySleepDTO") or {}
        out["sleep_score"] = _int((summary.get("sleepScores") or {}).get("overall", {}).get("value"))
    except Exception as e:
        log.info("garmin sleep %s failed: %s", ds, e)

    try:
        bb = g.get_body_battery(ds, ds)
        # bb is a list of entries with valuesArray of [ts, value] pairs
        peak = None
        if isinstance(bb, list):
            for entry in bb:
                for _, v in (entry.get("bodyBatteryValuesArray") or []):
                    if v is not None:
                        peak = v if peak is None else max(peak, v)
        out["body_battery"] = _int(peak)
    except Exception as e:
        log.info("garmin body_battery %s failed: %s", ds, e)

    try:
        stress = g.get_stress_data(ds) or {}
        out["stress_avg"] = _int(stress.get("avgStressLevel"))
    except Exception as e:
        log.info("garmin stress %s failed: %s", ds, e)

    try:
        hrv = g.get_hrv_data(ds) or {}
        summary = hrv.get("hrvSummary") or {}
        out["hrv_ms"] = _float(summary.get("lastNightAvg"))
    except Exception as e:
        log.info("garmin hrv %s failed: %s", ds, e)

    return out


def sync(days: int = 3) -> int:
    """Pull the last `days` days from Garmin and upsert. Returns rows written."""
    g = _client()
    if g is None:
        return 0

    end = date.today()
    today_ts = datetime.utcnow().isoformat()
    written = 0

    try:
        activities = g.get_activities(0, 20) or []
    except Exception as e:
        log.info("garmin activities failed: %s", e)
        activities = []
    workouts_by_day: dict[str, list] = {}
    for a in activities:
        ts = a.get("startTimeLocal") or a.get("startTimeGMT") or ""
        d = ts[:10] if ts else ""
        if not d:
            continue
        workouts_by_day.setdefault(d, []).append({
            "type": a.get("activityType", {}).get("typeKey"),
            "name": a.get("activityName"),
            "duration_s": a.get("duration"),
            "kcal": a.get("calories"),
            "avg_hr": a.get("averageHR"),
        })

    with connect() as db:
        for i in range(days):
            day = end - timedelta(days=i)
            ds = day.isoformat()
            data = _fetch_day(g, day)
            wo_json = json.dumps(workouts_by_day.get(ds, []))
            db.execute(
                """
                INSERT INTO garmin_raw
                    (date, body_battery, sleep_score, hrv_ms, resting_hr,
                     stress_avg, total_burn, active_burn, steps, workouts_json, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    body_battery = excluded.body_battery,
                    sleep_score = excluded.sleep_score,
                    hrv_ms = excluded.hrv_ms,
                    resting_hr = excluded.resting_hr,
                    stress_avg = excluded.stress_avg,
                    total_burn = excluded.total_burn,
                    active_burn = excluded.active_burn,
                    steps = excluded.steps,
                    workouts_json = excluded.workouts_json,
                    fetched_at = excluded.fetched_at
                """,
                (
                    ds, data.get("body_battery"), data.get("sleep_score"),
                    data.get("hrv_ms"), data.get("resting_hr"), data.get("stress_avg"),
                    data.get("total_burn"), data.get("active_burn"), data.get("steps"),
                    wo_json, today_ts,
                ),
            )
            # Roll the day's total burn into daily.kcal_out_est so the "Out" number lights up.
            if data.get("total_burn"):
                db.execute(
                    """
                    INSERT INTO daily (date, kcal_out_est)
                    VALUES (?, ?)
                    ON CONFLICT(date) DO UPDATE SET kcal_out_est = excluded.kcal_out_est
                    """,
                    (ds, data["total_burn"]),
                )
            written += 1

    log.info("Garmin sync: %d day(s)", written)
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    print(f"Wrote {sync(days=3)} day(s)")
