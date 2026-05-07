import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatPercent } from '@/lib/csvUtils';
import { calculateModifiedDietz, calculateDollarGainLoss, calculateRealizedGainsPerSell, buildXirrFlows, xirr } from '@/lib/calculations';
import { computeAllLots, formatHoldingPeriod } from '@/lib/lotTracking';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const INCOME_TYPES = ['Dividend', 'Interest', 'Capital Gain Distribution', 'Return of Capital', 'Distribution'];

export default function Reports() {
  const [portfolioFilter, setPortfolioFilter] = useState('all');
  const [incomeType, setIncomeType] = useState('all');
  const [incomeYear, setIncomeYear] = useState('all');
  const [gainsYear, setGainsYear] = useState('all');
  const [lotYear, setLotYear] = useState('all');
  const [lotView, setLotView] = useState<'open' | 'disposals'>('open');
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const portfolios = useLiveQuery(() => db.portfolios.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);
  const prices = useLiveQuery(() => db.priceCache.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  const priceMap = new Map((prices || []).map(p => [p.ticker, p]));
  const secMap = new Map((securities || []).map(s => [s.id, s]));
  const acctMap = new Map((accounts || []).map(a => [a.id, a]));

  const filteredAccounts = (accounts || []).filter(a =>
    portfolioFilter === 'all' || a.portfolioId === portfolioFilter
  );
  const filteredAccountIds = new Set(filteredAccounts.map(a => a.id));

  // ── Asset allocation ──────────────────────────────────────────────────────
  const allocationByAsset = new Map<string, number>();
  for (const h of (holdings || []).filter(h => filteredAccountIds.has(h.accountId))) {
    const sec = secMap.get(h.securityId);
    const price = sec ? priceMap.get(sec.ticker) : null;
    const val = price ? h.shares * price.price : h.bookValue;
    const cls = sec?.assetClass || 'Other';
    allocationByAsset.set(cls, (allocationByAsset.get(cls) || 0) + val);
  }
  const assetData = Array.from(allocationByAsset.entries()).map(([name, value]) => ({ name, value }));
  const acctTypeData = (['RRSP', 'TFSA', 'RESP', 'Non-Registered', 'LIRA', 'FHSA'] as const).map(type => {
    const accts = filteredAccounts.filter(a => a.type === type);
    const value = accts.reduce((sum, a) => {
      const hs = (holdings || []).filter(h => h.accountId === a.id);
      return sum + hs.reduce((s2, h) => {
        const sec = secMap.get(h.securityId);
        const price = sec ? priceMap.get(sec.ticker) : null;
        return s2 + (price ? h.shares * price.price : h.bookValue);
      }, 0) + a.cashBalance;
    }, 0);
    return { name: type, value };
  }).filter(d => d.value > 0);

  // ── Performance ───────────────────────────────────────────────────────────
  const monthlyMap = new Map<string, number>();
  let runningValue = 0;
  const filteredTx = (transactions || [])
    .filter(t => filteredAccountIds.has(t.accountId))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const t of filteredTx) {
    const month = t.date.substring(0, 7);
    if (t.type === 'Buy') runningValue += t.amount;
    else if (t.type === 'Sell') runningValue -= t.amount;
    else if (t.type === 'Contribution') runningValue += t.amount;
    else if (t.type === 'Withdrawal') runningValue -= t.amount;
    monthlyMap.set(month, runningValue);
  }
  const perfData = Array.from(monthlyMap.entries()).map(([month, value]) => ({ month, value }));

  const portTx = filteredTx.filter(t => t.date >= startDate && t.date <= endDate);
  const totalBook = (holdings || []).filter(h => filteredAccountIds.has(h.accountId)).reduce((s, h) => s + h.bookValue, 0);
  const totalMkt = (holdings || []).filter(h => filteredAccountIds.has(h.accountId)).reduce((s, h) => {
    const sec = secMap.get(h.securityId);
    const price = sec ? priceMap.get(sec.ticker) : null;
    return s + (price ? h.shares * price.price : h.bookValue);
  }, 0);
  const cashTotal = filteredAccounts.reduce((s, a) => s + a.cashBalance, 0);
  const totalPortfolioValue = totalMkt + cashTotal;

  const mdietz = calculateModifiedDietz(portTx, 0, totalMkt, startDate, endDate);
  const { dollar: totalGain, percent: totalGainPct } = calculateDollarGainLoss(totalBook, totalMkt);
  const mwrFlows = buildXirrFlows(filteredTx, totalPortfolioValue);
  const mwr = xirr(mwrFlows);

  // ── Income ────────────────────────────────────────────────────────────────
  const incomeTxs = (transactions || []).filter(t => {
    if (!filteredAccountIds.has(t.accountId)) return false;
    if (!INCOME_TYPES.includes(t.type) && t.type !== 'Dividend' && t.type !== 'Interest') return false;
    if (incomeType !== 'all' && t.type !== incomeType) return false;
    if (incomeYear !== 'all' && !t.date.startsWith(incomeYear)) return false;
    return true;
  });
  const incomeByYear = new Map<string, number>();
  const incomeByType = new Map<string, number>();
  for (const t of incomeTxs) {
    const yr = t.date.substring(0, 4);
    incomeByYear.set(yr, (incomeByYear.get(yr) || 0) + t.amount);
    incomeByType.set(t.type, (incomeByType.get(t.type) || 0) + t.amount);
  }
  const incomeByYearData = Array.from(incomeByYear.entries()).sort().map(([year, amount]) => ({ year, amount }));
  const incomeByTypeData = Array.from(incomeByType.entries()).map(([name, value]) => ({ name, value }));
  const totalIncome = incomeTxs.reduce((s, t) => s + t.amount, 0);

  // ── ACB Capital Gains (average cost, per-sell) ────────────────────────────
  const realizedRows = useMemo(() => {
    const allTx = transactions || [];
    const secs = securities || [];
    const rows = [];
    for (const sec of secs) {
      const secRows = calculateRealizedGainsPerSell(allTx, sec.id, sec.ticker);
      rows.push(...secRows);
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, securities]);

  const years = useMemo(() =>
    Array.from(new Set([
      ...(transactions || []).map(t => t.date.substring(0, 4)),
      ...realizedRows.map(r => String(r.year)),
    ])).sort().reverse(),
    [transactions, realizedRows],
  );

  const filteredGains = gainsYear === 'all' ? realizedRows : realizedRows.filter(r => r.year === Number(gainsYear));
  const totalRealizedGain = filteredGains.reduce((s, r) => s + r.gain, 0);
  const totalRealizedProceeds = filteredGains.reduce((s, r) => s + r.proceeds, 0);

  // ── FIFO Tax Lots ─────────────────────────────────────────────────────────
  const { openLots, disposals } = useMemo(() =>
    computeAllLots(transactions || [], securities || []),
    [transactions, securities],
  );

  // Filter to selected portfolio's accounts
  const filteredOpenLots = openLots.filter(l => filteredAccountIds.has(l.accountId));
  const filteredDisposals = disposals.filter(d =>
    filteredAccountIds.has(d.accountId) &&
    (lotYear === 'all' || d.year === Number(lotYear))
  );

  // Enrich open lots with current price
  const enrichedLots = filteredOpenLots.map(lot => {
    const price = priceMap.get(lot.ticker);
    const currentPrice = price?.price ?? lot.costPerShare;
    const marketValue = lot.sharesRemaining * currentPrice;
    const unrealizedGain = marketValue - lot.totalCost;
    const unrealizedPct = lot.totalCost > 0 ? (unrealizedGain / lot.totalCost) * 100 : 0;
    return { ...lot, currentPrice, marketValue, unrealizedGain, unrealizedPct };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker) || a.purchaseDate.localeCompare(b.purchaseDate));

  // Group open lots by ticker for summary row
  const lotsByTicker = useMemo(() => {
    const map = new Map<string, typeof enrichedLots>();
    for (const l of enrichedLots) {
      const arr = map.get(l.ticker) ?? [];
      arr.push(l);
      map.set(l.ticker, arr);
    }
    return map;
  }, [enrichedLots]);

  // FIFO disposal totals
  const totalFifoGain = filteredDisposals.reduce((s, d) => s + d.gainLoss, 0);
  const totalFifoProceeds = filteredDisposals.reduce((s, d) => s + d.proceeds, 0);
  const longTermGain = filteredDisposals.filter(d => d.isLongTerm).reduce((s, d) => s + d.gainLoss, 0);
  const shortTermGain = filteredDisposals.filter(d => !d.isLongTerm).reduce((s, d) => s + d.gainLoss, 0);

  // Tax-loss harvesting candidates (unrealized loss lots)
  const harvestCandidates = enrichedLots
    .filter(l => l.unrealizedGain < 0)
    .sort((a, b) => a.unrealizedGain - b.unrealizedGain);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">Asset allocation, performance, income and tax-lot analysis</p>
        </div>
        <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Portfolios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Portfolios</SelectItem>
            {(portfolios || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="allocation">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="allocation">Asset Allocation</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="capgains">Capital Gains (ACB)</TabsTrigger>
          <TabsTrigger value="taxlots">Tax Lots (FIFO)</TabsTrigger>
        </TabsList>

        {/* ── Asset Allocation ── */}
        <TabsContent value="allocation" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-sm mb-3">By Asset Class</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={assetData} cx="50%" cy="50%" outerRadius={100} dataKey="value" stroke="none">
                    {assetData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">By Account Type</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={acctTypeData} cx="50%" cy="50%" outerRadius={100} dataKey="value" stroke="none">
                    {acctTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* ── Performance ── */}
        <TabsContent value="performance" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Market Value', value: formatCurrency(totalMkt), sub: null, color: undefined },
              { label: 'Book Value', value: formatCurrency(totalBook), sub: null, color: undefined },
              { label: 'Total Gain/Loss', value: `${totalGain >= 0 ? '+' : ''}${formatCurrency(totalGain)}`, sub: formatPercent(totalGainPct), color: totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600' },
              { label: 'MWR (annualized)', value: mwr !== null ? formatPercent(mwr * 100) : '—', sub: 'Money-weighted return', color: mwr !== null && mwr >= 0 ? 'text-emerald-600' : 'text-rose-600' },
            ].map(card => (
              <div key={card.label} className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={cn('text-xl font-bold mt-1 num', card.color)}>{card.value}</p>
                {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Modified Dietz Return</p>
              <p className={cn('text-xl font-bold mt-1 num', mdietz >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatPercent(mdietz)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{startDate} — {endDate}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Total Portfolio Value</p>
              <p className="text-xl font-bold mt-1 num">{formatCurrency(totalPortfolioValue)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">incl. {formatCurrency(cashTotal)} cash</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" className="h-8 text-sm w-36" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date</Label>
              <Input type="date" className="h-8 text-sm w-36" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3">Portfolio Value Over Time (Invested)</h3>
            {perfData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={perfData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Not enough data</div>
            )}
          </div>
        </TabsContent>

        {/* ── Income ── */}
        <TabsContent value="income" className="mt-4 space-y-5">
          <div className="flex gap-3 flex-wrap">
            <Select value={incomeType} onValueChange={setIncomeType}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Income Types</SelectItem>
                {INCOME_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                <SelectItem value="Interest">Interest</SelectItem>
              </SelectContent>
            </Select>
            <Select value={incomeYear} onValueChange={setIncomeYear}>
              <SelectTrigger className="w-28"><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-xl font-bold text-emerald-600 mt-1 num">+{formatCurrency(totalIncome)}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-xl font-bold mt-1">{incomeTxs.length}</p>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3">Income by Year</h3>
            {incomeByYearData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={incomeByYearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(0)}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No income data for selected filters</div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2">Income by Type</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">% of Total</th>
                </tr></thead>
                <tbody>
                  {incomeByTypeData.map(row => (
                    <tr key={row.name} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs">{row.name}</td>
                      <td className="px-3 py-2 text-right text-xs num font-semibold">{formatCurrency(row.value)}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{totalIncome > 0 ? ((row.value / totalIncome) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                  {incomeByTypeData.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-8 text-muted-foreground text-xs">No income data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Capital Gains (ACB) ── */}
        <TabsContent value="capgains" className="mt-4 space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-800 font-medium">Canadian ACB Method</p>
            <p className="text-xs text-blue-700 mt-0.5">Canada requires the <strong>adjusted cost base (average cost)</strong> method for calculating capital gains on identical properties. Each sell uses the weighted average cost of all shares at that date. See the Tax Lots (FIFO) tab for lot-level analysis.</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Unrealized Gain/Loss</p>
                <p className={cn('text-xl font-bold mt-1 num', totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatPercent(totalGainPct)} return</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Realized Gain/Loss {gainsYear !== 'all' ? gainsYear : '(all years)'}</p>
                <p className={cn('text-xl font-bold mt-1 num', totalRealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {totalRealizedGain >= 0 ? '+' : ''}{formatCurrency(totalRealizedGain)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">on {formatCurrency(totalRealizedProceeds)} proceeds</p>
              </div>
            </div>
            <Select value={gainsYear} onValueChange={setGainsYear}>
              <SelectTrigger className="w-28"><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2">Realized Capital Gains — ACB method, per sell</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Symbol</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Proceeds</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">ACB Removed</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Gain/Loss</th>
                </tr></thead>
                <tbody>
                  {filteredGains.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-xs">No realized gains for this period</td></tr>
                  )}
                  {filteredGains.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs num">{row.date}</td>
                      <td className="px-3 py-2 text-xs font-semibold num">{row.ticker}</td>
                      <td className="px-3 py-2 text-right text-xs num">{formatCurrency(row.proceeds)}</td>
                      <td className="px-3 py-2 text-right text-xs num text-muted-foreground">{formatCurrency(row.acbRemoved)}</td>
                      <td className={cn('px-3 py-2 text-right text-xs num font-semibold', row.gain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                        {row.gain >= 0 ? '+' : ''}{formatCurrency(row.gain)}
                      </td>
                    </tr>
                  ))}
                  {filteredGains.length > 0 && (
                    <tr className="bg-muted/30 font-semibold border-t border-border">
                      <td className="px-3 py-2 text-xs" colSpan={2}>Total</td>
                      <td className="px-3 py-2 text-right text-xs num">{formatCurrency(totalRealizedProceeds)}</td>
                      <td className="px-3 py-2 text-right text-xs num text-muted-foreground">{formatCurrency(filteredGains.reduce((s, r) => s + r.acbRemoved, 0))}</td>
                      <td className={cn('px-3 py-2 text-right text-xs num', totalRealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                        {totalRealizedGain >= 0 ? '+' : ''}{formatCurrency(totalRealizedGain)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2">Capital Gain Distributions</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Security</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
                </tr></thead>
                <tbody>
                  {(transactions || []).filter(t => filteredAccountIds.has(t.accountId) && t.type === 'Capital Gain Distribution').length === 0 && (
                    <tr><td colSpan={3} className="text-center py-8 text-muted-foreground text-xs">No capital gain distributions</td></tr>
                  )}
                  {(transactions || []).filter(t => filteredAccountIds.has(t.accountId) && t.type === 'Capital Gain Distribution').map(t => {
                    const sec = t.securityId ? secMap.get(t.securityId) : null;
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-xs num">{t.date.split('T')[0]}</td>
                        <td className="px-3 py-2 text-xs num font-semibold">{sec?.ticker || '—'}</td>
                        <td className="px-3 py-2 text-right text-xs num">{formatCurrency(t.amount, t.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Tax Lots (FIFO) ── */}
        <TabsContent value="taxlots" className="mt-4 space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800 font-medium">FIFO Lot Tracking — informational</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This tab tracks each buy as a separate lot using First-In-First-Out matching. Useful for identifying tax-loss harvesting opportunities, viewing holding periods, and analyzing US securities. <strong>For your T1 General, use the ACB (average cost) figures in the Capital Gains tab.</strong>
            </p>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {(['open', 'disposals'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setLotView(v)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    lotView === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'open' ? `Open Lots (${filteredOpenLots.length})` : `Disposals (${filteredDisposals.length})`}
                </button>
              ))}
            </div>
            {lotView === 'disposals' && (
              <Select value={lotYear} onValueChange={setLotYear}>
                <SelectTrigger className="w-28 h-8"><SelectValue placeholder="All Years" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Open Lots view ── */}
          {lotView === 'open' && (
            <>
              {/* Tax-loss harvesting alert */}
              {harvestCandidates.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs text-rose-800 font-semibold mb-1">Tax-Loss Harvesting Candidates</p>
                  <p className="text-xs text-rose-700 mb-2">
                    {harvestCandidates.length} lot{harvestCandidates.length > 1 ? 's' : ''} with unrealized losses that could offset capital gains if sold:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {harvestCandidates.slice(0, 6).map(l => (
                      <div key={l.lotId} className="bg-rose-100 rounded px-2 py-1 text-xs">
                        <span className="font-semibold">{l.ticker}</span>
                        <span className="text-rose-600 ml-1">{formatCurrency(l.unrealizedGain)}</span>
                        <span className="text-rose-500 ml-1">({formatHoldingPeriod(l.holdingDays)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enrichedLots.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No open lots — add Buy transactions to see tax lots</div>
              ) : (
                <>
                  {/* Per-ticker lot groups */}
                  {Array.from(lotsByTicker.entries()).map(([ticker, lots]) => {
                    const totalShares = lots.reduce((s, l) => s + l.sharesRemaining, 0);
                    const totalCost = lots.reduce((s, l) => s + l.totalCost, 0);
                    const totalMarket = lots.reduce((s, l) => s + l.marketValue, 0);
                    const totalUnrealized = totalMarket - totalCost;
                    const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;
                    return (
                      <div key={ticker} className="space-y-1">
                        {/* Ticker header */}
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm num">{ticker}</span>
                            <span className="text-xs text-muted-foreground">{lots.length} lot{lots.length > 1 ? 's' : ''} · {totalShares.toFixed(4)} shares</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-muted-foreground">Avg cost: <span className="num font-medium">{formatCurrency(avgCostPerShare)}/sh</span></span>
                            <span className={cn('font-semibold num', totalUnrealized >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {totalUnrealized >= 0 ? '+' : ''}{formatCurrency(totalUnrealized)}
                            </span>
                          </div>
                        </div>
                        {/* Lot rows */}
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Purchase Date</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Shares</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cost/Share</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total Cost</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Market Value</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Unrealized G/L</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Held</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lots.map(lot => (
                                <tr key={lot.lotId} className={cn(
                                  'border-b border-border last:border-0',
                                  lot.unrealizedGain < 0 ? 'bg-rose-50/40' : lot.unrealizedGain > 0 ? 'bg-emerald-50/20' : '',
                                )}>
                                  <td className="px-3 py-1.5 num">{lot.purchaseDate}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[100px]">
                                    {acctMap.get(lot.accountId)?.name || '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right num">
                                    {lot.sharesRemaining.toFixed(4)}
                                    {lot.sharesRemaining < lot.sharesOriginal && (
                                      <span className="text-muted-foreground ml-1">/{lot.sharesOriginal.toFixed(2)}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 text-right num">{formatCurrency(lot.costPerShare)}</td>
                                  <td className="px-3 py-1.5 text-right num">{formatCurrency(lot.totalCost)}</td>
                                  <td className="px-3 py-1.5 text-right num">{formatCurrency(lot.marketValue)}</td>
                                  <td className={cn('px-3 py-1.5 text-right num font-semibold', lot.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                    {lot.unrealizedGain >= 0 ? '+' : ''}{formatCurrency(lot.unrealizedGain)}
                                    <span className="font-normal ml-1 text-[10px]">({lot.unrealizedPct >= 0 ? '+' : ''}{lot.unrealizedPct.toFixed(1)}%)</span>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Badge className={cn(
                                      'text-[10px] px-1.5 py-0 border-0 font-medium',
                                      lot.holdingDays > 365 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                                    )}>
                                      {formatHoldingPeriod(lot.holdingDays)}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* ── Disposals view ── */}
          {lotView === 'disposals' && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Proceeds', value: formatCurrency(totalFifoProceeds), color: '' },
                  { label: 'FIFO Gain/Loss', value: `${totalFifoGain >= 0 ? '+' : ''}${formatCurrency(totalFifoGain)}`, color: totalFifoGain >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                  { label: 'Long-Term (>1yr)', value: `${longTermGain >= 0 ? '+' : ''}${formatCurrency(longTermGain)}`, color: longTermGain >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                  { label: 'Short-Term (<1yr)', value: `${shortTermGain >= 0 ? '+' : ''}${formatCurrency(shortTermGain)}`, color: shortTermGain >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                ].map(c => (
                  <div key={c.label} className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className={cn('text-base font-bold mt-0.5 num', c.color)}>{c.value}</p>
                  </div>
                ))}
              </div>

              {filteredDisposals.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No disposals for this period — add Sell transactions to see lot matches</div>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-xs min-w-[820px]">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Purchase Date</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Sale Date</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Held</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Shares Sold</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Cost/Share</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Sale Price</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Proceeds</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">ACB (FIFO)</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Gain/Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDisposals.sort((a, b) => b.saleDate.localeCompare(a.saleDate)).map((d, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/10">
                          <td className="px-3 py-1.5 font-semibold num">{d.ticker}</td>
                          <td className="px-3 py-1.5 num">{d.purchaseDate}</td>
                          <td className="px-3 py-1.5 num">{d.saleDate}</td>
                          <td className="px-3 py-1.5">
                            <Badge className={cn(
                              'text-[10px] px-1.5 py-0 border-0',
                              d.isLongTerm ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                            )}>
                              {formatHoldingPeriod(d.holdingDays)}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right num">{d.sharesSold.toFixed(4)}</td>
                          <td className="px-3 py-1.5 text-right num text-muted-foreground">{formatCurrency(d.costPerShare)}</td>
                          <td className="px-3 py-1.5 text-right num text-muted-foreground">{formatCurrency(d.salePricePerShare)}</td>
                          <td className="px-3 py-1.5 text-right num">{formatCurrency(d.proceeds)}</td>
                          <td className="px-3 py-1.5 text-right num text-muted-foreground">{formatCurrency(d.acbRemoved)}</td>
                          <td className={cn('px-3 py-1.5 text-right num font-semibold', d.gainLoss >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {d.gainLoss >= 0 ? '+' : ''}{formatCurrency(d.gainLoss)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                        <td className="px-3 py-2" colSpan={7}>Total</td>
                        <td className="px-3 py-2 text-right num">{formatCurrency(totalFifoProceeds)}</td>
                        <td className="px-3 py-2 text-right num text-muted-foreground">{formatCurrency(filteredDisposals.reduce((s, d) => s + d.acbRemoved, 0))}</td>
                        <td className={cn('px-3 py-2 text-right num', totalFifoGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {totalFifoGain >= 0 ? '+' : ''}{formatCurrency(totalFifoGain)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
