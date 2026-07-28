"""Tuya scale poller.

Cleverio (and most Tuya scales) don't emit DP data to the log endpoints.
The current weight always sits in the device shadow under the `weight`
property with a `time` field for when it was last updated. We poll shadow
and upsert into daily.weight_kg whenever we see a new-enough reading.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from tuya_connector import TuyaOpenAPI

from ..config import settings
from ..db import connect

log = logging.getLogger(__name__)

TZ = ZoneInfo("Europe/Stockholm")


def _api() -> TuyaOpenAPI | None:
    if not (settings.tuya_access_id and settings.tuya_access_secret and settings.tuya_device_id):
        return None
    api = TuyaOpenAPI(settings.tuya_endpoint, settings.tuya_access_id, settings.tuya_access_secret)
    r = api.connect()
    if not r.get("success"):
        log.warning("Tuya auth failed: %s", r)
        return None
    return api


def _weight_to_kg(value) -> float | None:
    """Cleverio Wifi Scale 2 reports weight in decigrams (840 = 84.0 kg).
    Fall back on magnitude-based heuristic in case another model uses grams."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    if v > 5000:      # grams (76700 → 76.7)
        return round(v / 1000.0, 2)
    if v >= 300:      # decigrams (840 → 84.0)  — the common case
        return round(v / 10.0, 2)
    return round(v, 2)


def _local_date(event_time_ms: int) -> str:
    dt = datetime.fromtimestamp(event_time_ms / 1000, tz=timezone.utc).astimezone(TZ)
    return dt.date().isoformat()


def sync_recent(hours: int = 48) -> int:
    """Poll the device shadow for the latest weight; upsert into daily.
    Returns 1 if a weight was written this call, else 0."""
    api = _api()
    if api is None:
        return 0

    end_ms = int(time.time() * 1000)
    start_ms = end_ms - hours * 3600 * 1000

    r = api.get(f"/v2.0/cloud/thing/{settings.tuya_device_id}/shadow/properties")
    if not r.get("success"):
        log.warning("Tuya shadow fetch failed: %s", r)
        return 0
    props = (r.get("result") or {}).get("properties") or []

    weight_prop = next((p for p in props if (p.get("code") or "").lower() == "weight"), None)
    if not weight_prop:
        log.info("Tuya: no 'weight' property in shadow. Codes present: %s",
                 [p.get("code") for p in props])
        return 0

    raw = weight_prop.get("value")
    t_ms = int(weight_prop.get("time") or 0)
    w = _weight_to_kg(raw)
    if w is None or not (20 < w < 300):
        log.info("Tuya: shadow weight out of range (raw=%s, kg=%s)", raw, w)
        return 0
    if t_ms < start_ms:
        log.info("Tuya: shadow weight is stale — last reading %s, window %sh",
                 datetime.fromtimestamp(t_ms / 1000, tz=TZ), hours)
        return 0

    # Grab the full property snapshot so body-composition raw values (LResistance,
    # RHR, LLR, plus anything else the scale reports) are preserved.
    scale_blob = {
        "read_at": datetime.fromtimestamp(t_ms / 1000, tz=TZ).isoformat(),
        "weight_kg": w,
        "weight_raw": raw,
        "properties": [
            {
                "code": p.get("code"),
                "value": p.get("value"),
                "type": p.get("type"),
                "time": p.get("time"),
                "dp_id": p.get("dp_id"),
            }
            for p in props
        ],
    }

    day = _local_date(t_ms)
    with connect() as c:
        row = c.execute("SELECT weight_kg FROM daily WHERE date = ?", (day,)).fetchone()
        if row and row["weight_kg"] == w:
            # Still refresh the scale_json in case new properties came in.
            c.execute(
                "UPDATE daily SET scale_json = ? WHERE date = ?",
                (json.dumps(scale_blob), day),
            )
            log.info("Tuya: weight for %s unchanged (%s kg), refreshed scale_json", day, w)
            return 0
        c.execute(
            """
            INSERT INTO daily (date, weight_kg, scale_json)
            VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                weight_kg = excluded.weight_kg,
                scale_json = excluded.scale_json
            """,
            (day, w, json.dumps(scale_blob)),
        )
    log.info("Tuya: wrote weight %s kg for %s (%d shadow properties)", w, day, len(props))
    return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    n = sync_recent(hours=24 * 7)
    print(f"Wrote {n} weight event(s)")
