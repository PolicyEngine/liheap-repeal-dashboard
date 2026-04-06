"""Aggregate impact calculations for LIHEAP repeal (DC, MA, IL).

Uses CPS/SPM reported energy subsidy data (spm_unit_energy_subsidy_reported)
which is already in spm_unit_benefits and flows into poverty calculations.

The reform zeros out energy subsidies to simulate federal LIHEAP repeal.
No PRs needed — uses existing microdata and variable structure.

Based on the Oregon Kicker dashboard generate_impacts.py pattern.
"""

import json
import numpy as np
from pathlib import Path
from policyengine_us import Microsimulation

YEAR = 2025
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

STATES = {
    "DC": {
        "dataset": "hf://policyengine/policyengine-us-data/states/DC.h5",
        "actual_heating_hh_fy24": 6891,
        "actual_allocation_fy26": 11368742,
        "actual_avg_benefit_fy22": 580,
    },
    "MA": {
        "dataset": "hf://policyengine/policyengine-us-data/states/MA.h5",
        "actual_heating_hh_fy24": 150047,
        "actual_allocation_fy26": 146098612,
        "actual_avg_benefit_fy22": 1344,
    },
    "IL": {
        "dataset": "hf://policyengine/policyengine-us-data/states/IL.h5",
        "actual_heating_hh_fy24": 205143,
        "actual_allocation_fy26": 180050062,
        "actual_avg_benefit_fy22": 940,
    },
}

_INTRA_BOUNDS = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
_INTRA_KEYS = [
    "lose_more_than_5pct",
    "lose_less_than_5pct",
    "no_change",
    "gain_less_than_5pct",
    "gain_more_than_5pct",
]


def _poverty_metrics(baseline_rate, reform_rate):
    """Return rate change and percent change for a poverty metric."""
    rate_change = reform_rate - baseline_rate
    percent_change = (
        rate_change / baseline_rate * 100 if baseline_rate > 0 else 0.0
    )
    return rate_change, percent_change


