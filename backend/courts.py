"""Справочник кортов и тарифов из data/courts.json."""
from __future__ import annotations

import json
from dataclasses import dataclass, replace
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Catalog:
    raw: dict
    by_id: dict
    open_hour: int
    close_hour: int  # последний слот начинается в close_hour - 1

    @property
    def hours(self) -> list[int]:
        return list(range(self.open_hour, self.close_hour))

    def price(self, court_id: str, day: date, hour: int) -> int:
        court = self.by_id[court_id]
        tariff = self.raw["tariffs"][court["tariff"]]
        peak_hours = self.raw["peak"]["weekends" if day.weekday() >= 5 else "weekdays"]
        return tariff["peak"] if hour in peak_hours else tariff["base"]

    def with_pricing(self, tariffs: dict, peak: dict) -> "Catalog":
        """Копия справочника с другими тарифами и часами пика."""
        return replace(self, raw={**self.raw, "tariffs": tariffs, "peak": peak})


def normalize_peak(peak: dict, open_hour: int, close_hour: int) -> dict:
    """Пиковые часы — часы начала слотов, отдельно для будней и выходных:
    {"weekdays": [17, 18, ...], "weekends": [...]}.
    Старый формат {"from_hour": 17, "weekends": true} переводится в новый."""
    if "from_hour" in peak:
        evening = list(range(peak["from_hour"], close_hour))
        return {"weekdays": evening, "weekends": list(range(open_hour, close_hour)) if peak["weekends"] else evening}
    return {k: sorted(set(peak.get(k, []))) for k in ("weekdays", "weekends")}


def load_catalog(path: Path) -> Catalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    open_hour, close_hour = raw["hours"]["open"], raw["hours"]["close"]
    raw["peak"] = normalize_peak(raw["peak"], open_hour, close_hour)
    by_id = {c["id"]: c for c in raw["courts"]}
    return Catalog(raw=raw, by_id=by_id, open_hour=open_hour, close_hour=close_hour)
