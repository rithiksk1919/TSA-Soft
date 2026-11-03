"""Per-skill learner model.

Pure functions only: no I/O, no randomness, no knowledge of any domain.
The engine sees skills, attempts, hints and verified outcomes - nothing else.
"""
from __future__ import annotations

import math

DEFAULT_MASTERY = 0.3
EARLY_ALPHA = 0.25      # learning rate for a skill's first EARLY_UPDATES updates
LATE_ALPHA = 0.12
EARLY_UPDATES = 3
SLOPE = 6.0             # steepness of the expected-success curve


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def attempt_score(solved: bool, attempts: int, hints: int) -> float:
    """Outcome o for one scenario.

    Solved:     o = max(0.4, 1 - 0.2*(attempts-1) - 0.15*hints)
    Not solved: o = 0
    `attempts` counts submissions, including the successful one (>= 1).
    """
    if not solved:
        return 0.0
    attempts = max(1, int(attempts))
    hints = max(0, int(hints))
    return max(0.4, 1.0 - 0.2 * (attempts - 1) - 0.15 * hints)


def expected_success(mastery: float, difficulty: float) -> float:
    """p = 1 / (1 + exp(-6 * (m - d)))"""
    return 1.0 / (1.0 + math.exp(-SLOPE * (mastery - difficulty)))


def learning_rate(prior_updates: int) -> float:
    """alpha = 0.25 for a skill's first 3 attempts, then 0.12."""
    return EARLY_ALPHA if prior_updates < EARLY_UPDATES else LATE_ALPHA


def update_mastery(mastery: float, outcome: float, difficulty: float, prior_updates: int) -> float:
    """m_new = clamp(m + alpha * (o - p), 0, 1)"""
    p = expected_success(mastery, difficulty)
    return clamp(mastery + learning_rate(prior_updates) * (outcome - p))
