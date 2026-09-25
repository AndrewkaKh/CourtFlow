"""Сборка приложения: API + статика фронтенда."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import Settings, load_settings
from .courts import load_catalog
from .db import init_db
from .payments import make_provider
from .routes.api import router as api_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = FastAPI(title="CourtFlow", version="0.1.0", docs_url="/api/docs", redoc_url=None)
    app.state.settings = settings
    app.state.catalog = load_catalog(settings.courts_file)
    app.state.provider = make_provider(settings)
    init_db(settings.db_path)

    app.include_router(api_router)
    # Статика подключается последней, чтобы не перекрывать /api.
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
    return app
