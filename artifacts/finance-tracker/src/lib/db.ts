import Dexie, { type EntityTable } from 'dexie';

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  portfolioId: string; // can be 'default' for everyday banking if portfolios are only for investments
  name: string;
  type: 'RRSP' | 'TFSA' | 'RESP' | 'Non-Registered' | 'LIRA' | 'FHSA' | 'Checking' | 'Savings' | 'Credit Card' | 'Cash' | 'Line of Credit';
  currency: 'CAD' | 'USD';
  institution?: string;
  beneficiary?: string; // for RESP — child name
  cashBalance: number; // for banking accounts, this is the main balance
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

export interface ExpenseCategory {
  id: string;
  name: string;
  group: string; // e.g., "Housing", "Food", "Income"
  type: 'Expense' | 'Income' | 'Transfer';
  isSystem?: boolean; // system categories like "Transfer" cannot be deleted
}

export interface LedgerTransaction {
  id: string;
  accountId: string; // references Account.id
  date: string; // ISO date
  payee: string;
  amount: number; // positive for income, negative for expenses
  categoryId?: string; // references ExpenseCategory.id (null if split)
  isSplit: boolean;
  memo?: string;
  tags: string[]; // Array of tag names
  status: 'cleared' | 'pending' | 'reconciled';
  transferAccountId?: string; // If it's a transfer to another account
  importId?: string; // To prevent duplicate imports
  createdAt: string;
}

export interface LedgerSplit {
  id: string;
  transactionId: string; // references LedgerTransaction.id
  categoryId: string; // references ExpenseCategory.id
  amount: number;
  memo?: string;
}

export interface AutoCategoryRule {
  id: string;
  matchField: 'payee' | 'memo';
  matchType: 'contains' | 'exact' | 'regex';
  matchValue: string;
  assignCategoryId: string;
  priority: number;
}

class FinanceHubDB extends Dexie {
  portfolios!: EntityTable<Portfolio, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  securities!: EntityTable<Security, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  contributionRecords!: EntityTable<ContributionRecord, 'id'>;
  priceCache!: EntityTable<PriceCache, 'ticker'>;
  distributionImports!: EntityTable<DistributionImport, 'id'>;
  
  // Expense Tracking additions
  expenseCategories!: EntityTable<ExpenseCategory, 'id'>;
  ledgerTransactions!: EntityTable<LedgerTransaction, 'id'>;
  ledgerSplits!: EntityTable<LedgerSplit, 'id'>;
  autoCategoryRules!: EntityTable<AutoCategoryRule, 'id'>;

  constructor() {
    super('FinanceHubDB');
    this.version(1).stores({
      portfolios: 'id, name',
      accounts: 'id, portfolioId, type',
      securities: 'id, ticker, type',
      transactions: 'id, accountId, securityId, date, type, approved',
      holdings: 'id, accountId, securityId',
      contributionRecords: 'id, accountId, year, type',
      priceCache: 'ticker',
      distributionImports: 'id, ticker, status',
      expenseCategories: 'id, group, type',
      ledgerTransactions: 'id, accountId, date, categoryId, *tags, transferAccountId, importId',
      ledgerSplits: 'id, transactionId, categoryId',
      autoCategoryRules: 'id, priority',
    });
  }
}

export const db = new FinanceHubDB();
