"""Send a Web Push notification to every subscribed device."""
from __future__ import annotations

import json
import logging

from pywebpush import WebPushException, webpush

from .config import settings
from .db import connect

log = logging.getLogger(__name__)


def send_all(title: str, body: str, url: str = "/") -> int:
    if not settings.vapid_private_key:
        log.warning("VAPID keys not configured — skipping push")
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    stale: list[str] = []

    with connect() as c:
        subs = c.execute("SELECT endpoint, p256dh, auth FROM push_subs").fetchall()

    for row in subs:
        info = {"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}}
        try:
            webpush(
                subscription_info=info,
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            sent += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                stale.append(row["endpoint"])
            else:
                log.warning("push failed: %s", e)

    if stale:
        with connect() as c:
            c.executemany("DELETE FROM push_subs WHERE endpoint = ?", [(e,) for e in stale])

    return sent
