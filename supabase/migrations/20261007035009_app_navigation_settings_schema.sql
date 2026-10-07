create table if not exists public.app_navigation_settings (
  id text primary key check (id = 'main'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.app_navigation_settings enable row level security;
revoke all on public.app_navigation_settings from anon, authenticated;
grant select, insert, update on public.app_navigation_settings to authenticated;

create policy "approved team reads navigation settings"
on public.app_navigation_settings for select to authenticated
using (public.has_active_app_access());

create policy "admins insert navigation settings"
on public.app_navigation_settings for insert to authenticated
with check (public.is_app_admin() and updated_by = (select auth.uid()));

create policy "admins update navigation settings"
on public.app_navigation_settings for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin() and updated_by = (select auth.uid()));
