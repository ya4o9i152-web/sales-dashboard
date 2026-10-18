import { changeRate, type Kpis } from "@/lib/kpi";
import { percent, signedPercent, signedPoint, yen } from "@/lib/format";

/** 増減は色だけでなく矢印と符号でも示す（色の見分けに頼らない） */
function Change({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-ink-muted">{label} —</span>;
  const up = value > 0;
  const flat = Math.round(value * 1000) === 0;
  return (
    <span className={flat ? "text-ink-muted" : up ? "text-up" : "text-down"}>
      {flat ? "→" : up ? "▲" : "▼"} {label} {signedPercent(value)}
    </span>
  );
}

function Card({ title, value, children }: { title: string; value: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
      <p className="mt-1 text-3xl font-bold tracking-tight text-navy tabular-nums">{value}</p>
      <div className="mt-3 space-y-1 text-sm tabular-nums">{children}</div>
    </section>
  );
}

export function KpiCards({ kpis }: { kpis: Kpis }) {
  const latest = kpis.months[kpis.months.length - 1];
  const prev = kpis.months.length >= 2 ? kpis.months[kpis.months.length - 2] : undefined;
  const rebuyDiff = signedPoint(latest.rebuyRate, prev?.rebuyRate ?? null);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="売上" value={yen(latest.revenue)}>
        <p>
          <Change value={changeRate(latest.revenue, prev?.revenue)} label="前月比" />
        </p>
        <p className="text-ink-muted">前月 {prev ? yen(prev.revenue) : "—"}</p>
      </Card>
      <Card title="粗利" value={yen(latest.grossProfit)}>
        <p>
          <Change value={changeRate(latest.grossProfit, prev?.grossProfit)} label="前月比" />
        </p>
        <p className="text-ink-muted">
          粗利率 {percent(latest.grossMargin)}（前月 {prev ? percent(prev.grossMargin) : "—"}）
        </p>
      </Card>
      <Card title="リピート率（全期間）" value={percent(kpis.repeat.rate)}>
        <p className="text-ink-muted">
          {kpis.repeat.customers}人中{kpis.repeat.repeaters}人が2か月以上購入
        </p>
        <p className="text-ink-muted">
          当月の再購入率 {percent(latest.rebuyRate)}（前月比 {rebuyDiff}）
        </p>
      </Card>
    </div>
  );
}
