import Dexie, { type EntityTable } from 'dexie';

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  portfolioId: string;
  name: string;
  type: 'RRSP' | 'TFSA' | 'RESP' | 'Non-Registered' | 'LIRA' | 'FHSA';
  currency: 'CAD' | 'USD';
  institution?: string;
  beneficiary?: string; // for RESP — child name
  cashBalance: number;
  createdAt: string;
}

export interface Security {
  id: string;
  ticker: string;
  name: string;
  type: 'Stock' | 'ETF' | 'Mutual Fund' | 'Bond' | 'GIC' | 'Cash' | 'Other';
  currency: 'CAD' | 'USD';
  exchange?: string;
  sector?: string;
  assetClass?: string; // e.g. Canadian Equity, US Equity, Fixed Income, Real Estate
}

export interface Transaction {
  id: string;
  accountId: string;
  securityId?: string; // null for cash transactions
  date: string; // ISO date
  type: 'Buy' | 'Sell' | 'Dividend' | 'Interest' | 'Contribution' | 'Withdrawal' | 'Transfer In' | 'Transfer Out' | 'Distribution' | 'Return of Capital' | 'Capital Gain Distribution' | 'Fee' | 'Reinvested Dividend';
  shares?: number;
  price?: number; // per share
  amount: number; // total dollar amount (always positive)
  commission?: number;
  currency: 'CAD' | 'USD';
  notes?: string;
  distributionClassification?: 'Dividend' | 'Capital Gain' | 'Return of Capital' | 'Foreign Income' | 'Other Income';
  taxYear?: number;
  approved: boolean; // for pending distribution imports
  importBatch?: string;
  createdAt: string;
}

export interface Holding {
  id: string;
  accountId: string;
  securityId: string;
  shares: number;
  bookValue: number; // ACB (Adjusted Cost Base) in account currency
  averageCost: number; // per share
  lastUpdated: string;
}

export interface ContributionRecord {
  id: string;
  accountId: string;
  year: number;
  type: 'RRSP' | 'TFSA' | 'RESP';
  amount: number;
  date: string;
  beneficiary?: string; // for RESP
}

export interface PriceCache {
  ticker: string;
  price: number;
  currency: 'CAD' | 'USD';
  change: number;
  changePercent: number;
  lastFetched: string;
}

export interface DistributionImport {
  id: string;
  ticker: string;
  exDate: string;
  payDate?: string;
  totalAmount: number;
  breakdown: {
    dividend?: number;
    capitalGain?: number;
    returnOfCapital?: number;
    foreignIncome?: number;
    otherIncome?: number;
  };
  status: 'pending' | 'approved' | 'rejected';
  importedAt: string;
}

class FolioDB extends Dexie {
  portfolios!: EntityTable<Portfolio, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  securities!: EntityTable<Security, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  contributionRecords!: EntityTable<ContributionRecord, 'id'>;
  priceCache!: EntityTable<PriceCache, 'ticker'>;
  distributionImports!: EntityTable<DistributionImport, 'id'>;

  constructor() {
    super('FolioDB');
    this.version(1).stores({
      portfolios: 'id, name',
      accounts: 'id, portfolioId, type',
      securities: 'id, ticker, type',
      transactions: 'id, accountId, securityId, date, type, approved',
      holdings: 'id, accountId, securityId',
      contributionRecords: 'id, accountId, year, type',
      priceCache: 'ticker',
      distributionImports: 'id, ticker, status',
    });
  }
}

export const db = new FolioDB();
