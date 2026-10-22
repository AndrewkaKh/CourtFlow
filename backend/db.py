"""SQLite: схема и подключение.

Защита от двойной брони — на уровне базы: частичный уникальный индекс
не даёт создать две активные брони (pending или paid) на один корт и час.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL,
    court_id    TEXT NOT NULL,
    date        TEXT NOT NULL,          -- YYYY-MM-DD, время клуба
    hour        INTEGER NOT NULL,       -- час начала, слот = 1 час
    status      TEXT NOT NULL,          -- pending | paid | cancelled | expired
    source      TEXT NOT NULL DEFAULT 'web',  -- web | seed (демо-занятость)
    name        TEXT,
    phone       TEXT,
    email       TEXT,
    amount      INTEGER NOT NULL DEFAULT 0,   -- рубли
    payment_id  TEXT,
    hold_until  TEXT,                   -- ISO UTC, до какого момента слот удерживается на оплату
    created_at  TEXT NOT NULL,
    paid_at     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_slot
    ON bookings (court_id, date, hour)
    WHERE status IN ('pending', 'paid');

CREATE INDEX IF NOT EXISTS bookings_by_date ON bookings (date);
CREATE INDEX IF NOT EXISTS bookings_by_payment ON bookings (payment_id);

CREATE TABLE IF NOT EXISTS seeded_dates (
    date TEXT PRIMARY KEY
);

-- Цены, которые менеджер задал в админке, поверх data/courts.json. Одна строка.
CREATE TABLE IF NOT EXISTS pricing (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    data        TEXT NOT NULL,          -- JSON {"tariffs": {...}, "peak": {"weekdays": [...], "weekends": [...]}}
    updated_at  TEXT NOT NULL           -- ISO UTC
);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db(db_path: Path) -> None:
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()
