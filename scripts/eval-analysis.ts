/**
 * 本物のClaudeでAI分析を実行し、合格基準を満たすかを確かめる（費用がかかるためCIでは実行しない）。
 *
 *   npm run eval:analysis            # 評価だけ
 *   npm run eval:analysis -- --record  # 結果を tests/fixtures/ai-response.json に保存（Snapshotテストの入力になる）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { parseSalesCsv } from "../src/lib/csv/parse";
import { computeKpis } from "../src/lib/kpi";
import { generateAnalysis } from "../src/lib/analysis/generate";

config({ path: ".env.local" });

async function main() {
  const csvPath = process.argv.find((a) => a.endsWith(".csv")) ?? "tests/fixtures/sample-sales.csv";
  const parsed = parseSalesCsv(readFileSync(csvPath));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));

  const started = Date.now();
  const result = await generateAnalysis(computeKpis(parsed.rows));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(JSON.stringify(result.report, null, 2));

  const allText = [result.report.summary, ...result.report.highlights, ...result.report.concerns].join("\n");
  const actionText = result.report.actions.map((a) => `${a.target} ${a.action} ${a.evidence}`).join("\n");
  const checks: [string, boolean][] = [
    ["数値照合：入力にない数字が0件", result.check.violations.length === 0],
    ["形：summary 200字以内・highlights 3・concerns 2・actions 3", result.check.shapeIssues.length === 0],
    ["「冬物アウターが牽引」を拾う（総括・良かった点にアウターが登場）", /アウター/.test(allText)],
    ["11月を踏まえた翌月のアクション（アクションがアウター・冬物・リピーターのいずれかに触れる）", /アウター|冬物|コート|ダウン|リピー|再購入/.test(actionText)],
  ];

  console.log(`\nモデル: ${result.model} ／ 試行: ${result.check.attempts}回 ／ ${seconds}秒`);
  if (result.check.violations.length > 0) console.log(`入力にない数字: ${result.check.violations.join(", ")}`);
  for (const issue of result.check.shapeIssues) console.log(`形の問題: ${issue}`);
  for (const [label, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${label}`);

  if (process.argv.includes("--record")) {
    writeFileSync("tests/fixtures/ai-response.json", JSON.stringify({ model: result.model, report: result.report }, null, 2) + "\n");
    console.log("\ntests/fixtures/ai-response.json に保存しました");
  }
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}

main();
