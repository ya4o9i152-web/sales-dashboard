// supabase/schema.sql を組み込みPostgres（PGlite）で実行し、権限と取り込み関数を検証する。
// 実行: npm run verify:schema
// authスキーマ・ロール・auth.uid() はSupabaseの代用を冒頭で作っている（本番のSupabaseでは不要）。

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create role authenticated nologin;
  create role anon nologin; -- ログインしていない利用者（Supabaseの anon キー）
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant usage on schema public to authenticated, anon;
`);

// 2回実行して、何度実行しても通ることを確かめる
const schema = readFileSync("supabase/schema.sql", "utf8");
await db.exec(schema);
await db.exec(schema);
console.log("schema.sql を2回実行OK");

const EDITOR = "00000000-0000-0000-0000-000000000001";
const VIEWER = "00000000-0000-0000-0000-000000000002";
await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"display_name":"マーケ担当"}'), ($2, '{}')`, [EDITOR, VIEWER]);
await db.query(`update profiles set role = 'editor' where id = $1`, [EDITOR]);

const as = async (uid, sql, params = []) => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
};
const fails = async (uid, sql, params = []) => {
  try {
    await as(uid, sql, params);
    return false;
  } catch {
    return true;
  }
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  →  ${detail}` : ""}`);
};

const row = (date, revenue) => ({ order_date: date, customer_id: "C001", product_name: "Tシャツ", category: "トップス", sku: "LUM-TOP-01", quantity: 1, revenue, cost: 1000 });
const importSql = `select import_sales($1, $2, 'utf-8', 0, $3::jsonb) as id`;
const totals = async () =>
  (await as(VIEWER, `select to_char(order_date,'YYYY-MM') m, sum(revenue)::int s, count(*)::int c from sales_data group by 1 order by 1`)).rows
    .map((r) => `${r.m}:${r.s}円/${r.c}行`)
    .join(" ");

let r = await as(EDITOR, `select role, display_name from profiles where id = $1`, [EDITOR]);
check("新規ユーザーに profiles が自動で作られる", r.rows[0]?.display_name === "マーケ担当");
r = await as(VIEWER, `select role from profiles where id = $1`, [VIEWER]);
check("新規ユーザーの既定は viewer（見る人）", r.rows[0]?.role === "viewer");

await as(EDITOR, importSql, ["9-10月.csv", ["2025-09", "2025-10"], JSON.stringify([row("2025-09-03", 1000), row("2025-10-03", 2000)])]);
check("editor は取り込める", (await totals()) === "2025-09:1000円/1行 2025-10:2000円/1行", await totals());

await as(EDITOR, importSql, ["10月_再.csv", ["2025-10"], JSON.stringify([row("2025-10-05", 5000), row("2025-10-06", 6000)])]);
check("同じ月を上げ直すと入れ替わる（9月は残る）", (await totals()) === "2025-09:1000円/1行 2025-10:11000円/2行", await totals());

check(
  "月の一覧と明細の日付が食い違うと全体が取り消される",
  (await fails(EDITOR, importSql, ["x.csv", ["2025-10"], JSON.stringify([row("2025-11-01", 999)])])) &&
    (await totals()) === "2025-09:1000円/1行 2025-10:11000円/2行",
  await totals(),
);
check(
  "カテゴリ外・負の金額はデータベースでも拒否する",
  (await fails(EDITOR, importSql, ["x.csv", ["2025-11"], JSON.stringify([{ ...row("2025-11-01", 1), category: "アウタ" }])])) &&
    (await fails(EDITOR, importSql, ["x.csv", ["2025-11"], JSON.stringify([row("2025-11-01", -1)])])),
);

check("viewer は取り込めない", await fails(VIEWER, importSql, ["x.csv", ["2025-11"], JSON.stringify([row("2025-11-01", 1)])]));
const upload = (await as(VIEWER, `select id from uploads limit 1`)).rows[0].id;
const denied = [];
for (const [label, sql, params] of [
  ["明細の追加", `insert into sales_data (upload_id, order_date, product_name, category, sku, quantity, revenue, cost) values ($1, '2025-11-01', 'x', 'トップス', 'x', 1, 1, 1)`, [upload]],
  ["集計結果の追加", `insert into kpi_snapshots (upload_id, kpis) values ($1, '{}')`, [upload]],
  ["自分を editor に変更", `update profiles set role = 'editor' where id = '${VIEWER}' returning id`, []],
]) {
  if (await fails(VIEWER, sql, params)) denied.push(`${label}:拒否`);
  else {
    // RLS で対象が0行になった場合は例外にならないので、件数で判定する
    const res = await as(VIEWER, `select role from profiles where id = $1`, [VIEWER]);
    denied.push(label === "自分を editor に変更" && res.rows[0].role === "viewer" ? `${label}:拒否（0行）` : `${label}:通ってしまった`);
  }
}
const deleted = await as(VIEWER, `delete from sales_data returning id`);
denied.push(deleted.rows.length === 0 ? "明細の削除:拒否（0行）" : "明細の削除:通ってしまった");
check("viewer は書き込めない", denied.every((d) => d.includes("拒否")), denied.join(" / "));

r = await as(VIEWER, `select count(*)::int c from sales_data`);
check("viewer は読める", r.rows[0].c === 3, `${r.rows[0].c}行`);

await db.exec(`set role anon;`);
r = await db.query(`select count(*)::int c from sales_data`).catch(() => ({ rows: [{ c: -1 }] }));
await db.exec(`reset role;`);
check("ログインしていなければ読めない", r.rows[0].c <= 0, r.rows[0].c < 0 ? "権限エラー" : `${r.rows[0].c}行`);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} 合格`);
process.exit(passed === results.length ? 0 : 1);
