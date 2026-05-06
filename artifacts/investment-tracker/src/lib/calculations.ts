import { type Transaction, type Holding } from './db';

export function calculateACB(transactions: Transaction[]): { shares: number; bookValue: number; averageCost: number } {
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
        bookValue -= (averageCost * s);
        shares -= s;
      }
    } else if (t.type === 'Return of Capital') {
      bookValue -= t.amount;
      if (bookValue < 0) bookValue = 0;
    }
  }

  if (shares < 0.0001) {
    shares = 0;
    bookValue = 0;
  }

  return {
    shares,
    bookValue,
    averageCost: shares > 0 ? bookValue / shares : 0,
  };
}

export type RealizedGainRow = {
  securityId: string;
  ticker: string;
  date: string;
  year: number;
  proceeds: number;
  acbRemoved: number;
  gain: number;
};

// Per-sell ACB capital gains tracking (Canadian ACB method).
// Processes all transactions for each security across all accounts and returns one row per Sell.
export function calculateRealizedGainsPerSell(
  transactions: Transaction[],
  securityId: string,
  ticker: string,
): RealizedGainRow[] {
  const sorted = [...transactions]
    .filter(t => t.securityId === securityId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let shares = 0;
  let bookValue = 0;
  const rows: RealizedGainRow[] = [];

  for (const t of sorted) {
    if (t.type === 'Buy' || t.type === 'Reinvested Dividend') {
      shares += (t.shares || 0);
      bookValue += t.amount + (t.commission || 0);
    } else if (t.type === 'Sell') {
      const s = t.shares || 0;
      if (shares > 0 && s > 0) {
        const avg = bookValue / shares;
        const acbRemoved = avg * s;
        const proceeds = t.amount - (t.commission || 0);
        const gain = proceeds - acbRemoved;
        rows.push({
          securityId,
          ticker,
          date: t.date.split('T')[0]!,
          year: Number(t.date.substring(0, 4)),
          proceeds,
          acbRemoved,
          gain,
        });
        bookValue -= acbRemoved;
        shares -= s;
        if (shares < 1e-9) { shares = 0; bookValue = 0; }
      }
    } else if (t.type === 'Return of Capital') {
      bookValue = Math.max(0, bookValue - t.amount);
    }
  }

  return rows;
}

export function calculateRealizedGains(transactions: Transaction[]): { shortTerm: number; longTerm: number; total: number } {
  let total = 0;
  let shares = 0;
  let bookValue = 0;

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const t of sorted) {
    if (t.type === 'Buy' || t.type === 'Reinvested Dividend') {
      shares += (t.shares || 0);
      bookValue += t.amount + (t.commission || 0);
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
      bookValue = Math.max(0, bookValue - t.amount);
    }
  }

  return { shortTerm: 0, longTerm: total, total };
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

export function calculateModifiedDietz(
  transactions: Transaction[],
  startValue: number,
  endValue: number,
  startDate: string,
  endDate: string,
): number {
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

  return ((endValue - startValue - netCashFlows) / adjustedStart) * 100;
}

export function calculateTWR(periodReturns: number[]): number {
  if (periodReturns.length === 0) return 0;
  let compound = 1;
  for (const r of periodReturns) {
    compound *= (1 + r / 100);
  }
  return (compound - 1) * 100;
}

// XIRR — annualized Internal Rate of Return (money-weighted).
// flows: array of { date, amount } where negative = outflow (investment), positive = inflow (current value or withdrawal).
export function xirr(flows: Array<{ date: Date; amount: number }>, guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const t0 = flows[0]!.date.getTime();
  const years = (d: Date) => (d.getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);
  const npv = (rate: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, years(f.date)), 0);
  const dnpv = (rate: number) =>
    flows.reduce((s, f) => {
      const t = years(f.date);
      return s - (t * f.amount) / Math.pow(1 + rate, t + 1);
    }, 0);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const v = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(d) < 1e-12) break;
    const next = rate - v / d;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
    if (rate < -0.999) rate = -0.999;
  }
  return Math.abs(npv(rate)) < 1 ? rate : null;
}

// Build cashflows for XIRR from transaction list.
// Contributions/buys are outflows (negative), current portfolio value is inflow (positive).
export function buildXirrFlows(
  transactions: Transaction[],
  currentValue: number,
): Array<{ date: Date; amount: number }> {
  const flows: Array<{ date: Date; amount: number }> = [];

  for (const t of transactions) {
    if (t.type === 'Contribution' || t.type === 'Transfer In') {
      flows.push({ date: new Date(t.date), amount: -Math.abs(t.amount) });
    } else if (t.type === 'Buy') {
      flows.push({ date: new Date(t.date), amount: -Math.abs(t.amount) });
    } else if (t.type === 'Sell' || t.type === 'Withdrawal' || t.type === 'Transfer Out') {
      flows.push({ date: new Date(t.date), amount: Math.abs(t.amount) });
    } else if (t.type === 'Dividend' || t.type === 'Interest' || t.type === 'Distribution') {
      flows.push({ date: new Date(t.date), amount: Math.abs(t.amount) });
    }
  }

  if (flows.length === 0 || currentValue <= 0) return [];

  // Add terminal value as inflow at today
  flows.push({ date: new Date(), amount: currentValue });

  // Sort by date ascending
  flows.sort((a, b) => a.date.getTime() - b.date.getTime());

  return flows;
}
