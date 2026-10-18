/**
 * 画面とAIへの入力で共通に使う数字の書式。
 * AIには整形済みの文字列を渡し、そのまま使わせる（画面とコメントの数字を一致させるため）。
 */

export function yen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

/** 0.2857 → "28.6%" */
export function percent(value: number | null): string {
  if (value === null) return "—";
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

/** 0.7946 → "+79.5%"、-0.006 → "-0.6%" */
export function signedPercent(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

/** 0.385 → 0.467 のような率の差をポイントで表す："+8.2pt" */
export function signedPoint(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "—";
  const diff = Math.round((current - previous) * 1000) / 10;
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pt`;
}

/** "2025-11" → "2025年11月" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}
