"""Model-agnostic explanations and explanation-reliability checks for the live predictions.

All methods work on scaled look-back windows X[L, F]. "Removing" a feature means
replacing it with the training mean, which is 0 after standardisation, at every time step.

- feature_shapley: Shapley values over the F features, estimated with antithetic sampled
  permutations. Each permutation path is additive, so sum(phi) == f(x) - f(baseline)
  exactly. The same permutations are reused across models, seeds and inputs (common
  random numbers), so differences reflect the model, not sampling noise.
- time_block_shapley: exact Shapley values over contiguous time blocks of the window
  (a WindowSHAP-style temporal view: is the signal coming from today or two weeks ago?).
- deletion_faithfulness: masking the top-k attributed features should move the prediction
  more than masking k random features (ratio > 1).

These are the first, cheap versions of the thesis XAI methods; WindowSHAP proper, TIMING
and counterfactuals come later. They are model explanations, not market explanations.
"""

from __future__ import annotations

import itertools
import math

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from .models.base import Model
from .windows import WindowSet

_BATCH = 20000


def predict(model: Model, X: np.ndarray, meta: pd.DataFrame | None = None) -> np.ndarray:
    """P(up) for raw window arrays, batched so big perturbation sets fit in memory."""
    out = []
    for i in range(0, len(X), _BATCH):
        chunk = X[i:i + _BATCH].astype(np.float32, copy=False)
        m = meta.iloc[i:i + _BATCH].reset_index(drop=True) if meta is not None else pd.DataFrame(index=range(len(chunk)))
        out.append(model.predict_proba(WindowSet(X_seq=chunk, y=None, meta=m)))
    return np.concatenate(out) if out else np.zeros(0)


def permutations(n_features: int, n_perm: int, seed: int = 0) -> np.ndarray:
    """n_perm permutations as antithetic pairs (each followed by its reverse)."""
    rng = np.random.default_rng(seed)
    half = [rng.permutation(n_features) for _ in range((n_perm + 1) // 2)]
    return np.array([p for h in half for p in (h, h[::-1])][:n_perm])


def feature_shapley(model: Model, X: np.ndarray, perms: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Shapley values per feature. Returns phi [N, F], f(x) [N], f(baseline) [N]."""
    n, L, F = X.shape
    P = len(perms)
    # Path rows: for each sample and permutation, k = 0..F features switched on (in permutation order).
    rows = np.zeros((n, P, F + 1, L, F), np.float32)
    for p, perm in enumerate(perms):
        mask = np.zeros(F, bool)
        for k in range(F + 1):
            if k:
                mask[perm[k - 1]] = True
            rows[:, p, k][:, :, mask] = X[:, :, mask]
    f = predict(model, rows.reshape(-1, L, F)).reshape(n, P, F + 1)
    delta = np.diff(f, axis=2)  # [n, P, F]: marginal gain of the k-th feature in the permutation
    phi = np.zeros((n, F))
    for p, perm in enumerate(perms):
        phi[:, perm] += delta[:, p]
    return phi / P, f[:, 0, -1], f[:, 0, 0]


def time_blocks(lookback: int) -> list[tuple[str, slice]]:
    """Blocks counted back from the prediction day t (the last row of the window)."""
    edges = [(0, 1, "t (latest day)"), (1, 5, "t-1 .. t-4"), (5, 10, "t-5 .. t-9"), (10, lookback, f"t-10 .. t-{lookback - 1}")]
    return [(name, slice(lookback - hi, lookback - lo)) for lo, hi, name in edges if lo < lookback]


def time_block_shapley(model: Model, X: np.ndarray) -> tuple[list[str], np.ndarray]:
    """Exact Shapley values over time blocks (all features in a block on/off together). Returns names, phi [N, B]."""
    n, L, F = X.shape
    blocks = time_blocks(L)
    B = len(blocks)
    coalitions = list(itertools.product([0, 1], repeat=B))
    rows = np.zeros((n, len(coalitions), L, F), np.float32)
    for c, on in enumerate(coalitions):
        for (_, sl), flag in zip(blocks, on):
            if flag:
                rows[:, c, sl] = X[:, sl]
    v = predict(model, rows.reshape(-1, L, F)).reshape(n, len(coalitions))
    index = {on: c for c, on in enumerate(coalitions)}
    phi = np.zeros((n, B))
    for i in range(B):
        for on in coalitions:
            if on[i]:
                continue
            s = sum(on)
            weight = math.factorial(s) * math.factorial(B - s - 1) / math.factorial(B)
            with_i = tuple(1 if j == i else on[j] for j in range(B))
            phi[:, i] += weight * (v[:, index[with_i]] - v[:, index[on]])
    return [name for name, _ in blocks], phi


def deletion_faithfulness(model: Model, X: np.ndarray, phi: np.ndarray, k: int = 3, n_random: int = 20,
                          seed: int = 0) -> dict:
    """Mean |change in P(up)| when masking the top-k features vs k random features."""
    n, L, F = X.shape
    rng = np.random.default_rng(seed)
    base = predict(model, X)
    top_rows, rand_rows = X.copy(), np.repeat(X[:, None], n_random, axis=1).copy()
    for i in range(n):
        top_rows[i][:, np.argsort(-np.abs(phi[i]))[:k]] = 0.0
        for r in range(n_random):
            rand_rows[i, r][:, rng.choice(F, k, replace=False)] = 0.0
    top = np.abs(predict(model, top_rows) - base)
    rand = np.abs(predict(model, rand_rows.reshape(-1, L, F)).reshape(n, n_random) - base[:, None]).mean(axis=1)
    top_m, rand_m = float(top.mean()), float(rand.mean())
    return {"k": k, "top_k_delta": top_m, "random_k_delta": rand_m,
            "ratio": top_m / rand_m if rand_m > 1e-9 else None}


def rank_corr(a: np.ndarray, b: np.ndarray) -> float | None:
    """Spearman correlation of two attribution vectors (None if either is constant)."""
    if np.ptp(a) < 1e-12 or np.ptp(b) < 1e-12:
        return None
    r = spearmanr(a, b).statistic
    return None if np.isnan(r) else float(r)


def mean_pairwise_corr(vectors: list[np.ndarray]) -> float | None:
    vals = [rank_corr(a, b) for a, b in itertools.combinations(vectors, 2)]
    vals = [v for v in vals if v is not None]
    return float(np.mean(vals)) if vals else None
