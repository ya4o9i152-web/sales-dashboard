import Link from "next/link";
import { Header } from "@/components/Header";
import { KpiCards } from "@/components/KpiCards";
import { MonthlyTrendChart } from "@/components/charts/MonthlyTrendChart";
import { CategoryChart } from "@/components/charts/CategoryChart";
import { SkuRanking } from "@/components/SkuRanking";
import { AiComment } from "@/components/AiComment";
import { getCurrentUser, getLatestDashboard } from "@/lib/data";
import { monthLabel } from "@/lib/format";

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="font-bold text-navy">{title}</h2>
        {note && <span className="text-xs text-ink-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const [user, { snapshot, report }] = await Promise.all([getCurrentUser(), getLatestDashboard()]);

  if (!snapshot) {
    return (
      <>
        <Header user={user} current="dashboard" />
        <main className="mx-auto max-w-6xl px-4 py-16 text-center">
          <p className="text-ink-muted">まだデータがありません。</p>
          {user.role === "editor" ? (
            <Link href="/upload" className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-white">
              最初のCSVを取り込む
            </Link>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">担当者がCSVを取り込むと、ここに表示されます。</p>
          )}
        </main>
      </>
    );
  }

  const { kpis } = snapshot;
  const first = kpis.months[0].month;
  return (
    <>
      <Header user={user} current="dashboard" />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold">{monthLabel(kpis.latestMonth)}の実績</h1>
          <p className="text-xs text-ink-muted">
            データ期間 {monthLabel(first)}〜{monthLabel(kpis.latestMonth)} ／ 最終更新{" "}
            {new Date(snapshot.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>

        <KpiCards kpis={kpis} />

        <Panel title="AIの分析コメント" note="数字はダッシュボードの集計値をそのまま引用しています">
          <AiComment report={report} snapshotId={snapshot.id} canRegenerate={user.role === "editor"} />
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="月次推移" note="売上・粗利">
            <MonthlyTrendChart months={kpis.months} />
          </Panel>
          <Panel title="カテゴリ別の売上" note="データ期間の合計">
            <CategoryChart categories={kpis.categories} total={kpis.total.revenue} />
          </Panel>
        </div>

        <Panel title="売れ筋商品トップ10" note="データ期間の合計・売上順">
          <SkuRanking skus={kpis.skuTop10} />
        </Panel>
      </main>
    </>
  );
}
