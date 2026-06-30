-- 在 Supabase SQL Editor 里执行这段 SQL

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  contact text not null,
  memo text,
  items jsonb not null,
  total integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- 不需要创建 RLS policy。
-- 前端不会直接连接 Supabase，所有读写都走 Vercel 的 /api/orders。
-- Vercel API 使用 service_role key，service_role key 必须只放在 Vercel 环境变量里，绝对不要写进前端 JS。
