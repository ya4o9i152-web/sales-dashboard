import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSalesCsv } from "@/lib/csv/parse";
import { computeKpis } from "@/lib/kpi";
import { percent } from "@/lib/format";

/** サンプルCSVの正解値（sample/README.md：Excelとの照合用）と完全一致することを確かめる */
function loadSample() {
  const result = parseSalesCsv(readFileSync("tests/fixtures/sample-sales.csv"), { today: "2026-10-18" });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return computeKpis(result.rows);
}

describe("集計：サンプルCSVの正解値", () => {
  const kpis = loadSample();

  it("月次の売上・粗利", () => {
    expect(kpis.months.map((m) => [m.month, m.revenue, m.grossProfit])).toEqual([
      ["2025-09", 148400, 93400],
      ["2025-10", 147500, 92600],
      ["2025-11", 264700, 163100],
    ]);
  });

  it("合計の売上・粗利", () => {
    expect(kpis.total.revenue).toBe(560600);
    expect(kpis.total.grossProfit).toBe(349100);
  });

  it("カテゴリ別の売上（降順）", () => {
    expect(kpis.categories.map((c) => [c.category, c.revenue])).toEqual([
      ["アウター", 287400],
      ["トップス", 114400],
      ["ボトムス", 82200],
      ["アクセサリー", 76600],
    ]);
  });

  it("リピート率：28人中8人 → 28.6%", () => {
    expect(kpis.repeat.customers).toBe(28);
    expect(kpis.repeat.repeaters).toBe(8);
    expect(percent(kpis.repeat.rate)).toBe("28.6%");
  });

  it("当月の再購入率：10月 5/13、11月 7/15", () => {
    const [sep, oct, nov] = kpis.months;
    expect([sep.returningCustomers, sep.customers]).toEqual([0, 12]);
    expect([oct.returningCustomers, oct.customers]).toEqual([5, 13]);
    expect([nov.returningCustomers, nov.customers]).toEqual([7, 15]);
  });

  it("SKUトップ10：SKUは8種類なので8件、売上の降順", () => {
    expect(kpis.skuTop10).toHaveLength(8);
    const revenues = kpis.skuTop10.map((s) => s.revenue);
    expect(revenues).toEqual([...revenues].sort((a, b) => b - a));
    expect(kpis.skuTop10.slice(0, 2).map((s) => [s.productName, s.revenue])).toEqual([
      ["ウールコート", 148800],
      ["ダウンジャケット", 138600],
    ]);
  });

  it("各月のカテゴリ別売上の合計が、その月の売上と一致する", () => {
    for (const m of kpis.months) {
      expect(m.categories.reduce((a, c) => a + c.revenue, 0)).toBe(m.revenue);
    }
  });
});
