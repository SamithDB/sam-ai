from __future__ import annotations

import numpy as np

from ..windows import WindowSet
from .base import Model


class PreviousDirection(Model):
    """Naive baseline: tomorrow moves the way today moved. Unchanged days predict down (class 0)."""

    name = "prev_direction"

    def fit(self, train: WindowSet, val: WindowSet, seed: int) -> PreviousDirection:
        return self

    def predict_proba(self, ws: WindowSet) -> np.ndarray:
        return (ws.meta["ret_1d"].to_numpy() > 0).astype(float)


class MajorityClass(Model):
    """Predicts the training-fold base rate for everyone (the chance level for balanced accuracy)."""

    name = "majority"

    def fit(self, train: WindowSet, val: WindowSet, seed: int) -> MajorityClass:
        self.rate_ = float(train.y.mean())
        return self

    def predict_proba(self, ws: WindowSet) -> np.ndarray:
        return np.full(len(ws), self.rate_)
