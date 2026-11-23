"""Scan the precomputed LIHEAP files for results worth a second look.

Reads the files written by generate_liheap_grids.py and prints, for each state,
its largest and smallest payments, where payments stop, and a list of flags:
payments that rise with income, fall with household size, never stop, are all
zero for a heating source, or change sharply between program years.

    python scripts/check_liheap_grids.py --year 2027 --compare 2026

A flag is a prompt to read the state's rules, not a finding that the model is
wrong.
"""

import argparse
import json
from pathlib import Path

# 2026 poverty guidelines for the 48 states and DC, used only to describe where
# payments stop in familiar terms.
FPG_FIRST, FPG_EXTRA = 15_960, 5_680

REFERENCE = {"adults": 1, "children": 2, "income": 20_000, "expense": 1_500}


def decode(runs):
    values = []
    for i in range(0, len(runs), 2):
        values.extend([runs[i]] * runs[i + 1])
    return values


class Grid:
    def __init__(self, path):
        self.d = json.loads(Path(path).read_text())
        d = self.d
        self.step = d["incomeStep"]
        self.fuels = [f["value"] for f in d["fuels"]]
        self.labels = {f["value"]: f["label"] for f in d["fuels"]}
        self._curves = [decode(c) for c in d["curves"]]
        self._flags = [decode(c) for c in d["eligibleCurves"]]

    def option(self, fuel, expense):
        position = self.fuels.index(fuel)
        for i, (f, e) in enumerate(self.d["options"]):
            if f == position and (fuel == "HEAT_IN_RENT" or e == expense):
                return i
        return None

    def curve(self, comp, option, cooling=0, variant=0, table="index"):
        pool = self._flags if table == "eligibleIndex" else self._curves
        return pool[self.d[table][cooling][variant][comp][option]]

    def comp(self, adults, children):
        return self.d["compositions"].index([adults, children])

    def value(self, adults, children, fuel, expense, income, cooling=0, variant=0):
        option = self.option(fuel, expense)
        i = income // self.step
        if option is None or i >= self.d["incomeCount"]:
            return None
        return self.curve(self.comp(adults, children), option, cooling, variant)[i]


