import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatPercent } from '@/lib/csvUtils';
import { calculateDollarGainLoss, buildXirrFlows, xirr } from '@/lib/calculations';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Calendar, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { refreshAllPrices } from '@/lib/marketData';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

void DollarSign;

export default function Dashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

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
    totalBookValue += h.bookValue;
    totalMarketValue += marketValue;
    todayChange += dayChange;
    return { ...h, sec, price, marketValue, gain, gainPct, dayChange };
  });

  const cashTotal = filteredAccounts.reduce((sum, a) => sum + a.cashBalance, 0);
  const totalPortfolioValue = totalMarketValue + cashTotal;
  const { dollar: totalGain, percent: totalGainPct } = calculateDollarGainLoss(totalBookValue, totalMarketValue);

  // Money-Weighted Return (XIRR)
  const filteredTx = (allTransactions || []).filter(t => filteredAccountIds.has(t.accountId));
  const xirrFlows = buildXirrFlows(filteredTx, totalPortfolioValue);
  const mwr = xirr(xirrFlows);

  // Asset allocation by assetClass
  const allocationMap = new Map<string, number>();
  for (const h of holdingDetails) {
    const cls = h.sec?.assetClass || 'Other';
    allocationMap.set(cls, (allocationMap.get(cls) || 0) + h.marketValue);
  }
  const allocationData = Array.from(allocationMap.entries()).map(([name, value]) => ({ name, value }));

  // Top gainers/losers
  const sorted = [...holdingDetails].sort((a, b) => b.gainPct - a.gainPct);
  const gainers = sorted.slice(0, 3);
  const losers = sorted.filter(h => h.gainPct < 0).reverse().slice(0, 3);

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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Portfolio overview as of today</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshPrices}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh Prices'}
          </Button>
        </div>
      </div>

      {/* Summary Cards — 5 cards: market value, book, gain/loss, today, MWR */}
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
            <div className="flex items-center gap-1 mt-1">
              {todayChange >= 0
                ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                : <TrendingDown className="h-3 w-3 text-rose-500" />}
              <span className="text-xs text-muted-foreground">vs. yesterday</span>
            </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Asset Allocation Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {allocationData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={allocationData} cx="45%" cy="50%" outerRadius={90} dataKey="value" stroke="none">
                      {allocationData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v)}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No holdings data
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contribution Summary */}
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
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">Cash by Account</p>
              <div className="mt-2 space-y-1">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Movers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Movers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {gainers.length === 0 && losers.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">No holdings data</p>
              )}
              {gainers.map(h => (
                <div key={h.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{h.sec?.ticker || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{h.sec?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm num font-semibold text-emerald-600">
                      +{formatCurrency(h.gain)}
                    </p>
                    <p className="text-xs num text-emerald-500">{formatPercent(h.gainPct)}</p>
                  </div>
                </div>
              ))}
              {losers.map(h => (
                <div key={h.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{h.sec?.ticker || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{h.sec?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm num font-semibold text-rose-600">
                      {formatCurrency(h.gain)}
                    </p>
                    <p className="text-xs num text-rose-500">{formatPercent(h.gainPct)}</p>
                  </div>
                </div>
              ))}
            </div>
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
                  <div key={t.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0">
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
