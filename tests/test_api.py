"""Проверка основного сценария брони и защиты от двойной брони.
Запуск: python -m pytest
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from backend.config import load_settings
from backend.main import create_app


@pytest.fixture()
def client(tmp_path):
    settings = load_settings(db_path=tmp_path / "test.sqlite3", payment_provider="mock", demo_seed=False)
    with TestClient(create_app(settings)) as c:
        yield c


def future_slot(client):
    """Первый свободный слот на завтра на падел-корте 12."""
    avail = client.get("/api/availability", params={"days": 2}).json()
    day = avail["dates"][1]
    row = avail["courts"]["padel-12"][day]
    hour = avail["open_hour"] + row.index("f")
    return day, hour


def booking_body(day, hour, **extra):
    body = {"court_id": "padel-12", "date": day, "hour": hour, "name": "Катя",
            "phone": "+7 900 000-00-00", "consent": True}
    body.update(extra)
    return body


def test_catalog_has_all_courts(client):
    courts = client.get("/api/courts").json()["courts"]
    assert len(courts) == 37
    assert sum(c["type"] == "padel" for c in courts) == 28
    assert len({c["id"] for c in courts}) == 37  # номера повторяются, id — нет


def test_full_booking_flow(client):
    day, hour = future_slot(client)
    r = client.post("/api/bookings", json=booking_body(day, hour))
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["status"] == "pending" and b["amount"] > 0

    # Слот удерживается и уже недоступен другим
    row = client.get("/api/availability", params={"days": 2}).json()["courts"]["padel-12"][day]
    assert row[hour - 7] == "b"

    paid = client.post(f"/api/bookings/{b['id']}/mock-pay").json()
    assert paid["status"] == "paid"
    assert client.get(f"/api/bookings/{b['id']}").json()["status"] == "paid"


def test_no_double_booking(client):
    day, hour = future_slot(client)
    assert client.post("/api/bookings", json=booking_body(day, hour)).status_code == 201
    second = client.post("/api/bookings", json=booking_body(day, hour, name="Андрей"))
    assert second.status_code == 409


def test_cancel_releases_slot(client):
    day, hour = future_slot(client)
    b = client.post("/api/bookings", json=booking_body(day, hour)).json()
    client.post(f"/api/bookings/{b['id']}/cancel")
    assert client.post("/api/bookings", json=booking_body(day, hour)).status_code == 201


def test_expired_hold_releases_slot(client):
    day, hour = future_slot(client)
    b = client.post("/api/bookings", json=booking_body(day, hour)).json()
    # Сдвигаем срок удержания в прошлое
    from backend.db import connect
    conn = connect(client.app.state.settings.db_path)
    conn.execute("UPDATE bookings SET hold_until='2000-01-01T00:00:00+00:00' WHERE id=?", (b["id"],))
    conn.close()
    assert client.post(f"/api/bookings/{b['id']}/mock-pay").status_code == 409
    assert client.post("/api/bookings", json=booking_body(day, hour)).status_code == 201


@pytest.mark.parametrize("patch,status", [
    ({"consent": False}, 422),
    ({"phone": "123"}, 422),
    ({"court_id": "padel-99"}, 422),
    ({"hour": 3}, 422),
])
def test_validation(client, patch, status):
    day, hour = future_slot(client)
    assert client.post("/api/bookings", json={**booking_body(day, hour), **patch}).status_code == status


def test_past_and_far_dates_rejected(client):
    avail = client.get("/api/availability", params={"days": 1}).json()
    from datetime import date
    today = date.fromisoformat(avail["today"])
    yesterday = (today - timedelta(days=1)).isoformat()
    far = (today + timedelta(days=60)).isoformat()
    assert client.post("/api/bookings", json=booking_body(yesterday, 12)).status_code == 422
    assert client.post("/api/bookings", json=booking_body(far, 12)).status_code == 422


def test_frontend_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "CourtFlow" in r.text
