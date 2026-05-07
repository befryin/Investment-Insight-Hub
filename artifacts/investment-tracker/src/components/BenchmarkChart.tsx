import { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type SeriesPoint = { date: string; close: number };
type ChartApiResponse = { series: Record<string, SeriesPoint[]> };

export interface Position {
  ticker: string;
  shares: number;
}

interface Props {
  positions: Position[];
  cashTotal: number;
}

type PeriodKey = '3mo' | '6mo' | '1y';

const BENCH_SYMBOLS = ['^GSPTSE', '^GSPC'];
const BENCH_LABELS: Record<string, string> = {
  '^GSPTSE': 'TSX Composite',
  '^GSPC': 'S&P 500',
};

function closestClose(series: SeriesPoint[], dateStr: string): number | null {
  if (!series || series.length === 0) return null;
  const target = new Date(dateStr).getTime();
  let best = series[0]!;
  for (const p of series) {
    if (Math.abs(new Date(p.date).getTime() - target) < Math.abs(new Date(best.date).getTime() - target)) {
      best = p;
    }
  }
  return best.close;
}

export function BenchmarkChart({ positions, cashTotal }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('1y');
  const [chartRows, setChartRows] = useState<Array<Record<string, number | string>>>([]);
  const [loading, setLoading] = useState(false);
  const [returns, setReturns] = useState<Record<string, number>>({});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    async function load() {
      const tickers = [...new Set(positions.map(p => p.ticker).filter(Boolean))];
      const allSymbols = [...BENCH_SYMBOLS, ...tickers];

      setLoading(true);
      try {
        const res = await fetch(
          `/api/chart?symbols=${encodeURIComponent(allSymbols.join(','))}&period=${period}&interval=1mo`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = await res.json() as ChartApiResponse;
        const series = data.series;

        // Use TSX dates as baseline; fall back to S&P dates
        const baseSeries = series['^GSPTSE'] ?? series['^GSPC'] ?? [];
        if (baseSeries.length === 0) { setLoading(false); return; }
        const dates = baseSeries.map(d => d.date);

        // Portfolio value at each date
        const portValues = dates.map(date => {
          let v = cashTotal;
          for (const pos of positions) {
            const c = closestClose(series[pos.ticker] ?? [], date);
            if (c !== null) v += pos.shares * c;
          }
          return v;
        });

        const firstPort = portValues[0] ?? 1;
        const firstTsx = closestClose(series['^GSPTSE'] ?? [], dates[0]!) ?? 1;
        const firstSp = closestClose(series['^GSPC'] ?? [], dates[0]!) ?? 1;

        const rows = dates.map((date, i) => {
          const row: Record<string, number | string> = { date: date.slice(0, 7) };
          const tsx = closestClose(series['^GSPTSE'] ?? [], date);
          const sp = closestClose(series['^GSPC'] ?? [], date);
          const port = portValues[i]!;

          if (tsx) row['TSX Composite'] = parseFloat(((tsx / firstTsx) * 100).toFixed(2));
          if (sp) row['S&P 500'] = parseFloat(((sp / firstSp) * 100).toFixed(2));
          row['Portfolio'] = parseFloat(((port / firstPort) * 100).toFixed(2));
          return row;
        });

        // Trailing returns
        const lastRow = rows[rows.length - 1];
        const newReturns: Record<string, number> = {};
        if (lastRow) {
          if (lastRow['TSX Composite']) newReturns['TSX Composite'] = (lastRow['TSX Composite'] as number) - 100;
          if (lastRow['S&P 500']) newReturns['S&P 500'] = (lastRow['S&P 500'] as number) - 100;
          if (lastRow['Portfolio']) newReturns['Portfolio'] = (lastRow['Portfolio'] as number) - 100;
        }

        setChartRows(rows);
        setReturns(newReturns);
      } catch (e: unknown) {
        if ((e as Error)?.name === 'AbortError') return;
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => ctrl.abort();
  }, [period, positions, cashTotal]);

  const periodLabels: Record<PeriodKey, string> = { '3mo': '3M', '6mo': '6M', '1y': '1Y' };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            Benchmark Comparison
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex gap-1">
              {(['3mo', '6mo', '1y'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    period === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Normalized to 100 at period start · monthly closes</p>
      </CardHeader>
      <CardContent>
        {/* Return badges */}
        {Object.keys(returns).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { key: 'Portfolio', color: 'text-amber-600 bg-amber-50 border-amber-200' },
              { key: 'TSX Composite', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { key: 'S&P 500', color: 'text-blue-700 bg-blue-50 border-blue-200' },
            ].map(({ key, color }) => {
              const r = returns[key];
              if (r === undefined) return null;
              return (
                <div key={key} className={cn('px-2 py-0.5 rounded text-xs font-semibold border', color)}>
                  {key}: {r >= 0 ? '+' : ''}{r.toFixed(1)}%
                </div>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chartRows.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
            {positions.length === 0
              ? 'Add holdings to compare portfolio performance'
              : 'Click Refresh Prices to load benchmark data'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartRows} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={v => `${v}`} />
              <ReferenceLine y={100} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
                formatter={(v: number, name: string) => [`${v.toFixed(1)} (${v >= 100 ? '+' : ''}${(v - 100).toFixed(1)}%)`, name]}
              />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="Portfolio" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="TSX Composite" stroke="#10b981" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="S&P 500" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
