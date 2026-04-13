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

BASELINE_YEAR = 2024
REPEAL_YEAR = 2027
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

STATES = {
    "DC": {
        "dataset": "hf://policyengine/policyengine-us-data/states/DC.h5",
        "actual_heating_hh": 6891,
        "actual_heating_spending": 7677745,
        "actual_avg_benefit": 912,
    },
    "MA": {
        "dataset": "hf://policyengine/policyengine-us-data/states/MA.h5",
        "actual_heating_hh": 150047,
        "actual_heating_spending": 124365554,
        "actual_avg_benefit": 1184,
    },
    "IL": {
        "dataset": "hf://policyengine/policyengine-us-data/states/IL.h5",
        "actual_heating_hh": 205143,
        "actual_heating_spending": 127485768,
        "actual_avg_benefit": 587,
    },
}
# Actual data source: ACF LIHEAP FY2024 State Profiles (heating assistance only)
# https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/

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
    """Run microsimulation for one state and return impact data.

    Baseline year (2024): what LIHEAP looks like today.
    Repeal year (2027): what happens if LIHEAP funding is zeroed out.
    """
    dataset = config["dataset"]

    # ===== BASELINE (2024) — current LIHEAP stats =====
    print(f"  Loading baseline ({BASELINE_YEAR})...")
    baseline = Microsimulation(dataset=dataset)

    baseline_subsidy = baseline.calc(
        "spm_unit_energy_subsidy_reported", period=BASELINE_YEAR
    )
    has_subsidy_baseline = baseline_subsidy > 1
    baseline_recipients = float(has_subsidy_baseline.sum())
    baseline_total_spending = float(baseline_subsidy.sum())
    baseline_avg_benefit = (
        baseline_total_spending / baseline_recipients
        if baseline_recipients > 0
        else 0.0
    )

    # Also get repeal-year subsidy from baseline (what would exist without repeal)
    repeal_subsidy = baseline.calc(
        "spm_unit_energy_subsidy_reported", period=REPEAL_YEAR
    )
    repeal_subsidy_hh = baseline.calc(
        "spm_unit_energy_subsidy_reported", period=REPEAL_YEAR, map_to="household"
    )

    has_subsidy_repeal = repeal_subsidy > 1
    repeal_recipients = float(has_subsidy_repeal.sum())
    repeal_total_spending = float(repeal_subsidy.sum())
    repeal_avg_benefit = (
        repeal_total_spending / repeal_recipients
        if repeal_recipients > 0
        else 0.0
    )

    income_change = -repeal_subsidy_hh

    baseline_net_income_raw = baseline.calc(
        "household_net_income", period=REPEAL_YEAR
    )
    baseline_net_income = baseline_net_income_raw + repeal_subsidy_hh

    print(f"  Computing baseline poverty ({REPEAL_YEAR})...")
    baseline_pov = baseline.calc(
        "in_poverty", period=REPEAL_YEAR, map_to="person"
    )
    baseline_deep_pov = baseline.calc(
        "in_deep_poverty", period=REPEAL_YEAR, map_to="person"
    )

    poverty_baseline_rate = float(baseline_pov.mean() * 100)
    deep_poverty_baseline_rate = float(baseline_deep_pov.mean() * 100)

    decile = baseline.calc(
        "household_income_decile", period=REPEAL_YEAR, map_to="household"
    )
    people_per_hh = baseline.calc(
        "household_count_people", period=REPEAL_YEAR, map_to="household"
    )

    is_child = baseline.calc("is_child", period=REPEAL_YEAR)
    total_child_w = float(is_child.sum())

    child_poverty_baseline_rate = (
        float((baseline_pov * is_child).sum() / total_child_w * 100)
        if total_child_w > 0
        else 0.0
    )
    deep_child_poverty_baseline_rate = (
        float((baseline_deep_pov * is_child).sum() / total_child_w * 100)
        if total_child_w > 0
        else 0.0
    )

    n_spm = len(repeal_subsidy)
    del baseline

    # ===== REFORM (2027) — LIHEAP repealed =====
    print(f"  Loading reform ({REPEAL_YEAR}, LIHEAP repealed)...")
    reformed = Microsimulation(dataset=dataset)
    reformed.set_input(
        "spm_unit_energy_subsidy_reported", REPEAL_YEAR, np.zeros(n_spm)
    )

    print(f"  Computing reform poverty...")
    reform_pov = reformed.calc(
        "in_poverty", period=REPEAL_YEAR, map_to="person"
    )
    reform_deep_pov = reformed.calc(
        "in_deep_poverty", period=REPEAL_YEAR, map_to="person"
    )

    poverty_reform_rate = float(reform_pov.mean() * 100)
    deep_poverty_reform_rate = float(reform_deep_pov.mean() * 100)

    reform_is_child = reformed.calc("is_child", period=REPEAL_YEAR)
    reform_total_child_w = float(reform_is_child.sum())

    child_poverty_reform_rate = (
        float((reform_pov * reform_is_child).sum() / reform_total_child_w * 100)
        if reform_total_child_w > 0
        else 0.0
    )
    deep_child_poverty_reform_rate = (
        float((reform_deep_pov * reform_is_child).sum() / reform_total_child_w * 100)
        if reform_total_child_w > 0
        else 0.0
    )

    del reformed

    # ===== FISCAL IMPACT =====
    total_income_change = float(income_change.sum())
    total_households = float((income_change * 0 + 1).sum())

    # ===== WINNERS / LOSERS =====
    losers = float((income_change < -1).sum())
    winners = float((income_change > 1).sum())

    affected = (income_change < -1) | (income_change > 1)
    affected_count = float(affected.sum())

    avg_loss = (
        float((income_change * affected).sum() / affected.sum())
        if affected_count > 0
        else 0.0
    )

    losers_rate = losers / total_households * 100
    winners_rate = winners / total_households * 100

    # ===== INCOME DECILE ANALYSIS =====
    decile_average = {}
    decile_relative = {}
    for d in range(1, 11):
        dmask = decile == d
        d_count = float(dmask.sum())
        if d_count > 0:
            d_change_sum = float((income_change * dmask).sum())
            decile_average[str(d)] = d_change_sum / d_count
            d_baseline_sum = float((baseline_net_income * dmask).sum())
            decile_relative[str(d)] = (
                d_change_sum / d_baseline_sum if d_baseline_sum != 0 else 0.0
            )
        else:
            decile_average[str(d)] = 0.0
            decile_relative[str(d)] = 0.0

    # Intra-decile distribution (people-weighted proportions)
    capped_baseline = baseline_net_income.clip(lower=1)
    rel_change = income_change / capped_baseline

    intra_decile_deciles = {key: [] for key in _INTRA_KEYS}
    for d in range(1, 11):
        dmask = decile == d
        d_total_people = float((people_per_hh * dmask).sum())

        for lower, upper, key in zip(
            _INTRA_BOUNDS[:-1], _INTRA_BOUNDS[1:], _INTRA_KEYS
        ):
            bucket_mask = dmask & (rel_change > lower) & (rel_change <= upper)
            bucket_people = float((people_per_hh * bucket_mask).sum())
            proportion = (
                bucket_people / d_total_people
                if d_total_people > 0
                else 0.0
            )
            intra_decile_deciles[key].append(proportion)

    intra_decile_all = {
        key: sum(intra_decile_deciles[key]) / 10 for key in _INTRA_KEYS
    }

    # ===== INCOME BRACKET BREAKDOWN =====
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
        bracket_mask = (
            (baseline_net_income >= min_inc)
            & (baseline_net_income < max_inc)
            & affected
        )
        bracket_affected = float(bracket_mask.sum())
        if bracket_affected > 0:
            bracket_cost = float((income_change * bracket_mask).sum())
            bracket_avg = bracket_cost / bracket_affected
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
        "baseline_stats": {
            "year": BASELINE_YEAR,
            "recipients": baseline_recipients,
            "total_spending": baseline_total_spending,
            "avg_benefit": baseline_avg_benefit,
        },
        "repeal_stats": {
            "year": REPEAL_YEAR,
            "recipients": repeal_recipients,
            "total_spending": repeal_total_spending,
            "avg_benefit": repeal_avg_benefit,
        },
    }


