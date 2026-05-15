import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Download, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const { toast } = useToast();
  const [clearDialog, setClearDialog] = useState(false);
  const [clearing, setClearing] = useState(false);
  
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const [incomeAccounts, setIncomeAccounts] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('finhub_income_accounts');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  useEffect(() => {
    if (accounts && !localStorage.getItem('finhub_income_accounts')) {
      const nonReg = accounts.filter(a => a.type === 'Non-Registered').map(a => a.id);
      setIncomeAccounts(nonReg);
    }
  }, [accounts]);

  const toggleIncomeAccount = (id: string) => {
    const newAccounts = incomeAccounts.includes(id) 
      ? incomeAccounts.filter(a => a !== id)
      : [...incomeAccounts, id];
    setIncomeAccounts(newAccounts);
    localStorage.setItem('finhub_income_accounts', JSON.stringify(newAccounts));
  };

  async function exportBackup() {
    const data = {
      portfolios: await db.portfolios.toArray(),
      accounts: await db.accounts.toArray(),
      securities: await db.securities.toArray(),
      transactions: await db.transactions.toArray(),
      holdings: await db.holdings.toArray(),
      contributionRecords: await db.contributionRecords.toArray(),
      distributionImports: await db.distributionImports.toArray(),
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folio-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Backup exported' });
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.portfolios || !data.accounts || !data.transactions) {
        toast({ title: 'Invalid backup file', variant: 'destructive' });
        return;
      }
      await db.portfolios.bulkPut(data.portfolios);
      await db.accounts.bulkPut(data.accounts);
      await db.securities.bulkPut(data.securities || []);
      await db.transactions.bulkPut(data.transactions);
      await db.holdings.bulkPut(data.holdings || []);
      await db.contributionRecords.bulkPut(data.contributionRecords || []);
      await db.distributionImports.bulkPut(data.distributionImports || []);
      toast({ title: 'Backup restored successfully' });
    } catch {
      toast({ title: 'Error importing backup', variant: 'destructive' });
    }
  }

  async function clearAllData() {
    setClearing(true);
    try {
      await db.portfolios.clear();
      await db.accounts.clear();
      await db.securities.clear();
      await db.transactions.clear();
      await db.holdings.clear();
      await db.contributionRecords.clear();
      await db.priceCache.clear();
      await db.distributionImports.clear();
      toast({ title: 'All data cleared' });
      setClearDialog(false);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">App configuration and data management</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">About Folio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Storage</span>
            <span className="font-medium">Browser IndexedDB (local only)</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Data Privacy</span>
            <span className="font-medium">All data stays on your device</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Market Data</span>
            <span className="font-medium">Yahoo Finance (15-min delay)</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Currency</span>
            <span className="font-medium">CAD primary, USD supported</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Version</span>
            <span className="font-medium">1.0.0</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registered Account Room</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Enter your known contribution room from CRA MyAccount for accurate tracking.</p>
          <div className="grid grid-cols-3 gap-4">
            {(['RRSP', 'TFSA', 'RESP'] as const).map(type => {
              const storageKey = `folio_room_${type.toLowerCase()}`;
              const [val, setVal] = useState(() => localStorage.getItem(storageKey) || '');
              return (
                <div key={type} className="space-y-1.5">
                  <Label className="text-xs">{type} Room ($)</Label>
                  <Input
                    type="number"
                    data-testid={`input-room-${type.toLowerCase()}`}
                    value={val}
                    onChange={e => {
                      setVal(e.target.value);
                      localStorage.setItem(storageKey, e.target.value);
                    }}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dashboard Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Income Tracking Accounts</p>
            <p className="text-xs text-muted-foreground mb-3">Select which accounts to include when calculating the "Total Income" KPI on the Overview Dashboard.</p>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
              {(accounts || []).map(acc => (
                <div key={acc.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`acc-${acc.id}`}
                    checked={incomeAccounts.includes(acc.id)}
                    onChange={() => toggleIncomeAccount(acc.id)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor={`acc-${acc.id}`} className="text-sm cursor-pointer">{acc.name} ({acc.type})</Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Export Backup</p>
              <p className="text-xs text-muted-foreground">Download all your data as a JSON file</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportBackup} data-testid="button-export-backup">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Import Backup</p>
              <p className="text-xs text-muted-foreground">Restore from a previously exported JSON backup</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => document.getElementById('backup-import')?.click()} data-testid="button-import-backup">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
            </Button>
          </div>
          <input id="backup-import" type="file" accept=".json" className="hidden"
            onChange={e => { if (e.target.files?.[0]) importBackup(e.target.files[0]); }} />
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-destructive">Clear All Data</p>
              <p className="text-xs text-muted-foreground">Permanently delete all portfolios, accounts, and transactions</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setClearDialog(true)} data-testid="button-clear-data">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tax Information (Canada)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Capital gains inclusion rate: 50% (on first $250,000/yr for individuals; 2/3 above threshold as of 2024 budget proposals — verify with CRA).</p>
          <p>TFSA annual limit: $7,000 (2024). Cumulative room since 2009 for eligible Canadians: $95,000.</p>
          <p>RRSP limit: 18% of prior year earned income, up to $31,560 (2024).</p>
          <p>RESP lifetime contribution limit: $50,000 per beneficiary. CESG: 20% on first $2,500/yr = $500/yr, lifetime max $7,200.</p>
          <p className="text-xs">This app is for tracking purposes only. Consult a tax professional for advice.</p>
        </CardContent>
      </Card>

      <Dialog open={clearDialog} onOpenChange={setClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Clear All Data
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete all portfolios, accounts, securities, transactions, holdings, and contribution records. This action cannot be undone. Export a backup first if you want to keep your data.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={clearAllData} disabled={clearing} data-testid="button-confirm-clear">
              {clearing ? 'Clearing...' : 'Yes, Delete Everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
