from datetime import datetime
from fastapi import APIRouter

from ..db import connect
from ..models import CheckinIn

router = APIRouter(prefix="/checkin", tags=["checkin"])


@router.post("")
def submit_checkin(entry: CheckinIn):
    d = entry.date.isoformat()
    now = datetime.utcnow().isoformat()
    with connect() as c:
        c.execute(
            """
            INSERT INTO checkins (date, transcript, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                transcript = excluded.transcript
            """,
            (d, entry.transcript, now),
        )
    return {"ok": True, "date": d}
