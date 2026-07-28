from datetime import datetime
from fastapi import APIRouter

from ..config import settings
from ..db import connect
from ..models import PushSubscription

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-key")
def vapid_key():
    return {"key": settings.vapid_public_key}


@router.post("/subscribe")
def subscribe(sub: PushSubscription):
    now = datetime.utcnow().isoformat()
    with connect() as c:
        c.execute(
            """
            INSERT INTO push_subs (endpoint, p256dh, auth, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(endpoint) DO NOTHING
            """,
            (sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""), now),
        )
    return {"ok": True}
