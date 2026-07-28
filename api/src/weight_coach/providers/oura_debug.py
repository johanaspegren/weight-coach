"""One-shot: python -m weight_coach.providers.oura_debug
Prints raw Oura responses so we can see what's actually coming back."""
import json
from datetime import date, timedelta

from .. import http as _http
_http.install()

import httpx
from ..config import settings


def main():
    if not settings.oura_token:
        print("OURA_TOKEN missing"); return

    end = date(2027, 1, 1)
    start = date(2024, 1, 1)
    with httpx.Client(
        headers={"Authorization": f"Bearer {settings.oura_token}"},
        timeout=20,
    ) as c:
        for ep in ("personal_info", "daily_activity", "daily_readiness", "daily_sleep"):
            url = f"https://api.ouraring.com/v2/usercollection/{ep}"
            params = None if ep == "personal_info" else {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
            }
            r = c.get(url, params=params)
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
            print(f"\n=== {ep}  HTTP {r.status_code}  params={params} ===")
            if isinstance(body, dict) and "data" in body:
                items = body["data"]
                days_seen = sorted({d.get("day") for d in items if d.get("day")})
                print(f"items: {len(items)}   days present: {days_seen[-10:] if days_seen else '[]'}")
                if items:
                    print("first item:")
                    print(json.dumps(items[0], indent=2)[:800])
            else:
                print(json.dumps(body, indent=2)[:800])


if __name__ == "__main__":
    main()
