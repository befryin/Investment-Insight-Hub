# Folio — Desktop Setup Guide

Folio is a fully client-side investment portfolio tracker for Canadian investors. All data is stored locally in your browser (IndexedDB) — nothing leaves your machine.

## Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Node.js | 18.x | https://nodejs.org |
| pnpm | 8.x | `npm install -g pnpm` |

Check your versions:
```bash
node --version   # should print v18.x.x or higher
pnpm --version   # should print 8.x.x or higher
```

## Installation

```bash
# 1. Clone or download the project
git clone <your-repo-url> folio
cd folio

# 2. Install all workspace dependencies
pnpm install
```

## Running

Folio has two services that must both run:

### Terminal 1 — API Server (market data proxy)

```bash
PORT=3001 pnpm --filter @workspace/api-server run dev
```

The API server proxies Yahoo Finance requests server-side to bypass browser CORS restrictions. It also scrapes ETF provider pages for distribution data.

### Terminal 2 — Frontend (the app)

```bash
PORT=5173 pnpm --filter @workspace/investment-tracker run dev
```

Then open **http://localhost:5173** in your browser.

> The frontend auto-detects the API server at `/api/*` via the Vite dev proxy. If you use a different port for the API server, update `vite.config.ts` → `server.proxy` accordingly.

## Vite Proxy Configuration

The frontend's `vite.config.ts` should proxy `/api` to the API server. If it is not already set, add:

```typescript
// artifacts/investment-tracker/vite.config.ts
export default defineConfig({
  server: {
    port: parseInt(process.env.PORT ?? '5173'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 3001}`,
        changeOrigin: true,
      },
    },
  },
});
```

## TypeScript type checking

```bash
# Check both packages
pnpm run typecheck
```

## First run

On first load, Folio seeds demo data automatically (two portfolios, several ETF/stock holdings, and sample transactions). This only happens once. To reset:

1. Open DevTools → Application → Storage → IndexedDB → FolioDB
2. Right-click → Delete database
3. Refresh the page

## Data Backup & Restore

All your data lives in IndexedDB. To back it up:

1. Go to **Settings** in the app
2. Click **Export Backup (JSON)**
3. Save the `.json` file somewhere safe

To restore on a new machine:
1. Go to **Settings → Import Backup**
2. Select your `.json` file

## Building for production

```bash
# Build the frontend
pnpm --filter @workspace/investment-tracker run build

# Build the API server
pnpm --filter @workspace/api-server run build

# Start the API server in production
PORT=3001 node artifacts/api-server/dist/index.js
```

Serve the frontend build (`artifacts/investment-tracker/dist/`) with any static file server (nginx, Caddy, `serve`, etc.).

## Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `PORT` | Both | 3001 / 5173 | Port to listen on |

No API keys or secrets are required. All market data comes from Yahoo Finance's public (unauthenticated) endpoints.

## Ticker format

- Canadian stocks / ETFs must use the `.TO` suffix: `XIU.TO`, `XAW.TO`, `RY.TO`
- US stocks use plain symbols: `AAPL`, `VTI`, `MSFT`
- TSX benchmark: `^GSPTSE`
- S&P 500 benchmark: `^GSPC`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Prices not loading | Ensure the API server (Terminal 1) is running |
| CORS errors in browser | Use the API server proxy — do not fetch Yahoo directly |
| `pnpm install` fails | Ensure Node.js ≥ 18 and pnpm ≥ 8 |
| App shows blank page | Check Terminal 2 for Vite errors; check browser console |
| Seed data not appearing | Clear IndexedDB (DevTools) and refresh |
