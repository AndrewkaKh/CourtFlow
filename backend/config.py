"""Настройки приложения из переменных окружения и файла .env в корне проекта."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Простейший разбор .env: KEY=VALUE, строки с # пропускаются.
    Уже заданные переменные окружения не перезаписываются."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    public_url: str
    db_path: Path
    courts_file: Path
    frontend_dir: Path
    timezone: str
    hold_minutes: int
    booking_days: int
    demo_seed: bool
    payment_provider: str  # "mock" или "yookassa"
    yookassa_shop_id: str
    yookassa_secret_key: str
    metrika_id: str
    admin_password: str  # пусто — админка выключена


def load_settings(**overrides) -> Settings:
    _load_dotenv(ROOT / ".env")
    env = os.environ.get
    port = int(env("PORT", "8000"))
    shop_id = env("YOOKASSA_SHOP_ID", "")
    secret = env("YOOKASSA_SECRET_KEY", "")
    provider = env("PAYMENT_PROVIDER", "yookassa" if shop_id and secret else "mock").lower()
    values = dict(
        host=env("HOST", "127.0.0.1"),
        port=port,
        public_url=env("PUBLIC_URL", f"http://127.0.0.1:{port}").rstrip("/"),
        db_path=Path(env("DB_PATH", str(ROOT / "var" / "courtflow.sqlite3"))),
        courts_file=ROOT / "data" / "courts.json",
        frontend_dir=ROOT / "frontend",
        timezone=env("TIMEZONE", "Europe/Moscow"),
        hold_minutes=int(env("HOLD_MINUTES", "10")),
        booking_days=int(env("BOOKING_DAYS", "14")),
        demo_seed=env("DEMO_SEED", "1") == "1",
        payment_provider=provider,
        yookassa_shop_id=shop_id,
        yookassa_secret_key=secret,
        metrika_id=env("METRIKA_ID", ""),
        admin_password=env("ADMIN_PASSWORD", ""),
    )
    values.update(overrides)
    return Settings(**values)
