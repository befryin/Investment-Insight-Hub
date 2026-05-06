import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type DistributionImport } from '@/lib/db';
import { parseCSV } from '@/lib/csvUtils';
import { formatCurrency } from '@/lib/csvUtils';
import { Check, X, Upload, Globe, AlertCircle } from 'lucide-react';
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

export default function Distributions() {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fetchUrl, setFetchUrl] = useState('');
  const [symbolHint, setSymbolHint] = useState('');
  const [provider, setProvider] = useState('ishares-ca');
  const [fetching, setFetching] = useState(false);
  const [fetchedPreview, setFetchedPreview] = useState<Distribution[]>([]);

  const pending = useLiveQuery(() => db.distributionImports.where('status').equals('pending').toArray(), []);
  const history = useLiveQuery(() =>
    db.distributionImports.where('status').anyOf(['approved', 'rejected']).reverse().toArray(), []);

  async function approve(item: DistributionImport) {
    await db.distributionImports.update(item.id, { status: 'approved' });
    const sec = await db.securities.where('ticker').equals(item.ticker.toUpperCase()).first();
    const accounts = await db.accounts.toArray();
    const holding = sec ? await db.holdings.where('securityId').equals(sec.id).first() : null;
    const accountId = holding?.accountId || accounts[0]?.id;
    if (accountId && sec) {
      await db.transactions.add({
        id: crypto.randomUUID(), accountId, securityId: sec.id,
        date: item.exDate, type: 'Distribution', amount: item.totalAmount,
        currency: 'CAD', approved: true,
        distributionClassification: item.breakdown.dividend ? 'Dividend' :
          item.breakdown.capitalGain ? 'Capital Gain' :
          item.breakdown.returnOfCapital ? 'Return of Capital' :
          item.breakdown.foreignIncome ? 'Foreign Income' : 'Other Income',
        notes: `Distribution: ${Object.entries(item.breakdown).filter(([, v]) => v).map(([k, v]) => `${k}: $${v}`).join(', ')}`,
        createdAt: new Date().toISOString(),
      });
    }
    toast({ title: `Approved distribution for ${item.ticker}` });
  }

  async function approveAll() {
    for (const item of (pending || [])) {
      await approve(item);
    }
    toast({ title: `Approved ${pending?.length || 0} distributions` });
  }

  async function reject(id: string) {
    await db.distributionImports.update(id, { status: 'rejected' });
    toast({ title: 'Distribution rejected' });
  }

  async function handleFile(file: File) {
    setImporting(true);
    try {
      const { rows } = await parseCSV(file);
      const items: DistributionImport[] = rows.map(row => {
        const ticker = (row['Ticker'] || row['ticker'] || row['Symbol'] || row['symbol'] || '').trim().toUpperCase();
        const exDate = row['Ex Date'] || row['ex_date'] || row['Ex-Date'] || row['date'] || '';
        const payDate = row['Pay Date'] || row['pay_date'] || '';
        const total = parseFloat(row['Total'] || row['total'] || row['Amount'] || row['amount'] || '0') || 0;
        const dividend = parseFloat(row['Dividend'] || row['dividend'] || row['Eligible Dividend'] || '0') || 0;
        const capitalGain = parseFloat(row['Capital Gain'] || row['capital_gain'] || row['CG'] || '0') || 0;
        const roc = parseFloat(row['Return of Capital'] || row['ROC'] || row['roc'] || '0') || 0;
        const foreign = parseFloat(row['Foreign Income'] || row['foreign_income'] || '0') || 0;
        const other = parseFloat(row['Other'] || row['other'] || '0') || 0;
        return {
          id: crypto.randomUUID(), ticker, exDate, payDate: payDate || undefined,
          totalAmount: total || dividend + capitalGain + roc + foreign + other,
          breakdown: { dividend: dividend || undefined, capitalGain: capitalGain || undefined, returnOfCapital: roc || undefined, foreignIncome: foreign || undefined, otherIncome: other || undefined },
          status: 'pending' as const, importedAt: new Date().toISOString(),
        };
      }).filter(i => i.ticker);
      await db.distributionImports.bulkAdd(items);
      toast({ title: `Imported ${items.length} distribution records` });
    } catch {
      toast({ title: 'Error parsing file', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }

  async function fetchFromUrl() {
    if (!fetchUrl.trim()) return;
    setFetching(true);
    setFetchedPreview([]);
    try {
      const params = new URLSearchParams({ url: fetchUrl.trim() });
      if (symbolHint.trim()) params.set('symbol', symbolHint.trim().toUpperCase());
      const res = await fetch(`/api/etf-distributions?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json() as { distributions: Distribution[]; error?: string };
      if (data.error) throw new Error(data.error);
      setFetchedPreview(data.distributions);
      if (data.distributions.length === 0) {
        toast({ title: 'No distributions found on that page. Try a different URL or provider.' });
      }
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

  const breakdownKeys = ['dividend', 'capitalGain', 'returnOfCapital', 'foreignIncome', 'otherIncome'] as const;
  const breakdownLabels: Record<string, string> = {
    dividend: 'Dividend', capitalGain: 'Capital Gain', returnOfCapital: 'Return of Capital',
    foreignIncome: 'Foreign Income', otherIncome: 'Other Income',
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Distribution Manager</h1>
        <p className="text-muted-foreground text-sm">Import and approve ETF distribution classifications</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approval
            {(pending || []).length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">{(pending || []).length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="import">Import Data</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending" className="mt-4 space-y-4">
          {(pending || []).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Check className="h-8 w-8 mx-auto mb-3 opacity-40 text-emerald-500" />
              <p>No pending distributions to review</p>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={approveAll}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve All
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ticker</th>
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Ex-Date</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Dividend</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Cap Gain</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">ROC</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Foreign</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Other</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pending || []).map(item => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 num font-semibold text-xs">{item.ticker}</td>
                        <td className="px-3 py-2 text-xs">{item.exDate}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold num">{formatCurrency(item.totalAmount)}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.dividend ? formatCurrency(item.breakdown.dividend) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.capitalGain ? formatCurrency(item.breakdown.capitalGain) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.returnOfCapital ? formatCurrency(item.breakdown.returnOfCapital) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.foreignIncome ? formatCurrency(item.breakdown.foreignIncome) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground num">{item.breakdown.otherIncome ? formatCurrency(item.breakdown.otherIncome) : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600 hover:text-emerald-700" onClick={() => approve(item)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => reject(item.id)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* Import */}
        <TabsContent value="import" className="mt-4 space-y-5">
          {/* Fetch from URL */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Fetch from ETF provider page</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>This fetches the provider's distribution page server-side. Results depend on page structure — always review before approving.</span>
            </div>
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ishares-ca">iShares Canada</SelectItem>
                    <SelectItem value="bmo">BMO ETFs</SelectItem>
                    <SelectItem value="vanguard-ca">Vanguard Canada</SelectItem>
                    <SelectItem value="generic">Other / Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Symbol hint (optional)</Label>
                <Input placeholder="e.g. XAW.TO" className="h-8 text-sm" value={symbolHint} onChange={e => setSymbolHint(e.target.value.toUpperCase())} maxLength={20} />
              </div>
              <div className="md:col-span-1">
                <Label className="text-xs">Distribution page URL</Label>
                <Input placeholder="https://..." className="h-8 text-sm" value={fetchUrl} onChange={e => setFetchUrl(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={fetchFromUrl} disabled={fetching || !fetchUrl.trim()}>
              {fetching ? 'Fetching…' : 'Fetch distributions'}
            </Button>

            {fetchedPreview.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Preview — {fetchedPreview.length} distribution(s) found</p>
                  <Button size="sm" onClick={importFetched}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Add to Pending
                  </Button>
                </div>
                <div className="rounded border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Symbol</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ex-Date</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Per Unit</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Div</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">CG</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">ROC</th>
                    </tr></thead>
                    <tbody>
                      {fetchedPreview.map((d, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 num font-semibold">{d.symbol}</td>
                          <td className="px-3 py-1.5">{d.ex_date || '—'}</td>
                          <td className="px-3 py-1.5 text-right num">{formatCurrency(d.per_unit)}</td>
                          <td className="px-3 py-1.5 text-right num text-muted-foreground">
                            {(d.classifications.eligible_div || 0) + (d.classifications.non_eligible_div || 0) > 0
                              ? formatCurrency((d.classifications.eligible_div || 0) + (d.classifications.non_eligible_div || 0))
                              : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right num text-muted-foreground">{d.classifications.capital_gains ? formatCurrency(d.classifications.capital_gains) : '—'}</td>
                          <td className="px-3 py-1.5 text-right num text-muted-foreground">{d.classifications.return_of_capital ? formatCurrency(d.classifications.return_of_capital) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* CSV Upload */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Upload CSV</h3>
            <p className="text-sm text-muted-foreground">
              Upload a CSV from your ETF provider with distribution breakdown data. Expected columns: Ticker, Ex Date, Total, Dividend, Capital Gain, Return of Capital, Foreign Income, Other.
            </p>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={async e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) await handleFile(f); }}
              className={cn('border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer', dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
              onClick={() => document.getElementById('dist-upload')?.click()}
            >
              <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">{importing ? 'Importing…' : 'Drop CSV file here or click to browse'}</p>
              <p className="text-xs text-muted-foreground mt-1">Supports iShares, Vanguard, BMO distribution schedules</p>
              <input id="dist-upload" type="file" accept=".csv" className="hidden"
                onChange={async e => { if (e.target.files?.[0]) await handleFile(e.target.files[0]); }} />
            </div>

            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <p className="text-xs font-medium mb-2">Or add a sample distribution record to test:</p>
              <Button variant="outline" size="sm" onClick={async () => {
                await db.distributionImports.add({
                  id: crypto.randomUUID(), ticker: 'XAW.TO',
                  exDate: new Date().toISOString().split('T')[0],
                  totalAmount: 0.45,
                  breakdown: { dividend: 0.30, capitalGain: 0.10, returnOfCapital: 0.05 },
                  status: 'pending', importedAt: new Date().toISOString(),
                });
                toast({ title: 'Sample distribution added' });
              }}>
                Add Sample Distribution
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* History */}
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
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
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
