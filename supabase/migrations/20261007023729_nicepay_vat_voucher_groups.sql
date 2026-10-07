create table if not exists public.nicepay_vat_voucher_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  product_names text[] not null default '{}',
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nicepay_vat_voucher_groups_name_unique
  on public.nicepay_vat_voucher_groups (lower(btrim(name)));

alter table public.nicepay_vat_voucher_groups enable row level security;
grant select, insert, update, delete on public.nicepay_vat_voucher_groups to authenticated;

create policy "approved app users only" on public.nicepay_vat_voucher_groups
  for all to authenticated
  using (public.has_active_app_access())
  with check (public.has_active_app_access());

create trigger touch_nicepay_vat_voucher_groups_updated_at
  before update on public.nicepay_vat_voucher_groups
  for each row execute function public.touch_nicepay_vat_updated_at();
