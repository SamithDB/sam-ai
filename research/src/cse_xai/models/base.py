from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from ..windows import WindowSet


class Model(ABC):
    name: str = "model"
    stochastic: bool = False  # True -> trained once per seed

    @abstractmethod
    def fit(self, train: WindowSet, val: WindowSet, seed: int) -> Model: ...

    @abstractmethod
    def predict_proba(self, ws: WindowSet) -> np.ndarray:
        """Probability that the next close is higher, shape [N]."""
