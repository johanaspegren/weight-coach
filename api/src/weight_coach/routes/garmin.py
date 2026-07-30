from fastapi import APIRouter, HTTPException

from ..config import settings
from ..providers import garmin as garmin_provider

router = APIRouter(prefix="/garmin", tags=["garmin"])


@router.post("/sync")
def trigger_sync(days: int = 3):
    if not settings.garmin_email:
        raise HTTPException(status_code=400, detail="GARMIN_EMAIL not configured in .env")
    try:
        n = garmin_provider.sync(days=days)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"sync failed: {e}") from e
    if n == 0:
        raise HTTPException(
            status_code=502,
            detail="Sync returned zero. Run `python -m weight_coach.providers.garmin_login` once to seed tokens (MFA prompt).",
        )
    return {"ok": True, "days_written": n}
