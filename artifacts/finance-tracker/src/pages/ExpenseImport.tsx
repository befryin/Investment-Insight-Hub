import { useState, useCallback, useMemo } from 'react';
import { db, type LedgerTransaction } from '@/lib/db';
import { parseFile, type ParsedTransaction } from '@/lib/importUtils';
import { Upload, ChevronRight, Check, AlertCircle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'preview' | 'done';

type ProcessedRow = ParsedTransaction & {
  valid: boolean;
  error?: string;
  assignedCategoryId?: string;
};

export default function ExpenseImport() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ProcessedRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [importing, setImporting] = useState(false);

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);
  const rules = useLiveQuery(() => db.autoCategoryRules.toArray(), []);

  const bankingAccounts = useMemo(() => {
    return (accounts || []).filter(a => ['Checking', 'Savings', 'Credit Card', 'Cash', 'Line of Credit'].includes(a.type as string));
  }, [accounts]);

  async function handleFile(file: File) {
    try {
      const txs = await parseFile(file);
      
      const currentDbCats = await db.expenseCategories.toArray();
      const rulesArr = (rules || []).sort((a,b) => b.priority - a.priority);
      
      const processed: ProcessedRow[] = [];
      
      for (const tx of txs) {
        let assignedCategoryId: string | undefined;
        
        if (tx.category) {
          const catStr = tx.category.trim();
          let group = 'Imported';
          let name = catStr;
          
          if (catStr.includes(':')) {
            const parts = catStr.split(':');
            group = parts[0].trim();
            name = parts.slice(1).join(':').trim();
          }
          
          let existing = currentDbCats.find(c => c.name.toLowerCase() === name.toLowerCase() && c.group.toLowerCase() === group.toLowerCase());
          
          if (!existing) {
            existing = {
              id: crypto.randomUUID(),
              name,
              group,
              type: 'Expense'
            };
            await db.expenseCategories.add(existing);
            currentDbCats.push(existing);
          }
          assignedCategoryId = existing.id;
        }
        
        if (!assignedCategoryId) {
          for (const rule of rulesArr) {
            const target = rule.matchField === 'payee' ? tx.payee : (tx.memo || '');
            const t = target.toLowerCase();
            const v = rule.matchValue.toLowerCase();
            
            if (rule.matchType === 'exact' && t === v) {
              assignedCategoryId = rule.assignCategoryId; break;
            } else if (rule.matchType === 'contains' && t.includes(v)) {
              assignedCategoryId = rule.assignCategoryId; break;
            } else if (rule.matchType === 'regex') {
              try {
                if (new RegExp(rule.matchValue, 'i').test(target)) {
                  assignedCategoryId = rule.assignCategoryId; break;
                }
              } catch (e) {}
            }
          }
        }
        
        processed.push({
          ...tx,
          assignedCategoryId,
          valid: !!tx.date && !isNaN(tx.amount),
          error: (!tx.date || isNaN(tx.amount)) ? 'Invalid date or amount' : undefined
        });
      }
      
      setParsed(processed);
      setStep('preview');
    } catch (e: any) {
      toast({ title: 'Error parsing file', description: e.message, variant: 'destructive' });
    }
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }, []);

  async function doImport() {
    if (!selectedAccountId) { toast({ title: 'Please select an account', variant: 'destructive' }); return; }
    setImporting(true);
    
    const validRows = parsed.filter(r => r.valid);
    const txs: LedgerTransaction[] = validRows.map(r => ({
        id: crypto.randomUUID(),
        accountId: selectedAccountId,
        date: r.date,
        payee: r.payee,
        amount: r.amount,
        categoryId: r.assignedCategoryId || undefined,
        isSplit: false,
        memo: r.memo,
        tags: [],
        status: 'cleared',
        importId: `${selectedAccountId}-${r.date}-${r.amount}-${r.payee}`, // Simple dup prevention
        createdAt: new Date().toISOString(),
    }));
    
    // Quick dedup check based on importId
    const existing = await db.ledgerTransactions.where('accountId').equals(selectedAccountId).toArray();
    const existingIds = new Set(existing.map(t => `${t.accountId}-${t.date}-${t.amount}-${t.payee}`));
    
    const toImport = txs.filter(t => !existingIds.has(t.importId!));
    
    await db.ledgerTransactions.bulkAdd(toImport);
    setImporting(false);
    setStep('done');
    toast({ title: `Imported ${toImport.length} transactions. ${txs.length - toImport.length} duplicates skipped.` });
  }

  const STEPS = [
    { key: 'upload', label: 'Upload' },
    { key: 'preview', label: 'Review & Categorize' },
    { key: 'done', label: 'Complete' },
  ];

  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Import Everyday Transactions</h1>
        <p className="text-muted-foreground text-sm">Import from CSV, QIF, or OFX with auto-categorization</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
              i < stepIdx ? 'bg-blue-500 text-white' :
              i === stepIdx ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground')}>
              {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn('text-sm', i === stepIdx ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('border-2 border-dashed rounded-xl p-16 text-center transition-colors cursor-pointer', dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30')}
          onClick={() => document.getElementById('csv-upload')?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">Drop your CSV, QIF, or OFX file here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
          <input id="csv-upload" type="file" accept=".csv,.qif,.ofx,.qfx" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-2">
              <Label>Import into:</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {bankingAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Payee</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-64">Category</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i} className={cn('border-b border-border last:border-0 hover:bg-muted/30', !r.valid && 'bg-rose-50')}>
                      <td className="px-3 py-2 whitespace-nowrap">{r.date || <span className="text-rose-500">invalid</span>}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.payee}</div>
                        {r.memo && <div className="text-xs text-muted-foreground">{r.memo}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Select 
                          value={r.assignedCategoryId || 'none'} 
                          onValueChange={(val) => {
                            const newParsed = [...parsed];
                            newParsed[i].assignedCategoryId = val === 'none' ? undefined : val;
                            setParsed(newParsed);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Uncategorized" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Uncategorized</SelectItem>
                            {(categories || []).map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={cn("px-3 py-2 text-right font-medium", (r.amount || 0) >= 0 ? "text-emerald-600" : "")}>
                        {r.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
            <Button onClick={doImport} disabled={importing || parsed.filter(r => r.valid).length === 0 || !selectedAccountId}>
              {importing ? 'Importing...' : `Import ${parsed.filter(r => r.valid).length} Transactions`}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-12 space-y-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
            <Check className="h-7 w-7 text-blue-600" />
          </div>
          <p className="text-lg font-semibold">Import Complete</p>
          <p className="text-sm text-muted-foreground">Your everyday transactions have been added to the ledger.</p>
          <Button onClick={() => { setStep('upload'); setParsed([]); }}>
            Import Another File
          </Button>
        </div>
      )}
    </div>
  );
}
