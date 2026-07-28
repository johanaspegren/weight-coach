from fastapi import APIRouter, HTTPException

from ..config import settings
from ..providers import oura as oura_provider

router = APIRouter(prefix="/oura", tags=["oura"])


@router.post("/sync")
def trigger_sync(days: int = 7):
    if not settings.oura_token:
        raise HTTPException(status_code=400, detail="OURA_TOKEN not configured in .env")
    try:
        n = oura_provider.sync(days=days)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"sync failed: {e}") from e
    return {"ok": True, "days_written": n}
