import { db, type Holding, type Security, type PriceCache } from './db';

function apiUrl(path: string) {
  return `/api/${path}`;
}

export type Quote = { symbol: string; price: number; change: number; changePct: number };

export async function fetchQuotes(tickers: string[]): Promise<Quote[]> {
  if (tickers.length === 0) return [];
  try {
    const res = await fetch(apiUrl(`quotes?symbols=${encodeURIComponent(tickers.join(','))}`));
    if (!res.ok) throw new Error(`Quote fetch failed: ${res.status}`);
    const data = await res.json() as { quotes: Quote[] };
    return data.quotes;
  } catch (err) {
    console.warn('[marketData] API proxy unavailable, falling back to direct Yahoo Finance', err);
    return fetchQuotesDirect(tickers);
  }
}

async function fetchQuotesDirect(tickers: string[]): Promise<Quote[]> {
  const results: Quote[] = [];
  await Promise.allSettled(tickers.map(async (ticker) => {
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      );
      if (!r.ok) return;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return;
      const price = meta.regularMarketPrice ?? 0;
      const prev = meta.chartPreviousClose ?? price;
      results.push({ symbol: ticker, price, change: price - prev, changePct: prev ? (price - prev) / prev : 0 });
    } catch {
      // ignore
    }
  }));
  return results;
}

export async function fetchPrice(ticker: string): Promise<PriceCache | null> {
  try {
    const quotes = await fetchQuotes([ticker]);
    const q = quotes.find(x => x.symbol === ticker);
    if (!q) return null;

    const cacheEntry: PriceCache = {
      ticker,
      price: q.price,
      currency: ticker.endsWith('.TO') ? 'CAD' : 'USD',
      change: q.change,
      changePercent: q.changePct * 100,
      lastFetched: new Date().toISOString(),
    };

    await db.priceCache.put(cacheEntry);
    return cacheEntry;
  } catch (error) {
    console.error(`Failed to fetch price for ${ticker}`, error);
    return null;
  }
}

export async function refreshAllPrices(holdings: Holding[], securities: Security[]) {
  const securityMap = new Map(securities.map(s => [s.id, s]));
  const tickersToFetch = new Set<string>();

  for (const holding of holdings) {
    const security = securityMap.get(holding.securityId);
    if (security && security.ticker && security.type !== 'Cash') {
      tickersToFetch.add(security.ticker);
    }
  }

  const tickers = Array.from(tickersToFetch);
  if (tickers.length === 0) return;

  const quotes = await fetchQuotes(tickers);
  const qMap = new Map(quotes.map(q => [q.symbol, q]));

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const q = qMap.get(ticker);
      if (!q) return;
      const cacheEntry: PriceCache = {
        ticker,
        price: q.price,
        currency: ticker.endsWith('.TO') ? 'CAD' : 'USD',
        change: q.change,
        changePercent: q.changePct * 100,
        lastFetched: new Date().toISOString(),
      };
      await db.priceCache.put(cacheEntry);
    }),
  );
}

export type HistoricalPrices = Record<string, number | null>;

export async function fetchHistoricalPrices(
  tickers: string[],
  period: '1mo' | '3mo' | '6mo' | '1y',
): Promise<HistoricalPrices> {
  if (tickers.length === 0) return {};
  try {
    const res = await fetch(
      apiUrl(`history?symbols=${encodeURIComponent(tickers.join(','))}&period=${period}`),
    );
    if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
    const data = await res.json() as { prices: HistoricalPrices };
    return data.prices;
  } catch {
    return {};
  }
}
