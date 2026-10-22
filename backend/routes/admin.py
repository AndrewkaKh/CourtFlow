"""API админки: вход менеджера по паролю и правка цен."""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import sqlite3
import time
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import pricing
from ..courts import normalize_peak
from .api import get_conn

log = logging.getLogger("courtflow.admin")
router = APIRouter(prefix="/api/admin")

COOKIE = "cf_admin"
SESSION_HOURS = 12
MAX_PRICE = 100_000


# ---------- сессия ----------
# Кука — срок действия и подпись HMAC с паролем в качестве ключа.
# Смена ADMIN_PASSWORD в .env завершает все открытые сессии.

def _sign(password: str, exp: int) -> str:
    return hmac.new(password.encode(), str(exp).encode(), hashlib.sha256).hexdigest()


def make_token(password: str) -> str:
    exp = int(time.time()) + SESSION_HOURS * 3600
    return f"{exp}.{_sign(password, exp)}"


def token_valid(password: str, token: str | None) -> bool:
    try:
        exp_s, sig = (token or "").split(".", 1)
        exp = int(exp_s)
    except ValueError:
        return False
    return exp > time.time() and hmac.compare_digest(sig, _sign(password, exp))


def admin_password(request: Request) -> str:
    password = request.app.state.settings.admin_password
    if not password:
        raise HTTPException(404, "Админка выключена: задайте ADMIN_PASSWORD в .env и перезапустите сервер")
    return password


def require_admin(request: Request) -> None:
    if not token_valid(admin_password(request), request.cookies.get(COOKIE)):
        raise HTTPException(401, "Войдите в админку")


# ---------- модели ----------

class LoginIn(BaseModel):
    password: str = Field(max_length=200)


class TariffIn(BaseModel):
    base: int = Field(ge=1, le=MAX_PRICE)
    peak: int = Field(ge=1, le=MAX_PRICE)


class PeakIn(BaseModel):
    """Часы начала слотов по пиковой цене, отдельно будни и выходные."""
    weekdays: list[int] = Field(max_length=24)
    weekends: list[int] = Field(max_length=24)


class PricingIn(BaseModel):
    tariffs: dict[str, TariffIn]
    peak: PeakIn


def hour_ranges(hours: list[int]) -> str:
    """[17, 18, 19, 21] -> «17–20, 21–22» для лога."""
    out, start = [], None
    for i, h in enumerate(hours):
        start = h if start is None else start
        if i + 1 == len(hours) or hours[i + 1] != h + 1:
            out.append(f"{start}–{h + 1}")
            start = None
    return ", ".join(out) or "нет"


def pricing_out(request: Request, updated_at: str | None) -> dict:
    catalog = request.app.state.catalog
    default = request.app.state.default_catalog.raw
    return {
        "tariffs": catalog.raw["tariffs"],
        "peak": catalog.raw["peak"],
        "hours": catalog.raw["hours"],
        "defaults": {"tariffs": default["tariffs"], "peak": default["peak"]},
        "courts_per_tariff": dict(Counter(c["tariff"] for c in catalog.raw["courts"])),
        "updated_at": updated_at,
    }


# ---------- вход ----------

@router.get("/session")
def get_session(request: Request):
    password = request.app.state.settings.admin_password
    return {"enabled": bool(password),
            "logged_in": bool(password) and token_valid(password, request.cookies.get(COOKIE))}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    password = admin_password(request)
    if not secrets.compare_digest(body.password.encode(), password.encode()):
        log.warning("Неудачный вход в админку с %s", request.client.host if request.client else "?")
        raise HTTPException(401, "Неверный пароль")
    response.set_cookie(
        COOKIE, make_token(password), max_age=SESSION_HOURS * 3600, path="/api/admin",
        httponly=True, samesite="strict", secure=request.app.state.settings.public_url.startswith("https://"),
    )
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/api/admin")
    return {"ok": True}


# ---------- цены ----------

@router.get("/pricing", dependencies=[Depends(require_admin)])
def get_pricing(request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    stored = pricing.load(conn)
    return pricing_out(request, stored and stored["updated_at"])


@router.put("/pricing", dependencies=[Depends(require_admin)])
def put_pricing(body: PricingIn, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    catalog = request.app.state.catalog
    if set(body.tariffs) != set(catalog.raw["tariffs"]):
        raise HTTPException(422, "Нужно указать цены для всех тарифов")
    if any(h not in catalog.hours for h in body.peak.weekdays + body.peak.weekends):
        raise HTTPException(422, f"Пиковые часы должны быть в часы работы клуба: "
                                 f"{catalog.open_hour}:00–{catalog.close_hour}:00")

    tariffs = {k: t.model_dump() for k, t in body.tariffs.items()}
    peak = normalize_peak(body.peak.model_dump(), catalog.open_hour, catalog.close_hour)
    updated_at = pricing.save(conn, tariffs, peak)
    request.app.state.catalog = catalog.with_pricing(tariffs, peak)
    log.info("Цены изменены: %s; пик в будни %s, в выходные %s",
             ", ".join(f"{k} {t['base']}/{t['peak']}" for k, t in tariffs.items()),
             hour_ranges(peak["weekdays"]), hour_ranges(peak["weekends"]))
    return pricing_out(request, updated_at)


@router.delete("/pricing", dependencies=[Depends(require_admin)])
def reset_pricing(request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    pricing.clear(conn)
    request.app.state.catalog = request.app.state.default_catalog
    log.info("Цены сброшены к data/courts.json")
    return pricing_out(request, None)
