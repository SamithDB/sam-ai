"""Model zoo. Every model implements `fit(train, val, seed)` and `predict_proba(ws) -> P(up)`."""

from __future__ import annotations

from .base import Model
from .baselines import MajorityClass, PreviousDirection
from .sklearn_models import LogisticRegressionModel, RandomForestModel


def make_model(name: str, params: dict | None = None) -> Model:
    params = params or {}
    if name == "prev_direction":
        return PreviousDirection()
    if name == "majority":
        return MajorityClass()
    if name == "logreg":
        return LogisticRegressionModel(**params)
    if name == "random_forest":
        return RandomForestModel(**params)
    if name in ("lstm", "patchtst"):
        from .deep import DeepModel  # imported lazily so torch is optional for the baselines

        return DeepModel(arch=name, **params)
    raise ValueError(f"Unknown model: {name}")


__all__ = ["Model", "make_model"]
