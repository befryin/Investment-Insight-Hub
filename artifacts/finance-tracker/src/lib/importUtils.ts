import Papa from 'papaparse';

export type ParsedTransaction = {
  date: string; // YYYY-MM-DD
  amount: number;
  payee: string;
  memo?: string;
  category?: string;
};

export async function parseFile(file: File): Promise<ParsedTransaction[]> {
  const text = await file.text();
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Attempt generic mapping for CSV
          const data = results.data as Record<string, string>[];
          const txs: ParsedTransaction[] = [];
          data.forEach(row => {
            const rowKeys = Object.keys(row).map(k => k.toLowerCase());
            
            // Find columns
            const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('date'));
            const payeeKey = Object.keys(row).find(k => /payee|description|name|title/i.test(k));
            const amountKey = Object.keys(row).find(k => /amount|value|total/i.test(k));
            const memoKey = Object.keys(row).find(k => /memo|notes/i.test(k));

            if (dateKey && amountKey) {
              const amountRaw = row[amountKey]?.replace(/[$,]/g, '');
              const amount = parseFloat(amountRaw);
              if (!isNaN(amount)) {
                // Try to parse date
                const dateRaw = row[dateKey];
                const date = new Date(dateRaw).toISOString().split('T')[0];
                if (date && date !== 'NaN-NaN-NaN') {
                  txs.push({
                    date,
                    amount,
                    payee: payeeKey ? row[payeeKey] : 'Unknown Payee',
                    memo: memoKey ? row[memoKey] : undefined,
                  });
                }
              }
            }
          });
          resolve(txs);
        },
        error: reject,
      });
    });
  } else if (ext === 'qif') {
    // Basic QIF parser
    const txs: ParsedTransaction[] = [];
    let current: Partial<ParsedTransaction> = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      const type = line[0];
      const val = line.substring(1).trim();
      
      if (type === '^') {
        if (current.date && current.amount !== undefined) {
          txs.push(current as ParsedTransaction);
        }
        current = {};
      } else if (type === 'D') {
        current.date = new Date(val).toISOString().split('T')[0];
      } else if (type === 'T' || type === 'U') {
        current.amount = parseFloat(val.replace(/[$,]/g, ''));
      } else if (type === 'P') {
        current.payee = val;
      } else if (type === 'M') {
        current.memo = val;
      } else if (type === 'L') {
        current.category = val;
      }
    }
    return txs;
  } else if (ext === 'ofx' || ext === 'qfx') {
    // Basic OFX parser (regex based for simplicity)
    const txs: ParsedTransaction[] = [];
    const txMatches = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g);
    if (txMatches) {
      for (const tx of txMatches) {
        const dateMatch = tx.match(/<DTPOSTED>(\d{8})/);
        const amountMatch = tx.match(/<TRNAMT>([-\d.]+)/);
        const payeeMatch = tx.match(/<NAME>(.*?)(\r|\n|<)/);
        const memoMatch = tx.match(/<MEMO>(.*?)(\r|\n|<)/);
        
        if (dateMatch && amountMatch) {
          const d = dateMatch[1];
          const date = `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;
          txs.push({
            date,
            amount: parseFloat(amountMatch[1]),
            payee: payeeMatch ? payeeMatch[1].trim() : 'Unknown',
            memo: memoMatch ? memoMatch[1].trim() : undefined,
          });
        }
      }
    }
    return txs;
  }
  
  throw new Error('Unsupported file format');
}
