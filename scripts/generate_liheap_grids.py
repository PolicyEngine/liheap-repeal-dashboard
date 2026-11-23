"""Precompute LIHEAP heating benefits for every state from a local policyengine-us.

The dashboard looks values up in the files this script writes. Every number is
the output of one model run for one household: the frontend never interpolates
between runs, so its inputs are limited to the steps computed here.

Run it with a Python environment that can import ``policyengine_us`` from the
local source you want to use, for example an export of the checkout's main:

    PYTHONPATH=/path/to/policyengine-us python scripts/generate_liheap_grids.py \
        --year 2027

One process, one state at a time. Nothing calls the PolicyEngine API.
"""

import argparse
import json
import resource
import time
from pathlib import Path

import numpy as np
import pandas as pd

# Heating fuel choices, with the model input that holds that fuel's yearly bill.
FUELS = [
    ("ELECTRICITY", "Electricity", "pre_subsidy_electricity_expense"),
    ("NATURAL_GAS", "Natural gas", "gas_expense"),
    ("FUEL_OIL", "Fuel oil", "fuel_oil_expense"),
    ("KEROSENE", "Kerosene", "fuel_oil_expense"),
    ("PROPANE", "Propane", "bottled_gas_expense"),
    ("WOOD", "Wood", "wood_expense"),
    ("COAL", "Coal", "coal_expense"),
    ("OTHER", "Other fuel", "other_heating_fuel_expense"),
]
HEAT_IN_RENT = ("HEAT_IN_RENT", "Heat included in rent")
NO_HEATING = ("NONE", "No heating (cooling only)")
HEAT_IN_RENT_INDEX = len(FUELS)
NO_HEATING_INDEX = len(FUELS) + 1
# The model needs a fuel even when heat is in the rent; natural gas is assumed.
HEAT_IN_RENT_FUEL = "NATURAL_GAS"
HEAT_IN_RENT_ANNUAL_RENT = 12_000
# Homes not heated with electricity still have an electric bill.
BASE_ELECTRIC_BILL = 1_500

EXPENSES = [300, 600, 900, 1_200, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000]
COMPOSITIONS = [(adults, children) for adults in (1, 2) for children in range(7)]
ADULT_AGE = 40
CHILD_AGE = 10

INCOME_STEP = 500
MAX_HOUSEHOLDS_PER_RUN = 120_000
COARSE_STEP = 5_000
COARSE_MAX = 250_000
MIN_INCOME_RANGE = 20_000

STATES = {
    "AL": (1, "Alabama"), "AK": (2, "Alaska"), "AZ": (4, "Arizona"),
    "AR": (5, "Arkansas"), "CA": (6, "California"), "CO": (8, "Colorado"),
    "CT": (9, "Connecticut"), "DE": (10, "Delaware"),
    "DC": (11, "District of Columbia"), "FL": (12, "Florida"),
    "GA": (13, "Georgia"), "HI": (15, "Hawaii"), "ID": (16, "Idaho"),
    "IL": (17, "Illinois"), "IN": (18, "Indiana"), "IA": (19, "Iowa"),
    "KS": (20, "Kansas"), "KY": (21, "Kentucky"), "LA": (22, "Louisiana"),
    "ME": (23, "Maine"), "MD": (24, "Maryland"), "MA": (25, "Massachusetts"),
    "MI": (26, "Michigan"), "MN": (27, "Minnesota"), "MS": (28, "Mississippi"),
    "MO": (29, "Missouri"), "MT": (30, "Montana"), "NE": (31, "Nebraska"),
    "NV": (32, "Nevada"), "NH": (33, "New Hampshire"), "NJ": (34, "New Jersey"),
    "NM": (35, "New Mexico"), "NY": (36, "New York"),
    "NC": (37, "North Carolina"), "ND": (38, "North Dakota"), "OH": (39, "Ohio"),
    "OK": (40, "Oklahoma"), "OR": (41, "Oregon"), "PA": (42, "Pennsylvania"),
    "RI": (44, "Rhode Island"), "SC": (45, "South Carolina"),
    "SD": (46, "South Dakota"), "TN": (47, "Tennessee"), "TX": (48, "Texas"),
    "UT": (49, "Utah"), "VT": (50, "Vermont"), "VA": (51, "Virginia"),
    "WA": (53, "Washington"), "WV": (54, "West Virginia"),
    "WI": (55, "Wisconsin"), "WY": (56, "Wyoming"),
}

