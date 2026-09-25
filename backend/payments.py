"""Платёжные провайдеры.

mock      — оплата внутри сайта по кнопке, для разработки без ключей.
yookassa  — тестовый магазин ЮKassa (песочница): редирект на страницу оплаты,
            статус проверяется запросом к API ЮKassa (по вебхуку или при возврате на сайт).
"""
from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass

log = logging.getLogger("courtflow.payments")

YOOKASSA_API = "https://api.yookassa.ru/v3"


class PaymentError(RuntimeError):
    pass


@dataclass
class CreatedPayment:
    payment_id: str
    confirmation_url: str | None  # None — оплата подтверждается на сайте (mock)


class MockProvider:
    name = "mock"

    def create(self, booking_id: str, amount: int, description: str, return_url: str) -> CreatedPayment:
        return CreatedPayment(payment_id=f"mock-{booking_id}", confirmation_url=None)

    def status(self, payment_id: str) -> str | None:
        return None  # статус меняется только через /mock-pay


class YooKassaProvider:
    name = "yookassa"

    def __init__(self, shop_id: str, secret_key: str):
        if not shop_id or not secret_key:
            raise PaymentError("Для ЮKassa нужны YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY")
        token = base64.b64encode(f"{shop_id}:{secret_key}".encode()).decode()
        self._auth = f"Basic {token}"

    def _request(self, method: str, path: str, body: dict | None = None, idem_key: str | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{YOOKASSA_API}{path}", data=data, method=method)
        req.add_header("Authorization", self._auth)
        req.add_header("Content-Type", "application/json")
        if idem_key:
            req.add_header("Idempotence-Key", idem_key)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            log.error("ЮKassa %s %s -> %s: %s", method, path, e.code, detail)
            raise PaymentError(f"ЮKassa ответила {e.code}") from e
        except urllib.error.URLError as e:
            raise PaymentError(f"ЮKassa недоступна: {e.reason}") from e

    def create(self, booking_id: str, amount: int, description: str, return_url: str) -> CreatedPayment:
        payload = {
            "amount": {"value": f"{amount}.00", "currency": "RUB"},
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": return_url},
            "description": description[:128],
            "metadata": {"booking_id": booking_id},
        }
        data = self._request("POST", "/payments", payload, idem_key=str(uuid.uuid4()))
        return CreatedPayment(payment_id=data["id"], confirmation_url=data["confirmation"]["confirmation_url"])

    def status(self, payment_id: str) -> str | None:
        return self._request("GET", f"/payments/{payment_id}").get("status")


def make_provider(settings):
    if settings.payment_provider == "yookassa":
        return YooKassaProvider(settings.yookassa_shop_id, settings.yookassa_secret_key)
    return MockProvider()
