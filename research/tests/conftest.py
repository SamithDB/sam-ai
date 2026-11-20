"""Shared fixtures. Every test runs on real cse.lk data: the latest raw download for configs/dev_1y.yaml.

There is no synthetic data in this project. If the raw download is missing, the tests that need it are
skipped with instructions instead of falling back to invented data.
"""

import pandas as pd
import pytest

from cse_xai.config import RESEARCH_ROOT, ExperimentConfig, SplitConfig, load_config
from cse_xai.data import latest_run_dir, load_public_indexes, load_public_stocks

CONFIG = RESEARCH_ROOT / "configs" / "dev_1y.yaml"
TEST_SYMBOLS = ["JKH.N0000", "COMB.N0000", "HNB.N0000"]
# Fits the ~205 usable days of the free one-year history (after the 34-day indicator warm-up).
TEST_SPLITS = SplitConfig(min_train_days=100, val_days=20, test_days=20, step_days=20)


@pytest.fixture(scope="session")
def real_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    cfg = load_config(CONFIG)
    try:
        run_dir = latest_run_dir(cfg.raw_path)
    except FileNotFoundError:
        pytest.skip("No real cse.lk download. Run: python -I scripts/cse_public_spike.py (from research/)")
    return load_public_stocks(run_dir, TEST_SYMBOLS), load_public_indexes(run_dir)


@pytest.fixture(scope="session")
def test_cfg() -> ExperimentConfig:
    return ExperimentConfig(name="pytest", raw_dir="", symbols=TEST_SYMBOLS, seeds=[0], splits=TEST_SPLITS)
