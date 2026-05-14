import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/csvUtils';
import { refreshAllPrices } from '@/lib/marketData';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Holdings() {
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioFilter, setPortfolioFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [consolidated, setConsolidated] = useState(false);

  const portfolios = useLiveQuery(() => db.portfolios.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);
  const prices = useLiveQuery(() => db.priceCache.toArray(), []);

  const priceMap = new Map((prices || []).map(p => [p.ticker, p]));
  const securityMap = new Map((securities || []).map(s => [s.id, s]));
  const accountMap = new Map((accounts || []).map(a => [a.id, a]));
  const portfolioMap = new Map((portfolios || []).map(p => [p.id, p]));

  const filteredAccounts = (accounts || []).filter(a => {
    if (portfolioFilter !== 'all' && a.portfolioId !== portfolioFilter) return false;
    return true;
  });
  const filteredAccountIds = new Set(filteredAccounts.map(a => a.id));

  const baseHoldings = (holdings || []).filter(h => {
    if (!filteredAccountIds.has(h.accountId)) return false;
    if (accountFilter !== 'all' && h.accountId !== accountFilter) return false;
    return true;
  });

  const enriched = baseHoldings.map(h => {
    const sec = securityMap.get(h.securityId);
    const acct = accountMap.get(h.accountId);
    const portfolio = acct ? portfolioMap.get(acct.portfolioId) : null;
    const price = sec ? priceMap.get(sec.ticker) : null;
    const marketValue = price ? h.shares * price.price : h.bookValue;
    const gain = marketValue - h.bookValue;
    const gainPct = h.bookValue > 0 ? (gain / h.bookValue) * 100 : 0;
    return { ...h, sec, acct, portfolio, price, marketValue, gain, gainPct };
  });

  let rows = enriched;
  if (consolidated) {
    const map = new Map<string, typeof enriched[0]>();
    for (const h of enriched) {
      const key = h.securityId;
      const existing = map.get(key);
      if (existing) {
        existing.shares += h.shares;
        existing.bookValue += h.bookValue;
        existing.marketValue += h.marketValue;
        existing.gain += h.gain;
        existing.gainPct = existing.bookValue > 0 ? (existing.gain / existing.bookValue) * 100 : 0;
      } else {
        map.set(key, { ...h });
      }
    }
    rows = Array.from(map.values());
  }

  const totalMarket = rows.reduce((s, r) => s + r.marketValue, 0);
  const totalBook = rows.reduce((s, r) => s + r.bookValue, 0);
  const totalGain = totalMarket - totalBook;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const allH = await db.holdings.toArray();
      const allS = await db.securities.toArray();
      await refreshAllPrices(allH, allS);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Holdings</h1>
          <p className="text-muted-foreground text-sm">Book value vs. market value across all accounts</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh-holdings">
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
          Refresh Prices
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
          <SelectTrigger className="w-44" data-testid="select-portfolio-filter">
            <SelectValue placeholder="All Portfolios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Portfolios</SelectItem>
            {(portfolios || []).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-44" data-testid="select-account-filter">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {filteredAccounts.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setConsolidated(!consolidated)}
          data-testid="toggle-consolidated"
          className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
            consolidated ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-foreground hover:bg-muted'
          )}
        >
          {consolidated ? 'Consolidated' : 'By Account'}
        </button>
      </div>

      {/* Summary row */}
      <div className="flex gap-6 px-1">
        <div>
          <p className="text-xs text-muted-foreground">Market Value</p>
          <p className="text-lg font-bold">{formatCurrency(totalMarket)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Book Value</p>
          <p className="text-lg font-bold">{formatCurrency(totalBook)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unrealized Gain/Loss</p>
          <p className={cn('text-lg font-bold', totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
            {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {!consolidated && <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Account</th>}
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Security</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ticker</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Shares</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Avg Cost</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Book Value</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Mkt Price</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Mkt Value</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Gain/Loss $</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Gain/Loss %</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Day Chg</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-muted-foreground">No holdings found</td>
                </tr>
              )}
              {rows.map(h => (
                <tr key={h.id} data-testid={`row-holding-${h.id}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  {!consolidated && (
                    <td className="px-3 py-2">
                      <div>
                        <p className="text-xs font-medium">{h.acct?.name}</p>
                        <p className="text-xs text-muted-foreground">{h.acct?.type}</p>
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <p className="text-xs max-w-[160px] truncate">{h.sec?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{h.sec?.type}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded">{h.sec?.ticker}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatNumber(h.shares, 4)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(h.averageCost, h.acct?.currency as 'CAD' | 'USD')}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(h.bookValue, h.acct?.currency as 'CAD' | 'USD')}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {h.price ? formatCurrency(h.price.price, h.price.currency) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(h.marketValue)}</td>
                  <td className={cn('px-3 py-2 text-right font-mono text-xs font-semibold', h.gain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {h.gain >= 0 ? '+' : ''}{formatCurrency(h.gain)}
                  </td>
                  <td className={cn('px-3 py-2 text-right text-xs font-semibold flex items-center justify-end gap-1', h.gainPct >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {h.gainPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatPercent(h.gainPct)}
                  </td>
                  <td className={cn('px-3 py-2 text-right font-mono text-xs', (h.price?.change || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {h.price ? `${(h.price.change || 0) >= 0 ? '+' : ''}${formatPercent(h.price.changePercent || 0)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
