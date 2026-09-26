"""Intra-decile winners/losers shares, weighted by people.

Kept free of PolicyEngine imports so it can be tested without microdata.
"""

import numpy as np

INTRA_BOUNDS = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
INTRA_KEYS = [
    "lose_more_than_5pct",
    "lose_less_than_5pct",
    "no_change",
    "gain_less_than_5pct",
    "gain_more_than_5pct",
]


def intra_decile_distribution(rel_change, decile, people):
    """Share of people in each relative-change bucket, by decile and overall.

    ``people`` carries the people each household represents: a weighted
    series (e.g. a MicroSeries of household_count_people) whose ``sum`` is
    the weighted people total, or plain per-household person weights.

    The "all" shares cover the same households as the ten decile rows
    (deciles 1-10; PolicyEngine puts negative-income households in decile -1)
    and weight them by people, so "all" is the people-weighted average of the
    decile rows. It is not the plain average of the ten decile shares: deciles
    can hold different numbers of people, and averaging them would weight a
    small decile as heavily as a large one.
    """
    deciles = {key: [] for key in INTRA_KEYS}
    for d in range(1, 11):
        in_decile = decile == d
        decile_people = float((people * in_decile).sum())
        for lower, upper, key in zip(INTRA_BOUNDS[:-1], INTRA_BOUNDS[1:], INTRA_KEYS):
            in_bucket = in_decile & (rel_change > lower) & (rel_change <= upper)
            bucket_people = float((people * in_bucket).sum())
            deciles[key].append(
                bucket_people / decile_people if decile_people > 0 else 0.0
            )

    in_any_decile = (decile >= 1) & (decile <= 10)
    total_people = float((people * in_any_decile).sum())
    overall = {}
    for lower, upper, key in zip(INTRA_BOUNDS[:-1], INTRA_BOUNDS[1:], INTRA_KEYS):
        in_bucket = in_any_decile & (rel_change > lower) & (rel_change <= upper)
        bucket_people = float((people * in_bucket).sum())
        overall[key] = bucket_people / total_people if total_people > 0 else 0.0
    return overall, deciles
