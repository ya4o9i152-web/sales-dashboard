import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSalesCsv } from "@/lib/csv/parse";
import { computeKpis } from "@/lib/kpi";
import { buildAnalysisInput } from "@/lib/analysis/input";
import { ANALYSIS_SYSTEM_PROMPT, AnalysisReportSchema, PROMPT_VERSION, buildUserMessage } from "@/lib/analysis/prompt";
import { verifyReport } from "@/lib/analysis/verify";

/**
 * AI分析のSnapshotテスト。
 * AIの出力そのものは毎回変わるため、CIでは「AIに渡すもの」と「AIの出力の検査」を固定して確かめる。
 * - 入力のSnapshot：集計やプロンプトを変えたとき、AIに渡る内容がどう変わったかがレビューで見える
 * - 記録した応答（npm run eval:analysis -- --record）：スキーマと数値照合が通ることを確かめる
 */
const parsed = parseSalesCsv(readFileSync("tests/fixtures/sample-sales.csv"), { today: "2026-10-18" });
if (!parsed.ok) throw new Error("サンプルCSVを読み込めませんでした");
const input = buildAnalysisInput(computeKpis(parsed.rows));
const recorded = JSON.parse(readFileSync("tests/fixtures/ai-response.json", "utf-8"));

describe("AIに渡す入力", () => {
  it("集計済みの数字（Snapshot）", () => {
    expect(input).toMatchSnapshot();
  });

  it("プロンプト（Snapshot）", () => {
    expect({ version: PROMPT_VERSION, system: ANALYSIS_SYSTEM_PROMPT, user: buildUserMessage(input) }).toMatchSnapshot();
  });

  it("生の明細と顧客IDを含まない", () => {
    const text = JSON.stringify(input);
    expect(text).not.toMatch(/C0\d\d/);
    expect(text).not.toMatch(/2025-\d\d-\d\d/);
  });
});

describe("記録したAIの応答", () => {
  const report = AnalysisReportSchema.parse(recorded.report);

  it("スキーマに合い、数値照合と形の検査を通る", () => {
    expect(verifyReport(report, input)).toEqual({ ok: true, violations: [], shapeIssues: [] });
  });

  it("「冬物アウターが牽引」を拾っている", () => {
    expect([report.summary, ...report.highlights].join("")).toMatch(/アウター/);
  });

  it("応答の内容（Snapshot）", () => {
    expect(recorded).toMatchSnapshot();
  });
});

describe("数値照合が働くこと", () => {
  const report = AnalysisReportSchema.parse(recorded.report);

  it("入力にない数字（AIが計算した倍率や丸めた金額）を検出する", () => {
    const tampered = { ...report, summary: `${report.summary}売上は前月の1.8倍、約26万円でした。` };
    expect(verifyReport(tampered, input).violations).toEqual(["1.8", "26"]);
  });

  it("件数の崩れを検出する", () => {
    const tampered = { ...report, actions: report.actions.slice(0, 2) };
    expect(verifyReport(tampered, input).shapeIssues).toEqual(["actions が3つではありません（2つ）"]);
  });
});
