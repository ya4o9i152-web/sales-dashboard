import { changeRate, type Kpis } from "../kpi";
import { monthLabel, percent, signedPercent, signedPoint, yen } from "../format";

/**
 * AIに渡す入力。数字はすべて計算済み・整形済みの文字列にする。
 * AIには計算させず、この文字列をそのまま引用させる（出力の数字をコードで照合できるようにするため）。
 * 生の明細と顧客IDは含めない。
 */
export function buildAnalysisInput(kpis: Kpis) {
  const latest = kpis.months[kpis.months.length - 1];
  const previous = kpis.months.length >= 2 ? kpis.months[kpis.months.length - 2] : undefined;
  const prevCategory = (category: string) => previous?.categories.find((c) => c.category === category)?.revenue;

  return {
    対象月: monthLabel(latest.month),
    前月: previous ? monthLabel(previous.month) : "なし",
    主要KPI: {
      売上: {
        当月: yen(latest.revenue),
        前月: previous ? yen(previous.revenue) : "—",
        前月比: signedPercent(changeRate(latest.revenue, previous?.revenue)),
      },
      粗利: {
        当月: yen(latest.grossProfit),
        前月: previous ? yen(previous.grossProfit) : "—",
        前月比: signedPercent(changeRate(latest.grossProfit, previous?.grossProfit)),
        粗利率_当月: percent(latest.grossMargin),
        粗利率_前月: previous ? percent(previous.grossMargin) : "—",
      },
      リピート率_全期間: {
        値: percent(kpis.repeat.rate),
        内訳: `${kpis.repeat.customers}人中${kpis.repeat.repeaters}人が2か月以上購入`,
      },
      当月の再購入率: {
        当月: percent(latest.rebuyRate),
        前月: previous ? percent(previous.rebuyRate) : "—",
        差: signedPoint(latest.rebuyRate, previous?.rebuyRate ?? null),
        内訳: `当月の購入者${latest.customers}人のうち${latest.returningCustomers}人が前月以前にも購入`,
      },
    },
    月次推移: kpis.months.map((m) => ({
      月: monthLabel(m.month),
      売上: yen(m.revenue),
      粗利: yen(m.grossProfit),
      粗利率: percent(m.grossMargin),
      購入者数: `${m.customers}人`,
    })),
    カテゴリ別_当月: latest.categories.map((c) => ({
      カテゴリ: c.category,
      当月売上: yen(c.revenue),
      前月売上: prevCategory(c.category) !== undefined ? yen(prevCategory(c.category)!) : "—",
      前月比: signedPercent(changeRate(c.revenue, prevCategory(c.category))),
    })),
    売れ筋_当月上位5: latest.topSkus.map((s, i) => ({
      順位: `${i + 1}位`,
      商品名: s.productName,
      数量: `${s.quantity}点`,
      売上: yen(s.revenue),
    })),
    売れ筋_全期間上位10: kpis.skuTop10.map((s, i) => ({
      順位: `${i + 1}位`,
      商品名: s.productName,
      カテゴリ: s.category,
      数量: `${s.quantity}点`,
      売上: yen(s.revenue),
    })),
  };
}

export type AnalysisInput = ReturnType<typeof buildAnalysisInput>;
