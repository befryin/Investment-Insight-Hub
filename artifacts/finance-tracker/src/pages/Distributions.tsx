import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { db, type DistributionImport } from '@/lib/db';
import { parseCSV } from '@/lib/csvUtils';
import * as XLSX from 'xlsx';
import { formatCurrency } from '@/lib/csvUtils';
import { Check, X, Upload, Globe, AlertCircle, Pencil, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Distribution = {
  symbol: string;
  ex_date?: string;
  pay_date?: string;
  per_unit: number;
  classifications: {
    eligible_div?: number;
    non_eligible_div?: number;
    capital_gains?: number;
    return_of_capital?: number;
    interest?: number;
    foreign_income?: number;
  };
};

type BreakdownDraft = {
  totalAmount: number;
  dividend: number;
  capitalGain: number;
  returnOfCapital: number;
  foreignIncome: number;
  otherIncome: number;
};

export default function Distributions() {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fetchUrl, setFetchUrl] = useState('');
  const [symbolHint, setSymbolHint] = useState('');
  const [provider, setProvider] = useState('ishares-ca');
  const [fetchYear, setFetchYear] = useState(new Date().getFullYear().toString());
  const [fetching, setFetching] = useState(false);
  const [fetchedPreview, setFetchedPreview] = useState<Distribution[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BreakdownDraft>({ totalAmount: 0, dividend: 0, capitalGain: 0, returnOfCapital: 0, foreignIncome: 0, otherIncome: 0 });

  const pending = useLiveQuery(() => db.distributionImports.where('status').equals('pending').toArray(), []);
  const approved = useLiveQuery(() => db.distributionImports.where('status').equals('approved').toArray(), []);
  const history = useLiveQuery(() =>
    db.distributionImports.where('status').anyOf(['approved', 'rejected']).reverse().toArray(), []);

  // Annual tax summary — group approved distributions by year + ticker
  const annualSummary = useMemo(() => {
    const map = new Map<string, {
      year: number; ticker: string;
      dividend: number; capitalGain: number; roc: number;
      foreignIncome: number; otherIncome: number; total: number; count: number;
    }>();
    for (const item of (approved || [])) {
      const year = parseInt(item.exDate.slice(0, 4));
      const key = `${year}|${item.ticker}`;
      const e = map.get(key) ?? { year, ticker: item.ticker, dividend: 0, capitalGain: 0, roc: 0, foreignIncome: 0, otherIncome: 0, total: 0, count: 0 };
      e.dividend += item.breakdown.dividend ?? 0;
      e.capitalGain += item.breakdown.capitalGain ?? 0;
      e.roc += item.breakdown.returnOfCapital ?? 0;
      e.foreignIncome += item.breakdown.foreignIncome ?? 0;
      e.otherIncome += item.breakdown.otherIncome ?? 0;
      e.total += item.totalAmount;
      e.count += 1;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year || a.ticker.localeCompare(b.ticker));
  }, [approved]);

  async function approve(item: DistributionImport) {
    await db.distributionImports.update(item.id, { status: 'approved' });
    const sec = await db.securities.where('ticker').equals(item.ticker.toUpperCase()).first();
    const accounts = await db.accounts.toArray();
    const holding = sec ? await db.holdings.where('securityId').equals(sec.id).first() : null;
    const accountId = holding?.accountId || accounts[0]?.id;
    if (accountId && sec) {
      const baseTx = { accountId, securityId: sec.id, date: item.exDate, currency: 'CAD' as const, approved: true, createdAt: new Date().toISOString() };
      const txs = [];
      if (item.breakdown.dividend) txs.push({ ...baseTx, id: crypto.randomUUID(), type: 'Dividend' as const, amount: item.breakdown.dividend, distributionClassification: 'Dividend' as const, notes: 'Distribution: Dividend' });
      if (item.breakdown.returnOfCapital) txs.push({ ...baseTx, id: crypto.randomUUID(), type: 'Return of Capital' as const, amount: item.breakdown.returnOfCapital, notes: 'Distribution: ROC' });
      if (item.breakdown.capitalGain) txs.push({ ...baseTx, id: crypto.randomUUID(), type: 'Capital Gain Distribution' as const, amount: item.breakdown.capitalGain, notes: 'Distribution: Reinvested Capital Gain' });
      if (item.breakdown.foreignIncome) txs.push({ ...baseTx, id: crypto.randomUUID(), type: 'Distribution' as const, amount: item.breakdown.foreignIncome, distributionClassification: 'Foreign Income' as const, notes: 'Distribution: Foreign Income' });
      if (item.breakdown.otherIncome) txs.push({ ...baseTx, id: crypto.randomUUID(), type: 'Distribution' as const, amount: item.breakdown.otherIncome, distributionClassification: 'Other Income' as const, notes: 'Distribution: Other Income' });
      
      // If there are no breakdown parts, just add a generic distribution for total amount
      if (txs.length === 0 && item.totalAmount > 0) {
        txs.push({ ...baseTx, id: crypto.randomUUID(), type: 'Distribution' as const, amount: item.totalAmount, notes: 'Distribution' });
      }
      
      await db.transactions.bulkAdd(txs);
    }
    toast({ title: `Approved distribution for ${item.ticker}` });
  }

  async function approveAll() {
    for (const item of (pending || [])) { await approve(item); }
    toast({ title: `Approved ${pending?.length || 0} distributions` });
  }

  async function reject(id: string) {
    await db.distributionImports.update(id, { status: 'rejected' });
    toast({ title: 'Distribution rejected' });
  }

  function startEdit(item: DistributionImport) {
    setEditingId(item.id);
    setEditDraft({
      totalAmount: item.totalAmount,
      dividend: item.breakdown.dividend ?? 0,
      capitalGain: item.breakdown.capitalGain ?? 0,
      returnOfCapital: item.breakdown.returnOfCapital ?? 0,
      foreignIncome: item.breakdown.foreignIncome ?? 0,
      otherIncome: item.breakdown.otherIncome ?? 0,
    });
  }

  async function saveEdit(id: string) {
    await db.distributionImports.update(id, {
      totalAmount: editDraft.totalAmount,
      breakdown: {
        dividend: editDraft.dividend || undefined,
        capitalGain: editDraft.capitalGain || undefined,
        returnOfCapital: editDraft.returnOfCapital || undefined,
        foreignIncome: editDraft.foreignIncome || undefined,
        otherIncome: editDraft.otherIncome || undefined,
      },
    });
    setEditingId(null);
    toast({ title: 'Distribution updated' });
  }

  async function handleFile(file: File) {
    setImporting(true);
    try {
      let rows: any[] = [];
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(20, rawJson.length); i++) {
          const rowStr = (rawJson[i] || []).join(' ').toLowerCase();
          if (rowStr.includes('ticker') || rowStr.includes('symbol') || rowStr.includes('fund')) {
            headerRowIdx = i;
            break;
          }
        }
        
        const headers = rawJson[headerRowIdx] || [];
        for (let i = headerRowIdx + 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0) continue;
          const obj: any = {};
          headers.forEach((h: string, idx: number) => {
            if (h) obj[h.toString().trim()] = row[idx];
          });
          rows.push(obj);
        }
      } else {
        const parsed = await parseCSV(file);
        rows = parsed.rows;
      }

      const items: DistributionImport[] = rows.map(row => {
        const ticker = (row['Ticker'] || row['ticker'] || row['Symbol'] || row['symbol'] || row['Fund'] || '').toString().trim().toUpperCase();
        let exDateRaw = row['Ex Date'] || row['ex_date'] || row['Ex-Date'] || row['date'] || row['Record Date'] || '';
        if (typeof exDateRaw === 'number') {
           // Excel date number
           const date = new Date(Math.round((exDateRaw - 25569) * 86400 * 1000));
           exDateRaw = date.toISOString().split('T')[0];
        }
        const exDate = exDateRaw.toString();
        const payDate = row['Pay Date'] || row['pay_date'] || '';
        
        // Some files format amounts with $ or commas. Clean them up.
        const cleanNum = (v: any) => parseFloat(v?.toString().replace(/[$ ,]/g, '') || '0') || 0;
        
        const total = cleanNum(row['Total'] || row['total'] || row['Amount'] || row['amount'] || row['Cash Distribution']);
        const dividend = cleanNum(row['Dividend'] || row['dividend'] || row['Eligible Dividend']);
        const capitalGain = cleanNum(row['Capital Gain'] || row['capital_gain'] || row['CG'] || row['Capital Gains']);
        const roc = cleanNum(row['Return of Capital'] || row['ROC'] || row['roc']);
        const foreign = cleanNum(row['Foreign Income'] || row['foreign_income']);
        const other = cleanNum(row['Other'] || row['other'] || row['Interest']);
        
        return {
          id: crypto.randomUUID(), ticker, exDate, payDate: payDate || undefined,
          totalAmount: total || dividend + capitalGain + roc + foreign + other,
          breakdown: {
            dividend: dividend || undefined, capitalGain: capitalGain || undefined,
            returnOfCapital: roc || undefined, foreignIncome: foreign || undefined, otherIncome: other || undefined,
          },
          status: 'pending' as const, importedAt: new Date().toISOString(),
        };
      }).filter((i: any) => i.ticker && i.exDate);
      await db.distributionImports.bulkAdd(items);
      toast({ title: `Imported ${items.length} distribution records` });
    } catch (e) {
      toast({ title: 'Error parsing file: ' + (e as Error).message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }

  async function fetchFromUrl() {
    let url = fetchUrl.trim();
    if (!url) {
      if (provider === 'vanguard-ca') url = 'https://fund-docs.vanguard.com/ETF-Distribution-History.xlsx';
      else if (provider === 'bmo') url = `https://www.bmo.com/assets/pdfs/bmo-etfs-tax-distribution-history-${fetchYear}-en.xlsx`;
      else if (provider === 'ishares-ca') url = `https://www.blackrock.com/ca/investors/en/literature/tax-information/distribution-characteristics-${fetchYear}-en.xlsx`;
      else return;
    }
    setFetching(true);
    setFetchedPreview([]);
    try {
      const res = await fetch(`/api/proxy-file?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Failed to fetch file (HTTP ${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], "downloaded.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      await handleFile(file);
    } catch (e) {
      toast({ title: 'Fetch failed: ' + (e as Error).message, variant: 'destructive' });
    } finally {
      setFetching(false);
    }
  }

  async function importFetched() {
    const items: DistributionImport[] = fetchedPreview.map(d => ({
      id: crypto.randomUUID(),
      ticker: d.symbol,
      exDate: d.ex_date || new Date().toISOString().split('T')[0]!,
      payDate: d.pay_date,
      totalAmount: d.per_unit,
      breakdown: {
        dividend: (d.classifications.eligible_div || 0) + (d.classifications.non_eligible_div || 0) || undefined,
        capitalGain: d.classifications.capital_gains || undefined,
        returnOfCapital: d.classifications.return_of_capital || undefined,
        foreignIncome: d.classifications.foreign_income || undefined,
        otherIncome: d.classifications.interest || undefined,
      },
      status: 'pending' as const,
      importedAt: new Date().toISOString(),
    }));
    await db.distributionImports.bulkAdd(items);
    setFetchedPreview([]);
    setFetchUrl('');
    toast({ title: `Added ${items.length} distribution(s) to pending review` });
  }

  const numInput = (label: string, field: keyof BreakdownDraft) => (
    <div>
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <Input
        type="number" step="0.0001" min="0" className="h-6 text-xs num px-1.5 w-24"
        value={editDraft[field] || ''}
        onChange={e => setEditDraft(d => ({ ...d, [field]: parseFloat(e.target.value) || 0 }))}
      />
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Distribution Manager</h1>
        <p className="text-muted-foreground text-sm">Import, review, edit, and approve ETF distribution tax breakdowns</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {(pending || []).length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">{(pending || []).length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="annual">Annual Summary</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Pending Approval ── */}
        <TabsContent value="pending" className="mt-4 space-y-4">
          {(pending || []).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Check className="h-8 w-8 mx-auto mb-3 opacity-40 text-emerald-500" />
              <p>No pending distributions to review</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Review and edit breakdown amounts before approving. ROC (return of capital) reduces your ACB.
                </p>
                <Button size="sm" onClick={approveAll}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve All
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ticker</th>
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ex-Date</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Total/Unit</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Dividend</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Cap Gain</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">
                        <span className="text-amber-600">ROC ↓ACB</span>
                      </th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Foreign</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Other</th>
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pending || []).map(item => (
                      editingId === item.id ? (
                        /* ── Inline Edit Row ── */
                        <tr key={item.id} className="border-b border-border bg-blue-50">
                          <td className="px-3 py-2 num font-semibold text-xs">{item.ticker}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.exDate}</td>
                          <td colSpan={6} className="px-3 py-2">
                            <div className="flex flex-wrap gap-3 items-end">
                              {numInput('Total/Unit', 'totalAmount')}
                              {numInput('Dividend', 'dividend')}
                              {numInput('Cap Gain', 'capitalGain')}
                              <div>
                                <p className="text-[10px] text-amber-600 font-medium mb-0.5">ROC ↓ACB</p>
                                <Input
                                  type="number" step="0.0001" min="0" className="h-6 text-xs num px-1.5 w-24 border-amber-300 focus:ring-amber-400"
                                  value={editDraft.returnOfCapital || ''}
                                  onChange={e => setEditDraft(d => ({ ...d, returnOfCapital: parseFloat(e.target.value) || 0 }))}
                                />
                              </div>
                              {numInput('Foreign', 'foreignIncome')}
                              {numInput('Other', 'otherIncome')}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="default" className="h-6 w-6" onClick={() => saveEdit(item.id)}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        /* ── Normal Row ── */
                        <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 num font-semibold text-xs">{item.ticker}</td>
                          <td className="px-3 py-2 text-xs">{item.exDate}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold num">{formatCurrency(item.totalAmount)}</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.dividend ? formatCurrency(item.breakdown.dividend) : '—'}</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.capitalGain ? formatCurrency(item.breakdown.capitalGain) : '—'}</td>
                          <td className="px-3 py-2 text-right text-xs num">
                            {item.breakdown.returnOfCapital
                              ? <span className="text-amber-700 font-medium">{formatCurrency(item.breakdown.returnOfCapital)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.foreignIncome ? formatCurrency(item.breakdown.foreignIncome) : '—'}</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.otherIncome ? formatCurrency(item.breakdown.otherIncome) : '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => startEdit(item)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600 hover:text-emerald-700" onClick={() => approve(item)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => reject(item.id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800 font-medium">About Return of Capital (ROC)</p>
                <p className="text-xs text-amber-700 mt-1">ROC distributions are not taxable in the year received, but they reduce your Adjusted Cost Base (ACB). A lower ACB increases your capital gain when you eventually sell. Approving a distribution with ROC records it as a transaction and reduces your ACB automatically.</p>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Annual Tax Summary ── */}
        <TabsContent value="annual" className="mt-4 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Year-end tax breakdown of approved distributions — use this to prepare your T3/T5 slips and Schedule 3. ROC amounts reduce ACB.
            </p>
          </div>
          {annualSummary.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>No approved distributions yet</p>
              <p className="text-xs mt-1">Approve pending distributions to see the annual breakdown here</p>
            </div>
          ) : (
            <>
              {/* Group by year */}
              {Array.from(new Set(annualSummary.map(r => r.year))).map(year => {
                const rows = annualSummary.filter(r => r.year === year);
                const totals = rows.reduce((acc, r) => ({
                  dividend: acc.dividend + r.dividend,
                  capitalGain: acc.capitalGain + r.capitalGain,
                  roc: acc.roc + r.roc,
                  foreignIncome: acc.foreignIncome + r.foreignIncome,
                  otherIncome: acc.otherIncome + r.otherIncome,
                  total: acc.total + r.total,
                }), { dividend: 0, capitalGain: 0, roc: 0, foreignIncome: 0, otherIncome: 0, total: 0 });

                return (
                  <div key={year} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{year} Tax Year</h3>
                      <span className="text-xs text-muted-foreground">{rows.length} security{rows.length !== 1 ? 'ies' : 'y'} · {rows.reduce((s, r) => s + r.count, 0)} distributions</span>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ticker</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Dividend</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cap Gain</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-amber-600">ROC ↓ACB</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Foreign</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Other</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.ticker} className="border-b border-border last:border-0 hover:bg-muted/10">
                              <td className="px-3 py-1.5 font-semibold num">{r.ticker}</td>
                              <td className="px-3 py-1.5 text-right num text-muted-foreground">{r.dividend > 0 ? formatCurrency(r.dividend) : '—'}</td>
                              <td className="px-3 py-1.5 text-right num text-muted-foreground">{r.capitalGain > 0 ? formatCurrency(r.capitalGain) : '—'}</td>
                              <td className="px-3 py-1.5 text-right num">
                                {r.roc > 0
                                  ? <span className="text-amber-700 font-medium">{formatCurrency(r.roc)}</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right num text-muted-foreground">{r.foreignIncome > 0 ? formatCurrency(r.foreignIncome) : '—'}</td>
                              <td className="px-3 py-1.5 text-right num text-muted-foreground">{r.otherIncome > 0 ? formatCurrency(r.otherIncome) : '—'}</td>
                              <td className="px-3 py-1.5 text-right num font-semibold">{formatCurrency(r.total)}</td>
                            </tr>
                          ))}
                          {/* Year totals row */}
                          <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                            <td className="px-3 py-2 text-xs">Total {year}</td>
                            <td className="px-3 py-2 text-right text-xs num">{totals.dividend > 0 ? formatCurrency(totals.dividend) : '—'}</td>
                            <td className="px-3 py-2 text-right text-xs num">{totals.capitalGain > 0 ? formatCurrency(totals.capitalGain) : '—'}</td>
                            <td className="px-3 py-2 text-right text-xs num">
                              {totals.roc > 0 ? <span className="text-amber-700">{formatCurrency(totals.roc)}</span> : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-xs num">{totals.foreignIncome > 0 ? formatCurrency(totals.foreignIncome) : '—'}</td>
                            <td className="px-3 py-2 text-right text-xs num">{totals.otherIncome > 0 ? formatCurrency(totals.otherIncome) : '—'}</td>
                            <td className="px-3 py-2 text-right text-xs num">{formatCurrency(totals.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </TabsContent>

        {/* ── Import ── */}
        <TabsContent value="import" className="mt-4 space-y-5">
          {/* Fetch from URL */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Fetch from ETF provider page</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded p-2">
              <Globe className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Downloads static XLSX files directly from the provider.</span>
            </div>
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ishares-ca">iShares Canada</SelectItem>
                    <SelectItem value="bmo">BMO ETFs</SelectItem>
                    <SelectItem value="vanguard-ca">Vanguard Canada</SelectItem>
                    <SelectItem value="generic">Other / Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tax Year</Label>
                <Select value={fetchYear} onValueChange={setFetchYear}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                    <SelectItem value="2022">2022</SelectItem>
                    <SelectItem value="2021">2021</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Or custom URL</Label>
                <Input placeholder="Leave blank to use default" className="h-8 text-sm" value={fetchUrl} onChange={e => setFetchUrl(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={fetchFromUrl} disabled={fetching}>
              {fetching ? 'Fetching…' : 'Fetch distributions'}
            </Button>
          </div>
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history" className="mt-4">
          {(history || []).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">No distribution history</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ticker</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ex-Date</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Total/Unit</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-amber-600">ROC</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Imported</th>
                  </tr>
                </thead>
                <tbody>
                  {(history || []).map(item => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 num font-semibold text-xs">{item.ticker}</td>
                      <td className="px-3 py-2 text-xs">{item.exDate}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold num">{formatCurrency(item.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-xs num">
                        {item.breakdown.returnOfCapital
                          ? <span className="text-amber-700 font-medium">{formatCurrency(item.breakdown.returnOfCapital)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={cn('text-xs border-0', item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(item.importedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}