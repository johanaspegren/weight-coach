from datetime import datetime
from fastapi import APIRouter, Query

from ..config import settings
from ..db import connect
from ..models import WorkoutIn

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _refresh_kcal_out_if_no_oura(conn, day: str) -> None:
    """When Oura hasn't reported for `day`, derive kcal_out from BMR + manual workouts.
    Oura's daily sync overwrites this with the real number when it lands."""
    has_oura = conn.execute(
        "SELECT 1 FROM oura_raw WHERE date = ? AND total_burn IS NOT NULL", (day,)
    ).fetchone()
    if has_oura:
        return
    row = conn.execute(
        "SELECT COALESCE(SUM(kcal_burn), 0) AS s FROM workouts WHERE date = ?", (day,)
    ).fetchone()
    est = settings.bmr_kcal + int(row["s"])
    conn.execute(
        """
        INSERT INTO daily (date, kcal_out_est)
        VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET kcal_out_est = excluded.kcal_out_est
        """,
        (day, est),
    )


@router.post("")
def add_workout(entry: WorkoutIn):
    d = entry.date.isoformat()
    now = datetime.utcnow().isoformat()
    with connect() as c:
        c.execute(
            """
            INSERT INTO workouts
                (date, source, kind, duration_min, kcal_burn, avg_hr, notes, created_at)
            VALUES (?, 'manual', ?, ?, ?, ?, ?, ?)
            """,
            (d, entry.kind, entry.duration_min, entry.kcal_burn, entry.avg_hr, entry.notes, now),
        )
        _refresh_kcal_out_if_no_oura(c, d)
    return {"ok": True, "date": d}


@router.get("")
def list_workouts(date: str | None = Query(default=None), limit: int = Query(default=30, ge=1, le=365)):
    with connect() as c:
        if date:
            rows = c.execute(
                "SELECT * FROM workouts WHERE date = ? ORDER BY created_at ASC", (date,)
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM workouts ORDER BY date DESC, created_at DESC LIMIT ?", (limit,)
            ).fetchall()
    return [dict(r) for r in rows]


@router.delete("/{workout_id}")
def delete_workout(workout_id: int):
    with connect() as c:
        row = c.execute("SELECT date FROM workouts WHERE id = ?", (workout_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "not found"}
        c.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
        _refresh_kcal_out_if_no_oura(c, row["date"])
    return {"ok": True}
