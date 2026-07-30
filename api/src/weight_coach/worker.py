"""Background jobs: nightly check-in push + daily Oura sync."""
from __future__ import annotations

import logging

from . import http as _http

_http.install()  # must run before any TLS request

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .db import migrate
from .providers import estimator, garmin, oura, tuya
from .push_send import send_all

log = logging.getLogger(__name__)


def job_backfill_pending() -> None:
    try:
        estimator.retry_pending()
    except Exception:
        log.exception("pending backfill failed")


def job_checkin_push() -> None:
    # Backfill first so the app opens with fresh "In" numbers.
    job_backfill_pending()
    n = send_all(
        title="Nightly check-in",
        body="Two minutes: what did you eat today?",
        url="/#checkin",
    )
    log.info("Checkin push sent to %d device(s)", n)


def job_oura_sync() -> None:
    if not settings.oura_token:
        log.info("OURA_TOKEN missing — skipping sync")
    else:
        try:
            oura.sync(days=3)
        except Exception:
            log.exception("Oura sync failed")
    job_backfill_pending()


def job_garmin_sync() -> None:
    if not settings.garmin_email:
        return
    try:
        garmin.sync(days=3)
    except Exception:
        log.exception("Garmin sync failed")


def job_tuya_sync() -> None:
    if not settings.tuya_device_id:
        return
    try:
        tuya.sync_recent(hours=6)
    except Exception:
        log.exception("Tuya sync failed")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    migrate()

    sched = BlockingScheduler(timezone="Europe/Stockholm")
    sched.add_job(
        job_checkin_push,
        CronTrigger(hour=settings.checkin_hour, minute=settings.checkin_minute),
        id="checkin_push",
        replace_existing=True,
    )
    sched.add_job(
        job_oura_sync,
        CronTrigger(hour=6, minute=30),
        id="oura_sync",
        replace_existing=True,
    )
    # Also retry pending meal estimates hourly — cheap and picks up any
    # meals logged while both LLMs were down.
    sched.add_job(
        job_backfill_pending,
        CronTrigger(minute=17),
        id="pending_backfill",
        replace_existing=True,
    )
    # Poll Tuya every 5 min — weight only appears when you step on the scale,
    # so we want short latency between weighing and seeing it on the dashboard.
    sched.add_job(
        job_tuya_sync,
        CronTrigger(minute="*/5"),
        id="tuya_sync",
        replace_existing=True,
    )
    # Garmin every 20 min — enough to catch morning activity by the time you
    # open the dashboard; not aggressive enough to trigger rate-limits.
    sched.add_job(
        job_garmin_sync,
        CronTrigger(minute="7,27,47"),
        id="garmin_sync",
        replace_existing=True,
    )
    log.info(
        "worker up — checkin=%02d:%02d, oura=06:30, garmin=20min, tuya=5min, backfill=hourly",
        settings.checkin_hour,
        settings.checkin_minute,
    )
    sched.start()


if __name__ == "__main__":
    main()
