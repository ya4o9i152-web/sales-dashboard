"use server";

import { revalidatePath } from "next/cache";
import { parseSalesCsv, type Cleaning, type RowError } from "@/lib/csv/parse";
import { computeKpis, type Kpis } from "@/lib/kpi";
import { fetchAllSales, getCurrentUser } from "@/lib/data";
import { generateAnalysis } from "@/lib/analysis/generate";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 4 * 1024 * 1024;

export type ImportResult =
  | { ok: true; snapshotId: string; rowCount: number; months: string[]; cleanings: Cleaning[]; missingCustomerIds: number; encoding: string }
  | { ok: false; message: string; errors?: RowError[] };

/**
 * CSVを取り込み、全期間を集計し直して保存する。
 * ブラウザでも同じ検証をしているが、改ざんされた送信もあり得るため、サーバーでもう一度検証する。
 */
export async function importCsv(formData: FormData): Promise<ImportResult> {
  const user = await getCurrentUser();
  if (user.role !== "editor") return { ok: false, message: "データを取り込めるのは担当者だけです" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "CSVファイルを選んでください" };
  if (!file.name.toLowerCase().endsWith(".csv")) return { ok: false, message: "拡張子が .csv のファイルを選んでください" };
  if (file.size > MAX_BYTES) return { ok: false, message: "ファイルが大きすぎます（4MBまで）" };

  const parsed = parseSalesCsv(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.ok) return { ok: false, message: "CSVに取り込めない行があります", errors: parsed.errors };

  const supabase = await createClient();
  const { data: uploadId, error } = await supabase.rpc("import_sales", {
    p_filename: file.name,
    p_months: parsed.months,
    p_encoding: parsed.encoding,
    p_cleaned_count: parsed.cleanings.length,
    p_rows: parsed.rows,
  });
  if (error) return { ok: false, message: `取り込みに失敗しました：${error.message}` };

  // 上げ直した月以外も含めて、全期間を計算し直す（リピート率は全期間の購入履歴で決まるため）
  const kpis = computeKpis(await fetchAllSales());
  const { data: snapshot, error: snapError } = await supabase
    .from("kpi_snapshots")
    .insert({ upload_id: uploadId, kpis })
    .select("id")
    .single();
  if (snapError) return { ok: false, message: `集計結果の保存に失敗しました：${snapError.message}` };

  revalidatePath("/");
  return {
    ok: true,
    snapshotId: snapshot.id,
    rowCount: parsed.rows.length,
    months: parsed.months,
    cleanings: parsed.cleanings,
    missingCustomerIds: parsed.missingCustomerIds,
    encoding: parsed.encoding,
  };
}

/** 集計結果に対するAIコメントを作って保存する。取り込みとは分けて、失敗しても取り込んだデータは残す */
export async function generateReport(snapshotId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (user.role !== "editor") return { ok: false, message: "コメントを作り直せるのは担当者だけです" };

  const supabase = await createClient();
  const { data: snap, error } = await supabase.from("kpi_snapshots").select("kpis").eq("id", snapshotId).single();
  if (error) return { ok: false, message: "集計結果が見つかりません" };

  try {
    const result = await generateAnalysis(snap.kpis as Kpis);
    const { error: insertError } = await supabase.from("ai_reports").insert({
      snapshot_id: snapshotId,
      report: result.report,
      input: result.input,
      model: result.model,
      prompt_version: result.promptVersion,
      check_result: result.check,
      generated_by: user.id,
    });
    if (insertError) return { ok: false, message: `コメントの保存に失敗しました：${insertError.message}` };
  } catch (e) {
    console.error("AI分析の生成に失敗", e);
    return { ok: false, message: "AIのコメントを作成できませんでした。時間をおいて「作り直す」を押してください" };
  }
  revalidatePath("/");
  return { ok: true };
}
