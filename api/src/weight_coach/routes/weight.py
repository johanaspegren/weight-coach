from datetime import datetime
from fastapi import APIRouter

from ..db import connect
from ..models import WeightIn

router = APIRouter(prefix="/weight", tags=["weight"])


@router.post("")
def add_weight(entry: WeightIn):
    d = entry.date.isoformat()
    with connect() as c:
        c.execute(
            """
            INSERT INTO daily (date, weight_kg, waist_cm)
            VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                weight_kg = excluded.weight_kg,
                waist_cm = COALESCE(excluded.waist_cm, daily.waist_cm)
            """,
            (d, entry.weight_kg, entry.waist_cm),
        )
    return {"ok": True, "date": d}