# Benefits vary by county in these states. The model otherwise uses the state's
# first county in alphabetical order, so the most populous county is sent.
COUNTY_FIPS = {
    "CA": ("06037", "Los Angeles County"),
    "HI": ("15003", "Honolulu County"),
    "ID": ("16001", "Ada County"),
    "MD": ("24031", "Montgomery County"),
    "ME": ("23005", "Cumberland County"),
    "MT": ("30111", "Yellowstone County"),
    "NH": ("33011", "Hillsborough County"),
    "NJ": ("34003", "Bergen County"),
    "OH": ("39049", "Franklin County"),
    "OR": ("41051", "Multnomah County"),
    "PA": ("42101", "Philadelphia County"),
    "SD": ("46099", "Minnehaha County"),
    "VA": ("51059", "Fairfax County"),
}
# Alaska pays by community.
PLACE_FIPS = {"AK": ("03000", "Anchorage")}

# The state's own heating eligibility output. States not listed have none, and
# the dashboard then treats a positive benefit as eligible.
ELIGIBILITY = {
    "AL": "al_liheap_eligible", "AR": "ar_liheap_eligible",
    "AZ": "az_liheap_eligible", "CO": "co_leap_eligible",
    "CT": "ct_ceap_eligible", "DC": "dc_liheap_eligible",
    "DE": "de_liheap_eligible", "FL": "fl_liheap_eligible",
    "GA": "ga_liheap_eligible", "HI": "hi_liheap_eligible",
    "IA": "ia_liheap_eligible", "ID": "id_liheap_eligible",
    "IL": "il_liheap_eligible", "IN": "in_eap_eligible",
    "KS": "ks_liheap_eligible", "KY": "ky_liheap_eligible",
    "LA": "la_liheap_eligible", "MA": "ma_liheap_eligible",
    "MD": "md_meap_eligible", "ME": "me_heap_eligible",
    "MN": "mn_eap_eligible", "MO": "mo_liheap_eligible",
    "MS": "ms_liheap_eligible", "MT": "mt_liheap_eligible",
    "NC": "nc_lieap_eligible", "ND": "nd_liheap_eligible",
    "NE": "ne_liheap_eligible", "NH": "nh_fap_eligible",
    "NJ": "nj_liheap_eligible", "NM": "nm_liheap_eligible",
    "NV": "nv_liheap_eligible", "NY": "ny_heap_eligible",
    "OH": "oh_liheap_eligible", "OK": "ok_liheap_eligible",
    "OR": "or_liheap_eligible", "PA": "pa_liheap_eligible",
    "RI": "ri_liheap_eligible", "SC": "sc_liheap_eligible",
    "SD": "sd_liheap_eligible", "TN": "tn_liheap_eligible",
    "TX": "tx_ceap_eligible", "UT": "ut_heat_eligible",
    "VA": "va_eap_eligible", "VT": "vt_liheap_eligible",
    "WA": "wa_liheap_eligible", "WI": "wi_wheap_eligible",
    "WY": "wy_lieap_eligible",
}

# States with a separate regular cooling benefit that this household can
# receive, and that benefit's output. The dashboard offers "also pays for
# cooling" there. Nebraska, New Jersey and Virginia also pay one, but only to
# households with an older, very young, disabled or medically certified member,
# which the dashboard's household does not have.
COOLING_OUTPUT = {
    "AL": "al_liheap_cooling",
    "AR": "ar_liheap_cooling",
    "GA": "ga_liheap_cooling",
    "KY": "ky_liheap_cooling",
    "LA": "la_liheap_cooling",
    "OK": "ok_liheap_cooling",
    "SC": "sc_liheap_cooling",
}
# States whose benefit can go to a home with no heating: the separate cooling
# benefits above and the states where one benefit covers heating or cooling.
NO_HEATING_STATES = set(COOLING_OUTPUT) | {
    "AZ", "CA", "DC", "FL", "HI", "MS", "NM", "NV", "OR", "TN", "TX", "UT",
}

