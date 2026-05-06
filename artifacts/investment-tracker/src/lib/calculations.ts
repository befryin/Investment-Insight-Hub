import { type Transaction, type Holding } from './db';

export function calculateACB(transactions: Transaction[]): { shares: number; bookValue: number; averageCost: number } {
  let shares = 0;
  let bookValue = 0;

  // Sort chronologically
  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const t of sorted) {
    if (t.type === 'Buy' || t.type === 'Reinvested Dividend') {
      const s = t.shares || 0;
      const cost = t.amount + (t.commission || 0);
      shares += s;
      bookValue += cost;
    } else if (t.type === 'Sell') {
      const s = t.shares || 0;
      if (shares > 0) {
        const averageCost = bookValue / shares;
        bookValue -= (averageCost * s);
        shares -= s;
      }
    } else if (t.type === 'Return of Capital') {
      bookValue -= t.amount;
    }
  }

  if (shares < 0.0001) {
    shares = 0;
    bookValue = 0;
  }

  return {
    shares,
    bookValue,
    averageCost: shares > 0 ? bookValue / shares : 0
  };
}

export function calculateRealizedGains(transactions: Transaction[]): { shortTerm: number; longTerm: number; total: number } {
  // Simplistic implementation for tracking realized gains based on ACB
  let total = 0;
  let shares = 0;
  let bookValue = 0;

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const t of sorted) {
    if (t.type === 'Buy' || t.type === 'Reinvested Dividend') {
      const s = t.shares || 0;
      const cost = t.amount + (t.commission || 0);
      shares += s;
      bookValue += cost;
    } else if (t.type === 'Sell') {
      const s = t.shares || 0;
      if (shares > 0) {
        const averageCost = bookValue / shares;
        const acbRemoved = averageCost * s;
        const proceeds = t.amount - (t.commission || 0);
        total += (proceeds - acbRemoved);
        
        bookValue -= acbRemoved;
        shares -= s;
      }
    } else if (t.type === 'Return of Capital') {
      bookValue -= t.amount;
    }
  }

  return { shortTerm: 0, longTerm: total, total }; // Simplified classification
}

export function calculateUnrealizedGain(holding: Holding, currentPrice: number): { gain: number; gainPercent: number } {
  const marketValue = holding.shares * currentPrice;
  const gain = marketValue - holding.bookValue;
  const gainPercent = holding.bookValue > 0 ? (gain / holding.bookValue) * 100 : 0;
  return { gain, gainPercent };
}

export function calculateDollarGainLoss(bookValue: number, marketValue: number): { dollar: number; percent: number } {
  const dollar = marketValue - bookValue;
  const percent = bookValue > 0 ? (dollar / bookValue) * 100 : 0;
  return { dollar, percent };
}

// Simplified Modified Dietz
export function calculateModifiedDietz(transactions: Transaction[], startValue: number, endValue: number, startDate: string, endDate: string): number {
  let netCashFlows = 0;
  let timeWeightedCashFlows = 0;
  
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const totalDays = (end - start) / (1000 * 60 * 60 * 24);

  if (totalDays <= 0) return 0;

  for (const t of transactions) {
    if (t.type === 'Contribution' || t.type === 'Transfer In') {
      netCashFlows += t.amount;
      const tDate = new Date(t.date).getTime();
      const weight = Math.max(0, (end - tDate) / (1000 * 60 * 60 * 24)) / totalDays;
      timeWeightedCashFlows += t.amount * weight;
    } else if (t.type === 'Withdrawal' || t.type === 'Transfer Out') {
      netCashFlows -= t.amount;
      const tDate = new Date(t.date).getTime();
      const weight = Math.max(0, (end - tDate) / (1000 * 60 * 60 * 24)) / totalDays;
      timeWeightedCashFlows -= t.amount * weight;
    }
  }

  const adjustedStart = startValue + timeWeightedCashFlows;
  if (adjustedStart === 0) return 0;

  const return_val = (endValue - startValue - netCashFlows) / adjustedStart;
  return return_val * 100;
}

export function calculateTWR(periodReturns: number[]): number {
  if (periodReturns.length === 0) return 0;
  let compound = 1;
  for (const r of periodReturns) {
    compound *= (1 + r / 100);
  }
  return (compound - 1) * 100;
}