def main():
    print("=" * 60)
    print("LIHEAP Repeal — CPS Survey Impact Analysis (DC, MA, IL)")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / "aggregate_impact.json"

    # Load existing JSON to preserve model data
    if filepath.exists():
        with open(filepath) as f:
            all_results = json.load(f)
        print(f"Loaded existing {filepath} — will update survey data only.")
    else:
        all_results = {
            "meta": {
                "baseline_year": BASELINE_YEAR,
                "repeal_year": REPEAL_YEAR,
                "policy": "Federal LIHEAP repeal",
                "states": list(STATES.keys()),
            },
            "states": {},
        }

    for state, config in STATES.items():
        print(f"\n{'─' * 40}")
        print(f"Processing {state}...")
        print(f"{'─' * 40}")
        survey_data = calculate_state_impact(state, config)

        # Merge: update survey key, preserve everything else
        if state not in all_results["states"]:
            all_results["states"][state] = {}
        all_results["states"][state]["survey"] = survey_data

        # Print summary
        pov = survey_data["poverty"]["poverty"]["all"]
        bs = survey_data["baseline_stats"]
        print(f"\n  {state} Summary:")
        print(f"    Total LIHEAP loss: ${abs(survey_data['total_cost']):,.0f}")
        print(f"    Affected households: {survey_data['affected_households']:,.0f}")
        print(f"    Average loss: ${abs(survey_data['avg_loss']):,.0f}")
        print(f"    Recipients: {bs['recipients']:,.0f} estimated vs {config['actual_heating_hh']:,} actual")
        print(f"    Poverty: {pov['baseline']:.2f}% -> {pov['reform']:.2f}%")

    # Save
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
        d = all_results["states"][state]["survey"]
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
