create table if not exists public.naver_settlement_product_mappings (
  id text primary key check (id = 'main'),
  mappings jsonb not null default '{}'::jsonb check (jsonb_typeof(mappings) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.naver_settlement_product_mappings enable row level security;
revoke all on public.naver_settlement_product_mappings from anon, authenticated;
grant select, insert, update on public.naver_settlement_product_mappings to authenticated;

create policy "approved team reads Naver settlement mappings"
on public.naver_settlement_product_mappings for select to authenticated
using (public.has_active_app_access());

create policy "approved team inserts Naver settlement mappings"
on public.naver_settlement_product_mappings for insert to authenticated
with check (public.has_active_app_access() and updated_by = (select auth.uid()));

create policy "approved team updates Naver settlement mappings"
on public.naver_settlement_product_mappings for update to authenticated
using (public.has_active_app_access())
with check (public.has_active_app_access() and updated_by = (select auth.uid()));
