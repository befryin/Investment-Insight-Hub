import { useState, useCallback } from 'react';
import { db, type Transaction } from '@/lib/db';
import { parseCSV, parseDate, type ColumnMapping } from '@/lib/csvUtils';
import { Upload, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';

const TX_TYPES = ['Buy', 'Sell', 'Dividend', 'Interest', 'Contribution', 'Withdrawal', 'Transfer In', 'Transfer Out', 'Distribution', 'Return of Capital', 'Capital Gain Distribution', 'Fee', 'Reinvested Dividend'] as const;

const APP_FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'type', label: 'Transaction Type', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'ticker', label: 'Ticker / Symbol', required: false },
  { key: 'shares', label: 'Shares / Units', required: false },
  { key: 'price', label: 'Price Per Share', required: false },
  { key: 'commission', label: 'Commission', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'classification', label: 'Distribution Classification', required: false },
] as const;

type Step = 'upload' | 'map' | 'map-actions' | 'preview' | 'done';

type ParsedRow = {
  date: string | null; type: string; amount: number; ticker?: string;
  shares?: number; price?: number; commission?: number; currency: 'CAD' | 'USD';
  notes?: string; classification?: string; valid: boolean; error?: string;
};

export default function ImportPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [actionMapping, setActionMapping] = useState<Record<string, string>>({});
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [importing, setImporting] = useState(false);

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);

  async function handleFile(file: File) {
    try {
      const { headers: h, rows } = await parseCSV(file);
      setHeaders(h);
      setRawRows(rows);
      // Auto-map based on common header names
      const autoMap: Record<string, string> = {};
      for (const field of APP_FIELDS) {
        const patterns: Record<string, string[]> = {
          date: ['date', 'trade date', 'settlement date', 'transaction date'],
          type: ['type', 'transaction type', 'activity', 'action'],
          amount: ['amount', 'total', 'net amount', 'value'],
          ticker: ['ticker', 'symbol', 'security', 'stock'],
          shares: ['shares', 'units', 'quantity', 'qty'],
          price: ['price', 'unit price', 'price per share'],
          commission: ['commission', 'fee', 'fees', 'charges'],
          currency: ['currency', 'ccy'],
          notes: ['notes', 'description', 'memo', 'comment'],
          classification: ['classification', 'income type', 'distribution type'],
        };
        const matches = patterns[field.key] || [field.key];
        for (const hdr of h) {
          if (matches.some(m => hdr.toLowerCase().includes(m))) {
            autoMap[field.key] = hdr;
            break;
          }
        }
      }
      setMapping(autoMap);
      setStep('map');
    } catch {
      toast({ title: 'Error parsing CSV', variant: 'destructive' });
    }
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }, []);

  function buildActionMapping() {
    if (!mapping.type) {
      setStep('preview');
      buildPreview();
      return;
    }
    const uniqueActions = new Set<string>();
    rawRows.forEach(r => {
      const v = r[mapping.type]?.trim();
      if (v) uniqueActions.add(v);
    });
    
    if (uniqueActions.size === 0) {
      setStep('preview');
      buildPreview();
      return;
    }

    const currentMapping = { ...actionMapping };
    uniqueActions.forEach(action => {
      if (!currentMapping[action]) {
        const matched = TX_TYPES.find(t => t.toLowerCase() === action.toLowerCase());
        currentMapping[action] = matched || '';
      }
    });
    setActionMapping(currentMapping);
    setStep('map-actions');
  }

  function buildPreview() {
    const secByTicker = new Map((securities || []).map(s => [s.ticker.toUpperCase(), s]));
    const rows: ParsedRow[] = rawRows.map((r, i) => {
      const dateRaw = mapping.date ? r[mapping.date] : '';
      const date = parseDate(dateRaw);
      const rawType = (mapping.type ? r[mapping.type] : '').trim();
      const typeStr = actionMapping[rawType] || rawType || 'Buy';
      const amountRaw = parseFloat((mapping.amount ? r[mapping.amount] : '0').replace(/[$,]/g, '')) || 0;
      const ticker = mapping.ticker ? r[mapping.ticker]?.trim().toUpperCase() : undefined;
      const shares = mapping.shares ? parseFloat(r[mapping.shares]) || undefined : undefined;
      const price = mapping.price ? parseFloat(r[mapping.price]?.replace(/[$,]/g, '')) || undefined : undefined;
      const commission = mapping.commission ? parseFloat(r[mapping.commission]?.replace(/[$,]/g, '')) || undefined : undefined;
      const currency = (mapping.currency ? r[mapping.currency] : 'CAD') as 'CAD' | 'USD';
      const notes = mapping.notes ? r[mapping.notes] : undefined;
      const classification = mapping.classification ? r[mapping.classification] : undefined;

      let error: string | undefined;
      if (!date) error = `Row ${i + 1}: Invalid date "${dateRaw}"`;
      if (!amountRaw && amountRaw !== 0) error = `Row ${i + 1}: Invalid amount`;

      return { date, type: typeStr, amount: amountRaw, ticker, shares, price, commission, currency, notes, classification, valid: !error, error };
    });
    setParsed(rows);
    setStep('preview');
  }

  async function doImport() {
    if (!selectedAccountId) { toast({ title: 'Please select an account', variant: 'destructive' }); return; }
    setImporting(true);
    const secByTicker = new Map((securities || []).map(s => [s.ticker.toUpperCase(), s]));
    const validRows = parsed.filter(r => r.valid);
    const txs: Transaction[] = validRows.map(r => {
      const sec = r.ticker ? secByTicker.get(r.ticker) : undefined;
      // Match type
      let type: Transaction['type'] = 'Buy';
      const typeStr = r.type.trim();
      const matched = TX_TYPES.find(t => t.toLowerCase() === typeStr.toLowerCase());
      if (matched) type = matched;
      return {
        id: crypto.randomUUID(), accountId: selectedAccountId,
        securityId: sec?.id, date: r.date!, type,
        shares: r.shares, price: r.price, amount: r.amount,
        commission: r.commission, currency: r.currency, notes: r.notes,
        distributionClassification: r.classification as Transaction['distributionClassification'],
        approved: true, createdAt: new Date().toISOString(),
      };
    });
    await db.transactions.bulkAdd(txs);
    setImporting(false);
    setStep('done');
    toast({ title: `Imported ${txs.length} transactions` });
  }

  const STEPS: { key: string; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'map', label: 'Map Columns' },
    { key: 'map-actions', label: 'Map Actions' },
    { key: 'preview', label: 'Preview' },
    { key: 'done', label: 'Complete' },
  ];

  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Import Transactions</h1>
        <p className="text-muted-foreground text-sm">Import from CSV with custom column mapping</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
              i < stepIdx ? 'bg-emerald-500 text-white' :
              i === stepIdx ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground')}>
              {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn('text-sm', i === stepIdx ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          data-testid="dropzone-csv"
          className={cn('border-2 border-dashed rounded-xl p-16 text-center transition-colors cursor-pointer', dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30')}
          onClick={() => document.getElementById('csv-upload')?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">Drop your CSV file here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
          <input id="csv-upload" type="file" accept=".csv" className="hidden" data-testid="input-csv-file"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 'map' && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Detected {headers.length} columns, {rawRows.length} rows. Map your CSV columns to the app's fields.</p>
          <div className="space-y-3">
            {APP_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-4">
                <div className="w-48 flex items-center gap-1.5">
                  <span className="text-sm font-medium">{field.label}</span>
                  {field.required && <span className="text-xs text-rose-500">*</span>}
                </div>
                <Select value={mapping[field.key] || 'none'} onValueChange={v => setMapping(m => ({ ...m, [field.key]: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="w-56" data-testid={`select-mapping-${field.key}`}><SelectValue placeholder="Not mapped" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not mapped —</SelectItem>
                    {headers.filter(h => h.trim()).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
                {mapping[field.key] && rawRows[0] && (
                  <span className="text-xs text-muted-foreground italic truncate max-w-[120px]">e.g. "{rawRows[0][mapping[field.key]]}"</span>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Import into account</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-64" data-testid="select-import-account"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')} data-testid="button-import-back">Back</Button>
            <Button onClick={buildActionMapping} data-testid="button-import-next">Next Step</Button>
          </div>
        </div>
      )}

      {/* Step 2.5: Map Actions */}
      {step === 'map-actions' && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Map the action types found in your CSV to the transaction types in the app.</p>
          <div className="space-y-3">
            {Object.keys(actionMapping).map(action => (
              <div key={action} className="flex items-center gap-4">
                <div className="w-48 flex items-center gap-1.5">
                  <span className="text-sm font-medium">{action}</span>
                </div>
                <Select value={actionMapping[action] || 'none'} onValueChange={v => setActionMapping(m => ({ ...m, [action]: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Not mapped" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not mapped —</SelectItem>
                    {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
            <Button onClick={buildPreview}>Preview Import</Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge className={cn('border-0', parsed.filter(r => r.valid).length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
              {parsed.filter(r => r.valid).length} valid
            </Badge>
            {parsed.filter(r => !r.valid).length > 0 && (
              <Badge className="border-0 bg-rose-100 text-rose-700">
                {parsed.filter(r => !r.valid).length} errors
              </Badge>
            )}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ticker</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Shares</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i} data-testid={`row-preview-${i}`} className={cn('border-b border-border last:border-0', !r.valid && 'bg-rose-50')}>
                      <td className="px-3 py-1.5">
                        {r.valid ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 text-rose-500" aria-label={r.error} />}
                      </td>
                      <td className="px-3 py-1.5 font-mono">{r.date || <span className="text-rose-500">invalid</span>}</td>
                      <td className="px-3 py-1.5">{r.type}</td>
                      <td className="px-3 py-1.5 font-mono">{r.ticker || '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.shares ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('map')} data-testid="button-preview-back">Back</Button>
            <Button onClick={doImport} disabled={importing || parsed.filter(r => r.valid).length === 0} data-testid="button-confirm-import">
              {importing ? 'Importing...' : `Import ${parsed.filter(r => r.valid).length} Transactions`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <div className="text-center py-12 space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <p className="text-lg font-semibold">Import Complete</p>
          <p className="text-sm text-muted-foreground">Your transactions have been added successfully.</p>
          <Button onClick={() => { setStep('upload'); setHeaders([]); setRawRows([]); setParsed([]); }} data-testid="button-import-again">
            Import Another File
          </Button>
        </div>
      )}
    </div>
  );
}