# Extra choices a state's schedule needs. Each variant sets SPM-unit inputs.
VARIANTS = {
    "DC": {
        "label": "Housing",
        "choices": [
            ("MULTI_FAMILY", "Multi-family", {"dc_liheap_housing_type": "MULTI_FAMILY"}),
            ("SINGLE_FAMILY", "Single-family", {"dc_liheap_housing_type": "SINGLE_FAMILY"}),
        ],
    },
    "MA": {
        "label": "Housing",
        "choices": [
            ("NOT_SUBSIDIZED", "Not subsidized", {"receives_housing_assistance": False}),
            ("SUBSIDIZED", "Subsidized", {"receives_housing_assistance": True}),
        ],
    },
}
NO_VARIANT = {"label": "", "choices": [("DEFAULT", "", {})]}


def options(state):
    """(fuel index, bill) for each fuel and bill level, then heat in rent.

    States that can pay a home with no heating add that choice, where the bill
    is the electric bill.
    """
    pairs = [(f, e) for f in range(len(FUELS)) for e in EXPENSES]
    pairs.append((HEAT_IN_RENT_INDEX, 0))
    if state in NO_HEATING_STATES:
        pairs.extend((NO_HEATING_INDEX, e) for e in EXPENSES)
    return pairs


def build_frame(state, year, scen, variant_inputs):
    """One row per person for the households in ``scen``.

    ``scen`` holds one household per row: adults, children, fuel, expense,
    income and variant. Group inputs are repeated on each member's row, as the
    model's flat-file loader expects. Every input is set for ``year`` and for
    the year before.
    """
    fips = STATES[state][0]
    adults = scen["adults"].to_numpy()
    size = adults + scen["children"].to_numpy()
    n = len(scen)
    hh = np.repeat(np.arange(n), size)
    first_row = np.cumsum(size) - size
    pos = np.arange(len(hh)) - np.repeat(first_row, size)
    is_adult = pos < np.repeat(adults, size)
    is_first = pos == 0

    def per_person(values):
        return np.repeat(np.asarray(values), size)

    fuel = scen["fuel"].to_numpy()
    expense = scen["expense"].to_numpy()
    heat_in_rent = fuel == HEAT_IN_RENT_INDEX
    no_heating = fuel == NO_HEATING_INDEX
    fuel_names = np.array(
        [f[0] for f in FUELS] + [HEAT_IN_RENT_FUEL, NO_HEATING[0]]
    )[fuel]
    electric_fuel = [f[0] for f in FUELS].index("ELECTRICITY")
    # The entered bill is the electric bill for electric heat and for a home
    # with no heating; every other home has the base electric bill.
    electric_bill = np.where(
        (fuel == electric_fuel) | no_heating, expense, BASE_ELECTRIC_BILL
    )
    has_cooling = scen["cooling"].to_numpy().astype(bool) | no_heating

    y = str(year)
    rent = np.where(
        is_first & per_person(heat_in_rent), HEAT_IN_RENT_ANNUAL_RENT, 0
    ).astype(float)
    data = {
        "person_id": np.arange(len(hh)),
        "person_household_id": hh,
        "person_tax_unit_id": hh,
        "person_spm_unit_id": hh,
        "person_family_id": hh,
        # Both adults share a marital unit; each child has their own.
        "person_marital_unit_id": hh * 10 + np.where(is_adult, 0, pos),
        f"age__{y}": np.where(is_adult, ADULT_AGE, CHILD_AGE),
        f"employment_income_before_lsr__{y}": np.where(
            is_first, per_person(scen["income"].to_numpy()), 0
        ).astype(float),
        f"rent__{y}": rent,
        # Rent before any housing subsidy. Alaska, Montana and Missouri read
        # this input for heat-in-rent households and treat a household that
        # sends only `rent` as paying none. This renter has no subsidy, so the
        # two are equal.
        f"pre_subsidy_rent__{y}": rent,
        # Without this the model also computes a federal rent subsidy for any
        # low-income renter with pre-subsidy rent, received or not.
        f"housing_assistance__{y}": np.zeros(len(hh)),
        f"state_fips__{y}": np.full(len(hh), fips),
        f"heating_type__{y}": per_person(fuel_names),
        f"heat_expense_included_in_rent__{y}": per_person(heat_in_rent),
        f"has_cooling_expense__{y}": per_person(has_cooling),
        f"pre_subsidy_electricity_expense__{y}": per_person(electric_bill).astype(
            float
        ),
    }
    for variable in sorted({f[2] for f in FUELS} - {"pre_subsidy_electricity_expense"}):
        uses = np.isin(fuel, [i for i, f in enumerate(FUELS) if f[2] == variable])
        data[f"{variable}__{y}"] = per_person(np.where(uses, expense, 0)).astype(float)
    if state in COUNTY_FIPS:
        data[f"county_fips__{y}"] = np.full(len(hh), COUNTY_FIPS[state][0])
    if state in PLACE_FIPS:
        data[f"place_fips__{y}"] = np.full(len(hh), PLACE_FIPS[state][0])
    variant = scen["variant"].to_numpy()
    names = sorted({name for inputs in variant_inputs for name in inputs})
    for name in names:
        values = np.array([inputs[name] for inputs in variant_inputs])[variant]
        data[f"{name}__{y}"] = per_person(values)
    # The same household the year before. Some rules read an earlier month, such
    # as Idaho's check for SNAP in October of the prior calendar year, and
    # inputs set for one year only would leave that month with a default
    # household in a default state.
    suffix = f"__{y}"
    earlier = {
        name[: -len(suffix)] + f"__{year - 1}": values
        for name, values in data.items()
        if name.endswith(suffix)
    }
    data.update(earlier)
    return pd.DataFrame(data)


