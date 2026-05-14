import { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { exportCSV, exportQIF, exportOFX } from '@/lib/exportUtils';
import { Download, FileSpreadsheet, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useLiveQuery } from 'dexie-react-hooks';

export default function ExpenseExport() {
  const [selectedAccountId, setSelectedAccountId] = useState('all');

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []);
  const transactions = useLiveQuery(() => db.ledgerTransactions.toArray(), []);

  const bankingAccounts = useMemo(() => {
    return (accounts || []).filter(a => ['Checking', 'Savings', 'Credit Card', 'Cash', 'Line of Credit'].includes(a.type as string));
  }, [accounts]);

  function doExport(format: 'CSV' | 'QIF' | 'OFX') {
    if (!transactions || !categories || !accounts) return;

    let txsToExport = transactions;
    let acct = undefined;

    if (selectedAccountId !== 'all') {
      txsToExport = transactions.filter(t => t.accountId === selectedAccountId);
      acct = bankingAccounts.find(a => a.id === selectedAccountId);
    }

    if (format === 'CSV') {
      exportCSV(txsToExport, categories, acct);
    } else if (format === 'QIF' && acct) {
      exportQIF(txsToExport, categories, acct);
    } else if (format === 'OFX' && acct) {
      exportOFX(txsToExport, acct);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Export Everyday Transactions</h1>
        <p className="text-muted-foreground text-sm">Download your ledger data in CSV, QIF, or OFX formats.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-3 max-w-sm">
            <Label>Select Account to Export</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {bankingAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Note: QIF and OFX formats require exporting a single account at a time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div className="space-y-3 text-center p-4 border rounded-lg bg-muted/20">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">CSV Format</h3>
              <p className="text-xs text-muted-foreground">Standard comma-separated values. Best for Excel or Google Sheets.</p>
              <Button onClick={() => doExport('CSV')} className="w-full" disabled={!transactions || transactions.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>

            <div className="space-y-3 text-center p-4 border rounded-lg bg-muted/20">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <FileCode2 className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">QIF Format</h3>
              <p className="text-xs text-muted-foreground">Quicken Interchange Format. Broadly supported by finance apps.</p>
              <Button onClick={() => doExport('QIF')} className="w-full" disabled={selectedAccountId === 'all' || !transactions || transactions.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export QIF
              </Button>
            </div>

            <div className="space-y-3 text-center p-4 border rounded-lg bg-muted/20">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto">
                <FileCode2 className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">OFX Format</h3>
              <p className="text-xs text-muted-foreground">Open Financial Exchange. The standard format for bank statements.</p>
              <Button onClick={() => doExport('OFX')} className="w-full" disabled={selectedAccountId === 'all' || !transactions || transactions.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export OFX
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
