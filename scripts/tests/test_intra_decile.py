import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intra_decile import INTRA_KEYS, intra_decile_distribution


def test_all_is_people_weighted_not_the_mean_of_deciles():
    # Decile 1 holds 90 people who all lose more than 5%; decile 2 holds 10
    # people with no change. Deciles 3-10 are empty.
    rel_change = pd.Series([-0.2, 0.0])
    decile = pd.Series([1, 2])
    people = pd.Series([90.0, 10.0])

    overall, deciles = intra_decile_distribution(rel_change, decile, people)

    assert deciles["lose_more_than_5pct"][:2] == [1.0, 0.0]
    assert overall["lose_more_than_5pct"] == pytest.approx(0.9)
    assert overall["no_change"] == pytest.approx(0.1)
    # The old unweighted mean over ten deciles would have said 0.1.
    assert sum(deciles["lose_more_than_5pct"]) / 10 == pytest.approx(0.1)


def test_all_excludes_households_outside_deciles_1_to_10():
    rel_change = pd.Series([-0.2, 0.0, -0.2])
    decile = pd.Series([1, 1, -1])
    people = pd.Series([1.0, 3.0, 100.0])

    overall, _ = intra_decile_distribution(rel_change, decile, people)

    assert overall["lose_more_than_5pct"] == pytest.approx(0.25)
    assert overall["no_change"] == pytest.approx(0.75)


def test_shares_partition_people_and_all_is_the_weighted_average_of_deciles():
    rng = np.random.default_rng(20260925)
    n = 5_000
    rel_change = pd.Series(rng.normal(0, 0.05, n) * (rng.random(n) < 0.3))
    decile = pd.Series(rng.integers(-1, 11, n))
    people = pd.Series(rng.integers(1, 7, n) * rng.uniform(50, 500, n))

    overall, deciles = intra_decile_distribution(rel_change, decile, people)

    assert sum(overall.values()) == pytest.approx(1.0)
    decile_people = [float(people[decile == d].sum()) for d in range(1, 11)]
    for d in range(10):
        assert sum(deciles[key][d] for key in INTRA_KEYS) == pytest.approx(1.0)
    for key in INTRA_KEYS:
        weighted = sum(
            share * weight for share, weight in zip(deciles[key], decile_people)
        ) / sum(decile_people)
        assert overall[key] == pytest.approx(weighted)


def test_empty_population_returns_zero_shares():
    empty = pd.Series([], dtype=float)
    overall, deciles = intra_decile_distribution(empty, empty, empty)

    assert all(value == 0.0 for value in overall.values())
    assert all(len(values) == 10 for values in deciles.values())


def test_weighted_microseries_matches_pre_weighted_people():
    # The script passes MicroSeries carrying household weights; the result
    # must equal passing people already multiplied by those weights.
    microdf = pytest.importorskip("microdf")
    rel_change = [-0.2, 0.0, 0.03, -0.01]
    decile = [1, 1, 2, 3]
    people = [2.0, 3.0, 1.0, 4.0]
    weights = [10.0, 1.0, 5.0, 2.0]

    def weighted(values):
        return microdf.MicroSeries(values, weights=weights)

    from_microseries = intra_decile_distribution(
        weighted(rel_change), weighted(decile), weighted(people)
    )
    from_plain = intra_decile_distribution(
        pd.Series(rel_change),
        pd.Series(decile),
        pd.Series([p * w for p, w in zip(people, weights)]),
    )

    (overall_a, deciles_a), (overall_b, deciles_b) = from_microseries, from_plain
    assert overall_a["lose_more_than_5pct"] > 0
    for key in INTRA_KEYS:
        assert overall_a[key] == pytest.approx(overall_b[key])
        assert deciles_a[key] == pytest.approx(deciles_b[key])
