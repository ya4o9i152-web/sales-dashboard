import type { Category, SalesRow } from "./csv/parse";

export type MonthKpi = {
  month: string; // YYYY-MM
  revenue: number;
  grossProfit: number;
  grossMargin: number | null; // 粗利 ÷ 売上（売上0なら null）
  orders: number; // 明細の行数
  customers: number; // 顧客IDのある購入者数
  returningCustomers: number; // 前月以前にも購入した人数
  rebuyRate: number | null; // 当月の再購入率
  categories: { category: Category; revenue: number }[];
  topSkus: { sku: string; productName: string; quantity: number; revenue: number }[]; // 当月の上位5
};

export type Kpis = {
  months: MonthKpi[];
  total: { revenue: number; grossProfit: number; grossMargin: number | null };
  /** リピート率：全期間で2か月以上購入した顧客 ÷ 全顧客（顧客IDの空欄は除く） */
  repeat: { customers: number; repeaters: number; rate: number | null };
  categories: { category: Category; revenue: number; grossProfit: number }[];
  skuTop10: { sku: string; productName: string; category: Category; quantity: number; revenue: number }[];
  latestMonth: string;
  previousMonth: string | null;
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

/**
 * 売上明細からダッシュボードの数字をすべて計算する。
 * 画面とAIはこの結果だけを使い、自分では計算しない（数字の出どころを1か所にする）。
 */
export function computeKpis(rows: SalesRow[]): Kpis {
  if (rows.length === 0) throw new Error("明細が0件です");

  const byMonth = new Map<string, SalesRow[]>();
  for (const row of rows) {
    const month = row.order_date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  const monthKeys = [...byMonth.keys()].sort();

  // 月ごとの購入者。前月以前に買ったことがあるかの判定に使う
  const seenBefore = new Set<string>();
  const months: MonthKpi[] = monthKeys.map((month) => {
    const monthRows = byMonth.get(month)!;
    const revenue = sum(monthRows, (r) => r.revenue);
    const grossProfit = sum(monthRows, (r) => r.revenue - r.cost);
    const customers = new Set(monthRows.flatMap((r) => (r.customer_id ? [r.customer_id] : [])));
    const returning = [...customers].filter((c) => seenBefore.has(c)).length;
    customers.forEach((c) => seenBefore.add(c));
    return {
      month,
      revenue,
      grossProfit,
      grossMargin: ratio(grossProfit, revenue),
      orders: monthRows.length,
      customers: customers.size,
      returningCustomers: returning,
      rebuyRate: ratio(returning, customers.size),
      categories: groupCategories(monthRows).map(({ category, revenue }) => ({ category, revenue })),
      topSkus: groupSkus(monthRows)
        .slice(0, 5)
        .map(({ sku, productName, quantity, revenue }) => ({ sku, productName, quantity, revenue })),
    };
  });

  const monthsByCustomer = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.customer_id) continue;
    const set = monthsByCustomer.get(row.customer_id) ?? new Set<string>();
    set.add(row.order_date.slice(0, 7));
    monthsByCustomer.set(row.customer_id, set);
  }
  const repeaters = [...monthsByCustomer.values()].filter((s) => s.size >= 2).length;

  const revenue = sum(rows, (r) => r.revenue);
  const grossProfit = sum(rows, (r) => r.revenue - r.cost);
  return {
    months,
    total: { revenue, grossProfit, grossMargin: ratio(grossProfit, revenue) },
    repeat: { customers: monthsByCustomer.size, repeaters, rate: ratio(repeaters, monthsByCustomer.size) },
    categories: groupCategories(rows),
    skuTop10: groupSkus(rows).slice(0, 10),
    latestMonth: monthKeys[monthKeys.length - 1],
    previousMonth: monthKeys.length >= 2 ? monthKeys[monthKeys.length - 2] : null,
  };
}

function groupCategories(rows: SalesRow[]) {
  const map = new Map<Category, { category: Category; revenue: number; grossProfit: number }>();
  for (const row of rows) {
    const current = map.get(row.category) ?? { category: row.category, revenue: 0, grossProfit: 0 };
    current.revenue += row.revenue;
    current.grossProfit += row.revenue - row.cost;
    map.set(row.category, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.category.localeCompare(b.category));
}

/** SKU別の合計。売上が同じときはSKUの昇順にして、毎回同じ並びにする */
function groupSkus(rows: SalesRow[]): Kpis["skuTop10"] {
  const map = new Map<string, Kpis["skuTop10"][number]>();
  for (const row of rows) {
    const current = map.get(row.sku) ?? { sku: row.sku, productName: row.product_name, category: row.category, quantity: 0, revenue: 0 };
    current.quantity += row.quantity;
    current.revenue += row.revenue;
    map.set(row.sku, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.sku.localeCompare(b.sku));
}

function sum(rows: SalesRow[], pick: (r: SalesRow) => number): number {
  return rows.reduce((acc, r) => acc + pick(r), 0);
}

/** 前月比（増減率）。前月が0または前月がないときは null */
export function changeRate(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return (current - previous) / previous;
}