def run(state, year, scen, variant_inputs):
    """Run the model for the households in ``scen``, a chunk at a time.

    Returns the yearly regular benefit, its separate cooling part, whether the
    household is eligible, and the county the model used.
    """
    from policyengine_core.data import Dataset
    from policyengine_us import Simulation

    benefits, coolings, eligibles, county = [], [], [], ""
    for start in range(0, len(scen), MAX_HOUSEHOLDS_PER_RUN):
        chunk = scen.iloc[start : start + MAX_HOUSEHOLDS_PER_RUN]
        frame = build_frame(state, year, chunk, variant_inputs)
        sim = Simulation(dataset=Dataset.from_dataframe(frame, str(year)))
        if state == "MI":
            # Michigan's regular heating help is the Home Heating Credit.
            benefit = np.asarray(sim.calculate("mi_home_heating_credit", year))
        else:
            benefit = np.asarray(sim.calculate("liheap", year))
        assert len(benefit) == len(chunk), (len(benefit), len(chunk))
        benefit = benefit.astype(float)
        if state in COOLING_OUTPUT:
            cooling = np.asarray(sim.calculate(COOLING_OUTPUT[state], year))
        else:
            cooling = np.zeros(len(chunk))
        eligible = benefit > 0
        if state in ELIGIBILITY:
            eligible = eligible | np.asarray(
                sim.calculate(ELIGIBILITY[state], year)
            ).astype(bool)
        county = str(np.asarray(sim.calculate("county_str", year))[0])
        benefits.append(benefit)
        coolings.append(cooling.astype(float))
        eligibles.append(eligible)
        del sim, frame
    return (
        np.concatenate(benefits),
        np.concatenate(coolings),
        np.concatenate(eligibles),
        county,
    )


