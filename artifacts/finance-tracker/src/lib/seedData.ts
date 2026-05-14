import { db, type Account, type Portfolio, type Security, type Transaction, type Holding } from './db';

export async function seedData() {
  const portfoliosCount = await db.portfolios.count();
  if (portfoliosCount > 0) return; // Already seeded

  const p1Id = crypto.randomUUID();
  const p2Id = crypto.randomUUID();

  await db.portfolios.bulkAdd([
    { id: p1Id, name: 'Primary Portfolio', createdAt: new Date().toISOString() },
    { id: p2Id, name: 'Spousal Portfolio', createdAt: new Date().toISOString() }
  ]);

  const a1Id = crypto.randomUUID();
  const a2Id = crypto.randomUUID();
  const a3Id = crypto.randomUUID();
  const a4Id = crypto.randomUUID();

  await db.accounts.bulkAdd([
    { id: a1Id, portfolioId: p1Id, name: 'Main RRSP', type: 'RRSP', currency: 'CAD', institution: 'Questrade', cashBalance: 5200.50, createdAt: new Date().toISOString() },
    { id: a2Id, portfolioId: p1Id, name: 'Main TFSA', type: 'TFSA', currency: 'CAD', institution: 'Wealthsimple', cashBalance: 1500.00, createdAt: new Date().toISOString() },
    { id: a3Id, portfolioId: p1Id, name: 'US Margin', type: 'Non-Registered', currency: 'USD', institution: 'Interactive Brokers', cashBalance: 12000.00, createdAt: new Date().toISOString() },
    { id: a4Id, portfolioId: p2Id, name: 'Kids RESP', type: 'RESP', currency: 'CAD', beneficiary: 'Emma', institution: 'Wealthsimple', cashBalance: 400.00, createdAt: new Date().toISOString() },
  ]);

  const securities: Security[] = [
    { id: crypto.randomUUID(), ticker: 'XIU.TO', name: 'iShares S&P/TSX 60 Index ETF', type: 'ETF', currency: 'CAD', assetClass: 'Canadian Equity' },
    { id: crypto.randomUUID(), ticker: 'XAW.TO', name: 'iShares Core MSCI All Country World ex Canada', type: 'ETF', currency: 'CAD', assetClass: 'Global Equity' },
    { id: crypto.randomUUID(), ticker: 'ZAG.TO', name: 'BMO Aggregate Bond Index ETF', type: 'ETF', currency: 'CAD', assetClass: 'Fixed Income' },
    { id: crypto.randomUUID(), ticker: 'VCN.TO', name: 'Vanguard FTSE Canada All Cap Index ETF', type: 'ETF', currency: 'CAD', assetClass: 'Canadian Equity' },
    { id: crypto.randomUUID(), ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', currency: 'USD', assetClass: 'US Equity' },
    { id: crypto.randomUUID(), ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', type: 'ETF', currency: 'USD', assetClass: 'International Equity' },
    { id: crypto.randomUUID(), ticker: 'RY.TO', name: 'Royal Bank of Canada', type: 'Stock', currency: 'CAD', assetClass: 'Canadian Equity', sector: 'Financials' },
    { id: crypto.randomUUID(), ticker: 'TD.TO', name: 'Toronto-Dominion Bank', type: 'Stock', currency: 'CAD', assetClass: 'Canadian Equity', sector: 'Financials' },
    { id: crypto.randomUUID(), ticker: 'AAPL', name: 'Apple Inc.', type: 'Stock', currency: 'USD', assetClass: 'US Equity', sector: 'Technology' },
  ];

  await db.securities.bulkAdd(securities);

  // Generate some holdings and transactions to make it look active
  const tId1 = crypto.randomUUID();
  await db.transactions.bulkAdd([
    {
      id: crypto.randomUUID(),
      accountId: a1Id,
      securityId: securities[0].id,
      date: '2023-01-15T10:00:00Z',
      type: 'Buy',
      shares: 100,
      price: 30.50,
      amount: 3050.00,
      commission: 4.95,
      currency: 'CAD',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      accountId: a1Id,
      securityId: securities[1].id,
      date: '2023-02-20T10:00:00Z',
      type: 'Buy',
      shares: 200,
      price: 35.20,
      amount: 7040.00,
      commission: 4.95,
      currency: 'CAD',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      accountId: a3Id,
      securityId: securities[4].id,
      date: '2023-03-10T10:00:00Z',
      type: 'Buy',
      shares: 50,
      price: 200.00,
      amount: 10000.00,
      commission: 1.00,
      currency: 'USD',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      accountId: a3Id,
      securityId: securities[8].id,
      date: '2023-05-12T10:00:00Z',
      type: 'Buy',
      shares: 40,
      price: 150.00,
      amount: 6000.00,
      commission: 1.00,
      currency: 'USD',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      accountId: a2Id,
      securityId: securities[6].id,
      date: '2023-06-01T10:00:00Z',
      type: 'Buy',
      shares: 50,
      price: 120.00,
      amount: 6000.00,
      commission: 0,
      currency: 'CAD',
      approved: true,
      createdAt: new Date().toISOString()
    },
  ]);

  await db.holdings.bulkAdd([
    { id: crypto.randomUUID(), accountId: a1Id, securityId: securities[0].id, shares: 100, bookValue: 3054.95, averageCost: 30.5495, lastUpdated: new Date().toISOString() },
    { id: crypto.randomUUID(), accountId: a1Id, securityId: securities[1].id, shares: 200, bookValue: 7044.95, averageCost: 35.22475, lastUpdated: new Date().toISOString() },
    { id: crypto.randomUUID(), accountId: a3Id, securityId: securities[4].id, shares: 50, bookValue: 10001.00, averageCost: 200.02, lastUpdated: new Date().toISOString() },
    { id: crypto.randomUUID(), accountId: a3Id, securityId: securities[8].id, shares: 40, bookValue: 6001.00, averageCost: 150.025, lastUpdated: new Date().toISOString() },
    { id: crypto.randomUUID(), accountId: a2Id, securityId: securities[6].id, shares: 50, bookValue: 6000.00, averageCost: 120.00, lastUpdated: new Date().toISOString() },
  ]);

  // Mock Prices
  await db.priceCache.bulkAdd([
    { ticker: 'XIU.TO', price: 34.12, change: 0.15, changePercent: 0.44, currency: 'CAD', lastFetched: new Date().toISOString() },
    { ticker: 'XAW.TO', price: 39.80, change: 0.25, changePercent: 0.63, currency: 'CAD', lastFetched: new Date().toISOString() },
    { ticker: 'VTI', price: 260.45, change: 1.20, changePercent: 0.46, currency: 'USD', lastFetched: new Date().toISOString() },
    { ticker: 'RY.TO', price: 135.50, change: -0.50, changePercent: -0.37, currency: 'CAD', lastFetched: new Date().toISOString() },
    { ticker: 'AAPL', price: 175.20, change: 2.10, changePercent: 1.21, currency: 'USD', lastFetched: new Date().toISOString() },
  ]);
}
