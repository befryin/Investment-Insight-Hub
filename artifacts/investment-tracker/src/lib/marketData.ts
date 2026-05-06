import { db, type Holding, type Security, type PriceCache } from './db';

export async function fetchPrice(ticker: string): Promise<PriceCache | null> {
  try {
    const response = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.chart?.result?.[0]) return null;
    
    const result = data.chart.result[0];
    const price = result.meta.regularMarketPrice;
    const previousClose = result.meta.chartPreviousClose;
    const currency = result.meta.currency === 'CAD' ? 'CAD' : 'USD';
    
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    const cacheEntry: PriceCache = {
      ticker,
      price,
      currency,
      change,
      changePercent,
      lastFetched: new Date().toISOString()
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

  const promises = Array.from(tickersToFetch).map(ticker => fetchPrice(ticker));
  await Promise.allSettled(promises);
}
