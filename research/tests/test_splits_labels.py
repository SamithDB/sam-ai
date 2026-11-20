import numpy as np
import pandas as pd
import pytest

from cse_xai.config import LabelConfig
from cse_xai.dataset import build_table
from cse_xai.features import FEATURE_COLUMNS
from cse_xai.labels import add_labels
from cse_xai.splits import fold_frames, walk_forward


@pytest.fixture(scope="module")
def table(real_data, test_cfg):
    panel, indexes = real_data
    return build_table(panel, indexes, test_cfg), test_cfg


def test_folds_are_chronological_with_embargo(table):
    tbl, cfg = table
    folds = walk_forward(tbl["date"], cfg.splits)
    assert len(folds) >= 3
    calendar = pd.DatetimeIndex(sorted(tbl["date"].unique()))
    for f in folds:
        assert f.train_dates[-1] < f.val_dates[0] < f.val_dates[-1] < f.test_dates[0]
        gap = calendar.get_loc(f.val_dates[0]) - calendar.get_loc(f.train_dates[-1]) - 1
        assert gap == cfg.splits.embargo_days
    # expanding window
    assert all(len(a.train_dates) < len(b.train_dates) for a, b in zip(folds, folds[1:]))


def test_no_training_label_resolves_inside_validation(table):
    tbl, cfg = table
    for fold in walk_forward(tbl["date"], cfg.splits):
        train, val, test = fold_frames(tbl, fold)
        assert (train["label_date"] < fold.val_dates[0]).all()
        assert (val["label_date"] < fold.test_dates[0]).all()
        assert set(train.index).isdisjoint(val.index) and set(val.index).isdisjoint(test.index)


def test_missing_source_values_stay_missing(table):
    # Missing inputs are never filled in: any NaN left after warm-up must trace back to a missing raw value.
    tbl, _ = table
    rows_with_nan = tbl[tbl[FEATURE_COLUMNS].isna().any(axis=1)]
    assert len(rows_with_nan) <= len(tbl) * 0.05


def test_zero_return_policies(real_data):
    # Real JKH closes: unchanged days are common on the CSE (about a quarter of JKH's days).
    panel, _ = real_data
    jkh = panel[panel["symbol"] == "JKH.N0000"].reset_index(drop=True)
    nxt = jkh["close"].shift(-1)
    unchanged = (nxt == jkh["close"]) & nxt.notna()
    assert unchanged.any(), "expected unchanged days in the real JKH history"
    down = add_labels(jkh, LabelConfig(zero_return="down"))
    drop = add_labels(jkh, LabelConfig(zero_return="drop"))
    assert (down.loc[unchanged, "label"] == 0).all()
    assert drop.loc[unchanged, "label"].isna().all()
    moved = (nxt != jkh["close"]) & nxt.notna()
    expected = (nxt[moved] > jkh.loc[moved, "close"]).astype(float)
    assert drop.loc[moved, "label"].tolist() == expected.tolist()
    assert np.isnan(down["label"].iloc[-1]) and np.isnan(drop["label"].iloc[-1])  # no next close yet
