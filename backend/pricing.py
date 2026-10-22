"""Цены, которые менеджер меняет в админке. Хранятся в базе поверх data/courts.json."""
from __future__ import annotations

import json
import sqlite3

from .courts import Catalog, normalize_peak
from .schedule import utcnow


def load(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute("SELECT data, updated_at FROM pricing WHERE id=1").fetchone()
    if not row:
        return None
    return {**json.loads(row["data"]), "updated_at": row["updated_at"]}


def apply(default: Catalog, stored: dict | None) -> Catalog:
    """Тарифы из базы поверх справочника. Тариф, которого нет в базе
    (добавили в courts.json позже), остаётся с ценой из справочника."""
    if not stored:
        return default
    tariffs = {k: stored["tariffs"].get(k, v) for k, v in default.raw["tariffs"].items()}
    return default.with_pricing(tariffs, normalize_peak(stored["peak"], default.open_hour, default.close_hour))


def save(conn: sqlite3.Connection, tariffs: dict, peak: dict) -> str:
    updated_at = utcnow().isoformat()
    conn.execute(
        "INSERT INTO pricing (id, data, updated_at) VALUES (1, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
        (json.dumps({"tariffs": tariffs, "peak": peak}, ensure_ascii=False), updated_at),
    )
    return updated_at


def clear(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM pricing WHERE id=1")
