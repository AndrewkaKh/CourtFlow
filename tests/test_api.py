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
    settings = load_settings(db_path=tmp_path / "test.sqlite3", payment_provider="mock", demo_seed=False,
                             admin_password="")
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
    # Браузер должен перепроверять js/css после обновления сайта, а не брать старые из кэша
    assert client.get("/js/api.js").headers["cache-control"] == "no-cache"


# ---------- админка: цены ----------

PASSWORD = "secret-pass"


@pytest.fixture()
def admin(tmp_path):
    settings = load_settings(db_path=tmp_path / "test.sqlite3", payment_provider="mock", demo_seed=False,
                             admin_password=PASSWORD)
    with TestClient(create_app(settings)) as c:
        yield c


def new_pricing(client):
    p = client.get("/api/admin/pricing").json()
    tariffs = {k: {"base": t["base"] + 100, "peak": t["peak"] + 200} for k, t in p["tariffs"].items()}
    # Пик в будни утром и вечером, в выходные только днём: строки независимы
    return {"tariffs": tariffs, "peak": {"weekdays": [8, 9, 18, 19, 20], "weekends": [12, 13, 14]}}


def test_admin_disabled_without_password(client):
    assert client.get("/api/admin/session").json() == {"enabled": False, "logged_in": False}
    assert client.post("/api/admin/login", json={"password": ""}).status_code == 404
    assert client.get("/api/admin/pricing").status_code == 404


def test_admin_requires_login(admin):
    assert admin.get("/api/admin/pricing").status_code == 401
    assert admin.post("/api/admin/login", json={"password": "wrong"}).status_code == 401
    assert admin.put("/api/admin/pricing", json={"tariffs": {}, "peak": {"weekdays": [], "weekends": []}}).status_code == 401
    admin.cookies.set("cf_admin", "9999999999.forged", path="/api/admin")
    assert admin.get("/api/admin/pricing").status_code == 401


def test_admin_changes_prices(admin, tmp_path):
    assert admin.post("/api/admin/login", json={"password": PASSWORD}).status_code == 200
    assert admin.get("/api/admin/session").json()["logged_in"] is True

    body = new_pricing(admin)
    r = admin.put("/api/admin/pricing", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["updated_at"]

    # Клиентский справочник и сумма новой брони считаются по новым ценам
    courts = admin.get("/api/courts").json()
    assert courts["tariffs"] == body["tariffs"] and courts["peak"] == body["peak"]
    day, hour = future_slot(admin)
    amount = admin.post("/api/bookings", json=booking_body(day, hour)).json()["amount"]
    assert amount in (body["tariffs"]["padel"]["base"], body["tariffs"]["padel"]["peak"])

    # Цены переживают перезапуск сервера
    settings = load_settings(db_path=tmp_path / "test.sqlite3", payment_provider="mock", demo_seed=False,
                             admin_password=PASSWORD)
    with TestClient(create_app(settings)) as again:
        assert again.get("/api/courts").json()["tariffs"] == body["tariffs"]

    # Сброс возвращает цены из data/courts.json
    r = admin.delete("/api/admin/pricing").json()
    assert r["tariffs"] == r["defaults"]["tariffs"] and r["updated_at"] is None
    assert admin.get("/api/courts").json()["tariffs"] == r["defaults"]["tariffs"]


@pytest.mark.parametrize("patch", [
    lambda b: b["tariffs"].pop("clay"),
    lambda b: b["tariffs"].update(grass={"base": 1, "peak": 1}),
    lambda b: b["tariffs"]["padel"].update(base=0),
    lambda b: b["tariffs"]["padel"].update(peak=1_000_000),
    lambda b: b["peak"].update(weekdays=[3]),
    lambda b: b["peak"].update(weekends=[23]),
    lambda b: b["peak"].pop("weekends"),
])
def test_admin_pricing_validation(admin, patch):
    admin.post("/api/admin/login", json={"password": PASSWORD})
    body = new_pricing(admin)
    patch(body)
    assert admin.put("/api/admin/pricing", json=body).status_code == 422


def test_admin_page_served(admin):
    r = admin.get("/admin/")
    assert r.status_code == 200 and "Цены на аренду" in r.text


def test_peak_hours_by_day_type():
    from datetime import date
    from backend.config import ROOT
    from backend.courts import load_catalog
    cat = load_catalog(ROOT / "data" / "courts.json")
    t = cat.raw["tariffs"]["padel"]
    cat = cat.with_pricing(cat.raw["tariffs"], {"weekdays": [8, 18], "weekends": [12]})
    monday, saturday = date(2026, 10, 19), date(2026, 10, 24)
    assert cat.price("padel-12", monday, 8) == t["peak"]
    assert cat.price("padel-12", monday, 12) == t["base"]
    assert cat.price("padel-12", monday, 18) == t["peak"]
    assert cat.price("padel-12", saturday, 8) == t["base"]
    assert cat.price("padel-12", saturday, 12) == t["peak"]


def test_legacy_peak_format_converted():
    from backend.courts import normalize_peak
    assert normalize_peak({"from_hour": 21, "weekends": False}, 7, 23) == {"weekdays": [21, 22], "weekends": [21, 22]}
    assert normalize_peak({"from_hour": 23, "weekends": True}, 7, 23) == {"weekdays": [], "weekends": list(range(7, 23))}
    assert normalize_peak({"weekdays": [9, 8, 8], "weekends": []}, 7, 23) == {"weekdays": [8, 9], "weekends": []}


def test_legacy_stored_pricing_loads(tmp_path):
    import json
    from backend.db import connect, init_db
    db = tmp_path / "test.sqlite3"
    init_db(db)
    conn = connect(db)
    old = {"tariffs": {"padel": {"base": 1000, "peak": 2000}}, "peak": {"from_hour": 20, "weekends": False}}
    conn.execute("INSERT INTO pricing (id, data, updated_at) VALUES (1, ?, '2026-10-01T00:00:00')", (json.dumps(old),))
    conn.close()
    settings = load_settings(db_path=db, payment_provider="mock", demo_seed=False, admin_password="")
    with TestClient(create_app(settings)) as c:
        courts = c.get("/api/courts").json()
    assert courts["tariffs"]["padel"] == {"base": 1000, "peak": 2000}
    assert courts["peak"] == {"weekdays": [20, 21, 22], "weekends": [20, 21, 22]}
