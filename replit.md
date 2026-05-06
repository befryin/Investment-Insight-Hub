# Folio — Investment Tracker

A fully client-side investment portfolio tracker for Canadian investors, built as a React + Vite SPA. All data stored in IndexedDB (Dexie.js) — no backend required. A companion Express API server proxies market data to bypass CORS.

## Run & Operate

- `pnpm --filter @workspace/investment-tracker run dev` — frontend dev server (uses PORT env var)
- `pnpm --filter @workspace/api-server run dev` — API proxy server (builds then listens on PORT)
- Root workflow: `artifacts/investment-tracker: web`, `artifacts/api-server: API Server`
- No required env vars (client-only app; api-server uses PORT from workflow)

## Stack

- React 18, Vite 7, TypeScript 5.9, Tailwind CSS v4
- Dexie.js 4 + dexie-react-hooks (IndexedDB)
- PapaParse (CSV parsing/export)
- Recharts (charts)
- shadcn/ui components (`artifacts/investment-tracker/src/components/ui/`)
- Wouter (routing)
- Express (api-server — quote proxy + ETF distribution scraper)
- pnpm workspace monorepo

## Where things live

```
artifacts/investment-tracker/src/
  lib/
    db.ts           — Dexie schema (Portfolio, Account, Security, Transaction, Holding, ContributionRecord, PriceCache, DistributionImport)
    calculations.ts — ACB, Modified Dietz, TWR, XIRR/MWR, per-sell realized gains, buildXirrFlows
    marketData.ts   — fetchQuotes() via /api/quotes proxy (falls back to direct Yahoo Finance)
    csvUtils.ts     — CSV parse/export, formatCurrency, formatPercent
    seedData.ts     — Demo data seeded on first load
  components/
    Layout.tsx      — Fixed sidebar nav (all 10 routes)
    ui/             — shadcn/ui components
  pages/
    Dashboard.tsx   — 5-card summary incl. MWR (annualized), asset allocation pie, top movers
    Portfolios.tsx, Holdings.tsx, Transactions.tsx
    Import.tsx, Export.tsx
    Distributions.tsx — CSV + URL fetch from ETF provider pages; approve/reject workflow
    Reports.tsx     — Asset allocation, perf (MWR + Modified Dietz), income, per-sell ACB capital gains
    Contributions.tsx, Settings.tsx

artifacts/api-server/src/
  routes/
    quotes.ts           — GET /api/quotes?symbols=... → Yahoo Finance v7 + Stooq fallback
    etf-distributions.ts — GET /api/etf-distributions?url=...&symbol=... → HTML table scraper
```

## Architecture decisions

- **Client-only storage**: No backend, no auth. All data in IndexedDB via Dexie. Backup/restore via JSON export.
- **API proxy for quotes**: `/api/quotes` on the Express server bypasses CORS on Yahoo Finance. Frontend falls back to direct Yahoo calls if proxy is unavailable.
- **XIRR/MWR**: Newton-Raphson XIRR implementation in `calculations.ts`. Uses BUY/contribution outflows + terminal portfolio value as inflow.
- **Per-sell realized gains**: `calculateRealizedGainsPerSell()` tracks ACB per security and emits one row per Sell transaction, with proceeds, ACB removed, and net gain.
- **Seed on load**: `seedData()` checks if portfolios exist before seeding. Idempotent — safe to call on every mount.
- **Routing**: Wouter with `BASE_URL` base path for Replit proxy compatibility.
- **Tabular numbers**: `.num` CSS class (monospace + tabular-nums) applied to all financial figures.

## Product

- Dashboard: market value, book value, gain/loss, today's change, **MWR (annualized)**, asset allocation pie chart, top movers, recent transactions, contribution summary
- Portfolios: multi-portfolio/account management (RRSP, TFSA, RESP, Non-Registered, LIRA, FHSA)
- Holdings: all positions with unrealized gain/loss, market prices, consolidation toggle
- Transactions: full CRUD, filterable, paginated, all 13 transaction types
- Import CSV: 4-step wizard with column mapping, preview, validation
- Export CSV: column selection, date/account filters, preview
- Distributions: **URL fetch from iShares/BMO/Vanguard pages** + CSV import, classification, approve/reject workflow
- Reports: asset allocation, Modified Dietz + **MWR**, income by type/year, **per-sell ACB capital gains** table
- Contributions: RRSP/TFSA/RESP tracking with annual limits and room management
- Settings: backup export/import (JSON), clear all data, CRA reference info

## User preferences

- Canadian investors (CAD primary, USD secondary)
- Navy/emerald/rose theme (no red CSS placeholders)
- All data local — no cloud, no backend

## Gotchas

- Quote prices route through `/api/quotes` (Express proxy) to avoid CORS. If api-server is down, falls back to direct Yahoo Finance (may fail in browser).
- TSX tickers must use `.TO` suffix (e.g. `XIU.TO`, not `XIU`)
- Seed data runs once; clear IndexedDB in DevTools to reseed
- XIRR returns `null` when cashflows are insufficient (< 2 data points)

## Pointers

- See `react-vite` skill for Vite/React artifact setup
- See `pnpm-workspace` skill for monorepo conventions
