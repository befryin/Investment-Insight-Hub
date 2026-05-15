import Papa from 'papaparse';

export interface ColumnMapping {
  date: string;
  type: string;
  amount: string;
  ticker?: string;
  shares?: string;
  price?: string;
  commission?: string;
  notes?: string;
  currency?: string;
  classification?: string;
}

export function parseCSV(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        resolve({ headers, rows: results.data as Record<string, string>[] });
      },
      error: (error) => reject(error),
    });
  });
}

export function parseDate(value: string): string | null {
  if (!value) return null;
  value = value.trim();
  
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];

  for (const fmt of formats) {
    const m = value.match(fmt);
    if (m) {
      if (m[1].length === 4) {
        const isoStr = `${m[1]}-${m[2]}-${m[3]}`;
        if (!isNaN(new Date(isoStr).getTime())) return isoStr;
      } else {
        const iso1 = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
        const iso2 = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        
        const is1Valid = !isNaN(new Date(iso1).getTime()) && Number(m[1]) <= 12;
        const is2Valid = !isNaN(new Date(iso2).getTime()) && Number(m[2]) <= 12;

        if (is1Valid && !is2Valid) return iso1;
        if (is2Valid && !is1Valid) return iso2;
        if (is1Valid && is2Valid) return iso1; // Default to MM/DD/YYYY if ambiguous
      }
    }
  }

  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

export function exportToCSV(data: Record<string, unknown>[], columns: string[], filename: string): void {
  const rows = data.map(row => {
    const out: Record<string, unknown> = {};
    for (const col of columns) out[col] = row[col] ?? '';
    return out;
  });
  const csv = Papa.unparse(rows, { columns });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatCurrency(amount: number, currency: 'CAD' | 'USD' = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number, showSign = true): string {
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
