import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Account } from '@/lib/db';
import { formatCurrency } from '@/lib/csvUtils';
import { Plus, Pencil, Trash2, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const FINANCE_ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit Card', 'Cash', 'Line of Credit'] as const;

type AccountForm = {
  name: string; type: typeof FINANCE_ACCOUNT_TYPES[number]; currency: 'CAD' | 'USD';
  institution: string; cashBalance: string;
};

const defaultAccountForm: AccountForm = {
  name: '', type: 'Checking', currency: 'CAD', institution: '', cashBalance: '0',
};

export default function BankingAccounts() {
  const { toast } = useToast();
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; editing?: Account }>({ open: false });
  const [accountForm, setAccountForm] = useState<AccountForm>(defaultAccountForm);

  const accounts = useLiveQuery(() => 
    db.accounts.filter(a => FINANCE_ACCOUNT_TYPES.includes(a.type as any)).toArray(), 
  []);

  function openNewAccount() {
    setAccountForm(defaultAccountForm);
    setAccountDialog({ open: true });
  }

  function openEditAccount(a: Account) {
    setAccountForm({
      name: a.name, type: a.type as any, currency: a.currency,
      institution: a.institution || '', cashBalance: String(a.cashBalance),
    });
    setAccountDialog({ open: true, editing: a });
  }

  async function saveAccount() {
    if (!accountForm.name.trim()) return;
    const data = {
      name: accountForm.name, type: accountForm.type, currency: accountForm.currency,
      institution: accountForm.institution,
      cashBalance: parseFloat(accountForm.cashBalance) || 0,
      portfolioId: 'default', // Everyday banking doesn't need a portfolio
    };
    if (accountDialog.editing) {
      await db.accounts.update(accountDialog.editing.id, data);
      toast({ title: 'Account updated' });
    } else {
      await db.accounts.add({ id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() });
      toast({ title: 'Account created' });
    }
    setAccountDialog({ open: false });
  }

  async function deleteAccount(id: string) {
    await db.ledgerTransactions.where('accountId').equals(id).delete();
    await db.accounts.delete(id);
    toast({ title: 'Account deleted' });
  }

  const totalBalance = (accounts || []).reduce((sum, a) => {
    // For credit cards and lines of credit, balance is usually negative, but let's assume cashBalance reflects the actual signed value
    return sum + a.cashBalance;
  }, 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Everyday Banking</h1>
          <p className="text-muted-foreground text-sm">Manage your checking, savings, and credit cards</p>
        </div>
        <Button onClick={openNewAccount} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Account
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card className="bg-gradient-to-br from-blue-900 to-slate-900 border-none text-white shadow-lg">
          <CardContent className="p-6 flex justify-between items-center">
            <div>
              <p className="text-blue-200 text-sm font-medium mb-1">Total Cash & Credit</p>
              <h2 className="text-3xl font-bold tracking-tight">{formatCurrency(totalBalance)}</h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-800/50 flex items-center justify-center">
              <Landmark className="h-6 w-6 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        {(accounts || []).length === 0 && (
          <div className="text-center py-16 text-muted-foreground border rounded-lg border-dashed mt-4">
            <Landmark className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No banking accounts yet. Add one to start tracking expenses.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {(accounts || []).map(acct => (
            <Card key={acct.id}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Badge variant="outline" className="mb-2 text-xs font-normal">
                      {acct.type}
                    </Badge>
                    <h3 className="font-semibold text-lg">{acct.name}</h3>
                    {acct.institution && <p className="text-xs text-muted-foreground">{acct.institution}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAccount(acct)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAccount(acct.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t flex justify-between items-end">
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className="font-bold text-lg">{formatCurrency(acct.cashBalance, acct.currency)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={accountDialog.open} onOpenChange={o => setAccountDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accountDialog.editing ? 'Edit Account' : 'New Account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Daily Checking" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={accountForm.type} onValueChange={v => setAccountForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FINANCE_ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={accountForm.currency} onValueChange={v => setAccountForm(f => ({ ...f, currency: v as 'CAD' | 'USD' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Institution</Label>
                <Input value={accountForm.institution} onChange={e => setAccountForm(f => ({ ...f, institution: e.target.value }))} placeholder="e.g. RBC" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Current Balance</Label>
              <Input type="number" step="0.01" value={accountForm.cashBalance} onChange={e => setAccountForm(f => ({ ...f, cashBalance: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog({ open: false })}>Cancel</Button>
            <Button onClick={saveAccount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
