"""Справочник кортов и тарифов из data/courts.json."""
from __future__ import annotations

import json
from dataclasses import dataclass
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
        peak = self.raw["peak"]
        is_peak = hour >= peak["from_hour"] or (peak["weekends"] and day.weekday() >= 5)
        return tariff["peak"] if is_peak else tariff["base"]


def load_catalog(path: Path) -> Catalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in raw["courts"]}
    return Catalog(raw=raw, by_id=by_id, open_hour=raw["hours"]["open"], close_hour=raw["hours"]["close"])
