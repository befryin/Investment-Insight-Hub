# Investment Insight Hub

A comprehensive dashboard and management tool for tracking your investment portfolio, analyzing distributions, managing personal finances, and calculating adjusted cost bases (ACB) for tax purposes.

## Architecture

This is a full-stack application organized as a monorepo:
- **Frontend (`artifacts/investment-tracker`)**: A React application built with Vite, TailwindCSS, and shadcn/ui for tracking your investment portfolio.
- **Frontend (`artifacts/finance-tracker`)**: A local-first financial management React application for everyday expense tracking and multi-account ledger management. Data is stored locally in IndexedDB.
- **Backend (`artifacts/api-server`)**: An Express-based API server that handles proxying file downloads, fetching quotes, and managing data for the investment tracker.
- **Database (`artifacts/db`)**: Shared types and database schemas.

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

If the application requires environment variables, create a `.env` file in `artifacts/api-server/`. By default, the API server will run on a local port (e.g., `3001`), and the frontends will proxy API requests to it.

```bash
# Example: artifacts/api-server/.env
PORT=3001
```

### 3. Run the Development Servers

You will need to run the API server and the frontend applications concurrently in separate terminal windows.

**Terminal 1 — Start the API Server:**
```bash
PORT=3001 pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Start the Investment Tracker:**
```bash
PORT=5173 pnpm --filter @workspace/investment-tracker run dev
```
Accessible at `http://localhost:5173/`

**Terminal 3 — Start the Finance Tracker:**
```bash
PORT=5174 pnpm --filter @workspace/finance-tracker run dev
```
Accessible at `http://localhost:5174/`

Alternatively, you can run all applications concurrently from the root directory by running `pnpm -r run dev`.
