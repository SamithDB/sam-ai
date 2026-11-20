"""Next-day direction labels with an explicit zero-return policy.

label_t = 1 if close_{t+1} > close_t else 0. The last day of each symbol has no label.
Rows the policy excludes keep label = NaN, so they stay available as *inputs* inside
look-back windows but are never used as training or evaluation targets.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import LabelConfig


def add_labels(panel: pd.DataFrame, cfg: LabelConfig) -> pd.DataFrame:
    panel = panel.sort_values(["symbol", "date"]).copy()
    next_close = panel.groupby("symbol")["close"].shift(-1)
    fwd_ret = next_close / panel["close"] - 1
    panel["fwd_ret"] = fwd_ret
    # The date whose close the label depends on; split code uses it for purging.
    panel["label_date"] = panel.groupby("symbol")["date"].shift(-1)

    label = (fwd_ret > 0).astype(float)
    label[fwd_ret.isna()] = np.nan

    if cfg.zero_return == "down":
        pass
    elif cfg.zero_return == "drop":
        label[fwd_ret == 0] = np.nan
    elif cfg.zero_return == "band":
        label[fwd_ret.abs() <= cfg.band_threshold] = np.nan
    else:
        raise ValueError(f"Unknown zero_return policy: {cfg.zero_return}")

    panel["label"] = label
    return panel
