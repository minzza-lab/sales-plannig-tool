create table if not exists public.naver_vat_step3_settings (
  id text primary key check (id = 'main'),
  product_mappings jsonb not null default '{}'::jsonb check (jsonb_typeof(product_mappings) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.naver_vat_step3_settings enable row level security;
revoke all on public.naver_vat_step3_settings from anon, authenticated;
grant select, insert, update on public.naver_vat_step3_settings to authenticated;

create policy "approved team reads Naver VAT step 3 settings"
on public.naver_vat_step3_settings for select to authenticated
using (public.has_active_app_access());

create policy "approved team inserts Naver VAT step 3 settings"
on public.naver_vat_step3_settings for insert to authenticated
with check (public.has_active_app_access() and updated_by = (select auth.uid()));

create policy "approved team updates Naver VAT step 3 settings"
on public.naver_vat_step3_settings for update to authenticated
using (public.has_active_app_access())
with check (public.has_active_app_access() and updated_by = (select auth.uid()));
