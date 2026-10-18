import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { SalesRow } from "./csv/parse";
import type { Kpis } from "./kpi";
import type { AnalysisReport } from "./analysis/prompt";
import type { AnalysisInput } from "./analysis/input";
import type { VerifyResult } from "./analysis/verify";

export type CurrentUser = { id: string; displayName: string; role: "editor" | "viewer" };

export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name, role").eq("id", id).single();
  return { id, displayName: profile?.display_name || "", role: profile?.role === "editor" ? "editor" : "viewer" };
}

export type Snapshot = { id: string; kpis: Kpis; createdAt: string; filename: string };
export type StoredReport = {
  id: string;
  report: AnalysisReport;
  input: AnalysisInput;
  model: string;
  promptVersion: string;
  check: VerifyResult & { attempts: number };
  generatedAt: string;
};

/** 画面に出す最新の集計結果と、それに対する最新のAIコメント */
export async function getLatestDashboard(): Promise<{ snapshot: Snapshot | null; report: StoredReport | null }> {
  const supabase = await createClient();
  const { data: snap, error } = await supabase
    .from("kpi_snapshots")
    .select("id, kpis, created_at, uploads(filename)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`集計結果を読み込めませんでした: ${error.message}`);
  if (!snap) return { snapshot: null, report: null };

  const { data: rep } = await supabase
    .from("ai_reports")
    .select("id, report, input, model, prompt_version, check_result, generated_at")
    .eq("snapshot_id", snap.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const upload = snap.uploads as unknown as { filename: string } | null;
  return {
    snapshot: { id: snap.id, kpis: snap.kpis as Kpis, createdAt: snap.created_at, filename: upload?.filename ?? "" },
    report: rep
      ? {
          id: rep.id,
          report: rep.report as AnalysisReport,
          input: rep.input as AnalysisInput,
          model: rep.model,
          promptVersion: rep.prompt_version,
          check: rep.check_result as StoredReport["check"],
          generatedAt: rep.generated_at,
        }
      : null,
  };
}

const PAGE_SIZE = 1000;

/**
 * 全期間の明細を読む。Supabase は1回の取得が既定で1,000行までなので、ページを分けて読む。
 * id を並びの最後に入れて、同じ日付の行がページの境目で重複・欠落しないようにする。
 */
export async function fetchAllSales(): Promise<SalesRow[]> {
  const supabase = await createClient();
  const rows: SalesRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sales_data")
      .select("order_date, customer_id, product_name, category, sku, quantity, revenue, cost")
      .order("order_date")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`明細を読み込めませんでした: ${error.message}`);
    rows.push(...(data as SalesRow[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}
