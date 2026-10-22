"""Сборка приложения: API + статика фронтенда."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .config import Settings, load_settings
from . import pricing
from .courts import load_catalog
from .db import connect, init_db
from .payments import make_provider
from .routes.admin import router as admin_router
from .routes.api import router as api_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = FastAPI(title="CourtFlow", version="0.1.0", docs_url="/api/docs", redoc_url=None)
    app.state.settings = settings
    app.state.provider = make_provider(settings)
    init_db(settings.db_path)
    app.state.default_catalog = load_catalog(settings.courts_file)
    conn = connect(settings.db_path)
    try:
        app.state.catalog = pricing.apply(app.state.default_catalog, pricing.load(conn))
    finally:
        conn.close()

    app.include_router(api_router)
    app.include_router(admin_router)

    @app.middleware("http")
    async def revalidate_static(request: Request, call_next):
        response = await call_next(request)
        if not request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-cache")
        return response
    # Статика подключается последней, чтобы не перекрывать /api.
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
    return app
