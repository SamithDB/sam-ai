"""Classical benchmarks on the flattened look-back window (same information as the deep models)."""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

from ..windows import WindowSet
from .base import Model


class LogisticRegressionModel(Model):
    """L2 logistic regression; C chosen on the validation fold (log-loss)."""

    name = "logreg"

    def __init__(self, Cs: tuple[float, ...] = (0.001, 0.01, 0.1, 1.0)):
        self.Cs = Cs

    def fit(self, train: WindowSet, val: WindowSet, seed: int) -> LogisticRegressionModel:
        best = None
        for C in self.Cs:
            m = LogisticRegression(C=C, class_weight="balanced", max_iter=2000).fit(train.X_flat, train.y)
            loss = log_loss(val.y, m.predict_proba(val.X_flat)[:, 1], labels=[0, 1])
            if best is None or loss < best[0]:
                best = (loss, C, m)
        self.C_, self.model_ = best[1], best[2]
        return self

    def predict_proba(self, ws: WindowSet) -> np.ndarray:
        return self.model_.predict_proba(ws.X_flat)[:, 1]


class RandomForestModel(Model):
    name = "random_forest"
    stochastic = True

    def __init__(self, n_estimators: int = 300, max_depths: tuple[int, ...] = (3, 5, 8), min_samples_leaf: int = 20):
        self.n_estimators = n_estimators
        self.max_depths = max_depths
        self.min_samples_leaf = min_samples_leaf

    def fit(self, train: WindowSet, val: WindowSet, seed: int) -> RandomForestModel:
        best = None
        for depth in self.max_depths:
            m = RandomForestClassifier(
                n_estimators=self.n_estimators,
                max_depth=depth,
                min_samples_leaf=self.min_samples_leaf,
                class_weight="balanced",
                n_jobs=-1,
                random_state=seed,
            ).fit(train.X_flat, train.y)
            loss = log_loss(val.y, m.predict_proba(val.X_flat)[:, 1], labels=[0, 1])
            if best is None or loss < best[0]:
                best = (loss, depth, m)
        self.max_depth_, self.model_ = best[1], best[2]
        return self

    def predict_proba(self, ws: WindowSet) -> np.ndarray:
        return self.model_.predict_proba(ws.X_flat)[:, 1]
