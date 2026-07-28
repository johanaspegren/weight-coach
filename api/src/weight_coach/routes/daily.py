import json

from fastapi import APIRouter, Query

from ..config import settings
from ..db import connect

router = APIRouter(prefix="/daily", tags=["daily"])


@router.get("/detail")
def detail(date: str = Query(..., description="YYYY-MM-DD")):
    """Everything known about one date: daily row, Oura raw, meals, workouts."""
    with connect() as c:
        daily = c.execute("SELECT * FROM daily WHERE date = ?", (date,)).fetchone()
        oura = c.execute("SELECT * FROM oura_raw WHERE date = ?", (date,)).fetchone()
        meals = c.execute(
            "SELECT * FROM meals WHERE date = ? ORDER BY created_at ASC", (date,)
        ).fetchall()
        workouts = c.execute(
            "SELECT * FROM workouts WHERE date = ? ORDER BY created_at ASC", (date,)
        ).fetchall()

    oura_dict = dict(oura) if oura else None
    if oura_dict:
        for key in ("workouts_json", "tags_json"):
            if oura_dict.get(key):
                try:
                    oura_dict[key.replace("_json", "")] = json.loads(oura_dict[key])
                except (json.JSONDecodeError, TypeError):
                    pass

    return {
        "date": date,
        "daily": dict(daily) if daily else None,
        "oura": oura_dict,
        "meals": [dict(m) for m in meals],
        "workouts": [dict(w) for w in workouts],
    }


@router.get("")
def list_daily(limit: int = Query(default=90, ge=1, le=365)):
    with connect() as c:
        rows = c.execute(
            "SELECT * FROM daily ORDER BY date DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/summary")
def summary():
    """Dashboard headline numbers: today, week, cumulative deficit + weight change."""
    with connect() as c:
        rows = c.execute(
            "SELECT * FROM daily WHERE date >= ? ORDER BY date ASC",
            (settings.program_start,),
        ).fetchall()
        # Sum manual workout kcal per date; used as fallback when Oura is absent.
        wo_rows = c.execute(
            "SELECT date, COALESCE(SUM(kcal_burn), 0) AS s FROM workouts "
            "WHERE date >= ? GROUP BY date",
            (settings.program_start,),
        ).fetchall()
    workouts_by_date = {r["date"]: int(r["s"]) for r in wo_rows}

    def kcal_out(r) -> int | None:
        stored = r["kcal_out_est"]
        if stored is not None:
            return stored
        wo = workouts_by_date.get(r["date"], 0)
        return settings.bmr_kcal + wo if wo else None

    if not rows:
        return {
            "program_start": settings.program_start,
            "days": 0,
            "today_kcal_in": None,
            "today_kcal_out": None,
            "today_deficit_kcal": None,
            "week_deficit_kcal": 0,
            "cumulative_deficit_kcal": 0,
            "predicted_kg_lost": 0.0,
            "actual_kg_change": None,
        }

    def deficit(r) -> int | None:
        # Negative = deficit (kcal in < out). None if we don't yet have both sides.
        out = kcal_out(r)
        if r["kcal_in_est"] is None or out is None:
            return None
        return r["kcal_in_est"] - out

    today = rows[-1]
    week_slice = rows[-7:]
    cum = sum((deficit(r) or 0) for r in rows)
    week = sum((deficit(r) or 0) for r in week_slice)
    today_def = deficit(today)
    today_out = kcal_out(today)

    first_weight = next((r["weight_kg"] for r in rows if r["weight_kg"] is not None), None)
    last_weight = next(
        (r["weight_kg"] for r in reversed(rows) if r["weight_kg"] is not None),
        None,
    )
    actual = (last_weight - first_weight) if (first_weight and last_weight) else None

    return {
        "program_start": settings.program_start,
        "days": len(rows),
        "today_kcal_in": today["kcal_in_est"],
        "today_kcal_out": today_out,
        "today_deficit_kcal": today_def,
        "week_deficit_kcal": week,
        "cumulative_deficit_kcal": cum,
        "predicted_kg_lost": round(cum / 7700.0, 2),
        "actual_kg_change": round(actual, 2) if actual is not None else None,
    }
