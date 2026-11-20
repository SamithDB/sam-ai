"""LSTM and PatchTST classifiers plus a shared, deterministic training loop.

Both take a window [B, L, F] and return one logit for P(up). They are small on purpose:
about 1-2k training windows per fold on CPU.

PatchTST: the time axis is cut into patches (patch_len, stride) that are embedded and fed to a
Transformer encoder. `channel_independent=True` follows the original paper: each feature
is encoded separately and the features cannot interact until the head. The default (False)
embeds all features of a patch together so stock and market features can interact. This
matters for what attributions can show (see thesis methodology).
"""

from __future__ import annotations

import copy

import numpy as np
import torch
from torch import nn

from ..config import set_seed
from ..windows import WindowSet
from .base import Model


def _tensor(a: np.ndarray) -> torch.Tensor:
    # Copy: pandas/numpy can hand back read-only views, which torch.from_numpy warns about.
    return torch.from_numpy(np.array(a, copy=True))


class LSTMClassifier(nn.Module):
    def __init__(self, n_features: int, hidden: int = 32, layers: int = 1, dropout: float = 0.2):
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden, num_layers=layers, batch_first=True,
                            dropout=dropout if layers > 1 else 0.0)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        return self.head(out[:, -1]).squeeze(-1)


class PatchTSTClassifier(nn.Module):
    def __init__(self, n_features: int, lookback: int, patch_len: int = 4, stride: int = 2, d_model: int = 32,
                 heads: int = 4, layers: int = 2, dropout: float = 0.2, channel_independent: bool = False):
        super().__init__()
        self.patch_len, self.stride, self.ci = patch_len, stride, channel_independent
        self.n_patches = (lookback - patch_len) // stride + 1
        in_dim = patch_len if channel_independent else patch_len * n_features
        self.embed = nn.Linear(in_dim, d_model)
        self.pos = nn.Parameter(torch.zeros(1, self.n_patches, d_model))
        nn.init.trunc_normal_(self.pos, std=0.02)
        layer = nn.TransformerEncoderLayer(d_model, heads, dim_feedforward=2 * d_model, dropout=dropout,
                                           batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        # Flatten head as in Nie et al. (2023): keeps patch position, unlike mean pooling.
        head_in = d_model * self.n_patches * (n_features if channel_independent else 1)
        self.head = nn.Sequential(nn.Flatten(), nn.Dropout(dropout), nn.Linear(head_in, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, _, f = x.shape
        patches = x.unfold(1, self.patch_len, self.stride)  # [B, P, F, patch_len]
        if self.ci:
            z = patches.permute(0, 2, 1, 3).reshape(b * f, self.n_patches, self.patch_len)
            z = self.encoder(self.embed(z) + self.pos)  # [B*F, P, d]
            return self.head(z.reshape(b, -1)).squeeze(-1)
        # [B, P, F, patch_len] -> [B, P, patch_len*F]: all features of a patch embedded together
        z = patches.permute(0, 1, 3, 2).reshape(b, self.n_patches, -1)
        z = self.encoder(self.embed(z) + self.pos)  # [B, P, d]
        return self.head(z).squeeze(-1)


class DeepModel(Model):
    stochastic = True

    def __init__(self, arch: str, epochs: int = 100, batch_size: int = 64, lr: float = 1e-3,
                 weight_decay: float = 1e-4, patience: int = 10, **arch_params):
        self.arch, self.name = arch, arch
        self.epochs, self.batch_size, self.lr = epochs, batch_size, lr
        self.weight_decay, self.patience = weight_decay, patience
        self.arch_params = arch_params

    def _build(self, n_features: int, lookback: int) -> nn.Module:
        if self.arch == "lstm":
            return LSTMClassifier(n_features, **self.arch_params)
        return PatchTSTClassifier(n_features, lookback, **self.arch_params)

    def fit(self, train: WindowSet, val: WindowSet, seed: int) -> DeepModel:
        set_seed(seed)
        _, lookback, n_features = train.X_seq.shape
        self.net_ = self._build(n_features, lookback)
        opt = torch.optim.AdamW(self.net_.parameters(), lr=self.lr, weight_decay=self.weight_decay)
        pos_rate = float(train.y.mean())
        loss_fn = nn.BCEWithLogitsLoss(pos_weight=torch.tensor((1 - pos_rate) / max(pos_rate, 1e-6)))

        Xtr, ytr = _tensor(train.X_seq), _tensor(train.y).float()
        Xva, yva = _tensor(val.X_seq), _tensor(val.y).float()
        gen = torch.Generator().manual_seed(seed)

        best_loss, best_state, bad = float("inf"), None, 0
        self.history_ = []
        for epoch in range(self.epochs):
            self.net_.train()
            order = torch.randperm(len(Xtr), generator=gen)
            for start in range(0, len(order), self.batch_size):
                idx = order[start : start + self.batch_size]
                opt.zero_grad()
                loss = loss_fn(self.net_(Xtr[idx]), ytr[idx])
                loss.backward()
                nn.utils.clip_grad_norm_(self.net_.parameters(), 1.0)
                opt.step()
            self.net_.eval()
            with torch.no_grad():
                val_loss = float(loss_fn(self.net_(Xva), yva))
            self.history_.append(val_loss)
            if val_loss < best_loss - 1e-4:
                best_loss, best_state, bad = val_loss, copy.deepcopy(self.net_.state_dict()), 0
                self.best_epoch_ = epoch
            else:
                bad += 1
                if bad >= self.patience:
                    break
        self.net_.load_state_dict(best_state)
        self.net_.eval()
        return self

    def predict_proba(self, ws: WindowSet) -> np.ndarray:
        with torch.no_grad():
            return torch.sigmoid(self.net_(_tensor(ws.X_seq))).numpy()
