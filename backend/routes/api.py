"""HTTP API: корты, свободные слоты, брони, оплата."""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
import sqlite3
from datetime import date as Date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .. import schedule
from ..db import connect
from ..payments import PaymentError

log = logging.getLogger("courtflow.api")
router = APIRouter(prefix="/api")

PHONE_RE = re.compile(r"^\+?[\d\s\-()]{10,20}$")


# ---------- зависимости ----------

def get_conn(request: Request):
    conn = connect(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


def club_now(request: Request) -> datetime:
    return datetime.now(ZoneInfo(request.app.state.settings.timezone))


# ---------- модели ----------

class BookingIn(BaseModel):
    court_id: str
    date: Date
    hour: int
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=10, max_length=20)
    email: str | None = Field(default=None, max_length=120)
    consent: bool


def booking_out(row: sqlite3.Row, request: Request, confirmation_url: str | None = None) -> dict:
    catalog = request.app.state.catalog
    court = catalog.by_id.get(row["court_id"], {})
    return {
        "id": row["id"],
        "code": row["code"],
        "court_id": row["court_id"],
        "court_type": court.get("type"),
        "court_number": court.get("number"),
        "date": row["date"],
        "hour": row["hour"],
        "status": row["status"],
        "amount": row["amount"],
        "hold_until": row["hold_until"],
        "payment_mode": request.app.state.provider.name,
        "confirmation_url": confirmation_url,
    }


def load_booking(conn: sqlite3.Connection, booking_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM bookings WHERE id=? AND source='web'", (booking_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Бронь не найдена")
    return row


def mark_paid(conn: sqlite3.Connection, booking_id: str) -> bool:
    cur = conn.execute(
        "UPDATE bookings SET status='paid', paid_at=? WHERE id=? AND status='pending'",
        (schedule.utcnow().isoformat(), booking_id),
    )
    if cur.rowcount:
        row = conn.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone()
        # Здесь в итерации 2 — уведомление администратору (Telegram / почта).
        log.info("Оплачена бронь %s: %s %s %02d:00, %s ₽, %s",
                 row["code"], row["court_id"], row["date"], row["hour"], row["amount"], row["phone"])
        return True
    return False


# ---------- справочники ----------

@router.get("/config")
def get_config(request: Request):
    s = request.app.state.settings
    return {
        "payment_mode": request.app.state.provider.name,
        "metrika_id": s.metrika_id or None,
        "hold_minutes": s.hold_minutes,
        "booking_days": s.booking_days,
    }


@router.get("/courts")
def get_courts(request: Request):
    raw = request.app.state.catalog.raw
    return {k: raw[k] for k in ("zones", "hours", "tariffs", "peak", "courts")}


@router.get("/availability")
def get_availability(
    request: Request,
    start: Date | None = None,
    days: int = Query(7, ge=1, le=31),
    conn: sqlite3.Connection = Depends(get_conn),
):
    s = request.app.state.settings
    catalog = request.app.state.catalog
    now = club_now(request)
    today = now.date()
    start = start or today
    if start < today:
        start = today
    last = today + timedelta(days=s.booking_days - 1)
    days = max(1, min(days, (last - start).days + 1))

    schedule.expire_holds(conn)
    if s.demo_seed:
        for i in range(days):
            schedule.seed_demo_day(conn, catalog, start + timedelta(days=i))

    return {
        "today": today.isoformat(),
        "now_hour": now.hour,
        "open_hour": catalog.open_hour,
        "dates": [(start + timedelta(days=i)).isoformat() for i in range(days)],
        "courts": schedule.availability(conn, catalog, start, days, today, now.hour),
    }


# ---------- брони ----------

