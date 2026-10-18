-- 売上分析ダッシュボード スキーマ
-- Supabase の SQL Editor で1回実行する。何度実行しても同じ状態になるように書いている。

-- ───────────────────────────────────────────
-- 利用者と権限（作る人＝editor／見る人＝viewer）
-- ───────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now()
);

-- 新しいユーザーは「見る人」で作る。editor への変更は管理者が SQL かスクリプトで行う
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- RLS の中から profiles を読むと再帰するため、security definer で権限だけを引く
create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'editor')
$$;

-- ───────────────────────────────────────────
-- 取り込み
-- ───────────────────────────────────────────
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  filename text not null,
  row_count integer not null check (row_count > 0),
  months text[] not null,             -- このCSVに含まれる月（YYYY-MM）。これらの月の明細を入れ替えた
  encoding text not null,             -- utf-8 / shift_jis
  cleaned_count integer not null default 0,  -- 自動で補正したセルの数
  uploaded_at timestamptz not null default now()
);

-- 金額は円の整数（bigint）。NUMERIC は supabase-js で文字列として返り、足し算が文字の連結になりやすい
create table if not exists sales_data (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  order_date date not null,
  customer_id text,
  product_name text not null,
  category text not null check (category in ('トップス', 'ボトムス', 'アウター', 'アクセサリー')),
  sku text not null,
  quantity integer not null check (quantity > 0),
  revenue bigint not null check (revenue >= 0),
  cost bigint not null check (cost >= 0)
);
create index if not exists sales_data_order_date_idx on sales_data (order_date);

-- 集計結果（全期間ぶん）。アップロードのたびに計算し直して追加する。画面は最新の1件を読むだけ
create table if not exists kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  kpis jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists kpi_snapshots_created_at_idx on kpi_snapshots (created_at desc);

-- AIの分析コメント。後から「なぜこのコメントになったか」を追えるよう、入力・モデル・プロンプトの版・照合結果も残す
create table if not exists ai_reports (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references kpi_snapshots(id) on delete cascade,
  report jsonb not null,
  input jsonb not null,
  model text not null,
  prompt_version text not null,
  check_result jsonb not null,        -- { ok, violations, shapeIssues, attempts }
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default now()
);
create index if not exists ai_reports_snapshot_idx on ai_reports (snapshot_id, generated_at desc);

-- ───────────────────────────────────────────
-- CSVの取り込み（1つのトランザクションで実行）
--   CSVに含まれる月の明細を消してから入れ直す。同じ月を2回上げても二重計上にならない。
--   途中で失敗したら、消した明細も含めてすべて元に戻る。
-- ───────────────────────────────────────────
create or replace function import_sales(
  p_filename text,
  p_months text[],
  p_encoding text,
  p_cleaned_count integer,
  p_rows jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_upload_id uuid;
  v_inserted integer;
begin
  if not is_editor() then
    raise exception 'データを取り込めるのは担当者（editor）だけです' using errcode = '42501';
  end if;

  insert into uploads (user_id, filename, row_count, months, encoding, cleaned_count)
  values (auth.uid(), p_filename, jsonb_array_length(p_rows), p_months, p_encoding, p_cleaned_count)
  returning id into v_upload_id;

  delete from sales_data where to_char(order_date, 'YYYY-MM') = any (p_months);

  insert into sales_data (upload_id, order_date, customer_id, product_name, category, sku, quantity, revenue, cost)
  select v_upload_id, r.order_date, r.customer_id, r.product_name, r.category, r.sku, r.quantity, r.revenue, r.cost
  from jsonb_to_recordset(p_rows) as r(
    order_date date, customer_id text, product_name text, category text, sku text,
    quantity integer, revenue bigint, cost bigint
  );
  get diagnostics v_inserted = row_count;

  -- 送った行とCSVに含まれる月が食い違っていないか（月の一覧の渡し忘れで、古い明細が残るのを防ぐ）
  if exists (
    select 1 from sales_data where upload_id = v_upload_id and not (to_char(order_date, 'YYYY-MM') = any (p_months))
  ) then
    raise exception 'CSVの月の一覧と明細の日付が一致しません';
  end if;

  return v_upload_id;
end $$;

-- ───────────────────────────────────────────
-- 閲覧制限（RLS）：ログインした人は読める。書き込めるのは editor だけ
-- ───────────────────────────────────────────
alter table profiles enable row level security;
alter table uploads enable row level security;
alter table sales_data enable row level security;
alter table kpi_snapshots enable row level security;
alter table ai_reports enable row level security;

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select to authenticated using (true);
-- profiles の書き込み用ポリシーは作らない（権限の変更は管理者だけ）

do $$
declare t text;
begin
  foreach t in array array['uploads', 'sales_data', 'kpi_snapshots', 'ai_reports'] loop
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (true)', t);
    execute format('drop policy if exists "editor writes %1$s" on %1$I', t);
    execute format('create policy "editor writes %1$s" on %1$I for all to authenticated using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

-- Supabase Free の自動停止を防ぐため、Vercel Cron が毎日呼ぶ。データは何も返さない
create or replace function keepalive() returns boolean language sql stable as $$ select true $$;
grant execute on function keepalive() to anon;

-- 「Automatically expose new tables」をオフにしたプロジェクトでも動くよう、必要な権限だけを明示する
grant select on profiles to authenticated;
grant select, insert, update, delete on uploads, sales_data, kpi_snapshots, ai_reports to authenticated;
grant execute on function import_sales(text, text[], text, integer, jsonb) to authenticated;
grant execute on function is_editor() to authenticated;
