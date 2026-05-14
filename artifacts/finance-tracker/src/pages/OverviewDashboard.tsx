import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatPercent } from '@/lib/csvUtils';
import { startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, subYears, isWithinInterval, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart, ComposedChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, ArrowRightLeft, DollarSign, Briefcase, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchQuotes } from '@/lib/marketData';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export default function OverviewDashboard() {
  const [period, setPeriod] = useState<string>('ytd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [cadUsdRate, setCadUsdRate] = useState<number | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const portfolios = useLiveQuery(() => db.portfolios.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);
  const prices = useLiveQuery(() => db.priceCache.toArray(), []);
  
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);
  const ledgerTx = useLiveQuery(() => db.ledgerTransactions.toArray(), []);
  const ledgerSplits = useLiveQuery(() => db.ledgerSplits.toArray(), []);

  useEffect(() => {
    fetchQuotes(['CADUSD=X']).then(qs => {
      const q = qs.find(x => x.symbol === 'CADUSD=X');
      if (q) setCadUsdRate(q.price);
    }).catch(() => {});
  }, []);

  // Compute date ranges
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (period) {
      case 'ytd':
        start = startOfYear(now);
        break;
      case 'lastYear':
        start = startOfYear(subYears(now, 1));
        end = endOfYear(subYears(now, 1));
        break;
      case 'lastMonth':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case 'thisMonth':
        start = startOfMonth(now);
        break;
      case 'custom':
        start = customStart ? new Date(customStart) : startOfYear(now);
        end = customEnd ? new Date(customEnd) : now;
        break;
      default: // all
        start = new Date('2000-01-01');
        break;
    }
    return { start, end };
  }, [period, customStart, customEnd]);

  // Investment Calculations
  const investmentData = useMemo(() => {
    const priceMap = new Map((prices || []).map(p => [p.ticker, p]));
    const securityMap = new Map((securities || []).map(s => [s.id, s]));
    
    let totalMarketValue = 0;
    let cashTotal = 0;

    // Filter investment accounts vs banking accounts
    const investmentAccounts = (accounts || []).filter(a => !!a.portfolioId);
    
    for (const acc of investmentAccounts) {
      cashTotal += acc.cashBalance;
    }

    const accIds = new Set(investmentAccounts.map(a => a.id));
    const activeHoldings = (holdings || []).filter(h => accIds.has(h.accountId));

    for (const h of activeHoldings) {
      const sec = securityMap.get(h.securityId);
      const price = sec ? priceMap.get(sec.ticker) : null;
      totalMarketValue += price ? h.shares * price.price : h.bookValue;
    }

    // Since we don't have historical portfolio value snapshots natively without calling historical prices,
    // we just use current value for the KPI.
    return {
      totalMarketValue: totalMarketValue + cashTotal,
      cashTotal
    };
  }, [accounts, holdings, securities, prices]);

  // Banking / Expense Calculations
  const bankingData = useMemo(() => {
    const bankingAccounts = (accounts || []).filter(a => !a.portfolioId);
    let totalCash = 0;
    for (const acc of bankingAccounts) {
      // Very basic net cash. (Line of Credit and CC should ideally be negative in cashBalance or tracked via ledger, 
      // but for simplicity we sum cashBalance).
      totalCash += acc.cashBalance;
    }

    const catMap = new Map((categories || []).map(c => [c.id, c]));
    
    let totalExpenses = 0;
    let totalIncome = 0;
    
    const expMap = new Map<string, number>(); // category -> amount
    const catDetails = new Map<string, any[]>(); // category -> tx list

    const validTxs = (ledgerTx || []).filter(t => {
      try {
        const d = parseISO(t.date);
        return isWithinInterval(d, { start: dateRange.start, end: dateRange.end });
      } catch { return false; }
    });

    for (const t of validTxs) {
      if (t.transferAccountId) continue; // skip transfers

      if (t.isSplit && ledgerSplits) {
        const txSplits = ledgerSplits.filter(s => s.transactionId === t.id);
        for (const s of txSplits) {
          const cat = catMap.get(s.categoryId);
          if (cat?.type === 'Transfer') continue;
          
          if (s.amount < 0) {
            totalExpenses += Math.abs(s.amount);
            const key = cat?.name || 'Uncategorized';
            expMap.set(key, (expMap.get(key) || 0) + Math.abs(s.amount));
            
            const arr = catDetails.get(key) || [];
            arr.push({ ...t, amount: s.amount, accountId: t.accountId });
            catDetails.set(key, arr);
          } else {
            totalIncome += s.amount;
          }
        }
      } else {
        const cat = t.categoryId ? catMap.get(t.categoryId) : undefined;
        if (cat?.type === 'Transfer') continue;
        
        if (t.amount < 0) {
          totalExpenses += Math.abs(t.amount);
          const key = cat?.name || 'Uncategorized';
          expMap.set(key, (expMap.get(key) || 0) + Math.abs(t.amount));
          
          const arr = catDetails.get(key) || [];
          arr.push(t);
          catDetails.set(key, arr);
        } else {
          totalIncome += t.amount;
        }
      }
    }

    const expensesByCategory = Array.from(expMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value);

    return {
      totalCash,
      totalExpenses,
      totalIncome,
      netCashFlow: totalIncome - totalExpenses,
      expensesByCategory,
      catDetails
    };
  }, [accounts, ledgerTx, ledgerSplits, categories, dateRange]);

  const totalNetWorth = investmentData.totalMarketValue + bankingData.totalCash;

  // Build drill-down data
  const accMap = new Map((accounts || []).map(a => [a.id, a]));
  
  const drillDownDetails = useMemo(() => {
    if (!selectedCategory || !bankingData.catDetails.has(selectedCategory)) return null;
    
    const txs = bankingData.catDetails.get(selectedCategory) || [];
    
    // Group by account
    const byAcc = new Map<string, number>();
    for (const t of txs) {
      const accName = accMap.get(t.accountId)?.name || 'Unknown';
      byAcc.set(accName, (byAcc.get(accName) || 0) + Math.abs(t.amount));
    }
    
    return {
      category: selectedCategory,
      total: bankingData.expensesByCategory.find(e => e.name === selectedCategory)?.value || 0,
      byAccount: Array.from(byAcc.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
      transactions: [...txs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15) // top 15 recent
    };
  }, [selectedCategory, bankingData, accMap]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header & Date Range */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">WealthHub Overview</h1>
          <p className="text-muted-foreground text-sm">Combined Net Worth & Cash Flow</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Period" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="lastMonth">Last Month</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="lastYear">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" />
              <span className="text-muted-foreground">to</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary text-primary-foreground border-none">
          <CardContent className="p-5">
            <p className="text-xs text-primary-foreground/80 uppercase font-semibold flex items-center gap-1.5 mb-1">
              <Briefcase className="h-4 w-4" /> Total Net Worth
            </p>
            <p className="text-3xl font-bold num">{formatCurrency(totalNetWorth)}</p>
            <p className="text-xs text-primary-foreground/70 mt-1">Investments + Bank Balances</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50">
          <CardContent className="p-5">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-4 w-4" /> Total Income
            </p>
            <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 num">{formatCurrency(bankingData.totalIncome)}</p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">For selected period</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/50">
          <CardContent className="p-5">
            <p className="text-xs text-rose-600 dark:text-rose-400 uppercase font-semibold flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-4 w-4" /> Total Expenses
            </p>
            <p className="text-3xl font-bold text-rose-700 dark:text-rose-300 num">{formatCurrency(bankingData.totalExpenses)}</p>
            <p className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-1">For selected period</p>
          </CardContent>
        </Card>
        <Card className={cn(bankingData.netCashFlow >= 0 ? 'bg-blue-50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50' : 'bg-orange-50 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/50')}>
          <CardContent className="p-5">
            <p className={cn("text-xs uppercase font-semibold flex items-center gap-1.5 mb-1", bankingData.netCashFlow >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400")}>
              <Activity className="h-4 w-4" /> Net Cash Flow
            </p>
            <p className={cn("text-3xl font-bold num", bankingData.netCashFlow >= 0 ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300")}>
              {formatCurrency(bankingData.netCashFlow)}
            </p>
            <p className={cn("text-xs mt-1", bankingData.netCashFlow >= 0 ? "text-blue-600/70 dark:text-blue-400/70" : "text-orange-600/70 dark:text-orange-400/70")}>
              Income minus Expenses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Expenses by Category Pie Chart (Clickable) */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expenses by Category</CardTitle>
            <p className="text-xs text-muted-foreground">Click a slice to drill down</p>
          </CardHeader>
          <CardContent>
            {bankingData.expensesByCategory.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={bankingData.expensesByCategory} 
                      cx="50%" cy="50%" 
                      innerRadius={60} outerRadius={90} 
                      dataKey="value" stroke="none"
                      onClick={(data) => {
                        setSelectedCategory(selectedCategory === data.name ? null : data.name);
                      }}
                      className="cursor-pointer"
                    >
                      {bankingData.expensesByCategory.map((entry, i) => (
                        <Cell 
                          key={i} 
                          fill={CHART_COLORS[i % CHART_COLORS.length]} 
                          opacity={selectedCategory ? (selectedCategory === entry.name ? 1 : 0.3) : 1}
                          className="transition-opacity duration-300"
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                No expenses found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Drill-down Details or Top Summary */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {drillDownDetails ? `Drill-down: ${drillDownDetails.category}` : 'Top Expenses Summary'}
            </CardTitle>
            {drillDownDetails && (
              <p className="text-xs text-muted-foreground">
                Total: {formatCurrency(drillDownDetails.total)}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {drillDownDetails ? (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold mb-3 border-b pb-1 text-muted-foreground">By Account</h4>
                  <div className="space-y-2">
                    {drillDownDetails.byAccount.map((acc, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span>{acc.name}</span>
                        <span className="font-medium num">{formatCurrency(acc.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-3 border-b pb-1 text-muted-foreground">Recent Transactions</h4>
                  <div className="space-y-2">
                    {drillDownDetails.transactions.map((t, i) => (
                      <div key={i} className="flex justify-between items-start py-1.5 border-b border-border/50 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{t.payee}</p>
                          <p className="text-xs text-muted-foreground">{t.date}</p>
                        </div>
                        <p className="text-sm font-medium num text-rose-600">{formatCurrency(Math.abs(t.amount))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">Select a category from the chart to view details, or review the top 5 expenses below.</p>
                <div className="space-y-3">
                  {bankingData.expensesByCategory.slice(0, 5).map((e, i) => (
                    <div key={i} className="flex items-center justify-between group cursor-pointer hover:bg-muted/30 p-2 rounded-md transition-colors" onClick={() => setSelectedCategory(e.name)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '20', color: CHART_COLORS[i % CHART_COLORS.length] }}>
                          {i + 1}
                        </div>
                        <span className="font-medium text-sm">{e.name}</span>
                      </div>
                      <span className="font-bold num">{formatCurrency(e.value)}</span>
                    </div>
                  ))}
                  {bankingData.expensesByCategory.length === 0 && (
                    <p className="text-sm text-muted-foreground">No data available.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
