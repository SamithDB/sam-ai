"""Explanation mechanics on real cse.lk data: Shapley values must add up exactly and the checks must be sane.

Without a planted ground truth these tests verify the mathematics (additivity, exactness, determinism),
not which features "should" matter; that question is what the reliability analysis studies.
"""

import numpy as np
import pytest

from cse_xai.dataset import build_table
from cse_xai.explain import deletion_faithfulness, feature_shapley, permutations, predict, rank_corr, time_block_shapley
from cse_xai.features import FEATURE_COLUMNS
from cse_xai.models import make_model
from cse_xai.splits import fold_frames, walk_forward
from cse_xai.windows import build_windows, fit_scaler


@pytest.fixture(scope="module")
def fitted(real_data, test_cfg):
    panel, indexes = real_data
    table = build_table(panel, indexes, test_cfg)
    fold = walk_forward(table["date"], test_cfg.splits)[0]
    scaler = fit_scaler(table, fold.train_dates)
    train, val, test = (build_windows(table, rows, scaler, test_cfg.lookback) for rows in fold_frames(table, fold))
    model = make_model("logreg").fit(train, val, seed=0)
    return model, test.X_seq[:30]


def test_shapley_is_additive(fitted):
    model, X = fitted
    phi, fx, fbase = feature_shapley(model, X, permutations(len(FEATURE_COLUMNS), 8))
    np.testing.assert_allclose(phi.sum(axis=1), fx - fbase, atol=1e-5)
    np.testing.assert_allclose(fx, predict(model, X), atol=1e-6)
    names, tphi = time_block_shapley(model, X)
    np.testing.assert_allclose(tphi.sum(axis=1), fx - fbase, atol=1e-5)
    assert len(names) == 4


def test_shapley_is_deterministic_for_fixed_permutations(fitted):
    model, X = fitted
    perms = permutations(len(FEATURE_COLUMNS), 8, seed=3)
    a, _, _ = feature_shapley(model, X, perms)
    b, _, _ = feature_shapley(model, X, perms)
    np.testing.assert_array_equal(a, b)


def test_deletion_faithfulness_is_well_formed(fitted):
    model, X = fitted
    phi, _, _ = feature_shapley(model, X, permutations(len(FEATURE_COLUMNS), 16))
    res = deletion_faithfulness(model, X, phi, k=3)
    assert res["k"] == 3 and res["top_k_delta"] >= 0 and res["random_k_delta"] >= 0
    assert res["ratio"] is None or np.isfinite(res["ratio"])


def test_rank_corr_handles_constant_vectors():
    assert rank_corr(np.zeros(5), np.arange(5.0)) is None
    assert rank_corr(np.arange(5.0), np.arange(5.0)) == pytest.approx(1.0)
