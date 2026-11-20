"""Models must run end to end on real cse.lk data, return valid probabilities, and be reproducible per seed.

Accuracy is not asserted: on one year of real data no model reliably beats chance, and that is a result,
not a bug. Skill is judged by the walk-forward evaluation with confidence intervals, not by unit tests.
"""

import numpy as np
import pytest

from cse_xai.dataset import build_table
from cse_xai.metrics import summarise
from cse_xai.models import make_model
from cse_xai.runner import run_walk_forward
from cse_xai.splits import fold_frames, walk_forward
from cse_xai.windows import build_windows, fit_scaler


@pytest.fixture(scope="module")
def fold_windows(real_data, test_cfg):
    panel, indexes = real_data
    table = build_table(panel, indexes, test_cfg)
    fold = walk_forward(table["date"], test_cfg.splits)[0]
    scaler = fit_scaler(table, fold.train_dates)
    return [build_windows(table, rows, scaler, test_cfg.lookback) for rows in fold_frames(table, fold)]


def test_windows_are_causal_and_shaped(fold_windows):
    train, val, test = fold_windows
    assert train.X_seq.shape[1:] == (20, 20)
    assert train.meta["date"].max() < val.meta["date"].min() < test.meta["date"].min()
    assert not np.isnan(train.X_seq).any()  # windows with a missing value are skipped, never filled


@pytest.mark.parametrize("name,params", [
    ("prev_direction", {}),
    ("majority", {}),
    ("logreg", {}),
    ("random_forest", {"n_estimators": 50}),
    ("lstm", {"epochs": 5}),
    ("patchtst", {"epochs": 5}),
])
def test_models_return_valid_probabilities(fold_windows, name, params):
    train, val, test = fold_windows
    prob = make_model(name, params).fit(train, val, seed=0).predict_proba(test)
    assert prob.shape == (len(test),)
    assert np.isfinite(prob).all() and ((prob >= 0) & (prob <= 1)).all()


def test_deep_model_is_deterministic_per_seed(fold_windows):
    train, val, test = fold_windows
    a = make_model("lstm", {"epochs": 5}).fit(train, val, seed=7).predict_proba(test)
    b = make_model("lstm", {"epochs": 5}).fit(train, val, seed=7).predict_proba(test)
    np.testing.assert_allclose(a, b, atol=1e-6)


def test_runner_and_summary_smoke(real_data, test_cfg):
    panel, indexes = real_data
    table = build_table(panel, indexes, test_cfg)
    preds = run_walk_forward(table, test_cfg, {"prev_direction": {}, "majority": {}}, log=lambda *_: None)
    summary = summarise(preds, n_boot=50)
    assert set(summary["model"]) == {"prev_direction", "majority"}
    assert summary.loc[summary["model"] == "majority", "balanced_accuracy"].item() == 0.5
