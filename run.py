"""Локальный запуск: python run.py"""
import uvicorn

from backend.config import load_settings
from backend.main import create_app

if __name__ == "__main__":
    settings = load_settings()
    print(f"\n  CourtFlow: {settings.public_url}  (оплата: {settings.payment_provider})")
    print(f"  API-документация: {settings.public_url}/api/docs\n")
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")
