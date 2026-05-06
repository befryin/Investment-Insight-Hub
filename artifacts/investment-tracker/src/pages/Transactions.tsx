import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Transaction } from '@/lib/db';
import { formatCurrency } from '@/lib/csvUtils';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const TX_TYPES = ['Buy', 'Sell', 'Dividend', 'Interest', 'Contribution', 'Withdrawal', 'Transfer In', 'Transfer Out', 'Distribution', 'Return of Capital', 'Capital Gain Distribution', 'Fee', 'Reinvested Dividend'] as const;
const TYPE_COLORS: Record<string, string> = {
  Buy: 'bg-blue-100 text-blue-700', Sell: 'bg-rose-100 text-rose-700',
  Dividend: 'bg-emerald-100 text-emerald-700', Interest: 'bg-emerald-100 text-emerald-700',
  Contribution: 'bg-violet-100 text-violet-700', Withdrawal: 'bg-orange-100 text-orange-700',
  Distribution: 'bg-amber-100 text-amber-700', 'Return of Capital': 'bg-gray-100 text-gray-700',
  'Capital Gain Distribution': 'bg-yellow-100 text-yellow-700', Fee: 'bg-red-100 text-red-700',
  'Reinvested Dividend': 'bg-teal-100 text-teal-700',
  'Transfer In': 'bg-cyan-100 text-cyan-700', 'Transfer Out': 'bg-pink-100 text-pink-700',
};

const PAGE_SIZE = 50;

type TxForm = Omit<Transaction, 'id' | 'createdAt'> & { id?: string };

const blankForm = (): TxForm => ({
  accountId: '', securityId: '', date: new Date().toISOString().split('T')[0],
  type: 'Buy', shares: undefined, price: undefined, amount: 0, commission: undefined,
  currency: 'CAD', notes: '', distributionClassification: undefined, taxYear: undefined,
  approved: true, importBatch: undefined,
});

export default function Transactions() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TxForm>(blankForm());

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);
  const allTx = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);

  const secMap = new Map((securities || []).map(s => [s.id, s]));
  const acctMap = new Map((accounts || []).map(a => [a.id, a]));

  const filtered = (allTx || []).filter(t => {
    if (accountFilter !== 'all' && t.accountId !== accountFilter) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (yearFilter !== 'all' && !t.date.startsWith(yearFilter)) return false;
    if (search) {
      const sec = t.securityId ? secMap.get(t.securityId) : null;
      const q = search.toLowerCase();
      if (!sec?.ticker.toLowerCase().includes(q) && !sec?.name.toLowerCase().includes(q) && !t.notes?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const years = Array.from(new Set((allTx || []).map(t => t.date.substring(0, 4)))).sort().reverse();

  function openNew() {
    setForm({ ...blankForm(), accountId: (accounts || [])[0]?.id || '' });
    setDialogOpen(true);
  }

  function openEdit(t: Transaction) {
    setForm({ ...t });
    setDialogOpen(true);
  }

  async function saveTx() {
    if (!form.accountId || !form.date || form.amount === undefined) return;
    const data: Omit<Transaction, 'id' | 'createdAt'> = {
      accountId: form.accountId, securityId: form.securityId || undefined,
      date: form.date, type: form.type, shares: form.shares ? Number(form.shares) : undefined,
      price: form.price ? Number(form.price) : undefined, amount: Number(form.amount),
      commission: form.commission ? Number(form.commission) : undefined,
      currency: form.currency, notes: form.notes,
      distributionClassification: form.distributionClassification,
      taxYear: form.taxYear ? Number(form.taxYear) : undefined,
      approved: form.approved, importBatch: form.importBatch,
    };
    if (form.id) {
      await db.transactions.update(form.id, data);
      toast({ title: 'Transaction updated' });
    } else {
      await db.transactions.add({ id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() });
      toast({ title: 'Transaction added' });
    }
    setDialogOpen(false);
  }

  async function deleteTx(id: string) {
    await db.transactions.delete(id);
    toast({ title: 'Transaction deleted' });
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} transactions</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-add-transaction">
          <Plus className="h-4 w-4 mr-1" /> Add Transaction
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 w-48 h-8 text-sm" placeholder="Search ticker, name..." data-testid="input-search-transactions" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={accountFilter} onValueChange={v => { setAccountFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-account-tx-filter"><SelectValue placeholder="All Accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-type-tx-filter"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={v => { setYearFilter(v); setPage(0); }}>
          <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-year-tx-filter"><SelectValue placeholder="All Years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Account</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Security</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Shares</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Price</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Commission</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Classification</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
              )}
              {paged.map(t => {
                const sec = t.securityId ? secMap.get(t.securityId) : null;
                const acct = acctMap.get(t.accountId);
                return (
                  <tr key={t.id} data-testid={`row-tx-${t.id}`} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 text-xs font-mono">{t.date.split('T')[0]}</td>
                    <td className="px-3 py-2 text-xs">{acct?.name || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {sec ? <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">{sec.ticker}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={cn('text-xs border-0 px-1.5 py-0', TYPE_COLORS[t.type] || 'bg-gray-100 text-gray-700')}>{t.type}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-mono">{t.shares != null ? t.shares : '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono">{t.price != null ? formatCurrency(t.price, t.currency) : '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono font-semibold">{formatCurrency(t.amount, t.currency)}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono">{t.commission ? formatCurrency(t.commission, t.currency) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.distributionClassification || '—'}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(t)} data-testid={`button-edit-tx-${t.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteTx(t.id)} data-testid={`button-delete-tx-${t.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">Next</Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? 'Edit Transaction' : 'New Transaction'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" data-testid="input-tx-date" value={form.date.split('T')[0]} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as Transaction['type'] }))}>
                <SelectTrigger data-testid="select-tx-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger data-testid="select-tx-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Security (optional)</Label>
              <Select value={form.securityId || 'none'} onValueChange={v => setForm(f => ({ ...f, securityId: v === 'none' ? undefined : v }))}>
                <SelectTrigger data-testid="select-tx-security"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (cash)</SelectItem>
                  {(securities || []).map(s => <SelectItem key={s.id} value={s.id}>{s.ticker} — {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" data-testid="input-tx-amount" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Shares (optional)</Label>
              <Input type="number" step="0.0001" data-testid="input-tx-shares" value={form.shares ?? ''} onChange={e => setForm(f => ({ ...f, shares: e.target.value ? parseFloat(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Price/Share (optional)</Label>
              <Input type="number" step="0.0001" data-testid="input-tx-price" value={form.price ?? ''} onChange={e => setForm(f => ({ ...f, price: e.target.value ? parseFloat(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Commission (optional)</Label>
              <Input type="number" step="0.01" data-testid="input-tx-commission" value={form.commission ?? ''} onChange={e => setForm(f => ({ ...f, commission: e.target.value ? parseFloat(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as 'CAD' | 'USD' }))}>
                <SelectTrigger data-testid="select-tx-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tax Year (optional)</Label>
              <Input type="number" data-testid="input-tx-taxyear" value={form.taxYear ?? ''} onChange={e => setForm(f => ({ ...f, taxYear: e.target.value ? parseInt(e.target.value) : undefined }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input data-testid="input-tx-notes" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTx} data-testid="button-save-tx">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
