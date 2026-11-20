"""MongoDB store for daily bars, index values, and prediction snapshots.

Collections (in the same database as the Nest API):
    research_bars            one doc per (symbol, date): close, high, low, open, volume
    research_index_values    one doc per (index, date): value
    research_bar_revisions   source values that disagreed with an already stored, settled bar
    research_jobs            sync / refresh job log
    research_predictions     latest prediction + explanation snapshot per data version

Point-in-time rule: a settled bar is never overwritten. If the source later reports a
different value (e.g. a split adjustment), the new value goes to `research_bar_revisions`
for audit and the stored bar stays as first seen. Only a provisional bar (fetched on its
own trading day, so possibly intraday) may be refreshed.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from dataclasses import dataclass, field

import pandas as pd
from pymongo import ASCENDING, DESCENDING, MongoClient, UpdateOne
from pymongo.database import Database

from .cse_public import SOURCE_INDEX, SOURCE_STOCK, colombo_today

REL_TOL = 1e-6


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _differs(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return (a is None) != (b is None)
    return abs(a - b) > REL_TOL * max(abs(a), abs(b), 1.0)


@dataclass
class UpsertReport:
    key: str
    fetched: int = 0
    inserted: int = 0
    refreshed: int = 0
    unchanged: int = 0
    revised: int = 0
    first: str | None = None
    last: str | None = None
    error: str | None = None
    revisions: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        d = self.__dict__.copy()
        d["revisions"] = d["revisions"][:5]  # a sample is enough for the job log
        return d


class ResearchStore:
    def __init__(self, uri: str):
        self.client = MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
        self.db: Database = self.client.get_default_database("sam-ai")
        self.bars = self.db["research_bars"]
        self.index_values = self.db["research_index_values"]
        self.revisions = self.db["research_bar_revisions"]
        self.jobs = self.db["research_jobs"]
        self.predictions = self.db["research_predictions"]

    def ensure_indexes(self) -> None:
        self.bars.create_index([("symbol", ASCENDING), ("date", ASCENDING)], unique=True)
        self.index_values.create_index([("index", ASCENDING), ("date", ASCENDING)], unique=True)
        self.jobs.create_index([("started_at", DESCENDING)])
        self.predictions.create_index([("created_at", DESCENDING)])

    def ping(self) -> bool:
        try:
            self.client.admin.command("ping")
            return True
        except Exception:  # noqa: BLE001
            return False

    # ------------------------------------------------------------------ writes

    def _upsert(self, coll, key_field: str, key: str, rows: list[dict], value_fields: tuple[str, ...],
                source: str) -> UpsertReport:
        report = UpsertReport(key=key, fetched=len(rows))
        if not rows:
            return report
        report.first, report.last = rows[0]["date"], rows[-1]["date"]
        existing = {d["date"]: d for d in coll.find({key_field: key, "date": {"$gte": rows[0]["date"]}})}
        today, now = colombo_today(), _now()
        ops = []
        for row in rows:
            doc = {f: row.get(f) for f in value_fields}
            provisional = row["date"] >= today  # fetched on its own trading day -> may still change
            old = existing.get(row["date"])
            if old is None:
                ops.append(UpdateOne(
                    {key_field: key, "date": row["date"]},
                    {"$setOnInsert": {**doc, "source": source, "provisional": provisional,
                                      "first_seen_at": now, "fetched_at": now}},
                    upsert=True))
                report.inserted += 1
                continue
            changed = any(_differs(old.get(f), doc[f]) for f in value_fields)
            if not changed:
                if old.get("provisional") and not provisional:
                    ops.append(UpdateOne({"_id": old["_id"]}, {"$set": {"provisional": False, "fetched_at": now}}))
                report.unchanged += 1
            elif old.get("provisional"):
                ops.append(UpdateOne({"_id": old["_id"]},
                                     {"$set": {**doc, "provisional": provisional, "fetched_at": now}}))
                report.refreshed += 1
            else:
                rev = {key_field: key, "date": row["date"], "stored": {f: old.get(f) for f in value_fields},
                       "source_value": doc, "source": source, "seen_at": now}
                self.revisions.update_one({key_field: key, "date": row["date"], "source_value": doc},
                                          {"$setOnInsert": rev}, upsert=True)
                report.revised += 1
                report.revisions.append({"date": row["date"], "stored": old.get(value_fields[0]),
                                         "source": doc[value_fields[0]]})
        if ops:
            coll.bulk_write(ops, ordered=False)
        return report

    def upsert_bars(self, symbol: str, bars: list[dict]) -> UpsertReport:
        return self._upsert(self.bars, "symbol", symbol, bars, ("close", "high", "low", "open", "volume"),
                            SOURCE_STOCK)

    def upsert_index(self, index: str, values: list[dict]) -> UpsertReport:
        return self._upsert(self.index_values, "index", index, values, ("value",), SOURCE_INDEX)

    # ------------------------------------------------------------------ reads

    def load_panel(self, symbols: list[str]) -> pd.DataFrame:
        """Same schema as `data.load_public_stocks`: symbol, date, open, high, low, close, volume."""
        docs = list(self.bars.find({"symbol": {"$in": symbols}},
                                   {"_id": 0, "symbol": 1, "date": 1, "open": 1, "high": 1, "low": 1,
                                    "close": 1, "volume": 1}))
        if not docs:
            raise ValueError("No bars in the database yet. Run a sync first.")
        panel = pd.DataFrame(docs)
        missing = sorted(set(symbols) - set(panel["symbol"]))
        if missing:
            raise ValueError(f"No bars in the database for: {', '.join(missing)}. Run a sync first.")
        panel["date"] = pd.to_datetime(panel["date"])
        for c in ("open", "high", "low", "close", "volume"):
            panel[c] = pd.to_numeric(panel[c], errors="coerce")
        panel = panel.dropna(subset=["close"])
        return panel.sort_values(["symbol", "date"]).reset_index(drop=True)[
            ["symbol", "date", "open", "high", "low", "close", "volume"]]

    def recent_bars(self, symbol: str, days: int) -> list[dict]:
        """The last `days` stored bars for one symbol, oldest first (real source values, no gap filling)."""
        docs = list(self.bars.find({"symbol": symbol},
                                   {"_id": 0, "date": 1, "open": 1, "high": 1, "low": 1, "close": 1, "volume": 1,
                                    "provisional": 1})
                    .sort("date", DESCENDING).limit(days))
        return docs[::-1]

    def load_indexes(self) -> pd.DataFrame:
        """Same schema as `data.load_public_indexes`: date, aspi, spsl20."""
        docs = list(self.index_values.find({}, {"_id": 0, "index": 1, "date": 1, "value": 1}))
        if not docs:
            raise ValueError("No index values in the database yet. Run a sync first.")
        wide = pd.DataFrame(docs).pivot(index="date", columns="index", values="value")
        for c in ("aspi", "spsl20"):
            if c not in wide:
                wide[c] = float("nan")
        wide.index = pd.to_datetime(wide.index)
        wide.index.name = "date"
        return wide.sort_index()[["aspi", "spsl20"]].reset_index()

    def coverage(self) -> dict:
        def agg(coll, key_field):
            rows = coll.aggregate([
                {"$group": {"_id": f"${key_field}", "count": {"$sum": 1}, "first": {"$min": "$date"},
                            "last": {"$max": "$date"}, "updated": {"$max": "$fetched_at"}}},
                {"$sort": {"_id": 1}},
            ])
            return [{"key": r["_id"], "count": r["count"], "first": r["first"], "last": r["last"],
                     "last_fetched_at": r["updated"].isoformat() if r.get("updated") else None} for r in rows]

        return {"stocks": agg(self.bars, "symbol"), "indexes": agg(self.index_values, "index"),
                "revisions": self.revisions.count_documents({})}

    def data_version(self, symbols: list[str], coverage: dict | None = None) -> str:
        """Fingerprint of the stored data the models would see; changes whenever a bar is added or refreshed."""
        cov = coverage or self.coverage()
        parts = [f"{r['key']}:{r['count']}:{r['last']}:{r['last_fetched_at']}" for r in cov["stocks"]
                 if r["key"] in symbols]
        parts += [f"{r['key']}:{r['count']}:{r['last']}:{r['last_fetched_at']}" for r in cov["indexes"]]
        return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]

    # ------------------------------------------------------------------ snapshots

    def save_snapshot(self, snapshot: dict) -> None:
        self.predictions.insert_one(snapshot)
        # Keep the last few snapshots only; they are derived data and can be rebuilt.
        old = list(self.predictions.find({}, {"_id": 1}).sort("created_at", DESCENDING).skip(5))
        if old:
            self.predictions.delete_many({"_id": {"$in": [d["_id"] for d in old]}})

    def latest_snapshot(self) -> dict | None:
        return self.predictions.find_one({}, {"_id": 0}, sort=[("created_at", DESCENDING)])
