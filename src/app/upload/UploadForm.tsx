"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { parseSalesCsv, type ParseResult } from "@/lib/csv/parse";
import { monthLabel } from "@/lib/format";
import { generateReport, importCsv } from "./actions";

type Step = "idle" | "importing" | "analyzing" | "done";

/**
 * 1. ファイルを選ぶと、ブラウザですぐに検証して結果を見せる（取り込む前に誤りがわかる）
 * 2. 「取り込む」で、サーバーが同じ検証をしてから保存・集計する
 * 3. 続けてAIのコメントを作り、できたらダッシュボードへ移る
 */
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function select(selected: File | undefined) {
    setMessage(null);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setPreview(null);
      setMessage("拡張子が .csv のファイルを選んでください");
      return;
    }
    setFile(selected);
    setPreview(parseSalesCsv(new Uint8Array(await selected.arrayBuffer())));
  }

  async function submit() {
    if (!file) return;
    setStep("importing");
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    const imported = await importCsv(formData);
    if (!imported.ok) {
      setStep("idle");
      setMessage(imported.message);
      if (imported.errors) setPreview({ ok: false, errors: imported.errors, encoding: null });
      return;
    }
    setStep("analyzing");
    const report = await generateReport(imported.snapshotId);
    setStep("done");
    if (!report.ok) {
      setMessage(`データの取り込みは完了しました。${report.message}`);
      return;
    }
    router.push("/");
  }

  const busy = step === "importing" || step === "analyzing";

  return (
    <div className="mt-6 space-y-5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) select(e.dataTransfer.files[0]);
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-navy bg-navy-50" : "border-navy-100 hover:bg-navy-50/60"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="font-medium text-navy">ここにCSVをドラッグ＆ドロップ</p>
        <p className="mt-1 text-sm text-ink-muted">またはクリックしてファイルを選ぶ</p>
        {file && <p className="mt-3 text-sm">選択中：{file.name}</p>}
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => select(e.target.files?.[0])} />
      </div>

      {message && (
        <p role="alert" className="rounded-md border border-down/30 bg-down/5 px-3 py-2 text-sm text-down">
          {message}
          {step === "done" && (
            <Link href="/" className="ml-2 underline">
              ダッシュボードを見る
            </Link>
          )}
        </p>
      )}

      {preview && !preview.ok && <ErrorTable errors={preview.errors} />}

      {preview?.ok && (
        <section className="rounded-xl border border-line p-5 text-sm">
          <h2 className="font-bold text-navy">取り込み前の確認</h2>
          <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1.5">
            <dt className="text-ink-muted">行数</dt>
            <dd>{preview.rows.length}行</dd>
            <dt className="text-ink-muted">入れ替える月</dt>
            <dd>{preview.months.map(monthLabel).join("、")}</dd>
            <dt className="text-ink-muted">文字コード</dt>
            <dd>{preview.encoding === "shift_jis" ? "Shift_JIS（Excelで保存し直したCSV）" : "UTF-8"}</dd>
            <dt className="text-ink-muted">自動で補正</dt>
            <dd>{preview.cleanings.length === 0 ? "なし" : `${preview.cleanings.length}か所`}</dd>
            {preview.missingCustomerIds > 0 && (
              <>
                <dt className="text-ink-muted">顧客IDなし</dt>
                <dd>{preview.missingCustomerIds}行（リピート率の計算から除きます）</dd>
              </>
            )}
          </dl>
          {preview.cleanings.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-navy">補正した内容を見る</summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {preview.cleanings.map((c, i) => (
                  <li key={i}>
                    {c.line}行目 {c.column}：「{c.before}」→「{c.after}」（{c.reason}）
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            onClick={submit}
            disabled={busy || step === "done"}
            className="mt-5 w-full rounded-md bg-navy py-2.5 font-medium text-white disabled:opacity-60"
          >
            {step === "importing" ? "取り込み・集計中…" : step === "analyzing" ? "AIがコメントを作成中…（30秒〜1分）" : "取り込む"}
          </button>
        </section>
      )}
    </div>
  );
}

function ErrorTable({ errors }: { errors: { line: number; column: string; value: string; reason: string }[] }) {
  return (
    <section className="rounded-xl border border-down/30 p-5 text-sm">
      <h2 className="font-bold text-down">取り込めない行が {errors.length} か所あります</h2>
      <p className="mt-1 text-ink-muted">CSVを直してから、もう一度選んでください。1か所でも誤りがあると、どの行も取り込みません（数字のずれを防ぐため）。</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-ink-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-medium">行</th>
              <th className="py-1.5 pr-3 font-medium">列</th>
              <th className="py-1.5 pr-3 font-medium">値</th>
              <th className="py-1.5 font-medium">理由</th>
            </tr>
          </thead>
          <tbody>
            {errors.slice(0, 100).map((e, i) => (
              <tr key={i} className="border-b border-line/70">
                <td className="py-1.5 pr-3 tabular-nums">{e.line}</td>
                <td className="py-1.5 pr-3">{e.column}</td>
                <td className="py-1.5 pr-3 font-mono">{e.value || "（空）"}</td>
                <td className="py-1.5">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {errors.length > 100 && <p className="mt-2 text-ink-muted">ほか {errors.length - 100} か所</p>}
      </div>
    </section>
  );
}
