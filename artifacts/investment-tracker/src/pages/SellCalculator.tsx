import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatPercent } from '@/lib/csvUtils';
import { calculateACB } from '@/lib/calculations';
import { computeLots, formatHoldingPeriod } from '@/lib/lotTracking';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Calculator, TrendingDown, DollarSign, Percent, AlertTriangle, Info } from 'lucide-react';

// Canadian combined federal + provincial top marginal rates (approx 2024)
const PROVINCE_RATES: Record<string, { label: string; rate: number }> = {
  custom:  { label: 'Custom rate',            rate: 40.0 },
  AB:      { label: 'Alberta',                rate: 48.0 },
  BC:      { label: 'British Columbia',       rate: 53.5 },
  MB:      { label: 'Manitoba',               rate: 50.4 },
  NB:      { label: 'New Brunswick',          rate: 52.5 },
  NL:      { label: 'Newfoundland & Labrador',rate: 54.8 },
  NS:      { label: 'Nova Scotia',            rate: 54.0 },
  NT:      { label: 'NWT',                    rate: 47.1 },
  NU:      { label: 'Nunavut',                rate: 44.5 },
  ON:      { label: 'Ontario',                rate: 53.5 },
  PE:      { label: 'PEI',                    rate: 51.4 },
  QC:      { label: 'Quebec',                 rate: 53.3 },
  SK:      { label: 'Saskatchewan',           rate: 47.5 },
  YT:      { label: 'Yukon',                  rate: 48.0 },
};

const INCLUSION_OPTIONS = [
  { label: '50%  — standard (most investors)', value: 0.5 },
  { label: '66⅔% — above $250k annual gain (2024 budget)', value: 2 / 3 },
];

