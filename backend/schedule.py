"""Расписание: занятость слотов, удержание на время оплаты, демо-занятость."""
from __future__ import annotations

import hashlib
import sqlite3
from datetime import date, datetime, timedelta, timezone

from .courts import Catalog

FREE, BUSY, PAST = "f", "b", "p"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def expire_holds(conn: sqlite3.Connection) -> None:
    """Неоплаченные брони, у которых истекло удержание, освобождают слот."""
    conn.execute(
        "UPDATE bookings SET status='expired' WHERE status='pending' AND hold_until < ?",
        (utcnow().isoformat(),),
    )


def _demo_busy(court: dict, day: date, hour: int) -> bool:
    """Детерминированная «чужая» занятость, чтобы карта выглядела живой."""
    digest = hashlib.sha256(f"{court['id']}|{day.isoformat()}|{hour}".encode()).digest()
    roll = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    p = 0.35 if hour < 10 else 0.25 if hour < 17 else 0.7 if hour < 22 else 0.4
    if day.weekday() >= 5:
        p += 0.15
    if not court["indoor"]:
        p -= 0.12
    return roll < p


def seed_demo_day(conn: sqlite3.Connection, catalog: Catalog, day: date) -> None:
    """Один раз на дату заполняет демо-брони (source='seed')."""
    iso = day.isoformat()
    if conn.execute("SELECT 1 FROM seeded_dates WHERE date=?", (iso,)).fetchone():
        return
    now = utcnow().isoformat()
    rows = []
    for court in catalog.raw["courts"]:
        for hour in catalog.hours:
            if _demo_busy(court, day, hour):
                bid = f"seed-{court['id']}-{iso}-{hour}"
                rows.append((bid, "SEED", court["id"], iso, hour, "paid", "seed", now))
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.executemany(
            "INSERT OR IGNORE INTO bookings (id, code, court_id, date, hour, status, source, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.execute("INSERT OR IGNORE INTO seeded_dates (date) VALUES (?)", (iso,))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def availability(
    conn: sqlite3.Connection,
    catalog: Catalog,
    start: date,
    days: int,
    today: date,
    now_hour: int,
) -> dict[str, dict[str, str]]:
    """Для каждого корта и даты строка статусов по часам: f — свободно, b — занято, p — прошло.
    Символ i соответствует часу open_hour + i."""
    dates = [start + timedelta(days=i) for i in range(days)]
    isos = [d.isoformat() for d in dates]
    placeholders = ",".join("?" * len(isos))
    taken = {
        (r["court_id"], r["date"], r["hour"])
        for r in conn.execute(
            f"SELECT court_id, date, hour FROM bookings "
            f"WHERE status IN ('pending','paid') AND date IN ({placeholders})",
            isos,
        )
    }
    result: dict[str, dict[str, str]] = {}
    for court in catalog.raw["courts"]:
        per_day = {}
        for d, iso in zip(dates, isos):
            chars = []
            for hour in catalog.hours:
                if d < today or (d == today and hour <= now_hour):
                    chars.append(PAST)
                elif (court["id"], iso, hour) in taken:
                    chars.append(BUSY)
                else:
                    chars.append(FREE)
            per_day[iso] = "".join(chars)
        result[court["id"]] = per_day
    return result


def hold_deadline(minutes: int) -> str:
    return (utcnow() + timedelta(minutes=minutes)).isoformat()
