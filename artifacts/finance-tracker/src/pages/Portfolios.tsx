import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Portfolio, type Account } from '@/lib/db';
import { formatCurrency } from '@/lib/csvUtils';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  RRSP: 'bg-blue-100 text-blue-700',
  TFSA: 'bg-emerald-100 text-emerald-700',
  RESP: 'bg-violet-100 text-violet-700',
  'Non-Registered': 'bg-gray-100 text-gray-700',
  LIRA: 'bg-amber-100 text-amber-700',
  FHSA: 'bg-pink-100 text-pink-700',
};

type PortfolioForm = { name: string; description: string };
type AccountForm = {
  name: string; type: Account['type']; currency: 'CAD' | 'USD';
  institution: string; beneficiary: string; cashBalance: string; portfolioId: string;
};

const defaultAccountForm: AccountForm = {
  name: '', type: 'RRSP', currency: 'CAD', institution: '', beneficiary: '', cashBalance: '0', portfolioId: '',
};

export default function Portfolios() {
  const { toast } = useToast();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());
  const [portfolioDialog, setPortfolioDialog] = useState<{ open: boolean; editing?: Portfolio }>({ open: false });
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; editing?: Account; portfolioId?: string }>({ open: false });
  const [portfolioForm, setPortfolioForm] = useState<PortfolioForm>({ name: '', description: '' });
  const [accountForm, setAccountForm] = useState<AccountForm>(defaultAccountForm);

  const portfolios = useLiveQuery(() => db.portfolios.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const prices = useLiveQuery(() => db.priceCache.toArray(), []);
  const securities = useLiveQuery(() => db.securities.toArray(), []);

  const priceMap = new Map((prices || []).map(p => [p.ticker, p]));
  const secMap = new Map((securities || []).map(s => [s.id, s]));

  function getAccountValue(accountId: string) {
    const acct = (accounts || []).find(a => a.id === accountId);
    const acctHoldings = (holdings || []).filter(h => h.accountId === accountId);
    const holdingsValue = acctHoldings.reduce((sum, h) => {
      const sec = secMap.get(h.securityId);
      const price = sec ? priceMap.get(sec.ticker) : null;
      return sum + (price ? h.shares * price.price : h.bookValue);
    }, 0);
    return holdingsValue + (acct?.cashBalance || 0);
  }

  function togglePortfolio(id: string) {
    setExpandedPortfolios(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openNewPortfolio() {
    setPortfolioForm({ name: '', description: '' });
    setPortfolioDialog({ open: true });
  }

  function openEditPortfolio(p: Portfolio) {
    setPortfolioForm({ name: p.name, description: p.description || '' });
    setPortfolioDialog({ open: true, editing: p });
  }

  async function savePortfolio() {
    if (!portfolioForm.name.trim()) return;
    if (portfolioDialog.editing) {
      await db.portfolios.update(portfolioDialog.editing.id, { name: portfolioForm.name, description: portfolioForm.description });
      toast({ title: 'Portfolio updated' });
    } else {
      await db.portfolios.add({ id: crypto.randomUUID(), name: portfolioForm.name, description: portfolioForm.description, createdAt: new Date().toISOString() });
      toast({ title: 'Portfolio created' });
    }
    setPortfolioDialog({ open: false });
  }

  async function deletePortfolio(id: string) {
    const acctIds = (accounts || []).filter(a => a.portfolioId === id).map(a => a.id);
    await db.transactions.where('accountId').anyOf(acctIds).delete();
    await db.holdings.where('accountId').anyOf(acctIds).delete();
    await db.accounts.where('portfolioId').equals(id).delete();
    await db.portfolios.delete(id);
    toast({ title: 'Portfolio deleted' });
  }

  function openNewAccount(portfolioId: string) {
    setAccountForm({ ...defaultAccountForm, portfolioId });
    setAccountDialog({ open: true, portfolioId });
  }

  function openEditAccount(a: Account) {
    setAccountForm({
      name: a.name, type: a.type, currency: a.currency,
      institution: a.institution || '', beneficiary: a.beneficiary || '',
      cashBalance: String(a.cashBalance), portfolioId: a.portfolioId,
    });
    setAccountDialog({ open: true, editing: a });
  }

  async function saveAccount() {
    if (!accountForm.name.trim()) return;
    const data = {
      name: accountForm.name, type: accountForm.type, currency: accountForm.currency,
      institution: accountForm.institution, beneficiary: accountForm.beneficiary,
      cashBalance: parseFloat(accountForm.cashBalance) || 0,
      portfolioId: accountForm.portfolioId,
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
    await db.transactions.where('accountId').equals(id).delete();
    await db.holdings.where('accountId').equals(id).delete();
    await db.accounts.delete(id);
    toast({ title: 'Account deleted' });
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolios</h1>
          <p className="text-muted-foreground text-sm">Manage portfolios and accounts</p>
        </div>
        <Button onClick={openNewPortfolio} size="sm" data-testid="button-new-portfolio">
          <Plus className="h-4 w-4 mr-1" /> New Portfolio
        </Button>
      </div>

      <div className="space-y-4">
        {(portfolios || []).length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No portfolios yet. Create one to get started.</p>
          </div>
        )}
        {(portfolios || []).map(portfolio => {
          const portAccounts = (accounts || []).filter(a => a.portfolioId === portfolio.id);
          const totalValue = portAccounts.reduce((s, a) => s + getAccountValue(a.id), 0);
          const expanded = expandedPortfolios.has(portfolio.id);
          return (
            <Card key={portfolio.id} data-testid={`card-portfolio-${portfolio.id}`}>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => togglePortfolio(portfolio.id)}
                    data-testid={`toggle-portfolio-${portfolio.id}`}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <CardTitle className="text-base">{portfolio.name}</CardTitle>
                      {portfolio.description && <p className="text-xs text-muted-foreground">{portfolio.description}</p>}
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(totalValue)}</p>
                      <p className="text-xs text-muted-foreground">{portAccounts.length} account{portAccounts.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPortfolio(portfolio)} data-testid={`button-edit-portfolio-${portfolio.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deletePortfolio(portfolio.id)} data-testid={`button-delete-portfolio-${portfolio.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              {expanded && (
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {portAccounts.map(acct => {
                      const value = getAccountValue(acct.id);
                      return (
                        <div key={acct.id} data-testid={`row-account-${acct.id}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                          <div className="flex items-center gap-3">
                            <Badge className={cn('text-xs border-0', ACCOUNT_TYPE_COLORS[acct.type] || 'bg-gray-100 text-gray-700')}>
                              {acct.type}
                            </Badge>
                            <div>
                              <p className="text-sm font-medium">{acct.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {acct.institution ? `${acct.institution} · ` : ''}{acct.currency}
                                {acct.beneficiary ? ` · ${acct.beneficiary}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold">{formatCurrency(value, acct.currency)}</p>
                              <p className="text-xs text-muted-foreground">Cash: {formatCurrency(acct.cashBalance, acct.currency)}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAccount(acct)} data-testid={`button-edit-account-${acct.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteAccount(acct.id)} data-testid={`button-delete-account-${acct.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => openNewAccount(portfolio.id)} data-testid={`button-add-account-${portfolio.id}`}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Portfolio Dialog */}
      <Dialog open={portfolioDialog.open} onOpenChange={o => setPortfolioDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{portfolioDialog.editing ? 'Edit Portfolio' : 'New Portfolio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-name">Name</Label>
              <Input id="portfolio-name" data-testid="input-portfolio-name" value={portfolioForm.name} onChange={e => setPortfolioForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Primary Portfolio" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-desc">Description (optional)</Label>
              <Input id="portfolio-desc" data-testid="input-portfolio-description" value={portfolioForm.description} onChange={e => setPortfolioForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortfolioDialog({ open: false })}>Cancel</Button>
            <Button onClick={savePortfolio} data-testid="button-save-portfolio">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Dialog */}
      <Dialog open={accountDialog.open} onOpenChange={o => setAccountDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accountDialog.editing ? 'Edit Account' : 'New Account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input data-testid="input-account-name" value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main RRSP" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={accountForm.type} onValueChange={v => setAccountForm(f => ({ ...f, type: v as Account['type'] }))}>
                  <SelectTrigger data-testid="select-account-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['RRSP', 'TFSA', 'RESP', 'Non-Registered', 'LIRA', 'FHSA'] as const).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={accountForm.currency} onValueChange={v => setAccountForm(f => ({ ...f, currency: v as 'CAD' | 'USD' }))}>
                  <SelectTrigger data-testid="select-account-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Institution</Label>
                <Input data-testid="input-account-institution" value={accountForm.institution} onChange={e => setAccountForm(f => ({ ...f, institution: e.target.value }))} placeholder="e.g. Questrade" />
              </div>
            </div>
            {accountForm.type === 'RESP' && (
              <div className="space-y-1.5">
                <Label>Beneficiary (Child Name)</Label>
                <Input data-testid="input-account-beneficiary" value={accountForm.beneficiary} onChange={e => setAccountForm(f => ({ ...f, beneficiary: e.target.value }))} placeholder="Child's name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Cash Balance</Label>
              <Input data-testid="input-account-cash" type="number" value={accountForm.cashBalance} onChange={e => setAccountForm(f => ({ ...f, cashBalance: e.target.value }))} />
            </div>
            {!accountDialog.editing && (
              <div className="space-y-1.5">
                <Label>Portfolio</Label>
                <Select value={accountForm.portfolioId} onValueChange={v => setAccountForm(f => ({ ...f, portfolioId: v }))}>
                  <SelectTrigger data-testid="select-account-portfolio"><SelectValue placeholder="Select portfolio" /></SelectTrigger>
                  <SelectContent>
                    {(portfolios || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog({ open: false })}>Cancel</Button>
            <Button onClick={saveAccount} data-testid="button-save-account">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
