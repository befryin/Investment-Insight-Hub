# Investment Insight Hub

A comprehensive dashboard and management tool for tracking your investment portfolio, analyzing distributions, and calculating adjusted cost bases (ACB) for tax purposes.

## Architecture

This is a full-stack application organized as a monorepo:
- **Frontend (`artifacts/investment-tracker`)**: A React application built with Vite, TailwindCSS, and shadcn/ui.
- **Backend (`artifacts/api-server`)**: An Express-based API server that handles proxying file downloads, fetching quotes, and managing data.
- **Database (`artifacts/db`)**: Shared types and database schemas.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [pnpm](https://pnpm.io/) package manager

## Getting Started

### 1. Install Dependencies

Clone the repository and install all dependencies from the root directory:

```bash
git clone https://github.com/befryin/Investment-Insight-Hub.git
cd Investment-Insight-Hub
pnpm install
```

### 2. Environment Configuration

If the application requires environment variables, create a `.env` file in `artifacts/api-server/`. By default, the API server will run on a local port (e.g., `3000` or `3001`), and the frontend will proxy API requests to it.

```bash
# Example: artifacts/api-server/.env
PORT=3000
```

### 3. Run the Development Servers

You will need to run both the API server and the frontend application concurrently.

**Start the API Server:**
Open a terminal and start the backend service:
```bash
cd artifacts/api-server
pnpm run dev
```

**Start the Frontend:**
Open a new terminal window or tab and start the React application:
```bash
cd artifacts/investment-tracker
pnpm run dev
```

The frontend will typically be accessible at `http://localhost:5173/`.
