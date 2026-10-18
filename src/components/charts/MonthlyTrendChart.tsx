"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel, percent, yen } from "@/lib/format";
import type { MonthKpi } from "@/lib/kpi";

const NAVY = "#1a2e5c";
const SERIES_2 = "#5b8de0";

/** 売上と粗利は同じ「円」なので、1本の軸に並べる（2軸グラフにしない） */
export function MonthlyTrendChart({ months }: { months: MonthKpi[] }) {
  const data = months.map((m) => ({ label: monthLabel(m.month).replace(/^\d+年/, ""), month: m.month, revenue: m.revenue, grossProfit: m.grossProfit, margin: m.grossMargin }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#d1d5db" }} tick={{ fill: "#4b5563", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}万` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "rgba(26,46,92,0.06)" }}
            formatter={(value, name) => [yen(Number(value)), name]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              return p ? `${monthLabel(p.month)}（粗利率 ${percent(p.margin)}）` : "";
            }}
          />
          {/* 凡例は系列の順（売上→粗利）。既定では名前順に並び替えられる */}
          <Legend itemSorter={null} formatter={(value) => <span className="text-sm text-ink">{value}</span>} />
          <Bar dataKey="revenue" name="売上" fill={NAVY} isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList dataKey="revenue" position="top" formatter={(v) => yen(Number(v))} style={{ fill: "#1f2937", fontSize: 11 }} />
          </Bar>
          <Bar dataKey="grossProfit" name="粗利" fill={SERIES_2} isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
