import { Router, type IRouter } from "express";

const router: IRouter = Router();

type ChartResult = {
  indicators?: {
    quote?: Array<{ close?: (number | null)[] }>;
  };
};

type ChartResp = {
  chart?: { result?: ChartResult[] };
};

async function fetchStartPrice(symbol: string, period: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${period}`;
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; FolioBot/1.0)" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as ChartResp;
    const closes = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    for (const c of closes) {
      if (c !== null && c !== undefined && isFinite(c) && c > 0) return c;
    }
    return null;
  } catch {
    return null;
  }
}

const ALLOWED_PERIODS = new Set(["1mo", "3mo", "6mo", "1y", "2y", "5y"]);

router.get("/history", async (req, res) => {
  const rawSymbols = (req.query["symbols"] as string | undefined) ?? "";
  const period = (req.query["period"] as string | undefined) ?? "3mo";

  if (!ALLOWED_PERIODS.has(period)) {
    res.status(400).json({ error: "Invalid period" });
    return;
  }

  const symbols = rawSymbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    res.json({ prices: {} });
    return;
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => ({
      symbol,
      startPrice: await fetchStartPrice(symbol, period),
    })),
  );

  const prices: Record<string, number | null> = {};
  for (const { symbol, startPrice } of results) {
    prices[symbol] = startPrice;
  }

  res.json({ prices });
});

export default router;
