import type { AnalysisInput } from "./input";
import type { AnalysisReport } from "./prompt";

/** 文中の数字を取り出す。"¥264,700" → "264700"、"+79.5%" → "79.5" */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/** 順位・件数・月など、入力に無くても書いてよい小さな整数 */
const SMALL_INTEGER_LIMIT = 12;

export type VerifyResult = {
  ok: boolean;
  /** 入力に存在しない数字 */
  violations: string[];
  /** 形の問題（件数・文字数） */
  shapeIssues: string[];
};

/**
 * AIの出力に含まれる数字が、すべて入力に存在するかを確かめる。
 * 画面の数字とコメントの数字がずれていないことを、AIの自己申告ではなくコードで保証するため。
 */
export function verifyReport(report: AnalysisReport, input: AnalysisInput): VerifyResult {
  const allowed = new Set(extractNumbers(JSON.stringify(input)));
  const texts = [
    report.summary,
    ...report.highlights,
    ...report.concerns,
    ...report.actions.flatMap((a) => [a.target, a.action, a.evidence]),
  ];

  const violations = new Set<string>();
  for (const text of texts) {
    for (const n of extractNumbers(text)) {
      const isSmallInteger = /^\d+$/.test(n) && Number(n) <= SMALL_INTEGER_LIMIT;
      // 年（2025年など）は月次推移のラベルに含まれるので allowed に入っている
      if (!isSmallInteger && !allowed.has(n)) violations.add(n);
    }
  }

  const shapeIssues: string[] = [];
  if ([...report.summary].length > 200) shapeIssues.push(`summary が200字を超えています（${[...report.summary].length}字）`);
  if (report.highlights.length !== 3) shapeIssues.push(`highlights が3つではありません（${report.highlights.length}つ）`);
  if (report.concerns.length !== 2) shapeIssues.push(`concerns が2つではありません（${report.concerns.length}つ）`);
  if (report.actions.length !== 3) shapeIssues.push(`actions が3つではありません（${report.actions.length}つ）`);

  return { ok: violations.size === 0 && shapeIssues.length === 0, violations: [...violations], shapeIssues };
}
