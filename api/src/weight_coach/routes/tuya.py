from fastapi import APIRouter, HTTPException

from ..config import settings
from ..providers import tuya as tuya_provider

router = APIRouter(prefix="/tuya", tags=["tuya"])


@router.post("/sync")
def trigger_sync(hours: int = 48):
    if not (settings.tuya_access_id and settings.tuya_device_id):
        raise HTTPException(status_code=400, detail="Tuya credentials not configured in .env")
    n = tuya_provider.sync_recent(hours=hours)
    return {"ok": True, "events_written": n}