def describe(grid):
    d = grid.d
    step = grid.step
    n_cooling = len(d["index"])
    n_variants = len(d["variants"])
    flags = []
    largest = (0, None)
    smallest = (float("inf"), None)
    rises, falls_with_size = [], []
    zero_fuels = []

    for fuel in grid.fuels:
        fuel_max = 0
        expenses = [0] if fuel == "HEAT_IN_RENT" else d["expenses"]
        for expense in expenses:
            option = grid.option(fuel, expense)
            for cooling in range(n_cooling):
                for variant in range(n_variants):
                    by_comp = []
                    for comp, (adults, children) in enumerate(d["compositions"]):
                        curve = grid.curve(comp, option, cooling, variant)
                        by_comp.append(curve)
                        top = max(curve)
                        if cooling == 0:
                            # Without a cooling cost, so a separate cooling
                            # benefit does not hide a fuel with no heating payment.
                            fuel_max = max(fuel_max, top)
                        where = (adults, children, fuel, expense, curve.index(top) * step, cooling, variant)
                        if top > largest[0]:
                            largest = (top, where)
                        positive = [v for v in curve if v > 0]
                        if positive and min(positive) < smallest[0]:
                            low = min(positive)
                            smallest = (low, (adults, children, fuel, expense, curve.index(low) * step, cooling, variant))
                        # A payment that rises with income.
                        for i in range(1, len(curve)):
                            if curve[i] > curve[i - 1] + 1:
                                rises.append((curve[i] - curve[i - 1], adults, children, fuel, expense, i * step, curve[i - 1], curve[i]))
                                break
                    # A payment that falls as the household grows, same adults.
                    for adults in (1, 2):
                        comps = [c for c, (a, _) in enumerate(d["compositions"]) if a == adults]
                        for i in range(0, d["incomeCount"], 10):
                            values = [by_comp[c][i] for c in comps]
                            for k in range(1, len(values)):
                                if values[k] < values[k - 1] - 1 and values[k - 1] > 0:
                                    falls_with_size.append((values[k - 1] - values[k], adults, k, fuel, expense, i * step, values[k - 1], values[k]))
        if fuel_max == 0:
            zero_fuels.append(grid.labels[fuel])

    # Where payments stop, for one adult alone and for two adults with two children.
    stops = {}
    for adults, children in ((1, 0), (2, 2), (2, 6)):
        comp = grid.comp(adults, children)
        last = 0
        for option in range(len(d["options"])):
            for cooling in range(n_cooling):
                for variant in range(n_variants):
                    curve = grid.curve(comp, option, cooling, variant)
                    positive = [i for i, v in enumerate(curve) if v > 0]
                    if positive:
                        last = max(last, positive[-1] * step)
        size = adults + children
        fpg = FPG_FIRST + FPG_EXTRA * (size - 1)
        stops[size] = (last, last / fpg)

    reference = {
        fuel: grid.value(REFERENCE["adults"], REFERENCE["children"], fuel, REFERENCE["expense"], REFERENCE["income"])
        for fuel in grid.fuels
        if fuel != "NONE"
    }

    if largest[0] == 0:
        flags.append("pays nothing to any household")
    if largest[0] > 3_000:
        flags.append(f"largest payment is ${largest[0]:,.0f}")
    if smallest[1] and smallest[0] < 20:
        flags.append(f"smallest payment is ${smallest[0]:,.2f}")
    if d["benefitsBeyondRange"]:
        flags.append("still pays or reports eligible at $250,000 of income")
    for size, (last, ratio) in stops.items():
        if last and (ratio < 1.2 or ratio > 4.5):
            flags.append(f"size {size} stops at ${last:,} ({ratio:.0%} of the poverty guideline)")
    if zero_fuels and largest[0] > 0:
        flags.append("no payment for: " + ", ".join(zero_fuels))
    if rises:
        worst = max(rises)
        flags.append(
            f"payment rises with income in {len(rises)} schedules, e.g. {worst[1]} adult(s) + {worst[2]} children, "
            f"{worst[3]}, ${worst[4]:,} bill: ${worst[6]:,.0f} -> ${worst[7]:,.0f} at ${worst[5]:,}"
        )
    if falls_with_size:
        worst = max(falls_with_size)
        flags.append(
            f"payment falls with household size in {len(falls_with_size)} places, e.g. {worst[1]} adult(s), "
            f"{worst[3]}, ${worst[4]:,} bill, ${worst[5]:,} income: ${worst[6]:,.0f} -> ${worst[7]:,.0f} at {worst[2]} children"
        )
    return {
        "state": d["state"],
        "largest": largest,
        "smallest": smallest,
        "stops": stops,
        "reference": reference,
        "flags": flags,
        "curves": len(d["curves"]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2027)
    parser.add_argument("--compare", type=int, default=None)
    parser.add_argument("--data", default="frontend/public/data/liheap")
    parser.add_argument("--json", default=None, help="write the summary here")
    args = parser.parse_args()

    root = Path(args.data)
    summaries = {}
    for path in sorted((root / str(args.year)).glob("??.json")):
        grid = Grid(path)
        summary = describe(grid)
        if args.compare:
            other_path = root / str(args.compare) / path.name
            if other_path.exists():
                other = Grid(other_path)
                changes = []
                for fuel, now in summary["reference"].items():
                    if fuel not in other.fuels:
                        continue
                    before = other.value(REFERENCE["adults"], REFERENCE["children"], fuel, REFERENCE["expense"], REFERENCE["income"])
                    if before is None or now is None:
                        continue
                    if (before == 0) != (now == 0) or (before and abs(now / before - 1) > 0.3):
                        changes.append(f"{fuel} ${before:,.0f} -> ${now:,.0f}")
                if changes:
                    summary["flags"].append(
                        f"reference household changes sharply from {args.compare} to {args.year}: " + "; ".join(changes)
                    )
        summaries[summary["state"]] = summary

    print(
        f"{'ST':<3} {'largest':>8} {'smallest':>9} {'gas ref':>8} {'oil ref':>8} "
        f"{'stop n=1':>9} {'stop n=4':>9} {'stop n=8':>9}  flags"
    )
    for state, s in summaries.items():
        ref = s["reference"]
        small = s["smallest"][0] if s["smallest"][1] else 0
        print(
            f"{state:<3} {s['largest'][0]:>8,.0f} {small:>9,.0f} "
            f"{ref.get('NATURAL_GAS') or 0:>8,.0f} {ref.get('FUEL_OIL') or 0:>8,.0f} "
            f"{s['stops'][1][0]:>9,} {s['stops'][4][0]:>9,} {s['stops'][8][0]:>9,}  {len(s['flags'])}"
        )
    print()
    for state, s in summaries.items():
        for flag in s["flags"]:
            print(f"{state}: {flag}")
    if args.json:
        Path(args.json).write_text(json.dumps(summaries, indent=1, default=str))


if __name__ == "__main__":
    main()
