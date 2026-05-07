import { Router, type IRouter } from "express";

const router: IRouter = Router();

type ChartResult = {
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ close?: (number | null)[] }>;
  };
};

type ChartResp = {
  chart?: { result?: ChartResult[] };
};

async function fetchSeries(
  symbol: string,
  period: string,
  interval: string,
): Promise<Array<{ date: string; close: number }>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${period}`;
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; FolioBot/1.0)" },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as ChartResp;
    const result = j.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];

    const series: Array<{ date: string; close: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const close = closes[i];
      if (ts && close !== null && close !== undefined && isFinite(close) && close > 0) {
        const date = new Date(ts * 1000).toISOString().split("T")[0]!;
        series.push({ date, close });
      }
    }
    return series;
  } catch {
    return [];
  }
}

const ALLOWED_PERIODS = new Set(["1mo", "3mo", "6mo", "1y", "2y", "5y"]);
const ALLOWED_INTERVALS = new Set(["1d", "1wk", "1mo"]);

router.get("/chart", async (req, res) => {
  const rawSymbols = (req.query["symbols"] as string | undefined) ?? "";
  const period = (req.query["period"] as string | undefined) ?? "1y";
  const interval = (req.query["interval"] as string | undefined) ?? "1mo";

  if (!ALLOWED_PERIODS.has(period) || !ALLOWED_INTERVALS.has(interval)) {
    res.status(400).json({ error: "Invalid period or interval" });
    return;
  }

  const symbols = rawSymbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  if (symbols.length === 0) {
    res.json({ series: {} });
    return;
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => ({
      symbol,
      data: await fetchSeries(symbol, period, interval),
    })),
  );

  const series: Record<string, Array<{ date: string; close: number }>> = {};
  for (const { symbol, data } of results) {
    if (data.length > 0) series[symbol] = data;
  }

  res.json({ series });
});

export default router;
