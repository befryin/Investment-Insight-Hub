import { Router, type IRouter } from "express";

const router: IRouter = Router();

type YahooResult = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
};

type YahooResp = {
  quoteResponse?: { result?: YahooResult[] };
};

async function fetchYahoo(symbols: string[]) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const r = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; FolioBot/1.0)" },
  });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = (await r.json()) as YahooResp;
  return (j.quoteResponse?.result ?? []).map((q) => ({
    symbol: q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: (q.regularMarketChangePercent ?? 0) / 100,
  }));
}

async function fetchStooq(symbols: string[]) {
  const out: Array<{ symbol: string; price: number; change: number; changePct: number }> = [];
  await Promise.all(
    symbols.map(async (s) => {
      const stooqSym = s.includes(".") ? s.toLowerCase() : `${s.toLowerCase()}.us`;
      try {
        const r = await fetch(
          `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=csv`,
        );
        if (!r.ok) return;
        const t = await r.text();
        const lines = t.trim().split("\n");
        if (lines.length < 2) return;
        const cols = lines[1]!.split(",");
        const price = Number(cols[6]);
        if (!isFinite(price) || price === 0) return;
        out.push({ symbol: s, price, change: 0, changePct: 0 });
      } catch {
        // ignore individual failures
      }
    }),
  );
  return out;
}

router.get("/quotes", async (req, res) => {
  const raw = (req.query["symbols"] as string | undefined) ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    res.json({ quotes: [] });
    return;
  }
  try {
    let quotes = await fetchYahoo(symbols);
    if (quotes.length === 0) quotes = await fetchStooq(symbols);
    res.json({ quotes });
  } catch {
    try {
      const quotes = await fetchStooq(symbols);
      res.json({ quotes });
    } catch (e2) {
      res.status(502).json({ quotes: [], error: (e2 as Error).message });
    }
  }
});

export default router;
