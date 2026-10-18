import Papa from "papaparse";

export const REQUIRED_COLUMNS = [
  "order_date",
  "customer_id",
  "product_name",
  "category",
  "sku",
  "quantity",
  "revenue",
  "cost",
] as const;

export const CATEGORIES = ["トップス", "ボトムス", "アウター", "アクセサリー"] as const;
export type Category = (typeof CATEGORIES)[number];

export type SalesRow = {
  order_date: string; // YYYY-MM-DD
  customer_id: string | null;
  product_name: string;
  category: Category;
  sku: string;
  quantity: number;
  revenue: number; // 円（整数）
  cost: number; // 円（整数）
};

/** 取り込めない行。line はCSVの行番号（見出しが1行目） */
export type RowError = { line: number; column: string; value: string; reason: string };

/** 自動で補正した内容。件数だけ画面に出し、中身は確認用に返す */
export type Cleaning = { line: number; column: string; before: string; after: string; reason: string };

export type ParseResult =
  | {
      ok: true;
      rows: SalesRow[];
      months: string[]; // YYYY-MM（昇順）
      encoding: "utf-8" | "shift_jis";
      cleanings: Cleaning[];
      missingCustomerIds: number;
    }
  | { ok: false; errors: RowError[]; encoding: "utf-8" | "shift_jis" | null };

/**
 * CSVのバイト列を文字列にする。
 * Shopifyの出力はUTF-8だが、Excelで開いて保存し直すとShift_JISになるため両方を受け付ける。
 */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: "utf-8" | "shift_jis" } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "shift_jis" };
  }
}

/** 全角英数・半角カナ・前後の空白をそろえる（NFKC） */
function normalizeText(value: string): string {
  return value.normalize("NFKC").trim();
}

/** 2025/9/3・2025-9-3 などを 2025-09-03 にそろえる。実在しない日付は null */
function normalizeDate(value: string): string | null {
  const m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 「¥7,600」「7,600円」などの表示形式を外す。小数・負の数・文字混じりは null。
 * Shift_JISでは「¥」が「\」と同じ文字コードのため、読み込むと「\7,600」になる。これも外す。
 */
function normalizeInteger(value: string): string | null {
  const stripped = value.replace(/[¥\\,円\s]/g, "");
  return /^\d+$/.test(stripped) ? stripped : null;
}

type ParseOptions = { today?: string };

/**
 * 売上CSVを読み込み、検証とクリーニングを行う。
 * - 意味が変わらない表記の違い（全角・空白・¥やカンマ・日付の区切り）は自動で補正し、記録する
 * - 意味があいまいなもの（カテゴリ外・実在しない日付・負の数など）は補正せずエラーにする
 * - エラーが1件でもあれば、どの行も取り込まない（集計の数字が今のExcelとずれるのを防ぐ）
 */
export function parseSalesCsv(bytes: Uint8Array, options: ParseOptions = {}): ParseResult {
  const { text, encoding } = decodeCsv(bytes);
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeText(h).toLowerCase(),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      encoding,
      errors: missing.map((c) => ({ line: 1, column: c, value: "", reason: "必須の列がありません" })),
    };
  }
  if (parsed.data.length === 0) {
    return { ok: false, encoding, errors: [{ line: 2, column: "", value: "", reason: "データの行がありません" }] };
  }

  const rows: SalesRow[] = [];
  const errors: RowError[] = [];
  const cleanings: Cleaning[] = [];
  let missingCustomerIds = 0;

  parsed.data.forEach((raw, index) => {
    const line = index + 2;
    const rowErrors: RowError[] = [];

    // 列ごとに NFKC で整え、変わったものは補正として記録する
    const cell = (column: (typeof REQUIRED_COLUMNS)[number]): string => {
      const before = raw[column] ?? "";
      const after = normalizeText(before);
      if (after !== before) cleanings.push({ line, column, before, after, reason: "全角・空白をそろえました" });
      return after;
    };
    const fail = (column: string, value: string, reason: string) => rowErrors.push({ line, column, value, reason });

    const dateText = cell("order_date");
    const orderDate = normalizeDate(dateText);
    if (!orderDate) fail("order_date", dateText, "日付は YYYY-MM-DD の形式で、実在する日付にしてください");
    else {
      if (orderDate !== dateText) cleanings.push({ line, column: "order_date", before: dateText, after: orderDate, reason: "日付の形式をそろえました" });
      if (orderDate > today) fail("order_date", dateText, "未来の日付です");
    }

    const customerId = cell("customer_id");
    if (customerId === "") missingCustomerIds++;

    const productName = cell("product_name");
    if (productName === "") fail("product_name", productName, "商品名が空です");

    const category = cell("category");
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      fail("category", category, `カテゴリは ${CATEGORIES.join("／")} のいずれかにしてください`);
    }

    const sku = cell("sku");
    if (sku === "") fail("sku", sku, "SKUが空です");

    const integer = (column: "quantity" | "revenue" | "cost", min: number, label: string): number => {
      const text = cell(column);
      const digits = normalizeInteger(text);
      if (digits === null) {
        fail(column, text, `${label}は整数で入力してください`);
        return 0;
      }
      if (digits !== text) cleanings.push({ line, column, before: text, after: digits, reason: "¥・カンマを外しました" });
      const value = Number(digits);
      if (value < min) fail(column, text, `${label}は${min}以上にしてください`);
      return value;
    };
    const quantity = integer("quantity", 1, "数量");
    const revenue = integer("revenue", 0, "売上");
    const cost = integer("cost", 0, "原価");

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      order_date: orderDate!,
      customer_id: customerId === "" ? null : customerId,
      product_name: productName,
      category: category as Category,
      sku,
      quantity,
      revenue,
      cost,
    });
  });

  if (errors.length > 0) return { ok: false, encoding, errors };

  const months = [...new Set(rows.map((r) => r.order_date.slice(0, 7)))].sort();
  return { ok: true, rows, months, encoding, cleanings, missingCustomerIds };
}
