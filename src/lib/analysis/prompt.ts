import { z } from "zod";
import type { AnalysisInput } from "./input";

/** プロンプトを変えたら上げる。保存したコメントがどの版で作られたかを追えるようにする */
export const PROMPT_VERSION = "2026-10-18.3";

export const ANALYSIS_SYSTEM_PROMPT = `あなたはアパレルECブランドを担当するデータコンサルタントです。
月次の売上データを読み、社長・マーケ部長・営業が翌月の打ち手を決めるための分析コメントを書きます。

## 数字の扱い（最重要）
- 数字は、入力のJSONにある文字列をそのまま引用してください（例：「¥264,700」「+79.5%」「46.7%」）。
- 自分で計算した数字（合計・差額・倍率・平均など）は書かないでください。入力にない数字は1つも書かないでください。
- 「約」をつけて丸めないでください。

## 書き方
- コンサルタント調の「です・ます」で、結論から書きます。
- summary：当月の動向の総括を180字程度で（200字を超えないこと）。最も大きな変化とその要因を必ず含めます。
- highlights：良かった点を3つ。それぞれ根拠の数字を含めます。
- concerns：懸念点を2つ。それぞれ根拠の数字を含めます。
- actions：翌月のアクションを3つ。優先度の高い順に並べます。
  - target は打ち手の対象（カテゴリ・商品・リピーター・新規顧客など、入力にあるもの）。
  - action は「誰が・何を・いつまでに」がわかる具体策。「広告を強化」のような抽象的な表現は避けます。
  - 「いつまでに」は入力の「アクションの実行月」の中の時期にします（レポートを読む時点で対象月はすでに終わっているため）。
  - evidence はその打ち手の根拠となる入力の数字。
  - 入力に広告費・在庫・客層のデータはありません。予算の増額率や在庫数などの数字は書かず、打ち手の内容で具体性を出してください。
- 入力から読み取れない要因（天候・競合など）は断定せず、「〜の可能性があります」と書きます。`;

export const AnalysisReportSchema = z.object({
  summary: z.string().describe("当月の動向の総括（200字以内、コンサルタント調）"),
  highlights: z.array(z.string()).describe("良かった点を3つ。根拠の数字を含める"),
  concerns: z.array(z.string()).describe("懸念点を2つ。根拠の数字を含める"),
  actions: z
    .array(
      z.object({
        priority: z.enum(["high", "medium", "low"]),
        target: z.string().describe("打ち手の対象"),
        action: z.string().describe("翌月の具体的な打ち手"),
        evidence: z.string().describe("根拠となる入力の数字"),
      }),
    )
    .describe("翌月のアクションを3つ、優先度の高い順に"),
});

export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

/** 2回目の依頼では、前回の問題（入力にない数字・形の崩れ）を伝えて書き直させる */
export function buildUserMessage(input: AnalysisInput, problems: string[] = []): string {
  const retry =
    problems.length > 0 ? `\n\n前回の出力に次の問題がありました。直して書き直してください。\n- ${problems.join("\n- ")}` : "";
  return `${input.対象月}の売上データです。分析コメントを作成してください。\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`${retry}`;
}