def calculate_state_impact(state, config):
    """Run microsimulation for one state and return impact data."""
    dataset = config["dataset"]

    # ===== BASELINE =====
    print(f"  Loading baseline...")
    baseline = Microsimulation(dataset=dataset)

    energy_subsidy = baseline.calc(
        "spm_unit_energy_subsidy_reported", period=YEAR
    )
    energy_subsidy_hh = baseline.calc(
        "spm_unit_energy_subsidy_reported", period=YEAR, map_to="household"
    )

    income_change = -energy_subsidy_hh

    baseline_net_income_raw = baseline.calc(
        "household_net_income", period=YEAR
    )
    baseline_net_income = baseline_net_income_raw + energy_subsidy_hh

    print(f"  Computing baseline poverty...")
    baseline_pov = baseline.calc(
        "in_poverty", period=YEAR, map_to="person"
    )
    baseline_deep_pov = baseline.calc(
        "in_deep_poverty", period=YEAR, map_to="person"
    )

    # Compute weighted poverty rates from MicroSeries BEFORE converting to numpy
    poverty_baseline_rate = float(baseline_pov.mean() * 100)
    deep_poverty_baseline_rate = float(baseline_deep_pov.mean() * 100)

    decile = baseline.calc(
        "household_income_decile", period=YEAR, map_to="household"
    )
    household_weight = baseline.calc("household_weight", period=YEAR)
    people_per_hh = baseline.calc(
        "household_count_people", period=YEAR, map_to="household"
    )

    # Convert to numpy only for child poverty filtering
    age_arr = np.array(baseline.calc("age", period=YEAR))
    is_child = age_arr < 18
    pw_arr = np.array(baseline.calc("person_weight", period=YEAR))
    child_w = pw_arr[is_child]
    total_child_w = child_w.sum()

    baseline_pov_arr = np.array(baseline_pov).astype(bool)
    baseline_deep_pov_arr = np.array(baseline_deep_pov).astype(bool)

    del baseline

    # ===== REFORM =====
    print(f"  Loading reform (LIHEAP repealed)...")
    reformed = Microsimulation(dataset=dataset)
    n_spm = energy_subsidy.shape[0]
    reformed.set_input(
        "spm_unit_energy_subsidy_reported", YEAR, np.zeros(n_spm)
    )

    print(f"  Computing reform poverty...")
    reform_pov = reformed.calc(
        "in_poverty", period=YEAR, map_to="person"
    )
    reform_deep_pov = reformed.calc(
        "in_deep_poverty", period=YEAR, map_to="person"
    )

    # Compute weighted poverty rates from MicroSeries BEFORE converting to numpy
    poverty_reform_rate = float(reform_pov.mean() * 100)
    deep_poverty_reform_rate = float(reform_deep_pov.mean() * 100)

    reform_pov_arr = np.array(reform_pov).astype(bool)
    reform_deep_pov_arr = np.array(reform_deep_pov).astype(bool)

    del reformed

    # ===== FISCAL IMPACT =====
    total_income_change = float(income_change.sum())
    total_households = float((income_change * 0 + 1).sum())

    # ===== WINNERS / LOSERS =====
    losers = float((income_change < -1).sum())
    winners = float((income_change > 1).sum())

    affected_ms = (income_change < -1) | (income_change > 1)
    affected_count = float(affected_ms.sum())

    weight_arr = np.array(household_weight)
    change_arr = np.array(income_change)
    affected_mask = np.array(affected_ms).astype(bool)

    avg_loss = (
        float(
            np.average(
                change_arr[affected_mask],
                weights=weight_arr[affected_mask],
            )
        )
        if affected_count > 0
        else 0.0
    )

    losers_rate = losers / total_households * 100
    winners_rate = winners / total_households * 100

    # ===== INCOME DECILE ANALYSIS =====
    baseline_net_arr = np.array(baseline_net_income)
    decile_arr = np.array(decile)

    decile_average = {}
    decile_relative = {}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_count = float(weight_arr[dmask].sum())
        if d_count > 0:
            d_change_sum = float(
                (change_arr[dmask] * weight_arr[dmask]).sum()
            )
            decile_average[str(d)] = d_change_sum / d_count
            d_baseline_sum = float(
                (baseline_net_arr[dmask] * weight_arr[dmask]).sum()
            )
            decile_relative[str(d)] = (
                d_change_sum / d_baseline_sum if d_baseline_sum != 0 else 0.0
            )
        else:
            decile_average[str(d)] = 0.0
            decile_relative[str(d)] = 0.0

    # Intra-decile distribution
    capped_baseline = np.maximum(baseline_net_arr, 1)
    rel_change_arr = change_arr / capped_baseline
    people_weighted = np.array(people_per_hh) * weight_arr

    intra_decile_deciles = {key: [] for key in _INTRA_KEYS}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_people = people_weighted[dmask]
        d_total_people = d_people.sum()
        d_rel = rel_change_arr[dmask]

        for lower, upper, key in zip(
            _INTRA_BOUNDS[:-1], _INTRA_BOUNDS[1:], _INTRA_KEYS
        ):
            in_group = (d_rel > lower) & (d_rel <= upper)
            proportion = (
                float(d_people[in_group].sum() / d_total_people)
                if d_total_people > 0
                else 0.0
            )
            intra_decile_deciles[key].append(proportion)

    intra_decile_all = {
        key: sum(intra_decile_deciles[key]) / 10 for key in _INTRA_KEYS
    }

    # ===== POVERTY IMPACT =====
    # Overall and deep rates already computed above from MicroSeries (.mean()).
    # Only child rates need numpy + manual weighting for age filtering.
    def _child_rate(arr):
        return (
            float((arr[is_child] * child_w).sum() / total_child_w * 100)
            if total_child_w > 0
            else 0.0
        )

    child_poverty_baseline_rate = _child_rate(baseline_pov_arr)
    child_poverty_reform_rate = _child_rate(reform_pov_arr)

    deep_child_poverty_baseline_rate = _child_rate(baseline_deep_pov_arr)
    deep_child_poverty_reform_rate = _child_rate(reform_deep_pov_arr)

    # ===== INCOME BRACKET BREAKDOWN =====
    agi_arr = baseline_net_arr

    income_brackets = [
        (0, 25_000, "Under $25k"),
        (25_000, 50_000, "$25k-$50k"),
        (50_000, 75_000, "$50k-$75k"),
        (75_000, 100_000, "$75k-$100k"),
        (100_000, 150_000, "$100k-$150k"),
        (150_000, float("inf"), "Over $150k"),
    ]

    by_income_bracket = []
    for min_inc, max_inc, label in income_brackets:
        mask = (
            (agi_arr >= min_inc)
            & (agi_arr < max_inc)
            & affected_mask
        )
        bracket_affected = float(weight_arr[mask].sum())
        if bracket_affected > 0:
            bracket_cost = float(
                (change_arr[mask] * weight_arr[mask]).sum()
            )
            bracket_avg = float(
                np.average(change_arr[mask], weights=weight_arr[mask])
            )
        else:
            bracket_cost = 0.0
            bracket_avg = 0.0
        by_income_bracket.append(
            {
                "bracket": label,
                "affected": bracket_affected,
                "total_loss": bracket_cost,
                "avg_loss": bracket_avg,
            }
        )

    return {
        "budget": {
            "budgetary_impact": total_income_change,
            "households": total_households,
        },
        "decile": {
            "average": decile_average,
            "relative": decile_relative,
        },
        "intra_decile": {
            "all": intra_decile_all,
            "deciles": intra_decile_deciles,
        },
        "total_cost": total_income_change,
        "affected_households": affected_count,
        "avg_loss": avg_loss,
        "winners": winners,
        "losers": losers,
        "winners_rate": winners_rate,
        "losers_rate": losers_rate,
        "poverty": {
            "poverty": {
                "all": {
                    "baseline": poverty_baseline_rate,
                    "reform": poverty_reform_rate,
                },
                "child": {
                    "baseline": child_poverty_baseline_rate,
                    "reform": child_poverty_reform_rate,
                },
            },
            "deep_poverty": {
                "all": {
                    "baseline": deep_poverty_baseline_rate,
                    "reform": deep_poverty_reform_rate,
                },
                "child": {
                    "baseline": deep_child_poverty_baseline_rate,
                    "reform": deep_child_poverty_reform_rate,
                },
            },
        },
        "by_income_bracket": by_income_bracket,
        "validation": {
            "model_recipients": affected_count,
            "model_total_spending": abs(total_income_change),
            "model_avg_benefit": abs(avg_loss),
            "actual_heating_hh_fy24": config["actual_heating_hh_fy24"],
            "actual_allocation_fy26": config["actual_allocation_fy26"],
            "actual_avg_benefit_fy22": config["actual_avg_benefit_fy22"],
        },
    }


