"""
partition.py — Splits one task's training data into N disjoint row-index partitions,
simulating N separate institutions that each hold their own non-overlapping slice of the
overall population. This is the core property federated learning exists to preserve: no
institution's raw rows are ever visible to another institution or to the coordinator — only
the partitioning happens here, in the same process, for simulation purposes; in a real
deployment each partition would physically live behind a different institution's firewall.
"""
from __future__ import annotations

from typing import Dict, List

import numpy as np


def partition_indices(n_rows: int, num_institutions: int, seed: int = 42) -> List[np.ndarray]:
    """Random, disjoint, roughly-equal-sized partitions of range(n_rows)."""
    rng = np.random.RandomState(seed)
    idx = rng.permutation(n_rows)
    return list(np.array_split(idx, num_institutions))


def partition_splits(splits: Dict, num_institutions: int, seed: int = 42) -> List[Dict]:
    """splits: evaluate.make_splits(..., val_split=True) output. Partitions X_train/y_train
    across institutions; X_val/y_val stay shared across all institutions so both the federated
    and centralized-baseline models are evaluated on the exact same held-out data — otherwise a
    difference in their scores could just be a difference in what each saw, not in the training
    approach itself."""
    X_train, y_train = splits["X_train"], splits["y_train"]
    partitions = partition_indices(len(X_train), num_institutions, seed)
    return [
        {
            "X_train": X_train[idx],
            "y_train": y_train[idx],
            "X_val": splits["X_val"],
            "y_val": splits["y_val"],
        }
        for idx in partitions
    ]
