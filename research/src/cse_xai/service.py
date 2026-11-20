"""HTTP API for the research pipeline. The Nest API calls this service, never the browser directly.

Run (from research/, venv active):
    python -m uvicorn cse_xai.service:app --port 8001

Endpoints
    GET  /health
    GET  /data/status              stored-data coverage, latest job, prediction snapshot freshness
    POST /sync?refresh=&force=     fetch the public cse.lk year, insert missing bars, then refresh predictions
    POST /refresh?force=           retrain + predict + explain on the stored data
    GET  /jobs/current             running job, or the most recent one
    GET  /predictions              latest prediction for every symbol (no explanations)
    GET  /predictions/{symbol}     full prediction: per-model probabilities, explanation, reliability, caveats
    GET  /bars/{symbol}?days=      stored daily bars; a symbol not stored yet is fetched from cse.lk and stored first

Configuration (environment variables, or the repo-root .env):
    MONGO_URI           default mongodb://127.0.0.1:27017/sam-ai
    RESEARCH_CONFIG     default configs/dev_1y.yaml (relative to research/)
    CSE_REQUEST_DELAY   seconds between cse.lk requests, default 1.0
"""

from __future__ import annotations

import contextlib
import datetime as dt
import functools
import os
import threading
import traceback
import urllib.error
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query

from .config import RESEARCH_ROOT, load_config
from .cse_public import CsePublicClient
from .store import ResearchStore, UpsertReport

MAX_LOG_LINES = 400


@functools.cache
def _read_dotenv() -> dict[str, str]:
    path = RESEARCH_ROOT.parent / ".env"
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def _setting(name: str, default: str) -> str:
    return os.environ.get(name) or _read_dotenv().get(name) or default


CONFIG_PATH = Path(_setting("RESEARCH_CONFIG", "configs/dev_1y.yaml"))
if not CONFIG_PATH.is_absolute():
    CONFIG_PATH = RESEARCH_ROOT / CONFIG_PATH
CFG = load_config(CONFIG_PATH)
STORE = ResearchStore(_setting("MONGO_URI", "mongodb://127.0.0.1:27017/sam-ai"))
CLIENT = CsePublicClient(delay=float(_setting("CSE_REQUEST_DELAY", "1.0")))
INDEXES = ["aspi", "spsl20"]


def _now() -> str:
    return dt.datetime.now(dt.UTC).isoformat()


def normalise_symbol(raw: str) -> str:
    s = raw.strip().upper()
    return s if "." in s else f"{s}.N0000"


# --------------------------------------------------------------------------- jobs

