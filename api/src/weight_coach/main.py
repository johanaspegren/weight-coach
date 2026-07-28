import logging

from . import http as _http

_http.install()  # must run before any TLS request

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import migrate
from .routes import checkin, daily, meals, oura, push, tuya, weight, workouts


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    migrate()
    app = FastAPI(title="weight-coach", version="0.1.0")

    app.include_router(weight.router)
    app.include_router(checkin.router)
    app.include_router(daily.router)
    app.include_router(meals.router)
    app.include_router(workouts.router)
    app.include_router(oura.router)
    app.include_router(tuya.router)
    app.include_router(push.router)

    @app.get("/health")
    def health():
        return {"ok": True}

    if settings.web_dist.exists():
        app.mount("/", StaticFiles(directory=str(settings.web_dist), html=True), name="web")

    return app


app = create_app()
