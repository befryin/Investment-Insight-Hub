import { useState } from 'react';
import { db } from '@/lib/db';
import { exportToCSV } from '@/lib/csvUtils';
import { Download, GripVertical, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';

const ALL_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'account', label: 'Account Name' },
  { key: 'type', label: 'Transaction Type' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'securityName', label: 'Security Name' },
  { key: 'shares', label: 'Shares' },
  { key: 'price', label: 'Price' },
  { key: 'amount', label: 'Amount' },
  { key: 'commission', label: 'Commission' },
  { key: 'currency', label: 'Currency' },
  { key: 'classification', label: 'Classification' },
  { key: 'taxYear', label: 'Tax Year' },
  { key: 'notes', label: 'Notes' },
];

export default function ExportPage() {
  const { toast } = useToast();
  const [accountFilter, setAccountFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set(ALL_COLUMNS.map(c => c.key)));
  const [exporting, setExporting] = useState(false);

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);

  const secMap = new Map((securities || []).map(s => [s.id, s]));
  const acctMap = new Map((accounts || []).map(a => [a.id, a]));

  function toggleCol(key: string) {
    setSelectedCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function doExport() {
    setExporting(true);
    try {
      let txs = await db.transactions.orderBy('date').toArray();
      if (accountFilter !== 'all') txs = txs.filter(t => t.accountId === accountFilter);
      if (startDate) txs = txs.filter(t => t.date >= startDate);
      if (endDate) txs = txs.filter(t => t.date <= endDate);

      const rows = txs.map(t => {
        const sec = t.securityId ? secMap.get(t.securityId) : null;
        const acct = acctMap.get(t.accountId);
        return {
          date: t.date.split('T')[0],
          account: acct?.name || '',
          type: t.type,
          ticker: sec?.ticker || '',
          securityName: sec?.name || '',
          shares: t.shares ?? '',
          price: t.price ?? '',
          amount: t.amount,
          commission: t.commission ?? '',
          currency: t.currency,
          classification: t.distributionClassification || '',
          taxYear: t.taxYear ?? '',
          notes: t.notes || '',
        };
      });

      const cols = ALL_COLUMNS.filter(c => selectedCols.has(c.key)).map(c => c.key);
      exportToCSV(rows as Record<string, unknown>[], cols, `folio-transactions-${new Date().toISOString().split('T')[0]}.csv`);
      toast({ title: `Exported ${rows.length} transactions` });
    } finally {
      setExporting(false);
    }
  }

  // Preview (first 5 rows)
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  async function loadPreview() {
    let txs = await db.transactions.orderBy('date').reverse().limit(5).toArray();
    if (accountFilter !== 'all') txs = txs.filter(t => t.accountId === accountFilter);
    const rows = txs.map(t => {
      const sec = t.securityId ? secMap.get(t.securityId) : null;
      const acct = acctMap.get(t.accountId);
      return { date: t.date.split('T')[0], account: acct?.name || '', type: t.type, ticker: sec?.ticker || '', securityName: sec?.name || '', shares: t.shares ?? '', price: t.price ?? '', amount: t.amount, commission: t.commission ?? '', currency: t.currency, classification: t.distributionClassification || '', taxYear: t.taxYear ?? '', notes: t.notes || '' };
    });
    setPreview(rows);
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Export Transactions</h1>
        <p className="text-muted-foreground text-sm">Export your transaction history to CSV</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Filters */}
        <div className="space-y-4">
          <h2 className="font-semibold text-sm">Filters</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger data-testid="select-export-account"><SelectValue placeholder="All Accounts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" data-testid="input-export-start" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" data-testid="input-export-end" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Column selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Columns to Include</h2>
            <div className="flex gap-2">
              <button className="text-xs text-primary hover:underline" onClick={() => setSelectedCols(new Set(ALL_COLUMNS.map(c => c.key)))}>Select all</button>
              <span className="text-muted-foreground text-xs">·</span>
              <button className="text-xs text-primary hover:underline" onClick={() => setSelectedCols(new Set())}>Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ALL_COLUMNS.map(col => (
              <button
                key={col.key}
                data-testid={`toggle-col-${col.key}`}
                onClick={() => toggleCol(col.key)}
                className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left', selectedCols.has(col.key) ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}
              >
                <div className={cn('w-4 h-4 rounded flex items-center justify-center flex-shrink-0', selectedCols.has(col.key) ? 'bg-primary text-primary-foreground' : 'border border-border')}>
                  {selectedCols.has(col.key) && <Check className="h-2.5 w-2.5" />}
                </div>
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Preview (first 5 rows)</h2>
            <Button variant="outline" size="sm" onClick={loadPreview} data-testid="button-preview-export">Load Preview</Button>
          </div>
          {preview.length > 0 && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="text-xs w-full">
                <thead className="bg-muted/50">
                  <tr>
                    {ALL_COLUMNS.filter(c => selectedCols.has(c.key)).map(c => (
                      <th key={c.key} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {ALL_COLUMNS.filter(c => selectedCols.has(c.key)).map(c => (
                        <td key={c.key} className="px-3 py-1.5 whitespace-nowrap">{String(row[c.key] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Button onClick={doExport} disabled={exporting || selectedCols.size === 0} className="w-fit" data-testid="button-download-csv">
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Download CSV'}
        </Button>
      </div>
    </div>
  );
}
