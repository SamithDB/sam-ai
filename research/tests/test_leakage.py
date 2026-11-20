"""Future-perturbation tests on real cse.lk data: changing data after day t must not change anything for day <= t."""

import numpy as np
import pandas as pd
import pytest

from cse_xai.config import LabelConfig, RegimeConfig
from cse_xai.features import FEATURE_COLUMNS, build_features
from cse_xai.regimes import add_regimes

CUTOFF_POS = 150  # of ~243 trading days in the real one-year history


def _perturb_future(panel: pd.DataFrame, indexes: pd.DataFrame, cutoff: pd.Timestamp, seed: int = 99):
    rng = np.random.default_rng(seed)
    p, i = panel.copy(), indexes.copy()
    p[["close", "high", "low", "volume"]] = p[["close", "high", "low", "volume"]].astype(float)
    fut = p["date"] > cutoff
    for col in ("close", "high", "low", "volume"):
        p.loc[fut, col] = p.loc[fut, col] * rng.uniform(0.5, 1.5, fut.sum())
    ifut = i["date"] > cutoff
    for col in ("aspi", "spsl20"):
        i.loc[ifut, col] = i.loc[ifut, col] * rng.uniform(0.5, 1.5, ifut.sum())
    return p, i


@pytest.fixture(scope="module")
def data(real_data):
    panel, indexes = real_data
    cutoff = pd.Timestamp(sorted(panel["date"].unique())[CUTOFF_POS])
    return panel, indexes, cutoff


def test_features_do_not_see_the_future(data):
    panel, indexes, cutoff = data
    base = build_features(panel, indexes)
    pert = build_features(*_perturb_future(panel, indexes, cutoff))
    past = base["date"] <= cutoff
    pd.testing.assert_frame_equal(
        base.loc[past, FEATURE_COLUMNS].reset_index(drop=True),
        pert.loc[pert["date"] <= cutoff, FEATURE_COLUMNS].reset_index(drop=True),
    )


@pytest.mark.parametrize("level", ["stock", "market"])
def test_regimes_do_not_see_the_future(data, level):
    panel, indexes, cutoff = data
    cfg = RegimeConfig(level=level)
    base = add_regimes(panel, cfg, indexes)
    p2, i2 = _perturb_future(panel, indexes, cutoff)
    pert = add_regimes(p2, cfg, i2)
    cols = ["trend_regime", "vol_regime", "regime"]
    pd.testing.assert_frame_equal(
        base.loc[base["date"] <= cutoff, cols].reset_index(drop=True),
        pert.loc[pert["date"] <= cutoff, cols].reset_index(drop=True),
    )


def test_labels_only_depend_on_next_close(data):
    from cse_xai.labels import add_labels

    panel, indexes, cutoff = data
    base = add_labels(panel, LabelConfig(zero_return="down"))
    p2, _ = _perturb_future(panel, indexes, cutoff)
    pert = add_labels(p2, LabelConfig(zero_return="down"))
    # Labels for days strictly before the cutoff's previous day only use closes <= cutoff.
    dates = sorted(panel["date"].unique())
    safe = base["date"] < dates[CUTOFF_POS]
    assert base.loc[safe, "label"].equals(pert.loc[pert["date"] < dates[CUTOFF_POS], "label"])
