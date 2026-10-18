import { createClient } from "@supabase/supabase-js";

/**
 * Supabase の無料プランは、1週間アクセスがないと停止する。毎日1回だけ軽い読み取りを行って止めないようにする。
 * Vercel Cron からだけ呼べるよう、CRON_SECRET で確かめる。
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
  // 未ログインなので RLS により0行が返るが、データベースへのアクセスとして数えられる
  const { error } = await supabase.from("kpi_snapshots").select("id").limit(1);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
