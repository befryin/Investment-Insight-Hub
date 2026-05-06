import { Router, type IRouter } from "express";

const router: IRouter = Router();

type Classification = {
  eligible_div?: number;
  non_eligible_div?: number;
  capital_gains?: number;
  return_of_capital?: number;
  interest?: number;
  foreign_income?: number;
};

type Distribution = {
  symbol: string;
  ex_date?: string;
  pay_date?: string;
  per_unit: number;
  classifications: Classification;
};

function classifyHeader(
  h: string,
): keyof Classification | "per_unit" | "ex_date" | "pay_date" | "symbol" | null {
  const x = h.toLowerCase();
  if (/symbol|ticker/.test(x)) return "symbol";
  if (/ex.?date/.test(x)) return "ex_date";
  if (/pay.?date|payable/.test(x)) return "pay_date";
  if (/total|per unit|distribution amount|cash distribution/.test(x)) return "per_unit";
  if (/eligible div/.test(x) && !/non/.test(x)) return "eligible_div";
  if (/non.?eligible/.test(x)) return "non_eligible_div";
  if (/capital gain/.test(x)) return "capital_gains";
  if (/return of capital|roc/.test(x)) return "return_of_capital";
  if (/interest/.test(x)) return "interest";
  if (/foreign/.test(x)) return "foreign_income";
  return null;
}

function parseMoney(s: string): number {
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}

function normalizeDate(s: string): string | undefined {
  const d = new Date(s);
  return isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
}

function parseHtmlTables(html: string, defaultSymbol?: string): Distribution[] {
  const out: Distribution[] = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex) ?? [];
  for (const tbl of tables) {
    const rowsRaw = tbl.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rowsRaw.length < 2) continue;
    const cellsOf = (r: string) =>
      (r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map((c) =>
        c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
      );
    const headers = cellsOf(rowsRaw[0]!);
    const colMap = headers.map(classifyHeader);
    if (!colMap.includes("per_unit")) continue;
    for (let i = 1; i < rowsRaw.length; i++) {
      const cells = cellsOf(rowsRaw[i]!);
      if (cells.length < Math.floor(headers.length / 2)) continue;
      const d: Distribution = {
        symbol: defaultSymbol ?? "",
        per_unit: 0,
        classifications: {},
      };
      cells.forEach((v, idx) => {
        const k = colMap[idx];
        if (!k) return;
        if (k === "symbol") d.symbol = v.toUpperCase();
        else if (k === "ex_date" || k === "pay_date") {
          const nd = normalizeDate(v);
          if (nd) d[k] = nd;
        } else if (k === "per_unit") {
          d.per_unit = parseMoney(v);
        } else {
          d.classifications[k] = parseMoney(v);
        }
      });
      if (d.symbol && d.per_unit > 0) out.push(d);
    }
  }
  return out;
}

router.get("/etf-distributions", async (req, res) => {
  const target = req.query["url"] as string | undefined;
  const symbolHint = req.query["symbol"] as string | undefined;
  if (!target) {
    res.status(400).json({ error: "url parameter required" });
    return;
  }
  try {
    const r = await fetch(target, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; FolioBot/1.0)" },
    });
    if (!r.ok) {
      res.status(502).json({ error: `Upstream ${r.status}` });
      return;
    }
    const html = await r.text();
    const distributions = parseHtmlTables(html, symbolHint);
    res.json({ distributions });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
