"""End-to-end live refresh on real cse.lk data, read from the raw download instead of MongoDB (no network)."""

import shutil

import pytest

from cse_xai.config import RESEARCH_ROOT, ExperimentConfig
from cse_xai.live import refresh


class RawFileStore:
    """Serves the real raw download through the same two methods ResearchStore exposes."""

    def __init__(self, panel, indexes):
        self.panel, self.indexes = panel, indexes

    def load_panel(self, symbols):
        return self.panel[self.panel["symbol"].isin(symbols)].copy()

    def load_indexes(self):
        return self.indexes.copy()


@pytest.fixture(scope="module")
def snapshot(real_data, test_cfg):
    cfg = ExperimentConfig(
        name="pytest_live", raw_dir="", symbols=test_cfg.symbols, seeds=[0, 1], splits=test_cfg.splits,
        models={"majority": {}, "logreg": {}, "lstm": {"epochs": 3}},
    )
    try:
        yield refresh(RawFileStore(*real_data), cfg, data_version="test", log=lambda *_: None)
    finally:
        shutil.rmtree(RESEARCH_ROOT / "results" / "pytest_live_db", ignore_errors=True)


def test_every_symbol_is_predicted_or_reported_unavailable(snapshot, test_cfg):
    predicted = {p["symbol"] for p in snapshot["predictions"]}
    unavailable = {u["symbol"] for u in snapshot["unavailable"]}
    assert predicted | unavailable == set(test_cfg.symbols) and not predicted & unavailable
    assert snapshot["recommended_model"] in ("logreg", "lstm")
    for p in snapshot["predictions"]:
        assert {m["model"] for m in p["models"]} == {"logreg", "lstm"}
        assert 0 <= p["consensus"]["prob_up"] <= 1


def test_explanations_are_additive_after_seed_averaging(snapshot):
    for p in snapshot["predictions"]:
        for e in p["explanations"]:
            total = sum(f["phi"] for f in e["features"])
            assert total == pytest.approx(e["prob_up"] - e["baseline_prob"], abs=1e-4)
            assert sum(b["phi"] for b in e["time_blocks"]) == pytest.approx(total, abs=1e-4)


def test_reliability_and_evidence_present(snapshot):
    p = snapshot["predictions"][0]
    lstm = p["reliability"]["by_model"]["lstm"]
    assert lstm["seed_stability"] is not None  # two seeds
    assert p["reliability"]["by_model"]["logreg"]["seed_stability"] is None  # deterministic: one fit
    assert all(k in lstm for k in ("temporal_stability", "robustness", "faithfulness_ratio"))
    m = next(x for x in p["models"] if x["model"] == "logreg")
    ba = m["oos_balanced_accuracy"]
    assert ba["ci_lo"] <= ba["mean"] <= ba["ci_hi"]
    assert m["confidence_bucket"] is not None
