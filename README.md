# FinHub

A comprehensive, local-first desktop application for tracking your entire financial life—from everyday expense tracking and multi-account ledger management to advanced investment portfolio tracking, distribution analysis, and adjusted cost base (ACB) calculations. Data is stored locally in your browser (IndexedDB) — nothing leaves your machine.

## Architecture

This is a full-stack application organized as a monorepo:

- **Frontend (`artifacts/finance-tracker`)**: The unified FinHub React application built with Vite, TailwindCSS, and shadcn/ui. Handles both everyday finances and investment tracking.
- **Backend (`artifacts/api-server`)**: An Express-based API server that handles proxying file downloads, fetching stock quotes, and managing external data for the tracker.
- **Database (`artifacts/db`)**: Shared types and database schemas.
- **Sandbox (`artifacts/mockup-sandbox`)**: A development sandbox for UI testing.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [pnpm](https://pnpm.io/) package manager (v8.x or higher)

## Getting Started

### 1. Install Dependencies

Clone the repository and install all dependencies from the root directory:

```bash
git clone https://github.com/befryin/Investment-Insight-Hub.git
cd Investment-Insight-Hub
pnpm install
```

### 2. Environment Configuration

If the application requires environment variables, create a `.env` file in `artifacts/api-server/`. By default, the API server will run on a local port (`3001`), and the frontends will proxy API requests to it.

```bash
# Example: artifacts/api-server/.env
PORT=3001
```

### 3. Run the Development Servers

The easiest way to run the entire stack concurrently is from the root directory:

```bash
pnpm -r run dev
```

If you need to run the services individually, you can start them in separate terminals:

**Terminal 1 — Start the API Server:**
```bash
# On Linux/macOS
PORT=3001 pnpm --filter @workspace/api-server run dev

# On Windows (PowerShell)
$env:PORT=3001; pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Start FinHub (Finance & Investment Tracker):**
```bash
# On Linux/macOS
PORT=5174 pnpm --filter @workspace/finance-tracker run dev

# On Windows (PowerShell)
$env:PORT=5174; pnpm --filter @workspace/finance-tracker run dev
```
Accessible at `http://localhost:5174/`

## First Run & Demo Data

On first load, the applications may seed demo data automatically (e.g., portfolios, ETF/stock holdings, sample transactions, or financial accounts). This only happens once. To reset your data:

1. Open Browser DevTools (F12) → Application → Storage → IndexedDB
2. Right-click the corresponding database (e.g., `FinanceHubDB`) → Delete database
3. Refresh the page

## Data Backup & Restore

All your data lives locally in IndexedDB. To back it up:

1. Go to **Settings** in the app.
2. Click **Export Backup (JSON)** (or equivalent).
3. Save the `.json` file somewhere safe.

To restore on a new machine:
1. Go to **Settings → Import Backup**
2. Select your `.json` file.

## TypeScript Type Checking

You can run TypeScript checks across the entire monorepo from the root:

```bash
pnpm run typecheck
```

## Building for Production

To build all packages for production:

```bash
pnpm run build
```

This will build the frontend and the API server. You can then serve the frontend build (`dist/` directory) with any static file server (nginx, Caddy, `serve`, etc.), and run the backend via `node artifacts/api-server/dist/index.js`.

## Investment Ticker Format

For the Investment Tracking features:
- Canadian stocks / ETFs must use the `.TO` suffix: `XIU.TO`, `XAW.TO`, `RY.TO`
- US stocks use plain symbols: `AAPL`, `VTI`, `MSFT`
- TSX benchmark: `^GSPTSE`
- S&P 500 benchmark: `^GSPC`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Prices not loading | Ensure the API server is running on the correct port |
| CORS errors in browser | Use the Vite API server proxy (`/api/*`) — do not fetch Yahoo directly |
| `pnpm install` fails | Ensure Node.js ≥ 18 and pnpm ≥ 8. Also ensure you are using a compatible OS (Windows/macOS/Linux). |
| App shows blank page | Check Terminal for Vite compilation errors; check browser console |
| Seed data not appearing | Clear IndexedDB (DevTools) and refresh |
