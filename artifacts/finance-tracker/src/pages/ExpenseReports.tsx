import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { db, type LedgerTransaction, type LedgerSplit } from '@/lib/db';
import { formatCurrency } from '@/lib/csvUtils';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingDown, ArrowRightLeft, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export default function ExpenseReports() {
  const [timeFilter, setTimeFilter] = useState<'thisMonth' | 'lastMonth' | 'thisYear' | 'all'>('thisMonth');

  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);
  const transactions = useLiveQuery(() => db.ledgerTransactions.toArray(), []);
  const splits = useLiveQuery(() => db.ledgerSplits.toArray(), []);

  const catMap = new Map((categories || []).map(c => [c.id, c]));

  const { expenses, income, transfers } = useMemo(() => {
    let txs = transactions || [];
    
    const now = new Date();
    if (timeFilter === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      txs = txs.filter(t => t.date >= start);
    } else if (timeFilter === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      txs = txs.filter(t => t.date >= start && t.date <= end);
    } else if (timeFilter === 'thisYear') {
      const start = new Date(now.getFullYear(), 0, 1).toISOString();
      txs = txs.filter(t => t.date >= start);
    }

    const expMap = new Map<string, number>();
    const incMap = new Map<string, number>();
    let totalTransfers = 0;

    for (const t of txs) {
      if (t.transferAccountId) {
        totalTransfers += Math.abs(t.amount);
        continue;
      }

      if (t.isSplit && splits) {
        const txSplits = splits.filter(s => s.transactionId === t.id);
        for (const s of txSplits) {
          const cat = catMap.get(s.categoryId);
          if (cat?.type === 'Transfer') {
            totalTransfers += Math.abs(s.amount);
          } else if (s.amount < 0) {
            const key = cat?.name || 'Uncategorized';
            expMap.set(key, (expMap.get(key) || 0) + Math.abs(s.amount));
          } else {
            const key = cat?.name || 'Uncategorized';
            incMap.set(key, (incMap.get(key) || 0) + s.amount);
          }
        }
      } else {
        const cat = t.categoryId ? catMap.get(t.categoryId) : undefined;
        if (cat?.type === 'Transfer') {
          totalTransfers += Math.abs(t.amount);
        } else if (t.amount < 0) {
          const key = cat?.name || 'Uncategorized';
          expMap.set(key, (expMap.get(key) || 0) + Math.abs(t.amount));
        } else {
          const key = cat?.name || 'Uncategorized';
          incMap.set(key, (incMap.get(key) || 0) + t.amount);
        }
      }
    }

    return {
      expenses: Array.from(expMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
      income: Array.from(incMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
      transfers: totalTransfers
    };
  }, [transactions, splits, categories, timeFilter]);

  const totalExpense = expenses.reduce((s, e) => s + e.value, 0);
  const totalIncome = income.reduce((s, i) => s + i.value, 0);
  const netSavings = totalIncome - totalExpense;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spending Reports</h1>
          <p className="text-muted-foreground text-sm">Analyze your cash flow and categories</p>
        </div>
        <Select value={timeFilter} onValueChange={(v: any) => setTimeFilter(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
            <SelectItem value="thisYear">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50">
          <CardContent className="p-5">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Total Income</p>
            <p className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/50">
          <CardContent className="p-5">
            <p className="text-xs text-rose-600 dark:text-rose-400 uppercase font-semibold">Total Expenses</p>
            <p className="text-3xl font-bold mt-1 text-rose-700 dark:text-rose-300">{formatCurrency(totalExpense)}</p>
          </CardContent>
        </Card>
        <Card className={cn(netSavings >= 0 ? 'bg-blue-50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50' : 'bg-orange-50 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/50')}>
          <CardContent className="p-5">
            <p className={cn("text-xs uppercase font-semibold", netSavings >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400")}>Net Savings</p>
            <p className={cn("text-3xl font-bold mt-1", netSavings >= 0 ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300")}>{formatCurrency(netSavings)}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" /> Excluded Transfers
            </p>
            <p className="text-3xl font-bold mt-1 text-muted-foreground">{formatCurrency(transfers)}</p>
            <p className="text-xs text-muted-foreground mt-1">Not counted in expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-rose-500" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenses} cx="50%" cy="50%" innerRadius={70} outerRadius={100} dataKey="value" stroke="none">
                      {expenses.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8 }} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No expense data for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-500" />
              Income Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {income.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={income} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} fontSize={12} />
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]}>
                      {income.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No income data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-rose-600 mb-3 border-b pb-2">Expenses</h3>
              <div className="space-y-3">
                {expenses.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-sm">{e.name}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-emerald-600 mb-3 border-b pb-2">Income</h3>
              <div className="space-y-3">
                {income.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-sm">{e.name}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
