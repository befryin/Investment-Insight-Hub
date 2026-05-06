import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type ContributionRecord, type Account } from '@/lib/db';
import { formatCurrency } from '@/lib/csvUtils';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ContribForm = {
  accountId: string; year: string; amount: string; date: string; beneficiary: string;
};

const blankForm = (): ContribForm => ({
  accountId: '', year: String(new Date().getFullYear()), amount: '',
  date: new Date().toISOString().split('T')[0], beneficiary: '',
});

function ContribTab({ type, accounts }: { type: 'RRSP' | 'TFSA' | 'RESP'; accounts: Account[] }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ContribForm & { id?: string }>(blankForm());

  const eligibleAccounts = accounts.filter(a => a.type === type);
  const records = useLiveQuery(() =>
    db.contributionRecords.where('type').equals(type).reverse().toArray(), [type]);

  const byYear = new Map<number, number>();
  for (const r of (records || [])) {
    byYear.set(r.year, (byYear.get(r.year) || 0) + r.amount);
  }
  const years = Array.from(new Set((records || []).map(r => r.year))).sort().reverse();
  const currentYear = new Date().getFullYear();
  const currentYearTotal = byYear.get(currentYear) || 0;

  // Room limits
  const roomLimits: Record<string, number> = { TFSA: 7000, RESP: 50000 };
  const roomLabel = roomLimits[type] ? `${formatCurrency(roomLimits[type])}/yr limit` : '';

  function openNew() {
    const defaultAccount = eligibleAccounts[0];
    setForm({ ...blankForm(), accountId: defaultAccount?.id || '' });
    setDialogOpen(true);
  }

  function openEdit(r: ContributionRecord) {
    setForm({ id: r.id, accountId: r.accountId, year: String(r.year), amount: String(r.amount), date: r.date, beneficiary: r.beneficiary || '' });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.accountId || !form.amount) return;
    const data = {
      accountId: form.accountId, year: parseInt(form.year), type,
      amount: parseFloat(form.amount), date: form.date, beneficiary: form.beneficiary || undefined,
    };
    if (form.id) {
      await db.contributionRecords.update(form.id, data);
      toast({ title: 'Contribution updated' });
    } else {
      await db.contributionRecords.add({ id: crypto.randomUUID(), ...data });
      toast({ title: 'Contribution recorded' });
    }
    setDialogOpen(false);
  }

  async function del(id: string) {
    await db.contributionRecords.delete(id);
    toast({ title: 'Contribution deleted' });
  }

  const beneficiaries = type === 'RESP' ? Array.from(new Set(eligibleAccounts.map(a => a.beneficiary).filter(Boolean))) : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{currentYear} Contributions</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(currentYearTotal)}</p>
          {roomLabel && <p className="text-xs text-muted-foreground mt-1">{roomLabel}</p>}
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total All Years</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(Array.from(byYear.values()).reduce((s, v) => s + v, 0))}</p>
          <p className="text-xs text-muted-foreground mt-1">{eligibleAccounts.length} account{eligibleAccounts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* By year summary */}
      {years.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">By Year</p>
          <div className="flex gap-2 flex-wrap">
            {years.map(yr => (
              <div key={yr} className={cn('px-3 py-1.5 rounded-lg border text-sm', yr === currentYear ? 'border-primary bg-primary/5 font-semibold' : 'border-border')}>
                <span className="text-muted-foreground text-xs">{yr}:</span> {formatCurrency(byYear.get(yr) || 0)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Contribution Records</h3>
        <Button size="sm" onClick={openNew} data-testid={`button-add-contrib-${type.toLowerCase()}`}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Contribution
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/50 border-b border-border">
            <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Year</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Account</th>
            {type === 'RESP' && <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Beneficiary</th>}
            <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
            <th className="px-2 py-2.5"></th>
          </tr></thead>
          <tbody>
            {(records || []).length === 0 && (
              <tr><td colSpan={type === 'RESP' ? 6 : 5} className="text-center py-10 text-muted-foreground text-xs">No contributions recorded</td></tr>
            )}
            {(records || []).map(r => {
              const acct = accounts.find(a => a.id === r.accountId);
              return (
                <tr key={r.id} data-testid={`row-contrib-${r.id}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs font-mono">{r.date}</td>
                  <td className="px-3 py-2 text-xs font-mono">{r.year}</td>
                  <td className="px-3 py-2 text-xs">{acct?.name || '—'}</td>
                  {type === 'RESP' && <td className="px-3 py-2 text-xs">{r.beneficiary || '—'}</td>}
                  <td className="px-3 py-2 text-right text-xs font-mono font-semibold">{formatCurrency(r.amount)}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(r)} data-testid={`button-edit-contrib-${r.id}`}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => del(r.id)} data-testid={`button-delete-contrib-${r.id}`}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Edit Contribution' : `New ${type} Contribution`}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" data-testid="input-contrib-date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Year</Label>
              <Input type="number" data-testid="input-contrib-year" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger data-testid="select-contrib-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {eligibleAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" data-testid="input-contrib-amount" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            {type === 'RESP' && (
              <div className="col-span-2 space-y-1.5">
                <Label>Beneficiary</Label>
                <Input data-testid="input-contrib-beneficiary" value={form.beneficiary} onChange={e => setForm(f => ({ ...f, beneficiary: e.target.value }))} placeholder="Child's name" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="button-save-contrib">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Contributions() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Registered Account Contributions</h1>
        <p className="text-muted-foreground text-sm">Track RRSP, TFSA, and RESP contributions by year</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Note:</strong> TFSA annual limit is $7,000 (2024+). RRSP limit is 18% of prior year income. RESP lifetime limit is $50,000 per beneficiary. Actual room may vary — verify with CRA MyAccount.
      </div>

      <Tabs defaultValue="rrsp">
        <TabsList>
          <TabsTrigger value="rrsp" data-testid="tab-rrsp">RRSP</TabsTrigger>
          <TabsTrigger value="tfsa" data-testid="tab-tfsa">TFSA</TabsTrigger>
          <TabsTrigger value="resp" data-testid="tab-resp">RESP</TabsTrigger>
        </TabsList>
        <TabsContent value="rrsp" className="mt-4"><ContribTab type="RRSP" accounts={accounts} /></TabsContent>
        <TabsContent value="tfsa" className="mt-4"><ContribTab type="TFSA" accounts={accounts} /></TabsContent>
        <TabsContent value="resp" className="mt-4"><ContribTab type="RESP" accounts={accounts} /></TabsContent>
      </Tabs>
    </div>
  );
}