def scenarios(compositions, incomes_by_comp, option_pairs, n_variants, n_cooling):
    """Every household for a pass, with the keys needed to file its result."""
    parts = []
    for comp_index, (adults, children) in enumerate(compositions):
        incomes = np.asarray(incomes_by_comp[comp_index])
        for cooling in range(n_cooling):
            for variant in range(n_variants):
                for option_index, (fuel, expense) in enumerate(option_pairs):
                    parts.append(
                        pd.DataFrame(
                            {
                                "comp": comp_index,
                                "adults": adults,
                                "children": children,
                                "cooling": cooling,
                                "variant": variant,
                                "option": option_index,
                                "fuel": fuel,
                                "expense": expense,
                                "income": incomes,
                            }
                        )
                    )
    return pd.concat(parts, ignore_index=True)


def run_length(values):
    """[value, count, value, count, ...] for a list of numbers."""
    out = []
    for value in values:
        if out and out[-2] == value:
            out[-1] = out[-1] + 1
        else:
            out.extend([value, 1])
    return out


def generate_state(state, year, step=INCOME_STEP):
    variant_spec = VARIANTS.get(state, NO_VARIANT)
    variant_inputs = [choice[2] for choice in variant_spec["choices"]]
    n_variants = len(variant_inputs)
    n_cooling = 2 if state in COOLING_OUTPUT else 1
    all_options = options(state)

    # Coarse pass: find the income above which no household gets a benefit.
    coarse_incomes = np.arange(0, COARSE_MAX + 1, COARSE_STEP)
    coarse_options = [
        (f, e) for f in (0, 1, 2) for e in (EXPENSES[0], EXPENSES[-1])
    ] + [(HEAT_IN_RENT_INDEX, 0)]
    if state in NO_HEATING_STATES:
        coarse_options.append((NO_HEATING_INDEX, EXPENSES[-1]))
    coarse = scenarios(
        COMPOSITIONS,
        [coarse_incomes] * len(COMPOSITIONS),
        coarse_options,
        n_variants,
        n_cooling,
    )
    benefit, _, eligible, county = run(state, year, coarse, variant_inputs)
    coarse["active"] = (benefit > 0) | eligible
    active = coarse[coarse["active"]]
    last = int(active["income"].max()) if len(active) else 0
    top = min(COARSE_MAX, max(MIN_INCOME_RANGE, last + COARSE_STEP + 2 * step))
    # One income range for the whole state, so every household composition is
    # run at every income the dashboard offers.
    incomes = np.arange(0, top + 1, step)
    incomes_by_comp = [incomes] * len(COMPOSITIONS)
    never_stops = bool(
        coarse.loc[coarse["income"] == COARSE_MAX, "active"].any()
    )

    # Main pass: every option at every income step.
    grid = scenarios(COMPOSITIONS, incomes_by_comp, all_options, n_variants, n_cooling)
    benefit, cooling, eligible, county = run(state, year, grid, variant_inputs)
    grid["benefit"] = np.round(benefit, 2)
    grid["cooling_part"] = np.round(cooling, 2)
    grid["eligible"] = eligible.astype(int)

    curves, curve_ids = [], {}
    flags, flag_ids = [], {}

    def intern(pool, ids, values):
        key = tuple(values)
        if key not in ids:
            ids[key] = len(pool)
            pool.append(run_length(list(key)))
        return ids[key]

    def table():
        return [
            [[[0] * len(all_options) for _ in COMPOSITIONS] for _ in range(n_variants)]
            for _ in range(n_cooling)
        ]

    def numbers(series):
        return [int(v) if float(v).is_integer() else float(v) for v in series]

    index, cooling_index, eligible_index = table(), table(), table()
    ordered = grid.sort_values(["cooling", "variant", "comp", "option", "income"])
    for (cool, variant, comp, option), block in ordered.groupby(
        ["cooling", "variant", "comp", "option"], sort=False
    ):
        index[cool][variant][comp][option] = intern(
            curves, curve_ids, numbers(block["benefit"])
        )
        cooling_index[cool][variant][comp][option] = intern(
            curves, curve_ids, numbers(block["cooling_part"])
        )
        eligible_index[cool][variant][comp][option] = intern(
            flags, flag_ids, block["eligible"].tolist()
        )

    return {
        "state": state,
        "name": STATES[state][1],
        "year": year,
        "benefitVariable": "mi_home_heating_credit" if state == "MI" else "liheap",
        "eligibilityVariable": ELIGIBILITY.get(state),
        "county": COUNTY_FIPS[state][1] if state in COUNTY_FIPS else None,
        "modelCounty": county,
        "place": PLACE_FIPS[state][1] if state in PLACE_FIPS else None,
        "compositions": [list(c) for c in COMPOSITIONS],
        "incomeStep": step,
        "incomeCount": len(incomes),
        "benefitsBeyondRange": never_stops,
        "fuels": [{"value": f[0], "label": f[1]} for f in FUELS]
        + [{"value": HEAT_IN_RENT[0], "label": HEAT_IN_RENT[1]}]
        + (
            [{"value": NO_HEATING[0], "label": NO_HEATING[1]}]
            if state in NO_HEATING_STATES
            else []
        ),
        "expenses": EXPENSES,
        # Each option is [fuel position in "fuels", yearly bill].
        "options": [list(pair) for pair in all_options],
        "coolingToggle": state in COOLING_OUTPUT,
        "coolingVariable": COOLING_OUTPUT.get(state),
        "variantLabel": variant_spec["label"],
        "variants": [
            {"value": choice[0], "label": choice[1]}
            for choice in variant_spec["choices"]
        ],
        "curves": curves,
        "eligibleCurves": flags,
        # Tables are indexed [cooling][variant][composition][option].
        "index": index,
        "coolingIndex": cooling_index if state in COOLING_OUTPUT else None,
        "eligibleIndex": eligible_index,
        "households": int(len(grid) + len(coarse)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2027)
    parser.add_argument("--states", nargs="*", default=sorted(STATES))
    parser.add_argument("--out", default=None)
    parser.add_argument("--step", type=int, default=INCOME_STEP)
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    import policyengine_us
    from importlib.metadata import PackageNotFoundError, version

    source = Path(policyengine_us.__file__).resolve().parent.parent
    try:
        model_version = version("policyengine-us")
    except PackageNotFoundError:
        model_version = None
    pyproject = source / "pyproject.toml"
    if pyproject.exists():
        for line in pyproject.read_text().splitlines():
            if line.startswith("version"):
                model_version = line.split('"')[1]
                break
    commit_file = source / "COMMIT"
    commit = commit_file.read_text().strip() if commit_file.exists() else None
    print(f"policyengine-us {model_version} from {source}", flush=True)

    out = Path(args.out or f"frontend/public/data/liheap/{args.year}")
    out.mkdir(parents=True, exist_ok=True)
    for state in args.states:
        target = out / f"{state}.json"
        if args.skip_existing and target.exists():
            continue
        start = time.time()
        result = generate_state(state, args.year, args.step)
        result["model"] = {"package": "policyengine-us", "version": model_version, "commit": commit}
        target.write_text(json.dumps(result, separators=(",", ":")))
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9
        print(
            f"{state}: {result['households']:,} households, "
            f"{len(result['curves'])} curves, {target.stat().st_size / 1e3:.0f} kB, "
            f"{time.time() - start:.0f}s, peak {peak:.1f} GB",
            flush=True,
        )

    meta = {
        "year": args.year,
        "model": {"package": "policyengine-us", "version": model_version, "commit": commit},
        "states": [
            {"code": code, "name": STATES[code][1]}
            for code in sorted(STATES, key=lambda c: STATES[c][1])
        ],
        "assumptions": {
            "adultAge": ADULT_AGE,
            "childAge": CHILD_AGE,
            "heatInRentFuel": HEAT_IN_RENT_FUEL,
            "heatInRentAnnualRent": HEAT_IN_RENT_ANNUAL_RENT,
            "baseElectricBill": BASE_ELECTRIC_BILL,
            "incomeStep": args.step,
        },
    }
    (out / "index.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