class JobRunner:
    """Runs one job at a time in a background thread and mirrors its state to MongoDB."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.current: dict | None = None

    def _save(self, job: dict) -> None:
        with contextlib.suppress(Exception):  # job logging must never kill the job
            STORE.jobs.replace_one({"id": job["id"]}, {k: v for k, v in job.items() if k != "_id"}, upsert=True)

    @staticmethod
    def mark_interrupted() -> None:
        """Jobs still 'running' in the database died with a previous process; close them so the UI stops waiting."""
        STORE.jobs.update_many({"status": "running"}, {"$set": {
            "status": "failed", "stage": "done", "finished_at": _now(),
            "error": "Interrupted: the research service stopped before the job finished. Run it again."}})

    def log(self, job: dict, msg: str) -> None:
        job["log"].append(f"{dt.datetime.now().strftime('%H:%M:%S')} {msg}")
        job["log"] = job["log"][-MAX_LOG_LINES:]
        job["updated_at"] = _now()
        self._save(job)

    def start(self, kind: str, sync: bool, refresh: bool, force: bool) -> tuple[dict, bool]:
        with self.lock:
            if self.current and self.current["status"] == "running":
                return self.current, False
            job = {"id": uuid.uuid4().hex[:12], "kind": kind, "status": "running", "stage": "starting",
                   "started_at": _now(), "updated_at": _now(), "finished_at": None, "options":
                   {"sync": sync, "refresh": refresh, "force": force}, "sync_report": None,
                   "refresh_result": None, "error": None, "log": []}
            self.current = job
        self._save(job)
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job, True

    def _run(self, job: dict) -> None:
        try:
            if job["options"]["sync"]:
                job["stage"] = "sync"
                job["sync_report"] = run_sync(lambda m: self.log(job, m))
            if job["options"]["refresh"]:
                job["stage"] = "refresh"
                job["refresh_result"] = run_refresh(job["options"]["force"], lambda m: self.log(job, m))
            job["status"] = "succeeded"
        except Exception as exc:  # noqa: BLE001
            job["status"], job["error"] = "failed", f"{type(exc).__name__}: {exc}"
            self.log(job, "ERROR " + traceback.format_exc(limit=3))
        finally:
            job["stage"], job["finished_at"] = "done", _now()
            self._save(job)

    def latest(self) -> dict | None:
        if self.current:
            return self.current
        return STORE.jobs.find_one({}, {"_id": 0}, sort=[("started_at", -1)])


JOBS = JobRunner()


def run_sync(log) -> dict:
    """Fetch the public year for every configured symbol + index; insert what the database lacks."""
    log(f"sync: {len(CFG.symbols)} stocks + {len(INDEXES)} indexes from cse.lk (public 1-year endpoints)")
    reports = {"stocks": [], "indexes": []}
    for index in INDEXES:
        try:
            rep = STORE.upsert_index(index, CLIENT.index_values(index))
        except Exception as exc:  # noqa: BLE001 - one failing series must not stop the rest
            rep = UpsertReport(key=index, error=str(exc))
        reports["indexes"].append(rep.as_dict())
        log(f"  {index:<12} fetched {rep.fetched:>4} | new {rep.inserted:>3} | refreshed {rep.refreshed} | "
            f"revised {rep.revised}" + (f" | ERROR {rep.error}" if rep.error else ""))
    for symbol in CFG.symbols:
        try:
            rep = STORE.upsert_bars(symbol, CLIENT.stock_bars(symbol))
        except Exception as exc:  # noqa: BLE001
            rep = UpsertReport(key=symbol, error=str(exc))
        reports["stocks"].append(rep.as_dict())
        log(f"  {symbol:<12} fetched {rep.fetched:>4} | new {rep.inserted:>3} | refreshed {rep.refreshed} | "
            f"revised {rep.revised}" + (f" | ERROR {rep.error}" if rep.error else ""))
    all_reps = reports["stocks"] + reports["indexes"]
    reports["totals"] = {k: sum(r[k] for r in all_reps) for k in ("fetched", "inserted", "refreshed", "revised")}
    reports["errors"] = sum(1 for r in all_reps if r["error"])
    log(f"sync done: {reports['totals']['inserted']} new bars, {reports['totals']['refreshed']} refreshed, "
        f"{reports['totals']['revised']} source revisions kept for audit, {reports['errors']} errors")
    return reports


def run_refresh(force: bool, log) -> dict:
    from .live import refresh  # heavy imports (torch) only when needed

    version = STORE.data_version(CFG.symbols)
    latest = STORE.latest_snapshot()
    if not force and latest and latest.get("data_version") == version and latest.get("config") == CFG.name:
        log("refresh skipped: no new data since the last prediction snapshot")
        return {"skipped": True, "data_version": version}
    snapshot = refresh(STORE, CFG, version, log=log)
    STORE.save_snapshot(dict(snapshot))
    return {"skipped": False, "data_version": version, "as_of": snapshot["as_of"],
            "elapsed_s": snapshot["elapsed_s"]}


# --------------------------------------------------------------------------- HTTP

@contextlib.asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    with contextlib.suppress(Exception):  # /health reports the database state
        STORE.ensure_indexes()
        JobRunner.mark_interrupted()
    yield


app = FastAPI(title="sam-ai research service", version="1", lifespan=_lifespan)


def _snapshot_or_404() -> dict:
    snap = STORE.latest_snapshot()
    if not snap:
        raise HTTPException(404, "No predictions yet. Click 'Sync data' (or POST /sync) to fetch data and "
                                 "build predictions.")
    return snap


@app.get("/health")
def health() -> dict:
    return {"ok": True, "mongo": STORE.ping(), "config": CFG.name, "symbols": CFG.symbols}


@app.get("/data/status")
def data_status() -> dict:
    cov = STORE.coverage()
    snap = STORE.predictions.find_one({}, {"_id": 0, "created_at": 1, "as_of": 1, "data_version": 1, "config": 1},
                                      sort=[("created_at", -1)])
    version = STORE.data_version(CFG.symbols, cov)
    job = JOBS.latest()
    return {
        "config": CFG.name,
        "symbols": CFG.symbols,
        "indexes": INDEXES,
        "coverage": cov,
        "missing_symbols": sorted(set(CFG.symbols) - {r["key"] for r in cov["stocks"]}),
        "data_version": version,
        "snapshot": {**snap, "stale": snap.get("data_version") != version} if snap else None,
        "job": {k: job.get(k) for k in ("id", "kind", "status", "stage", "started_at", "finished_at", "error")}
        if job else None,
    }


@app.post("/sync", status_code=202)
def sync(refresh: bool = True, force: bool = False) -> dict:
    job, started = JOBS.start("sync", sync=True, refresh=refresh, force=force)
    return {"started": started, "job": job}


@app.post("/refresh", status_code=202)
def refresh_predictions(force: bool = False) -> dict:
    job, started = JOBS.start("refresh", sync=False, refresh=True, force=force)
    return {"started": started, "job": job}


@app.get("/jobs/current")
def current_job() -> dict:
    job = JOBS.latest()
    if not job:
        raise HTTPException(404, "No jobs have run yet.")
    return job


@app.get("/predictions")
def predictions() -> dict:
    snap = _snapshot_or_404()
    rows = []
    for p in snap["predictions"]:
        best = next((m for m in p["models"] if m["model"] == p["recommended_model"]), None)
        rows.append({"symbol": p["symbol"], "as_of": p["as_of"], "last_close": p["last_close"],
                     "regime": p["regime"], "consensus": p["consensus"], "recommended_model": p["recommended_model"],
                     "recommended": best, "models": [{k: m[k] for k in ("model", "prob_up", "direction")}
                                                     for m in p["models"]]})
    return {k: snap[k] for k in ("schema_version", "created_at", "as_of", "config", "evaluation_experiment",
                                 "data", "recommended_model", "evaluation", "data_version")} | {
        "predictions": rows, "unavailable": snap.get("unavailable", [])}


@app.get("/predictions/{symbol}")
def prediction(symbol: str) -> dict:
    snap = _snapshot_or_404()
    sym = normalise_symbol(symbol)
    p = next((x for x in snap["predictions"] if x["symbol"] == sym), None)
    if not p:
        raise HTTPException(404, f"No prediction for {sym}. Available: {', '.join(snap['data']['symbols'])}")
    return {k: snap[k] for k in ("schema_version", "created_at", "config", "evaluation_experiment", "data",
                                 "methods", "data_version")} | {"prediction": p}


@app.get("/bars/{symbol}")
def bars(symbol: str, days: int = Query(60, ge=1, le=2000)) -> dict:
    """Real daily bars from MongoDB. Symbols outside the research universe are fetched once and then stored,
    so every answer comes from the same point-in-time store (and later syncs keep growing it)."""
    sym = normalise_symbol(symbol)
    fetched_now = False
    if not STORE.bars.count_documents({"symbol": sym}, limit=1):
        try:
            rows = CLIENT.stock_bars(sym)
        except (KeyError, TypeError):
            raise HTTPException(404, f"Unknown CSE symbol: {sym}") from None
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise HTTPException(404, f"Unknown CSE symbol: {sym}") from None
            raise HTTPException(503, f"Could not fetch {sym} from cse.lk: HTTP {exc.code}") from None
        except Exception as exc:  # noqa: BLE001 - network or upstream failure
            raise HTTPException(503, f"Could not fetch {sym} from cse.lk: {exc}") from None
        if not rows:
            raise HTTPException(404, f"cse.lk returned no daily history for {sym}")
        STORE.upsert_bars(sym, rows)
        fetched_now = True
    rows = STORE.recent_bars(sym, days)
    return {"symbol": sym, "source": "cse.lk daily bars stored in MongoDB (research_bars)",
            "fetched_now": fetched_now, "bars": rows}
