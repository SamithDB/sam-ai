"""Experiment configuration: one YAML file per experiment, validated into dataclasses."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml

RESEARCH_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODELS = ["prev_direction", "majority", "logreg", "random_forest", "lstm", "patchtst"]


@dataclass(frozen=True)
class LabelConfig:
    # How to treat days where next close == current close:
    #   "down"  -> label 0 (proposal's original "0 = otherwise")
    #   "drop"  -> remove those rows from training/evaluation
    #   "band"  -> drop rows with |return| <= threshold
    zero_return: str = "drop"
    band_threshold: float = 0.0


@dataclass(frozen=True)
class RegimeConfig:
    trend_window: int = 60
    trend_threshold: float = 0.05  # +/- trailing return separating bull / sideways / bear
    vol_window: int = 20
    vol_reference_window: int = 120  # trailing window for the high/low volatility split (no full-sample percentiles)
    level: str = "stock"  # "stock" (own price) or "market" (ASPI)


@dataclass(frozen=True)
class SplitConfig:
    min_train_days: int = 120
    val_days: int = 20
    test_days: int = 20
    step_days: int = 20
    embargo_days: int = 1  # label at t uses close t+1, so leave at least one day between blocks


@dataclass(frozen=True)
class ExperimentConfig:
    name: str
    raw_dir: str
    symbols: list[str]
    seeds: list[int] = field(default_factory=lambda: [0])
    lookback: int = 20
    labels: LabelConfig = LabelConfig()
    regimes: RegimeConfig = RegimeConfig()
    splits: SplitConfig = SplitConfig()
    # model name -> constructor params (see cse_xai.models.make_model)
    models: dict[str, dict] = field(default_factory=lambda: {m: {} for m in DEFAULT_MODELS})

    @property
    def raw_path(self) -> Path:
        return (RESEARCH_ROOT / self.raw_dir).resolve()


def load_config(path: str | Path) -> ExperimentConfig:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return ExperimentConfig(
        name=raw["name"],
        raw_dir=raw["raw_dir"],
        symbols=list(raw["symbols"]),
        seeds=list(raw.get("seeds", [0])),
        lookback=int(raw.get("lookback", 20)),
        labels=LabelConfig(**raw.get("labels", {})),
        regimes=RegimeConfig(**raw.get("regimes", {})),
        splits=SplitConfig(**raw.get("splits", {})),
        models={name: (params or {}) for name, params in raw.get("models", {m: {} for m in DEFAULT_MODELS}).items()},
    )


def set_seed(seed: int) -> None:
    """Seed every RNG the pipeline uses. torch is seeded too once it is installed."""
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        torch.use_deterministic_algorithms(True, warn_only=True)
    except ImportError:
        pass
