import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Kpis } from "../kpi";
import { buildAnalysisInput, type AnalysisInput } from "./input";
import { ANALYSIS_SYSTEM_PROMPT, AnalysisReportSchema, PROMPT_VERSION, buildUserMessage, type AnalysisReport } from "./prompt";
import { verifyReport, type VerifyResult } from "./verify";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_ATTEMPTS = 2;

export type AnalysisResult = {
  report: AnalysisReport;
  input: AnalysisInput;
  model: string;
  promptVersion: string;
  check: VerifyResult & { attempts: number };
};

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

async function requestReport(input: AnalysisInput, problems: string[]) {
  const response = await getClient().beta.messages.parse({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 16000,
    // 月に数回しか呼ばないため、速さより分析の質を優先する
    output_config: { effort: "medium", format: betaZodOutputFormat(AnalysisReportSchema) },
    // 安全性の判定でモデルが応答を断った場合に、Anthropicが推奨する別モデルで同じ依頼を実行し直す
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input, problems) }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`Claudeが応答を断りました（${response.stop_details?.category ?? "理由不明"}）`);
  }
  if (!response.parsed_output) throw new Error(`Claudeの応答を読み取れませんでした（stop_reason: ${response.stop_reason}）`);
  return { report: response.parsed_output, model: response.model };
}

/**
 * 集計結果からAIの分析コメントを作る。
 * 入力にない数字や形の崩れがあれば、その内容を伝えて1回だけ作り直す。それでも残れば check.ok=false のまま返し、画面で「要確認」と表示する。
 */
export async function generateAnalysis(kpis: Kpis): Promise<AnalysisResult> {
  const input = buildAnalysisInput(kpis);
  let problems: string[] = [];
  let last: { report: AnalysisReport; model: string; check: VerifyResult } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { report, model } = await requestReport(input, problems);
    const check = verifyReport(report, input);
    last = { report, model, check };
    if (check.ok) return { report, input, model, promptVersion: PROMPT_VERSION, check: { ...check, attempts: attempt } };
    problems = [...check.violations.map((n) => `入力にない数字「${n}」`), ...check.shapeIssues];
  }
  return { report: last!.report, input, model: last!.model, promptVersion: PROMPT_VERSION, check: { ...last!.check, attempts: MAX_ATTEMPTS } };
}
