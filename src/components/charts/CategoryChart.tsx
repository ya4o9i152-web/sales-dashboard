"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { percent, yen } from "@/lib/format";
import type { Kpis } from "@/lib/kpi";

/** カテゴリ別の売上（全期間）。1系列なので色はネイビー1色、値は棒の右に直接書く */
export function CategoryChart({ categories, total }: { categories: Kpis["categories"]; total: number }) {
  const data = categories.map((c) => ({ ...c, share: total === 0 ? null : c.revenue / total }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="category" width={84} tickLine={false} axisLine={false} tick={{ fill: "#1f2937", fontSize: 13 }} />
          <Tooltip
            cursor={{ fill: "rgba(26,46,92,0.06)" }}
            formatter={(value, _name, item) => [`${yen(Number(value))}（構成比 ${percent(item.payload.share)}）`, "売上"]}
          />
          <Bar dataKey="revenue" fill="#1a2e5c" radius={[0, 4, 4, 0]} barSize={22}>
            <LabelList
              dataKey="revenue"
              position="right"
              formatter={(v) => yen(Number(v))}
              style={{ fill: "#1f2937", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
