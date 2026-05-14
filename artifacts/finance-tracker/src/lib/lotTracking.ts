import { type Transaction } from './db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaxLot {
  /** Unique id (purchaseDate + securityId + index) */
  lotId: string;
  securityId: string;
  ticker: string;
  accountId: string;
  purchaseDate: string;       // ISO date of the Buy tx
  purchaseTransactionId: string;
  sharesOriginal: number;
  sharesRemaining: number;    // shares not yet matched to a Sell
  costPerShare: number;       // adjusted cost per share (incl. commission)
  totalCost: number;          // sharesOriginal × costPerShare
  currency: 'CAD' | 'USD';
  holdingDays: number;        // days from purchaseDate to today
}

export interface LotDisposal {
  lotId: string;
  ticker: string;
  securityId: string;
  accountId: string;
  purchaseDate: string;
  saleDate: string;
  holdingDays: number;
  isLongTerm: boolean;        // > 365 days (informational — Canada uses ACB, not holding period)
  sharesSold: number;
  costPerShare: number;       // per-lot cost basis per share
  salePricePerShare: number;  // from the Sell transaction
  proceeds: number;
  acbRemoved: number;         // costPerShare × sharesSold (FIFO basis, not average cost)
  gainLoss: number;           // proceeds - acbRemoved
  saleTransactionId: string;
  currency: 'CAD' | 'USD';
  year: number;
}

export interface LotSummary {
  openLots: TaxLot[];
  disposals: LotDisposal[];
}

// ─── Core FIFO engine ─────────────────────────────────────────────────────────

/**
 * Compute FIFO tax lots for a single security across all accounts.
 * Returns open lots (unsold shares) and completed disposals (matched lots).
 *
 * NOTE: For Canadian tax reporting, use the ACB (average cost) method via
 * calculateRealizedGainsPerSell(). The FIFO disposals here are informational —
 * useful for US securities, tax-loss harvesting analysis, and holding period tracking.
 */
export function computeLots(
  transactions: Transaction[],
  securityId: string,
  ticker: string,
): LotSummary {
  const today = new Date();

  // Only this security's transactions, sorted oldest first
  const sorted = transactions
    .filter(t => t.securityId === securityId)
    .sort((a, b) => a.date.localeCompare(b.date));

  // FIFO queue: each entry is a mutable lot record
  type Lot = {
    lotId: string;
    purchaseDate: string;
    purchaseTransactionId: string;
    accountId: string;
    sharesOriginal: number;
    sharesRemaining: number;
    costPerShare: number;
    currency: 'CAD' | 'USD';
  };
  const queue: Lot[] = [];
  let lotIndex = 0;

  const disposals: LotDisposal[] = [];

  // Track ROC reductions per lot (simplified: apply proportionally to open lots)
  let totalSharesHeld = 0;
  let totalRocPending = 0;

  for (const tx of sorted) {
    if (tx.type === 'Buy' || tx.type === 'Reinvested Dividend') {
      const shares = tx.shares ?? 0;
      if (shares <= 0) continue;
      const rawCost = tx.amount + (tx.commission ?? 0);
      const costPerShare = shares > 0 ? rawCost / shares : 0;
      queue.push({
        lotId: `${securityId}-${tx.date}-${lotIndex++}`,
        purchaseDate: tx.date.split('T')[0]!,
        purchaseTransactionId: tx.id,
        accountId: tx.accountId,
        sharesOriginal: shares,
        sharesRemaining: shares,
        costPerShare,
        currency: tx.currency,
      });
      totalSharesHeld += shares;

    } else if (tx.type === 'Sell') {
      let sharesToSell = tx.shares ?? 0;
      if (sharesToSell <= 0) continue;
      const saleDate = tx.date.split('T')[0]!;
      const saleYear = Number(tx.date.substring(0, 4));
      const commission = tx.commission ?? 0;
      const grossProceeds = tx.amount;
      // Net sale price per share (commission deducted proportionally)
      const salePricePerShare = sharesToSell > 0
        ? (grossProceeds - commission) / sharesToSell
        : 0;

      while (sharesToSell > 1e-9 && queue.length > 0) {
        const lot = queue[0]!;
        const fromLot = Math.min(lot.sharesRemaining, sharesToSell);

        const purchaseDate = lot.purchaseDate;
        const purchaseMs = new Date(purchaseDate).getTime();
        const saleMs = new Date(saleDate).getTime();
        const holdingDays = Math.max(0, Math.round((saleMs - purchaseMs) / 86400000));

        const proceeds = fromLot * salePricePerShare;
        const acbRemoved = fromLot * lot.costPerShare;
        const gainLoss = proceeds - acbRemoved;

        disposals.push({
          lotId: lot.lotId,
          ticker,
          securityId,
          accountId: lot.accountId,
          purchaseDate,
          saleDate,
          holdingDays,
          isLongTerm: holdingDays > 365,
          sharesSold: fromLot,
          costPerShare: lot.costPerShare,
          salePricePerShare,
          proceeds,
          acbRemoved,
          gainLoss,
          saleTransactionId: tx.id,
          currency: lot.currency,
          year: saleYear,
        });

        lot.sharesRemaining -= fromLot;
        sharesToSell -= fromLot;
        totalSharesHeld -= fromLot;

        if (lot.sharesRemaining < 1e-9) {
          queue.shift();
        }
      }

    } else if (tx.type === 'Return of Capital') {
      // ROC reduces cost basis of open lots proportionally
      if (totalSharesHeld > 0) {
        totalRocPending += tx.amount;
        const rocPerShare = tx.amount / totalSharesHeld;
        for (const lot of queue) {
          const newCost = Math.max(0, lot.costPerShare - rocPerShare);
          lot.costPerShare = newCost;
        }
      }
    }
  }

  void totalRocPending;

  // Build open lot output
  const openLots: TaxLot[] = queue
    .filter(lot => lot.sharesRemaining > 1e-9)
    .map(lot => {
      const purchaseMs = new Date(lot.purchaseDate).getTime();
      const holdingDays = Math.max(0, Math.round((today.getTime() - purchaseMs) / 86400000));
      return {
        lotId: lot.lotId,
        securityId,
        ticker,
        accountId: lot.accountId,
        purchaseDate: lot.purchaseDate,
        purchaseTransactionId: lot.purchaseTransactionId,
        sharesOriginal: lot.sharesOriginal,
        sharesRemaining: lot.sharesRemaining,
        costPerShare: lot.costPerShare,
        totalCost: lot.sharesRemaining * lot.costPerShare,
        currency: lot.currency,
        holdingDays,
      };
    });

  return { openLots, disposals };
}

/**
 * Run the FIFO engine across all securities and aggregate results.
 */
export function computeAllLots(
  transactions: Transaction[],
  securities: Array<{ id: string; ticker: string }>,
): LotSummary {
  const allOpen: TaxLot[] = [];
  const allDisposals: LotDisposal[] = [];

  for (const sec of securities) {
    const { openLots, disposals } = computeLots(transactions, sec.id, sec.ticker);
    allOpen.push(...openLots);
    allDisposals.push(...disposals);
  }

  return { openLots: allOpen, disposals: allDisposals };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatHoldingPeriod(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const months = Math.round((days % 365) / 30);
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}