def main():
    print("=" * 60)
    print("LIHEAP Repeal — Aggregate Impact Analysis (DC, MA, IL)")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_results = {
        "meta": {
            "year": YEAR,
            "policy": "Federal LIHEAP repeal",
            "variable": "spm_unit_energy_subsidy_reported",
            "states": list(STATES.keys()),
            "notes": (
                "Uses CPS/SPM self-reported energy assistance data. "
                "spm_unit_energy_subsidy is in spm_unit_benefits (poverty path) "
                "but not in household_benefits (household_net_income path). "
                "Income change computed directly from subsidy variable."
            ),
        },
        "states": {},
    }

    for state, config in STATES.items():
        print(f"\n{'─' * 40}")
        print(f"Processing {state}...")
        print(f"{'─' * 40}")
        data = calculate_state_impact(state, config)
        all_results["states"][state] = data

        # Print summary
        pov = data["poverty"]["poverty"]["all"]
        v = data["validation"]
        print(f"\n  {state} Summary:")
        print(f"    Total LIHEAP loss: ${abs(data['total_cost']):,.0f}")
        print(f"    Affected households: {data['affected_households']:,.0f}")
        print(f"    Average loss: ${abs(data['avg_loss']):,.0f}")
        print(f"    Poverty: {pov['baseline']:.2f}% -> {pov['reform']:.2f}%")
        print(f"    Model vs actual recipients: {v['model_recipients']:,.0f} vs {v['actual_heating_hh_fy24']:,}")

    # Save combined results
    filepath = OUTPUT_DIR / "aggregate_impact.json"
    with open(filepath, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nSaved: {filepath}")

    # Print cross-state comparison
    print("\n" + "=" * 60)
    print("Cross-State Comparison")
    print("=" * 60)
    print(f"{'State':>6} {'Loss':>14} {'HH Affected':>14} {'Avg Loss':>10} {'Poverty +':>10}")
    print("-" * 60)
    total_loss = 0
    total_affected = 0
    for state in STATES:
        d = all_results["states"][state]
        pov = d["poverty"]["poverty"]["all"]
        pov_change = pov["reform"] - pov["baseline"]
        print(
            f"{state:>6} ${abs(d['total_cost']):>13,.0f} {d['affected_households']:>14,.0f}"
            f" ${abs(d['avg_loss']):>9,.0f} {pov_change:>+9.2f}pp"
        )
        total_loss += abs(d["total_cost"])
        total_affected += d["affected_households"]
    print("-" * 60)
    print(f"{'TOTAL':>6} ${total_loss:>13,.0f} {total_affected:>14,.0f}")
    print("=" * 60)


if __name__ == "__main__":
    main()
