# LIHEAP Benefit Calculator

Interactive dashboard for exploring LIHEAP (Low Income Home Energy Assistance Program) benefits in all 50 states and DC.

## Features

- **Household calculator**: choose a state, program year, household, income, heating source and yearly bill to see the regular LIHEAP payment PolicyEngine's model computes
- **Every state**: all 50 states and DC, for the 2025-26 and 2026-27 program years
- **2D charts**: "Benefit by income" and "Benefit by household size", one line per group of heating sources the state treats alike
- **3D surface charts**: optional income x bill and income x household size surfaces (Plotly)
- **No API calls**: every amount is read from files precomputed with a local policyengine-us

## Repo Layout

```
frontend/                    Next.js app
  components/                Calculator, charts, page sections
  lib/liheapGrid.ts          Loads the precomputed files and looks results up
  public/data/liheap/        One file per state and program year
scripts/                     Python helpers (benefit files, impact generation)
```

## Local Development

```bash
cd frontend
bun install
bun run dev
```

Open http://localhost:3010

## Frontend Commands

Run from `frontend/`:

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server on port 3010 |
| `bun run build` | Production build |
| `bun run typecheck` | TypeScript check (no emit) |
| `bun run lint` | ESLint checks |

## Calculator Data Flow

The calculator makes no API calls. `scripts/generate_liheap_grids.py` runs a local policyengine-us for a fixed set of households in each state and writes `frontend/public/data/liheap/<year>/<STATE>.json`. The page loads one state's file when it is selected.

Every amount shown is one model run for that exact household. The page never interpolates between runs, so its inputs are limited to the households that were run:

- **Household**: one or two adults (age 40) and zero to six children (age 10). All income is one adult's wages.
- **Income**: $500 steps from $0 to just past the income where the state stops paying. A first pass in $5,000 steps up to $250,000 finds that income.
- **Heating source**: electricity, natural gas, fuel oil, kerosene, propane, wood, coal, other fuel, or heat included in rent ($12,000 of yearly rent, natural gas heat). States that can pay a home with no heating add that choice.
- **Yearly bill**: ten levels from $300 to $5,000. A home not heated with electricity also has a $1,500 electric bill.
- **County**: the most populous county where benefits vary by county; Anchorage in Alaska.
- **Cooling**: Alabama, Arkansas, Georgia, Kentucky, Louisiana, Oklahoma and South Carolina, which pay a separate cooling benefit to this household, are also run with a cooling cost.
- **State choices**: DC is run for both housing types and Massachusetts with and without subsidized housing.

The output is `liheap`, the model's total regular LIHEAP payment, and `mi_home_heating_credit` in Michigan. Files store each benefit schedule once, run-length encoded.

### Regenerating the files

Use a Python environment that can import `policyengine_us` from the local source you want. To use a checkout's main without touching it:

```bash
git -C ../policyengine-us archive upstream/main policyengine_us pyproject.toml uv.lock | tar -x -C /tmp/pe-main
UV_PROJECT_ENVIRONMENT=/tmp/pe-venv uv sync --project /tmp/pe-main --frozen --no-install-project --no-dev
PYTHONPATH=/tmp/pe-main /tmp/pe-venv/bin/python scripts/generate_liheap_grids.py --year 2027
PYTHONPATH=/tmp/pe-main /tmp/pe-venv/bin/python scripts/generate_liheap_grids.py --year 2026
```

Each year takes about an hour in one process and peaks near 4 GB of memory. The model version is written into every file and shown on the page. `scripts/check_liheap_grids.py` scans the files for results worth a second look.

## Aggregate Impact Data

Static aggregate impact data lives in `frontend/public/data/aggregate_impact.json`. To regenerate:

```bash
python scripts/generate_liheap_impacts.py
```

Requires `policyengine_us`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BASE_PATH` | (none) | Base path for GitHub Pages deployment |

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. The workflow builds the Next.js static export and deploys `frontend/out`.
