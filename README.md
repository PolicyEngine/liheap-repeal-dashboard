# LIHEAP Repeal Dashboard

This repository contains a small Next.js dashboard for exploring LIHEAP impacts.

It currently includes:

- a household-level LIHEAP calculator for DC, Massachusetts, and Illinois
- chart visualizations of state benefit schedules
- a static aggregate-impact dataset rendered in the frontend
- helper scripts for generating impact data and running a local PolicyEngine-style API

## Repo Layout

- `frontend/`: Next.js app
- `frontend/components/`: calculator, charts, page sections
- `frontend/lib/`: LIHEAP parsing and benefit logic
- `frontend/public/data/aggregate_impact.json`: static aggregate impact data used by the app
- `scripts/generate_liheap_impacts.py`: generates aggregate impact output
- `scripts/local_api.py`: lightweight local API compatible with the calculator request format
- `data/`: local state data artifacts

## Local Development

The frontend lives in `frontend/` and runs on port `3010`.

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3010/`.

## Frontend Commands

Run these from `frontend/`:

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

Notes:

- `npm run dev` starts the local app on port `3010`
- `npm run typecheck` runs TypeScript without emitting files
- `npm run lint` runs Next.js ESLint checks
- `npm run build` creates a production build and static export

## Calculator Data Flow

The household calculator uses two data sources:

1. Live PolicyEngine API calls to calculate household results.
2. A bundled LIHEAP parameter snapshot for chart rendering fallback.

The chart fallback snapshot lives in:

- `frontend/lib/liheapFallbackData.json`

If live metadata cannot be fetched, the app still renders charts using that bundled snapshot and shows a warning in the UI.

## Aggregate Impact Data

The frontend reads aggregate impact results from:

- `frontend/public/data/aggregate_impact.json`

To regenerate that data, run the Python script from the repo root after setting up the required Python environment and PolicyEngine dependencies:

```bash
python scripts/generate_liheap_impacts.py
```

The script currently depends on `policyengine_us`.

## Local API Helper

If you want to test calculator requests against a local PolicyEngine installation instead of the remote API, use:

```bash
python scripts/local_api.py
```

That server exposes:

- `POST /us/calculate`

It is designed to mimic the shape of `api.policyengine.org/us/calculate` closely enough for local development.

## Deployment

The project is configured for GitHub Pages deployment via:

- `.github/workflows/deploy.yml`

The workflow:

- installs frontend dependencies
- builds the Next.js static export
- deploys `frontend/out`

For Pages builds, the workflow sets:

```bash
NEXT_PUBLIC_BASE_PATH=/liheap-repeal-dashboard
```

## Current Status

Recent cleanup included:

- adding a real offline fallback for chart metadata
- removing the build-time Google Fonts dependency
- making the calculator layout more mobile-safe
- setting up working `typecheck`, `lint`, and `build` commands

Still worth doing:

- add automated tests for `frontend/lib/liheapData.ts`
- break up `frontend/components/HouseholdCalculator.tsx` into smaller units
- decide whether `AggregateImpact` should be exposed in the app or removed
