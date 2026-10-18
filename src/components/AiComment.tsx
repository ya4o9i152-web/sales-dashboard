import type { StoredReport } from "@/lib/data";
import { RegenerateButton } from "./RegenerateButton";

const PRIORITY = { high: "優先度 高", medium: "優先度 中", low: "優先度 低" } as const;

export function AiComment({ report, snapshotId, canRegenerate }: { report: StoredReport | null; snapshotId: string; canRegenerate: boolean }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-dashed border-line p-6 text-sm text-ink-muted">
        <p>この集計に対するAIのコメントはまだありません。</p>
        {canRegenerate && <RegenerateButton snapshotId={snapshotId} label="コメントを作成する" />}
      </div>
    );
  }
  const { summary, highlights, concerns, actions } = report.report;
  return (
    <div className="space-y-5">
      {!report.check.ok && (
        <p role="alert" className="rounded-md border border-down/30 bg-down/5 px-3 py-2 text-sm text-down">
          ⚠ 要確認：コメントにダッシュボードと一致しない数字があります（{report.check.violations.join("、") || report.check.shapeIssues.join("、")}）。
          数字はダッシュボードの値を正としてください。
        </p>
      )}
      <p className="leading-relaxed">{summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-bold text-navy">良かった点</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-bold text-navy">懸念点</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {concerns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-bold text-navy">翌月のアクション</h4>
        <ol className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="rounded-lg bg-navy-50 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-navy px-2 py-0.5 text-xs font-medium text-white">{PRIORITY[a.priority]}</span>
                <span className="font-bold">{a.target}</span>
              </div>
              <p className="mt-2 leading-relaxed">{a.action}</p>
              <p className="mt-1 text-xs text-ink-muted">根拠：{a.evidence}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>
          {new Date(report.generatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 作成 ／ {report.model} ／ プロンプト {report.promptVersion}
        </span>
        {canRegenerate && <RegenerateButton snapshotId={snapshotId} label="作り直す" />}
      </div>
    </div>
  );
}
