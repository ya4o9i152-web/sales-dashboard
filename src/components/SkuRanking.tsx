import { yen } from "@/lib/format";
import type { Kpis } from "@/lib/kpi";

/** SKUトップ10。順位は表のほうが読みやすいので、売上の大きさを行内の棒で添える */
export function SkuRanking({ skus }: { skus: Kpis["skuTop10"] }) {
  const max = Math.max(...skus.map((s) => s.revenue), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            <th className="w-10 py-2 font-medium">順位</th>
            <th className="py-2 font-medium">商品</th>
            <th className="hidden py-2 font-medium sm:table-cell">カテゴリ</th>
            <th className="py-2 text-right font-medium">数量</th>
            <th className="py-2 pl-3 text-right font-medium">売上</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((s, i) => (
            <tr key={s.sku} className="border-b border-line/70">
              <td className="py-2 font-bold text-navy tabular-nums">{i + 1}</td>
              <td className="py-2">
                <div>{s.productName}</div>
                <div className="mt-1 h-1.5 rounded-full bg-navy-50">
                  <div className="h-1.5 rounded-full bg-navy" style={{ width: `${(s.revenue / max) * 100}%` }} />
                </div>
              </td>
              <td className="hidden py-2 text-ink-muted sm:table-cell">{s.category}</td>
              <td className="py-2 text-right tabular-nums">{s.quantity}点</td>
              <td className="py-2 pl-3 text-right tabular-nums">{yen(s.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
