import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatPercent } from '@/lib/csvUtils';
import { calculateDollarGainLoss, buildXirrFlows, xirr } from '@/lib/calculations';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Calendar, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { refreshAllPrices, fetchQuotes, fetchHistoricalPrices } from '@/lib/marketData';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

type PeriodKey = '3mo' | '6mo' | '1y';
type HistMap = Record<string, number | null>;

export default function Dashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  // FX state
  const [cadUsdRate, setCadUsdRate] = useState<number | null>(null);
  const [fxAmount, setFxAmount] = useState('');
  const [fxDirection, setFxDirection] = useState<'CAD_TO_USD' | 'USD_TO_CAD'>('CAD_TO_USD');

  // Historical prices state
  const [histPrices, setHistPrices] = useState<Record<PeriodKey, HistMap>>({ '3mo': {}, '6mo': {}, '1y': {} });
  const [histLoading, setHistLoading] = useState(false);

  const portfolios = useLiveQuery(() => db.portfolios.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);
  const prices = useLiveQuery(() => db.priceCache.toArray(), []);
  const transactions = useLiveQuery(() =>
    db.transactions.orderBy('date').reverse().limit(10).toArray(), []);
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []);
  const contributions = useLiveQuery(() => db.contributionRecords.toArray(), []);

  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  // Fetch CAD/USD rate once on mount
  useEffect(() => {
    fetchQuotes(['CADUSD=X']).then(qs => {
      const q = qs.find(x => x.symbol === 'CADUSD=X');
      if (q) setCadUsdRate(q.price);
    }).catch(() => {});
  }, []);

  const priceMap = new Map((prices || []).map(p => [p.ticker, p]));
  const securityMap = new Map((securities || []).map(s => [s.id, s]));
  const accountMap = new Map((accounts || []).map(a => [a.id, a]));

  const filteredAccounts = (accounts || []).filter(a =>
    !selectedPortfolioId || a.portfolioId === selectedPortfolioId
  );
  const filteredAccountIds = new Set(filteredAccounts.map(a => a.id));
  const filteredHoldings = (holdings || []).filter(h => filteredAccountIds.has(h.accountId));

  let totalBookValue = 0;
  let totalMarketValue = 0;
  let todayChange = 0;

  const holdingDetails = filteredHoldings.map(h => {
    const sec = securityMap.get(h.securityId);
    const price = sec ? priceMap.get(sec.ticker) : null;
    const marketValue = price ? h.shares * price.price : h.bookValue;
    const gain = marketValue - h.bookValue;
    const gainPct = h.bookValue > 0 ? (gain / h.bookValue) * 100 : 0;
    const dayChange = price ? h.shares * price.change : 0;
    const dayChangePct = price?.changePercent ?? 0;
    totalBookValue += h.bookValue;
    totalMarketValue += marketValue;
    todayChange += dayChange;
    return { ...h, sec, price, marketValue, gain, gainPct, dayChange, dayChangePct };
  });

  const cashTotal = filteredAccounts.reduce((sum, a) => sum + a.cashBalance, 0);
  const totalPortfolioValue = totalMarketValue + cashTotal;
  const { dollar: totalGain, percent: totalGainPct } = calculateDollarGainLoss(totalBookValue, totalMarketValue);

  // Money-Weighted Return (XIRR)
  const filteredTx = (allTransactions || []).filter(t => filteredAccountIds.has(t.accountId));
  const xirrFlows = buildXirrFlows(filteredTx, totalPortfolioValue);
  const mwr = xirr(xirrFlows);

  // Fetch historical prices whenever the tickers in view change
  const tickerList = holdingDetails.map(h => h.sec?.ticker).filter(Boolean).join(',');
  const loadHistoricalPrices = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setHistLoading(true);
    const [mo3, mo6, y1] = await Promise.all([
      fetchHistoricalPrices(tickers, '3mo'),
      fetchHistoricalPrices(tickers, '6mo'),
      fetchHistoricalPrices(tickers, '1y'),
    ]);
    setHistPrices({ '3mo': mo3, '6mo': mo6, '1y': y1 });
    setHistLoading(false);
  }, []);

  useEffect(() => {
    const tickers = tickerList ? tickerList.split(',') : [];
    void loadHistoricalPrices(tickers);
  }, [tickerList, loadHistoricalPrices]);

  // Compute dollar change for a historical period
  function periodChange(histMap: HistMap): { dollar: number; pct: number } | null {
    if (Object.keys(histMap).length === 0) return null;
    let histValue = cashTotal; // cash unchanged
    let hasPrices = false;
    for (const h of filteredHoldings) {
      const sec = securityMap.get(h.securityId);
      if (!sec) { histValue += h.bookValue; continue; }
      const hp = histMap[sec.ticker];
      if (hp !== null && hp !== undefined) {
        histValue += h.shares * hp;
        hasPrices = true;
      } else {
        histValue += h.bookValue;
      }
    }
    if (!hasPrices) return null;
    const dollar = totalPortfolioValue - histValue;
    const pct = histValue > 0 ? (dollar / histValue) * 100 : 0;
    return { dollar, pct };
  }

  const todayChangePct = (totalPortfolioValue - todayChange) > 0
    ? (todayChange / (totalPortfolioValue - todayChange)) * 100
    : 0;

  const changes = {
    '1d': { dollar: todayChange, pct: todayChangePct, loading: false },
    '3mo': { ...periodChange(histPrices['3mo']), loading: histLoading },
    '6mo': { ...periodChange(histPrices['6mo']), loading: histLoading },
    '1y': { ...periodChange(histPrices['1y']), loading: histLoading },
  };

  // Asset allocation by assetClass
  const allocationMap = new Map<string, number>();
  for (const h of holdingDetails) {
    const cls = h.sec?.assetClass || 'Other';
    allocationMap.set(cls, (allocationMap.get(cls) || 0) + h.marketValue);
  }
  const allocationData = Array.from(allocationMap.entries()).map(([name, value]) => ({ name, value }));

  // Today's gainers / losers (sorted by today's % change)
  const withDayChange = holdingDetails.filter(h => h.price && h.shares > 0);
  const todayGainers = [...withDayChange].sort((a, b) => b.dayChangePct - a.dayChangePct).filter(h => h.dayChangePct > 0);
  const todayLosers = [...withDayChange].sort((a, b) => a.dayChangePct - b.dayChangePct).filter(h => h.dayChangePct < 0);

  // Current year contributions
  const currentYear = new Date().getFullYear();
  const rrspContrib = (contributions || []).filter(c => c.type === 'RRSP' && c.year === currentYear).reduce((s, c) => s + c.amount, 0);
  const tfsaContrib = (contributions || []).filter(c => c.type === 'TFSA' && c.year === currentYear).reduce((s, c) => s + c.amount, 0);

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      const allHoldings = await db.holdings.toArray();
      const allSecs = await db.securities.toArray();
      await refreshAllPrices(allHoldings, allSecs);
      // Also refresh FX rate
      const qs = await fetchQuotes(['CADUSD=X']);
      const q = qs.find(x => x.symbol === 'CADUSD=X');
      if (q) setCadUsdRate(q.price);
      // Reload historical
      const tickers = tickerList ? tickerList.split(',') : [];
      await loadHistoricalPrices(tickers);
    } finally {
      setRefreshing(false);
    }
  }

  const typeColors: Record<string, string> = {
    Buy: 'bg-blue-100 text-blue-700',
    Sell: 'bg-rose-100 text-rose-700',
    Dividend: 'bg-emerald-100 text-emerald-700',
    Interest: 'bg-emerald-100 text-emerald-700',
    Contribution: 'bg-violet-100 text-violet-700',
    Withdrawal: 'bg-orange-100 text-orange-700',
    Distribution: 'bg-amber-100 text-amber-700',
    'Return of Capital': 'bg-gray-100 text-gray-700',
    Fee: 'bg-red-100 text-red-700',
    default: 'bg-gray-100 text-gray-600',
  };

  // FX calculation
  const fxNum = parseFloat(fxAmount);
  const fxConverted = cadUsdRate && isFinite(fxNum) && fxNum > 0
    ? fxDirection === 'CAD_TO_USD' ? fxNum * cadUsdRate : fxNum / cadUsdRate
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Portfolio overview as of today</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {(portfolios || []).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPortfolioId(p.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  selectedPortfolioId === p.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setSelectedPortfolioId(null)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                !selectedPortfolioId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              All
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefreshPrices} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh Prices'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Market Value</p>
            <p className="text-2xl font-bold mt-1 num">{formatCurrency(totalPortfolioValue)}</p>
            <p className="text-xs text-muted-foreground mt-1">incl. {formatCurrency(cashTotal)} cash</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Book Value</p>
            <p className="text-2xl font-bold mt-1 num">{formatCurrency(totalBookValue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Adjusted cost base</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Unrealized Gain</p>
            <p className={cn('text-2xl font-bold mt-1 num', totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)}
            </p>
            <p className={cn('text-xs mt-1 num', totalGain >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
              {formatPercent(totalGainPct)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Today's Change</p>
            <p className={cn('text-2xl font-bold mt-1 num', todayChange >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              {todayChange >= 0 ? '+' : ''}{formatCurrency(todayChange)}
            </p>
            <p className={cn('text-xs mt-1 num', todayChange >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
              {todayChange >= 0 ? '+' : ''}{formatPercent(todayChangePct)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">MWR (annualized)</p>
            <p className={cn('text-2xl font-bold mt-1 num', mwr === null ? '' : mwr >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              {mwr !== null ? formatPercent(mwr * 100) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Money-weighted return</p>
          </CardContent>
        </Card>
      </div>

      {/* Period Change Cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Portfolio Performance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { label: '1 Day', key: '1d' },
            { label: '3 Months', key: '3mo' },
            { label: '6 Months', key: '6mo' },
            { label: '1 Year', key: '1y' },
          ] as const).map(({ label, key }) => {
            const c = changes[key];
            const loading = key !== '1d' && histLoading;
            const hasData = c && c.dollar !== undefined && c.dollar !== null;
            const dollar = hasData ? (c.dollar as number) : 0;
            const pct = hasData ? (c.pct as number) : 0;
            const isPositive = dollar >= 0;
            return (
              <Card key={key}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                  {loading ? (
                    <div className="mt-2 space-y-1.5">
                      <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-3.5 w-16 bg-muted animate-pulse rounded" />
                    </div>
                  ) : hasData ? (
                    <>
                      <p className={cn('text-xl font-bold mt-1 num', isPositive ? 'text-emerald-600' : 'text-rose-600')}>
                        {isPositive ? '+' : ''}{formatCurrency(dollar)}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {isPositive
                          ? <TrendingUp className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                          : <TrendingDown className="h-3 w-3 text-rose-500 flex-shrink-0" />}
                        <p className={cn('text-xs num', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
                          {isPositive ? '+' : ''}{formatPercent(pct)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xl font-bold mt-1 text-muted-foreground">—</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Middle row: allocation + contributions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {allocationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={allocationData} cx="45%" cy="50%" outerRadius={90} dataKey="value" stroke="none">
                    {allocationData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No holdings data
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {currentYear} Contributions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="text-sm font-medium">RRSP</p>
                <p className="text-xs text-muted-foreground">Registered Retirement</p>
              </div>
              <p className="num text-sm font-semibold">{formatCurrency(rrspContrib)}</p>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="text-sm font-medium">TFSA</p>
                <p className="text-xs text-muted-foreground">Tax-Free Savings</p>
              </div>
              <p className="num text-sm font-semibold">{formatCurrency(tfsaContrib)}</p>
            </div>
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-2">Cash by Account</p>
              <div className="space-y-1">
                {filteredAccounts.map(a => (
                  <div key={a.id} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[110px]">{a.name}</span>
                    <span className="text-xs num">{formatCurrency(a.cashBalance, a.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Gainers & Losers — full width */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Today's Market
          </CardTitle>
        </CardHeader>
        <CardContent>
          {withDayChange.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Refresh prices to see today's movers</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gainers */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Gainers
                </p>
                {todayGainers.length === 0
                  ? <p className="text-xs text-muted-foreground py-2">No gainers today</p>
                  : todayGainers.map(h => (
                    <div key={h.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{h.sec?.ticker || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">{h.sec?.name}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm num font-semibold text-emerald-600">
                          +{formatCurrency(h.dayChange)}
                        </p>
                        <p className="text-xs num text-emerald-500">
                          +{formatPercent(h.dayChangePct)} today
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
              {/* Losers */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 mb-2 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Losers
                </p>
                {todayLosers.length === 0
                  ? <p className="text-xs text-muted-foreground py-2">No losers today</p>
                  : todayLosers.map(h => (
                    <div key={h.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                          <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{h.sec?.ticker || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">{h.sec?.name}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm num font-semibold text-rose-600">
                          {formatCurrency(h.dayChange)}
                        </p>
                        <p className="text-xs num text-rose-500">
                          {formatPercent(h.dayChangePct)} today
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: Currency Converter + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Currency Converter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Currency Converter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Live rate */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground font-medium">Live Rate</span>
              {cadUsdRate ? (
                <div className="text-right">
                  <p className="text-sm font-semibold num">1 CAD = {cadUsdRate.toFixed(4)} USD</p>
                  <p className="text-xs text-muted-foreground num">1 USD = {(1 / cadUsdRate).toFixed(4)} CAD</p>
                </div>
              ) : (
                <div className="h-4 w-36 bg-muted animate-pulse rounded" />
              )}
            </div>
            {/* Direction toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setFxDirection('CAD_TO_USD')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  fxDirection === 'CAD_TO_USD'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                )}
              >
                CAD → USD
              </button>
              <button
                onClick={() => setFxDirection('USD_TO_CAD')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  fxDirection === 'USD_TO_CAD'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                )}
              >
                USD → CAD
              </button>
            </div>
            {/* Input */}
            <div className="space-y-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                  {fxDirection === 'CAD_TO_USD' ? 'CAD' : 'USD'}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={fxAmount}
                  onChange={e => setFxAmount(e.target.value)}
                  className="pl-12 num"
                />
              </div>
              {/* Result */}
              <div className={cn(
                'rounded-lg border px-3 py-2.5 transition-colors',
                fxConverted !== null ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/30 border-border'
              )}>
                <span className="text-xs text-muted-foreground font-medium block mb-0.5">
                  {fxDirection === 'CAD_TO_USD' ? 'USD' : 'CAD'}
                </span>
                <p className={cn('text-lg font-bold num', fxConverted !== null ? 'text-emerald-700' : 'text-muted-foreground')}>
                  {fxConverted !== null ? fxConverted.toFixed(2) : '—'}
                </p>
              </div>
            </div>
            {!cadUsdRate && (
              <p className="text-xs text-muted-foreground text-center">
                Click Refresh Prices to load the live rate
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {(transactions || []).length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">No transactions</p>
              )}
              {(transactions || []).map(t => {
                const sec = t.securityId ? securityMap.get(t.securityId) : null;
                const acct = accountMap.get(t.accountId);
                const colorClass = typeColors[t.type] || typeColors.default;
                return (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge className={cn('text-xs px-1.5 py-0 font-medium border-0 flex-shrink-0', colorClass)}>
                        {t.type}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{sec?.ticker || acct?.name || 'Cash'}</p>
                        <p className="text-xs text-muted-foreground">{t.date.split('T')[0]}</p>
                      </div>
                    </div>
                    <p className="text-xs num font-medium flex-shrink-0 ml-2">
                      {formatCurrency(t.amount, t.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
