import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSalesCsv } from "@/lib/csv/parse";

const TODAY = "2026-10-18";
const load = (name: string) => parseSalesCsv(readFileSync(`tests/fixtures/${name}`), { today: TODAY });
const fromText = (text: string) => parseSalesCsv(new TextEncoder().encode(text), { today: TODAY });

describe("CSVの読み込み", () => {
  it("サンプルCSVは40行・3か月をすべて取り込む", () => {
    const result = load("sample-sales.csv");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(40);
    expect(result.months).toEqual(["2025-09", "2025-10", "2025-11"]);
    expect(result.encoding).toBe("utf-8");
    expect(result.cleanings).toEqual([]);
  });

  it("BOM付きUTF-8でも見出しを正しく読む", () => {
    const result = fromText("﻿order_date,customer_id,product_name,category,sku,quantity,revenue,cost\n2025-09-03,C001,Tシャツ,トップス,LUM-TOP-01,2,7600,2800\n");
    expect(result.ok).toBe(true);
  });

  it("空行は無視する", () => {
    const result = fromText("order_date,customer_id,product_name,category,sku,quantity,revenue,cost\n2025-09-03,C001,Tシャツ,トップス,LUM-TOP-01,2,7600,2800\n\n,,,,,,,\n");
    expect(result.ok && result.rows.length).toBe(1);
  });
});

describe("データクリーニング（Excelで保存し直したCSV）", () => {
  const result = load("excel-resaved-sjis.csv");

  it("Shift_JISを判別して読む", () => {
    expect(result.encoding).toBe("shift_jis");
    expect(result.ok).toBe(true);
  });

  it("全角数字・¥とカンマ・日付の区切り・前後の空白を補正する", () => {
    if (!result.ok) throw new Error("取り込めませんでした");
    expect(result.rows[0]).toEqual({
      order_date: "2025-09-03",
      customer_id: "C001",
      product_name: "オーガニックコットンTシャツ",
      category: "トップス",
      sku: "LUM-TOP-01",
      quantity: 2,
      revenue: 7600,
      cost: 2800,
    });
    expect(result.cleanings.map((c) => `${c.line}:${c.column}:${c.reason}`)).toEqual([
      "2:order_date:日付の形式をそろえました",
      "2:product_name:全角・空白をそろえました",
      "2:quantity:全角・空白をそろえました",
      "2:revenue:¥・カンマを外しました",
      "2:cost:¥・カンマを外しました",
    ]);
  });

  it("顧客IDの空欄は取り込み、件数を数える", () => {
    if (!result.ok) throw new Error("取り込めませんでした");
    expect(result.rows[1].customer_id).toBeNull();
    expect(result.missingCustomerIds).toBe(1);
  });
});

describe("バリデーション（取り込まないもの）", () => {
  it("必須の列が足りなければ、列名を示して止める", () => {
    const result = load("missing-column.csv");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ line: 1, column: "cost", value: "", reason: "必須の列がありません" }]);
  });

  it("不正な行があれば1行も取り込まず、行番号と理由をすべて返す", () => {
    const result = load("invalid-rows.csv");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => `${e.line}:${e.column}`)).toEqual([
      "2:order_date", // 2月30日は存在しない
      "3:category", // 「アウタ」はカテゴリ外（推測で直さない）
      "4:quantity", // 0個
      "4:revenue", // 小数
      "4:cost", // 負の数
      "5:order_date", // 未来の日付
    ]);
  });

  it("データの行が0件なら止める", () => {
    const result = fromText("order_date,customer_id,product_name,category,sku,quantity,revenue,cost\n");
    expect(result.ok).toBe(false);
  });
});
