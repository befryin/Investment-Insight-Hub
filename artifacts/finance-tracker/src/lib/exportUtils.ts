import { LedgerTransaction, ExpenseCategory, Account } from './db';
import Papa from 'papaparse';

export function exportCSV(transactions: LedgerTransaction[], categories: ExpenseCategory[], account?: Account) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  
  const data = transactions.map(t => ({
    Date: t.date,
    Account: account ? account.name : 'Unknown',
    Payee: t.payee,
    Amount: t.amount,
    Category: t.categoryId ? catMap.get(t.categoryId)?.name || 'Uncategorized' : (t.isSplit ? 'Split' : (t.transferAccountId ? 'Transfer' : 'Uncategorized')),
    Memo: t.memo || '',
    Status: t.status
  }));

  const csv = Papa.unparse(data);
  downloadFile(csv, `export_${account ? account.name.replace(/\s+/g, '_') : 'all'}_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

export function exportQIF(transactions: LedgerTransaction[], categories: ExpenseCategory[], account: Account) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  
  let qif = `!Type:${account.type === 'Credit Card' ? 'CCard' : 'Bank'}\n`;
  
  for (const t of transactions) {
    const [year, month, day] = t.date.split('-');
    // QIF Date format usually DD/MM/YYYY or MM/DD/YYYY. Let's use YYYY-MM-DD for simplicity, most parsers handle it, or MM/DD/YYYY
    qif += `D${month}/${day}/${year}\n`;
    qif += `T${t.amount}\n`;
    qif += `P${t.payee}\n`;
    if (t.memo) qif += `M${t.memo}\n`;
    const cat = t.categoryId ? catMap.get(t.categoryId)?.name || 'Uncategorized' : (t.isSplit ? 'Split' : 'Transfer');
    qif += `L${cat}\n`;
    if (t.status === 'cleared' || t.status === 'reconciled') {
      qif += `C${t.status === 'reconciled' ? 'R' : 'c'}\n`;
    }
    qif += `^\n`;
  }

  downloadFile(qif, `export_${account.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.qif`, 'application/qif');
}

export function exportOFX(transactions: LedgerTransaction[], account: Account) {
  // A basic OFX 1.0.2 / SGML format
  const now = new Date();
  const dtserver = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}120000`;
  
  let ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS>
        <CODE>0
        <SEVERITY>INFO
      </STATUS>
      <DTSERVER>${dtserver}
      <LANGUAGE>ENG
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>1
      <STATUS>
        <CODE>0
        <SEVERITY>INFO
      </STATUS>
      <STMTRS>
        <CURDEF>${account.currency}
        <BANKACCTFROM>
          <BANKID>123456
          <ACCTID>${account.id}
          <ACCTTYPE>${account.type === 'Checking' ? 'CHECKING' : 'SAVINGS'}
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>${dtserver}
          <DTEND>${dtserver}
`;

  for (const t of transactions) {
    const dtf = t.date.replace(/-/g, '') + '120000';
    ofx += `          <STMTTRN>
            <TRNTYPE>${t.amount >= 0 ? 'CREDIT' : 'DEBIT'}
            <DTPOSTED>${dtf}
            <TRNAMT>${t.amount}
            <FITID>${t.id}
            <NAME>${escapeXML(t.payee)}
            ${t.memo ? `<MEMO>${escapeXML(t.memo)}` : ''}
          </STMTTRN>\n`;
  }

  ofx += `        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>${account.cashBalance}
          <DTASOF>${dtserver}
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

  downloadFile(ofx, `export_${account.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.ofx`, 'application/x-ofx');
}

function escapeXML(str: string) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
