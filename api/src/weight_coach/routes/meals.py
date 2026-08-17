from datetime import datetime
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from ..db import connect
from ..models import MealIn
from ..providers import estimator

router = APIRouter(prefix="/meals", tags=["meals"])


class EstimateIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)


def _resum_daily_kcal_in(conn, day: str) -> None:
    """Re-aggregate meals for a date into daily.kcal_in_est."""
    row = conn.execute(
        "SELECT COALESCE(SUM(kcal), 0) AS s FROM meals WHERE date = ?", (day,)
    ).fetchone()
    total = int(row["s"])
    conn.execute(
        """
        INSERT INTO daily (date, kcal_in_est)
        VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET kcal_in_est = excluded.kcal_in_est
        """,
        (day, total),
    )


@router.post("/estimate")
def estimate_meal(body: EstimateIn):
    """Look up macros for a meal description via template cache, then Ollama."""
    return estimator.estimate(body.description, caller="api.meals.estimate")


@router.post("/estimate-vision")
async def estimate_meal_vision(file: UploadFile = File(...)):
    """Take a meal photo, run qwen3-vl on it, return macros + a description."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="image too large (max 8MB)")
    est, description = estimator.estimate_from_image(raw)
    return {**est, "description": description}


@router.post("")
def add_meal(entry: MealIn):
    d = entry.date.isoformat()
    now = datetime.utcnow().isoformat()

    kcal, protein_g, carbs_g, fat_g, food_groups = (
        entry.kcal, entry.protein_g, entry.carbs_g, entry.fat_g, entry.food_groups
    )
    source = "manual"

    # If the user didn't supply kcal, try estimator inline; if that fails, defer.
    if kcal is None:
        est = estimator.estimate(entry.description, caller="api.meals.add")
        if est["kcal"] is not None:
            kcal = est["kcal"]
            protein_g = protein_g if protein_g is not None else est["protein_g"]
            carbs_g = carbs_g if carbs_g is not None else est["carbs_g"]
            fat_g = fat_g if fat_g is not None else est["fat_g"]
            food_groups = food_groups if food_groups is not None else est["food_groups"]
        else:
            source = "pending"

    template_id = estimator.bump_template(
        entry.description, kcal, protein_g, carbs_g, fat_g, food_groups
    )
    with connect() as c:
        c.execute(
            """
            INSERT INTO meals
                (date, source, category, raw_text, kcal, protein_g, carbs_g, fat_g, food_groups, template_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (d, source, entry.category, entry.description, kcal, protein_g,
             carbs_g, fat_g, food_groups, template_id, now),
        )
        _resum_daily_kcal_in(c, d)
    return {"ok": True, "date": d, "template_id": template_id, "source": source, "kcal": kcal}


@router.get("")
def list_meals(date: str = Query(..., description="YYYY-MM-DD")):
    with connect() as c:
        rows = c.execute(
            "SELECT * FROM meals WHERE date = ? ORDER BY created_at ASC", (date,)
        ).fetchall()
    return [dict(r) for r in rows]


@router.delete("/{meal_id}")
def delete_meal(meal_id: int):
    with connect() as c:
        row = c.execute("SELECT date FROM meals WHERE id = ?", (meal_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "not found"}
        c.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
        _resum_daily_kcal_in(c, row["date"])
    return {"ok": True}
