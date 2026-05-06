# Folio — Investment Tracker

A fully client-side investment portfolio tracker for Canadian investors, built as a React + Vite SPA. All data stored in IndexedDB (Dexie.js) — no backend required.

## Run & Operate

- `pnpm --filter @workspace/investment-tracker run dev` — dev server (uses PORT env var)
- Root workflow: `artifacts/investment-tracker: web`
- No required env vars (client-only app)

## Stack

- React 18, Vite 7, TypeScript 5.9, Tailwind CSS v4
- Dexie.js 4 + dexie-react-hooks (IndexedDB)
- PapaParse (CSV parsing/export)
- Recharts (charts)
- shadcn/ui components (`artifacts/investment-tracker/src/components/ui/`)
- Wouter (routing)
- pnpm workspace monorepo

## Where things live

```
artifacts/investment-tracker/src/
  lib/
    db.ts           — Dexie schema (Portfolio, Account, Security, Transaction, Holding, ContributionRecord, PriceCache, DistributionImport)
    calculations.ts — ACB, Modified Dietz, TWR, gain/loss
    marketData.ts   — Yahoo Finance price fetching/caching
    csvUtils.ts     — CSV parse/export, formatCurrency, formatPercent
    seedData.ts     — Demo data seeded on first load
  components/
    Layout.tsx      — Fixed sidebar nav (all 10 routes)
    ui/             — shadcn/ui components
  pages/
    Dashboard.tsx, Portfolios.tsx, Holdings.tsx, Transactions.tsx
    Import.tsx, Export.tsx, Distributions.tsx, Reports.tsx
    Contributions.tsx, Settings.tsx
```

## Architecture decisions

- **Client-only**: No backend, no auth. All data in IndexedDB via Dexie. Backup/restore via JSON export.
- **Seed on load**: `seedData()` checks if portfolios exist before seeding. Idempotent — safe to call on every mount.
- **Prices**: Yahoo Finance `query2.finance.yahoo.com/v8/finance/chart/{ticker}` with in-DB cache. TSX stocks use `.TO` suffix.
- **Routing**: Wouter with `BASE_URL` base path for Replit proxy compatibility.
- **Dexie reactive**: All pages use `useLiveQuery` for real-time reactive UI.

## Product

- Dashboard: market value, book value, gain/loss, today's change, asset allocation pie chart, top movers, recent transactions, contribution summary
- Portfolios: multi-portfolio/account management (RRSP, TFSA, RESP, Non-Registered, LIRA, FHSA)
- Holdings: all positions with unrealized gain/loss, market prices, consolidation toggle
- Transactions: full CRUD, filterable, paginated, all 13 transaction types
- Import CSV: 4-step wizard with column mapping, preview, validation
- Export CSV: column selection, date/account filters, preview
- Distributions: ETF distribution import, classification, approve/reject workflow
- Reports: asset allocation, Modified Dietz performance, income by type/year, capital gains
- Contributions: RRSP/TFSA/RESP tracking with annual limits and room management
- Settings: backup export/import (JSON), clear all data, CRA reference info

## User preferences

- Canadian investors (CAD primary, USD secondary)
- Navy/emerald/rose theme (no red CSS placeholders)
- All data local — no cloud, no backend

## Gotchas

- Yahoo Finance CORS may block in browser dev — prices fall back to book value
- TSX tickers must use `.TO` suffix (e.g. `XIU.TO`, not `XIU`)
- Seed data runs once; clear IndexedDB in DevTools to reseed

## Pointers

- See `react-vite` skill for Vite/React artifact setup
- See `pnpm-workspace` skill for monorepo conventions