export default function SellCalculator() {
  const [selectedHoldingId, setSelectedHoldingId] = useState('');
  const [quantity, setQuantity]   = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [commission, setCommission] = useState('0');
  const [province, setProvince]   = useState('ON');
  const [customRate, setCustomRate] = useState(40);
  const [inclusionRate, setInclusionRate] = useState(0.5);

  const holdings    = useLiveQuery(() => db.holdings.toArray(),     []);
  const securities  = useLiveQuery(() => db.securities.toArray(),   []);
  const accounts    = useLiveQuery(() => db.accounts.toArray(),     []);
  const prices      = useLiveQuery(() => db.priceCache.toArray(),   []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  const secMap   = new Map((securities  || []).map(s => [s.id, s]));
  const acctMap  = new Map((accounts    || []).map(a => [a.id, a]));
  const priceMap = new Map((prices      || []).map(p => [p.ticker, p]));

  // Build the option list: one entry per holding that has shares
  const holdingOptions = useMemo(() => {
    return (holdings || [])
      .filter(h => h.shares > 0)
      .map(h => {
        const sec  = secMap.get(h.securityId);
        const acct = acctMap.get(h.accountId);
        const avg  = h.shares > 0 ? h.bookValue / h.shares : 0;
        const px   = sec ? priceMap.get(sec.ticker) : null;
        return { id: h.id, sec, acct, h, avg, currentPrice: px?.price ?? avg };
      })
      .filter(o => o.sec)
      .sort((a, b) => (a.sec!.ticker).localeCompare(b.sec!.ticker));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, securities, accounts, prices]);

  const selected = holdingOptions.find(o => o.id === selectedHoldingId);

  // When a holding is selected, pre-fill quantity and price
  const handleSelectHolding = (id: string) => {
    setSelectedHoldingId(id);
    const opt = holdingOptions.find(o => o.id === id);
    if (opt) {
      setSalePrice(opt.currentPrice.toFixed(2));
      setQuantity('');
    }
  };

  // ── Core calculations ──────────────────────────────────────────────────────
  const calc = useMemo(() => {
    if (!selected) return null;
    const qty   = parseFloat(quantity)   || 0;
    const price = parseFloat(salePrice)  || 0;
    const comm  = parseFloat(commission) || 0;

    if (qty <= 0 || price <= 0) return null;

    const { h } = selected;
    const avgCost     = h.shares > 0 ? h.bookValue / h.shares : 0;
    const acbRemoved  = avgCost * qty;
    const proceeds    = qty * price - comm;
    const capitalGain = proceeds - acbRemoved;
    const taxableGain = capitalGain * inclusionRate;

    const marginalRate = province === 'custom' ? customRate / 100 : PROVINCE_RATES[province]!.rate / 100;
    const taxOwing     = Math.max(0, taxableGain * marginalRate);
    const afterTax     = proceeds - taxOwing;
    const effectiveRate = capitalGain > 0 ? (taxOwing / capitalGain) * 100 : 0;

    // Break-even: price where gain = 0 → price = (acbRemoved + comm) / qty
    const breakEvenPrice = qty > 0 ? (acbRemoved + comm) / qty : 0;

    // Remaining position after sell
    const remainingShares = h.shares - qty;
    const remainingBook   = remainingShares * avgCost;

    return {
      qty, price, comm, avgCost, acbRemoved, proceeds,
      capitalGain, taxableGain, taxOwing, afterTax, effectiveRate,
      breakEvenPrice, remainingShares, remainingBook, marginalRate,
    };
  }, [selected, quantity, salePrice, commission, province, customRate, inclusionRate]);

  // ── FIFO lot matching for selected security ───────────────────────────────
  const fifoLots = useMemo(() => {
    if (!selected || !transactions) return null;
    const { openLots } = computeLots(transactions, selected.h.securityId, selected.sec!.ticker);
    return openLots;
  }, [selected, transactions]);

  // Show which FIFO lots would be sold for the entered quantity
  const fifoMatch = useMemo(() => {
    if (!fifoLots || !calc || calc.qty <= 0) return [];
    let remaining = calc.qty;
    const matches: Array<{ lot: typeof fifoLots[0]; sharesSold: number; cost: number; gain: number }> = [];
    for (const lot of [...fifoLots].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))) {
      if (remaining <= 0) break;
      const fromLot = Math.min(lot.sharesRemaining, remaining);
      const cost = fromLot * lot.costPerShare;
      const gain = fromLot * (calc.price) - cost;
      matches.push({ lot, sharesSold: fromLot, cost, gain });
      remaining -= fromLot;
    }
    return matches;
  }, [fifoLots, calc]);

  const maxShares = selected?.h.shares ?? 0;
  const isOverSell = (parseFloat(quantity) || 0) > maxShares;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-emerald-500" />
          Sell Calculator
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Estimate capital gains tax before placing a sell order — ACB method, Canadian rates
        </p>
      </div>

      {/* ── Inputs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: trade inputs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trade Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Holding */}
            <div className="space-y-1.5">
              <Label className="text-xs">Security / Account</Label>
              <Select value={selectedHoldingId} onValueChange={handleSelectHolding}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a holding…" />
                </SelectTrigger>
                <SelectContent>
                  {holdingOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="font-semibold">{o.sec!.ticker}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {o.acct?.name} · {o.h.shares.toFixed(2)} sh · avg {formatCurrency(o.avg)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected && (
              <>
                {/* Position summary */}
                <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shares held</span>
                    <span className="num font-semibold">{selected.h.shares.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average cost (ACB)</span>
                    <span className="num">{formatCurrency(selected.avg)}/share</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total book value</span>
                    <span className="num">{formatCurrency(selected.h.bookValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current price</span>
                    <span className="num">{formatCurrency(selected.currentPrice)}</span>
                  </div>
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Shares to sell</Label>
                    <button
                      onClick={() => setQuantity(selected.h.shares.toFixed(4))}
                      className="text-xs text-emerald-600 hover:underline font-medium"
                    >
                      Sell all
                    </button>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={maxShares}
                    step="0.0001"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder={`max ${maxShares.toFixed(4)}`}
                    className={cn('num', isOverSell && 'border-rose-400 focus-visible:ring-rose-400')}
                  />
                  {isOverSell && (
                    <p className="text-xs text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Exceeds shares held
                    </p>
                  )}
                  {/* Quantity slider */}
                  {maxShares > 0 && (
                    <Slider
                      min={0}
                      max={maxShares}
                      step={maxShares / 100}
                      value={[parseFloat(quantity) || 0]}
                      onValueChange={([v]) => setQuantity((v ?? 0).toFixed(4))}
                      className="mt-2"
                    />
                  )}
                </div>

                {/* Sale price */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Sale price per share</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                    className="num"
                  />
                </div>

                {/* Commission */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Commission / fees</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={commission}
                    onChange={e => setCommission(e.target.value)}
                    className="num"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: tax inputs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tax Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Province */}
            <div className="space-y-1.5">
              <Label className="text-xs">Province / Territory</Label>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVINCE_RATES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}{k !== 'custom' ? ` — ${v.rate}% top marginal` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Top combined federal + provincial marginal rate</p>
            </div>

            {/* Marginal rate slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {province === 'custom' ? 'Your marginal rate' : 'Marginal rate'}
                </Label>
                <span className="text-sm font-bold num tabular-nums">
                  {province === 'custom' ? customRate.toFixed(1) : PROVINCE_RATES[province]!.rate.toFixed(1)}%
                </span>
              </div>
              <Slider
                min={15}
                max={58}
                step={0.5}
                value={[province === 'custom' ? customRate : PROVINCE_RATES[province]!.rate]}
                onValueChange={([v]) => {
                  setProvince('custom');
                  setCustomRate(v ?? 40);
                }}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>15%</span>
                <span>← drag to set custom rate</span>
                <span>58%</span>
              </div>
            </div>

            {/* Inclusion rate */}
            <div className="space-y-1.5">
              <Label className="text-xs">Capital gains inclusion rate</Label>
              <div className="space-y-2">
                {INCLUSION_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="inclusion"
                      checked={Math.abs(inclusionRate - opt.value) < 0.001}
                      onChange={() => setInclusionRate(opt.value)}
                      className="accent-emerald-500"
                    />
                    <span className="text-xs">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Info note */}
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 flex gap-2">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700">
                Rates shown are approximate top marginal rates for 2024. Your actual rate depends on your total income for the year. Consult a tax advisor for personalized advice.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Results ── */}
      {calc && selected && !isOverSell && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                icon: DollarSign,
                label: 'Net Proceeds',
                value: formatCurrency(calc.proceeds),
                sub: `${calc.qty.toFixed(4)} sh × ${formatCurrency(calc.price)} − ${formatCurrency(calc.comm)} fee`,
                color: 'text-foreground',
                bg: '',
              },
              {
                icon: TrendingDown,
                label: 'Capital Gain',
                value: `${calc.capitalGain >= 0 ? '+' : ''}${formatCurrency(calc.capitalGain)}`,
                sub: `${formatPercent(calc.capitalGain / calc.acbRemoved * 100)} gain on ACB`,
                color: calc.capitalGain >= 0 ? 'text-emerald-600' : 'text-rose-600',
                bg: calc.capitalGain >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200',
              },
              {
                icon: Percent,
                label: 'Tax Owing',
                value: formatCurrency(calc.taxOwing),
                sub: `${(calc.marginalRate * 100).toFixed(1)}% × ${(inclusionRate * 100).toFixed(0)}% inclusion`,
                color: 'text-rose-600',
                bg: calc.taxOwing > 0 ? 'bg-rose-50 border-rose-200' : '',
              },
              {
                icon: DollarSign,
                label: 'After-Tax Proceeds',
                value: formatCurrency(calc.afterTax),
                sub: `${calc.effectiveRate.toFixed(1)}% effective rate on gain`,
                color: 'text-foreground font-bold',
                bg: 'bg-emerald-50 border-emerald-200',
              },
            ].map(c => (
              <div key={c.label} className={cn('rounded-lg border p-4', c.bg || 'border-border')}>
                <div className="flex items-center gap-1.5 mb-1">
                  <c.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
                <p className={cn('text-lg font-bold num', c.color)}>{c.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Detailed breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ACB waterfall */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ACB Calculation (Canadian method)</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border">
                    {[
                      { label: 'Shares sold', value: calc.qty.toFixed(4), unit: 'sh', highlight: false },
                      { label: 'Sale price', value: formatCurrency(calc.price), unit: '/sh', highlight: false },
                      { label: 'Gross proceeds', value: formatCurrency(calc.qty * calc.price), unit: '', highlight: false },
                      { label: '− Commission', value: `−${formatCurrency(calc.comm)}`, unit: '', highlight: false },
                      { label: 'Net proceeds', value: formatCurrency(calc.proceeds), unit: '', highlight: true },
                      { label: 'ACB per share', value: formatCurrency(calc.avgCost), unit: '/sh', highlight: false },
                      { label: '− ACB removed', value: `−${formatCurrency(calc.acbRemoved)}`, unit: '', highlight: false },
                      { label: 'Capital gain / loss', value: `${calc.capitalGain >= 0 ? '+' : ''}${formatCurrency(calc.capitalGain)}`, unit: '', highlight: true, color: calc.capitalGain >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                      { label: `× ${(inclusionRate * 100).toFixed(0)}% inclusion rate`, value: formatCurrency(calc.taxableGain), unit: '', highlight: false },
                      { label: `× ${(calc.marginalRate * 100).toFixed(1)}% marginal rate`, value: formatCurrency(calc.taxOwing), unit: '', highlight: false, color: 'text-rose-600' },
                    ].map((row, i) => (
                      <tr key={i} className={cn(row.highlight ? 'bg-muted/50' : '')}>
                        <td className="py-1.5 text-muted-foreground">{row.label}</td>
                        <td className={cn('py-1.5 text-right num font-semibold', row.color)}>
                          {row.value}<span className="font-normal text-muted-foreground ml-0.5">{row.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Remaining position */}
                {calc.remainingShares > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1.5">Remaining position after sell</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Shares</span>
                      <span className="num">{calc.remainingShares.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Book value (ACB)</span>
                      <span className="num">{formatCurrency(calc.remainingBook)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Average cost unchanged</span>
                      <span className="num">{formatCurrency(calc.avgCost)}/sh</span>
                    </div>
                  </div>
                )}

                {/* Break-even */}
                <div className={cn(
                  'mt-3 pt-3 border-t border-border rounded-md p-3 -mx-1',
                  calc.capitalGain < 0 ? 'bg-amber-50' : '',
                )}>
                  <p className="text-xs text-muted-foreground">Break-even sale price (zero gain)</p>
                  <p className="text-base font-bold num mt-0.5">{formatCurrency(calc.breakEvenPrice)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {calc.price > calc.breakEvenPrice
                      ? `You are ${formatCurrency(calc.price - calc.breakEvenPrice)}/share above break-even`
                      : `You are ${formatCurrency(calc.breakEvenPrice - calc.price)}/share below break-even`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* FIFO lot preview */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>FIFO Lot Preview</span>
                  <Badge variant="outline" className="text-[10px] font-normal">informational</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Which lots would be sold first (oldest first). Gain shown is per-lot at entered price. <strong>Canada uses ACB above for tax.</strong>
                </p>
                {fifoMatch.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Enter a quantity to see lot preview</p>
                ) : (
                  <div className="space-y-2">
                    {fifoMatch.map(({ lot, sharesSold, cost, gain }, i) => (
                      <div key={i} className={cn(
                        'rounded-md border p-2.5 text-xs',
                        gain < 0 ? 'border-rose-200 bg-rose-50/50' : 'border-emerald-200 bg-emerald-50/30',
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">Lot {i + 1}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge className={cn(
                              'text-[10px] px-1.5 py-0 border-0',
                              lot.holdingDays > 365 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                            )}>
                              {formatHoldingPeriod(lot.holdingDays)}
                            </Badge>
                            <span className={cn('font-bold num', gain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-muted-foreground">
                          <span>Purchased</span><span className="num text-foreground">{lot.purchaseDate}</span>
                          <span>Shares sold</span><span className="num text-foreground">{sharesSold.toFixed(4)}</span>
                          <span>Lot cost/sh</span><span className="num text-foreground">{formatCurrency(lot.costPerShare)}</span>
                          <span>Total lot cost</span><span className="num text-foreground">{formatCurrency(cost)}</span>
                        </div>
                      </div>
                    ))}

                    {/* FIFO vs ACB note */}
                    {fifoMatch.length > 0 && (
                      <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 mt-2">
                        <p className="text-[11px] text-blue-700">
                          <strong>FIFO total gain: </strong>
                          <span className={cn('num font-bold', fifoMatch.reduce((s, m) => s + m.gain, 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                            {fifoMatch.reduce((s, m) => s + m.gain, 0) >= 0 ? '+' : ''}
                            {formatCurrency(fifoMatch.reduce((s, m) => s + m.gain, 0))}
                          </span>
                          {' vs ACB gain: '}
                          <span className={cn('num font-bold', calc.capitalGain >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                            {calc.capitalGain >= 0 ? '+' : ''}{formatCurrency(calc.capitalGain)}
                          </span>
                          . Canada taxes using the ACB (average cost) figure.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* After-tax summary banner */}
          <div className={cn(
            'rounded-xl border-2 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
            calc.capitalGain > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-muted/30',
          )}>
            <div>
              <p className="text-sm font-semibold">After-Tax Proceeds Summary</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selling {calc.qty.toFixed(4)} shares of {selected.sec!.ticker} at {formatCurrency(calc.price)}/share
              </p>
            </div>
            <div className="flex items-center gap-8">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Gross proceeds</p>
                <p className="text-lg num font-bold">{formatCurrency(calc.qty * calc.price)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Est. tax</p>
                <p className="text-lg num font-bold text-rose-600">−{formatCurrency(calc.taxOwing)}</p>
              </div>
              <div className="text-right border-l border-border pl-8">
                <p className="text-xs text-muted-foreground">After-tax proceeds</p>
                <p className="text-2xl num font-bold text-emerald-600">{formatCurrency(calc.afterTax)}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!selected && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Calculator className="h-12 w-12 opacity-20" />
          <p className="text-sm">Select a holding above to calculate your estimated capital gains tax</p>
        </div>
      )}
    </div>
  );
}