@router.post("/bookings", status_code=201)
def create_booking(body: BookingIn, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    s = request.app.state.settings
    catalog = request.app.state.catalog
    provider = request.app.state.provider
    now = club_now(request)
    today = now.date()

    if body.court_id not in catalog.by_id:
        raise HTTPException(422, "Такого корта нет")
    if body.hour not in catalog.hours:
        raise HTTPException(422, "Клуб в это время закрыт")
    if body.date < today or (body.date == today and body.hour <= now.hour):
        raise HTTPException(422, "Это время уже прошло")
    if body.date > today + timedelta(days=s.booking_days - 1):
        raise HTTPException(422, f"Бронировать можно на {s.booking_days} дней вперёд")
    if not body.consent:
        raise HTTPException(422, "Нужно согласие на обработку персональных данных")
    if not PHONE_RE.match(body.phone):
        raise HTTPException(422, "Проверьте номер телефона")

    schedule.expire_holds(conn)
    if s.demo_seed:
        schedule.seed_demo_day(conn, catalog, body.date)

    booking_id = secrets.token_urlsafe(12)
    code = "CF-" + str(int(hashlib.sha1(booking_id.encode()).hexdigest(), 16) % 9000 + 1000)
    amount = catalog.price(body.court_id, body.date, body.hour)
    try:
        conn.execute(
            "INSERT INTO bookings (id, code, court_id, date, hour, status, source, name, phone, email, "
            "amount, hold_until, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 'web', ?, ?, ?, ?, ?, ?)",
            (booking_id, code, body.court_id, body.date.isoformat(), body.hour, body.name.strip(),
             body.phone.strip(), (body.email or "").strip() or None, amount,
             schedule.hold_deadline(s.hold_minutes), schedule.utcnow().isoformat()),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Этот слот только что заняли. Выберите другое время.")

    court = catalog.by_id[body.court_id]
    kind = "Падел" if court["type"] == "padel" else "Теннис"
    description = f"{kind}, корт {court['number']}, {body.date.strftime('%d.%m')} {body.hour:02d}:00"
    try:
        payment = provider.create(booking_id, amount, description, f"{s.public_url}/?booking={booking_id}")
    except PaymentError as e:
        conn.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (booking_id,))
        raise HTTPException(502, f"Не удалось создать платёж: {e}")
    conn.execute("UPDATE bookings SET payment_id=? WHERE id=?", (payment.payment_id, booking_id))

    row = load_booking(conn, booking_id)
    return booking_out(row, request, payment.confirmation_url)


@router.get("/bookings/{booking_id}")
def get_booking(booking_id: str, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    schedule.expire_holds(conn)
    row = load_booking(conn, booking_id)
    provider = request.app.state.provider
    # Локально вебхук ЮKassa до нас не дойдёт, поэтому при возврате на сайт сверяем статус сами.
    if row["status"] == "pending" and provider.name == "yookassa" and row["payment_id"]:
        try:
            st = provider.status(row["payment_id"])
        except PaymentError:
            st = None
        if st == "succeeded":
            mark_paid(conn, booking_id)
        elif st == "canceled":
            conn.execute("UPDATE bookings SET status='cancelled' WHERE id=? AND status='pending'", (booking_id,))
        row = load_booking(conn, booking_id)
    return booking_out(row, request)


@router.post("/bookings/{booking_id}/mock-pay")
def mock_pay(booking_id: str, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    if request.app.state.provider.name != "mock":
        raise HTTPException(400, "Тестовая оплата на сайте выключена: используется ЮKassa")
    schedule.expire_holds(conn)
    row = load_booking(conn, booking_id)
    if row["status"] == "expired":
        raise HTTPException(409, "Время на оплату истекло. Выберите слот заново.")
    if row["status"] != "paid" and not mark_paid(conn, booking_id):
        raise HTTPException(409, "Бронь нельзя оплатить")
    return booking_out(load_booking(conn, booking_id), request)


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
    """Отмена неоплаченной брони: пользователь передумал на шаге оплаты."""
    load_booking(conn, booking_id)
    conn.execute("UPDATE bookings SET status='cancelled' WHERE id=? AND status='pending'", (booking_id,))
    return booking_out(load_booking(conn, booking_id), request)


# ---------- вебхук ЮKassa ----------

@router.post("/payments/yookassa/webhook")
async def yookassa_webhook(request: Request):
    provider = request.app.state.provider
    if provider.name != "yookassa":
        raise HTTPException(404)
    body = await request.json()
    payment_id = (body.get("object") or {}).get("id")
    if not payment_id:
        raise HTTPException(400, "Нет id платежа")
    # Телу уведомления не доверяем: статус берём из API ЮKassa.
    try:
        st = provider.status(payment_id)
    except PaymentError:
        raise HTTPException(502)
    conn = connect(request.app.state.settings.db_path)
    try:
        row = conn.execute("SELECT id FROM bookings WHERE payment_id=?", (payment_id,)).fetchone()
        if row and st == "succeeded":
            mark_paid(conn, row["id"])
        elif row and st == "canceled":
            conn.execute("UPDATE bookings SET status='cancelled' WHERE id=? AND status='pending'", (row["id"],))
    finally:
        conn.close()
    return {"ok": True}
