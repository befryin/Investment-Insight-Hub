import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { db, type LedgerTransaction, type LedgerSplit } from '@/lib/db';
import { formatCurrency } from '@/lib/csvUtils';
import { Plus, Pencil, Trash2, ReceiptText, ArrowRightLeft, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { MathInput } from '@/components/MathInput';

type SplitForm = { categoryId: string; amount: number; memo: string };
type TransactionForm = {
  accountId: string;
  date: string;
  payee: string;
  amount: number;
  categoryId: string; // 'split' if it's a split, 'transfer' if it's a transfer
  transferAccountId: string;
  memo: string;
  status: 'cleared' | 'pending' | 'reconciled';
  splits: SplitForm[];
};

const defaultTxForm: TransactionForm = {
  accountId: '', date: new Date().toISOString().split('T')[0], payee: '', amount: 0,
  categoryId: '', transferAccountId: '', memo: '', status: 'cleared', splits: []
};

export default function Ledger() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: LedgerTransaction; editingSplits?: LedgerSplit[] }>({ open: false });
  const [form, setForm] = useState<TransactionForm>(defaultTxForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);
  const transactions = useLiveQuery(() => db.ledgerTransactions.toArray(), []);
  const splits = useLiveQuery(() => db.ledgerSplits.toArray(), []);

  const bankingAccounts = useMemo(() => {
    return (accounts || []).filter(a => ['Checking', 'Savings', 'Credit Card', 'Cash', 'Line of Credit'].includes(a.type as string));
  }, [accounts]);

  const catMap = new Map((categories || []).map(c => [c.id, c]));
  const accMap = new Map((accounts || []).map(a => [a.id, a]));

  const filteredTx = useMemo(() => {
    let res = (transactions || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (accountFilter !== 'all') {
      res = res.filter(t => t.accountId === accountFilter || t.transferAccountId === accountFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      res = res.filter(t => t.payee.toLowerCase().includes(term) || (t.memo && t.memo.toLowerCase().includes(term)));
    }
    return res;
  }, [transactions, accountFilter, searchTerm]);

  function openNew() {
    setForm({ ...defaultTxForm, accountId: accountFilter !== 'all' ? accountFilter : (bankingAccounts[0]?.id || '') });
    setDialog({ open: true });
  }

  async function openEdit(t: LedgerTransaction) {
    const txSplits = t.isSplit ? await db.ledgerSplits.where('transactionId').equals(t.id).toArray() : [];
    setForm({
      accountId: t.accountId,
      date: t.date,
      payee: t.payee,
      amount: t.amount,
      categoryId: t.isSplit ? 'split' : (t.transferAccountId ? 'transfer' : (t.categoryId || '')),
      transferAccountId: t.transferAccountId || '',
      memo: t.memo || '',
      status: t.status,
      splits: txSplits.map(s => ({ categoryId: s.categoryId, amount: s.amount, memo: s.memo || '' })),
    });
    setDialog({ open: true, editing: t, editingSplits: txSplits });
  }

  async function save() {
    if (!form.accountId || !form.payee.trim() || !form.date) return;
    
    let isSplit = form.categoryId === 'split';
    let transferId = form.categoryId === 'transfer' ? form.transferAccountId : undefined;
    let actualCatId = (!isSplit && !transferId) ? form.categoryId : undefined;

    const txId = dialog.editing ? dialog.editing.id : crypto.randomUUID();

    const txData = {
      accountId: form.accountId,
      date: form.date,
      payee: form.payee,
      amount: form.amount,
      categoryId: actualCatId,
      isSplit,
      transferAccountId: transferId,
      memo: form.memo,
      status: form.status,
      tags: [], // Add tag support later
    };

    try {
      await db.transaction('rw', db.ledgerTransactions, db.ledgerSplits, async () => {
        if (dialog.editing) {
          await db.ledgerTransactions.update(txId, txData);
          await db.ledgerSplits.where('transactionId').equals(txId).delete();
        } else {
          await db.ledgerTransactions.add({ id: txId, ...txData, createdAt: new Date().toISOString() });
        }

        if (isSplit) {
          const splitAdds = form.splits.filter(s => s.categoryId && s.amount !== 0).map(s => ({
            id: crypto.randomUUID(),
            transactionId: txId,
            categoryId: s.categoryId,
            amount: s.amount,
            memo: s.memo,
          }));
          if (splitAdds.length > 0) {
            await db.ledgerSplits.bulkAdd(splitAdds);
          }
        }
      });

      // Update account balances
      // Need complex logic to adjust account balances based on previous state if editing.
      // For now, we will compute balances on the fly in reports/accounts.

      toast({ title: dialog.editing ? 'Transaction updated' : 'Transaction created' });
      setDialog({ open: false });
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message, variant: 'destructive' });
    }
  }

  async function remove(t: LedgerTransaction) {
    if (!confirm('Delete transaction?')) return;
    await db.transaction('rw', db.ledgerTransactions, db.ledgerSplits, async () => {
      await db.ledgerTransactions.delete(t.id);
      if (t.isSplit) {
        await db.ledgerSplits.where('transactionId').equals(t.id).delete();
      }
    });
    toast({ title: 'Transaction deleted' });
  }

  function addSplit() {
    setForm(f => ({ ...f, splits: [...f.splits, { categoryId: '', amount: 0, memo: '' }] }));
  }

  function updateSplit(index: number, field: keyof SplitForm, value: any) {
    setForm(f => {
      const newSplits = [...f.splits];
      newSplits[index] = { ...newSplits[index], [field]: value };
      return { ...f, splits: newSplits };
    });
  }

  return (
    <div className="p-6 space-y-5 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ledger</h1>
          <p className="text-muted-foreground text-sm">All transactions across your accounts</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Transaction
        </Button>
      </div>

      <div className="flex gap-3 items-center bg-card p-3 rounded-lg border shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search payee or memo..." 
            className="pl-8" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {bankingAccounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto border rounded-lg bg-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm text-muted-foreground font-medium">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Payee</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredTx.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  <ReceiptText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No transactions found.
                </td>
              </tr>
            ) : filteredTx.map(t => {
              const acc = accMap.get(t.accountId);
              const isExpense = t.amount < 0;
              let catDisplay = '';
              if (t.isSplit) {
                catDisplay = 'Split';
              } else if (t.transferAccountId) {
                const trAcc = accMap.get(t.transferAccountId);
                catDisplay = `Transfer ${isExpense ? 'to' : 'from'} ${trAcc?.name || 'Unknown'}`;
              } else if (t.categoryId) {
                catDisplay = catMap.get(t.categoryId)?.name || 'Uncategorized';
              } else {
                catDisplay = 'Uncategorized';
              }

              return (
                <tr key={t.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-3 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-3">{acc?.name || 'Unknown'}</td>
                  <td className="px-4 py-3 font-medium">
                    {t.payee}
                    {t.memo && <div className="text-xs text-muted-foreground font-normal mt-0.5">{t.memo}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {t.isSplit ? (
                      <Badge variant="outline" className="font-normal text-xs bg-slate-100 dark:bg-slate-800">Split</Badge>
                    ) : t.transferAccountId ? (
                      <Badge variant="secondary" className="font-normal text-xs flex w-fit items-center gap-1">
                        <ArrowRightLeft className="h-3 w-3" /> Transfer
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{catDisplay}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${isExpense ? '' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatCurrency(t.amount, acc?.currency || 'CAD')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(t)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog.open} onOpenChange={o => setDialog({ open: o })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {bankingAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Payee</Label>
              <Input value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))} placeholder="Who or what is this transaction for?" />
            </div>
            
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="split">➗ Split Transaction...</SelectItem>
                  <SelectItem value="transfer">🔄 Transfer to/from...</SelectItem>
                  <div className="my-2 border-t" />
                  {(categories || []).map(c => <SelectItem key={c.id} value={c.id}>{c.group} - {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount (Negative for expenses)</Label>
              <MathInput 
                value={form.amount} 
                onValueChange={(val) => setForm(f => ({ ...f, amount: val }))} 
                placeholder="-50.00 or 10+15"
              />
              <p className="text-[10px] text-muted-foreground">Tip: You can use math operators like 10+15</p>
            </div>

            {form.categoryId === 'transfer' && (
              <div className="space-y-2 col-span-2 bg-muted/50 p-3 rounded-md border border-border/50">
                <Label>Transfer Account</Label>
                <Select value={form.transferAccountId} onValueChange={v => setForm(f => ({ ...f, transferAccountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger>
                  <SelectContent>
                    {(accounts || []).filter(a => a.id !== form.accountId).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.categoryId === 'split' && (
              <div className="space-y-4 col-span-2 bg-muted/30 p-4 rounded-md border border-border/50">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Splits</h4>
                  <span className="text-xs text-muted-foreground">
                    Remaining: {formatCurrency(form.amount - form.splits.reduce((s, split) => s + (split.amount || 0), 0))}
                  </span>
                </div>
                {form.splits.map((split, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Select value={split.categoryId} onValueChange={v => updateSplit(i, 'categoryId', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          {(categories || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-1">
                      <MathInput 
                        value={split.amount} 
                        onValueChange={v => updateSplit(i, 'amount', v)} 
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setForm(f => ({...f, splits: f.splits.filter((_, idx) => idx !== i)}))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addSplit} className="w-full text-xs h-8">
                  <Plus className="h-3 w-3 mr-1" /> Add Split Line
                </Button>
              </div>
            )}

            <div className="space-y-2 col-span-2">
              <Label>Memo / Notes</Label>
              <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={save}>Save Transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
