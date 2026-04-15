# LIHEAP Benefit Calculator

Interactive dashboard for exploring LIHEAP (Low Income Home Energy Assistance Program) benefit structures across DC, Massachusetts, and Illinois.

## Features

- **Household calculator** — enter income, household size, heating source, and state to see estimated LIHEAP eligibility and benefit amount
- **Instant local computation** — after first Calculate click, eligibility and benefit update in real-time as inputs change
- **Dual 2D charts** — "Benefit by Income" and "Benefit by Heating Expense" show the full benefit schedule with the user's position highlighted
- **3D surface charts** — optional toggles for Income x Expense and Income x Household Size surfaces (Plotly)
- **API verification** — Calculate button calls the PolicyEngine API for detailed extras (Income Level, Benefit Level, HECS, etc.)

## Repo Layout

```
frontend/                    Next.js app
  components/                Calculator, charts, page sections
  lib/liheapData.ts          LIHEAP parsing, benefit computation, eligibility checks
  lib/liheapFallbackData.json  Bundled 2024 LIHEAP parameter snapshot
  scripts/                   Validation scripts for chart accuracy
  public/data/               Static aggregate impact data
scripts/                     Python helpers (impact generation, local API)
```

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3010

## Frontend Commands

Run from `frontend/`:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3010 |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run lint` | ESLint checks |

## Calculator Data Flow

The calculator uses two data sources:

1. **Bundled parameter snapshot** (`liheapFallbackData.json`) — 2024 LIHEAP parameters for all three states, used for instant chart rendering and local benefit computation. Parameters are evaluated at 2024-01-01 to match the PolicyEngine engine.

2. **Live PolicyEngine API** (`/us/calculate`) — called when user clicks Calculate, returns API-verified eligibility, payment, and state-specific extras.

### Local computation

Charts and the result row use `computeBenefit()` and `isEligible()` from `liheapData.ts`, which implement the same logic as the PolicyEngine API:

- **DC**: 10-level income matrix, capped by heating expense, 60% SMI eligibility
- **MA**: 6-level FPL-ratio brackets, standard payment table, 200% FPL eligibility (using prior-year FPG)
- **IL**: 4-bracket income matrix, max(60% SMI, 200% FPL) eligibility

### Validation

Validation scripts in `frontend/scripts/` compare local computation against the API:

```bash
node frontend/scripts/validate-charts.mjs
```

## Aggregate Impact Data

Static aggregate impact data lives in `frontend/public/data/aggregate_impact.json`. To regenerate:

```bash
python scripts/generate_liheap_impacts.py
```

Requires `policyengine_us`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_POLICYENGINE_API_URL` | `https://api.policyengine.org` | PolicyEngine API endpoint |
| `NEXT_PUBLIC_BASE_PATH` | (none) | Base path for GitHub Pages deployment |

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. The workflow builds the Next.js static export and deploys `frontend/out`.
