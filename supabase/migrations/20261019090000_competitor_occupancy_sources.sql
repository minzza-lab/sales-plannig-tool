create table if not exists public.competitor_occupancy_sources (
  id uuid primary key default gen_random_uuid(),
  period date not null unique,
  source_files jsonb not null default '[]'::jsonb,
  occupancy_rows jsonb not null default '[]'::jsonb,
  performance_metrics jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

alter table public.competitor_occupancy_sources enable row level security;
revoke all on public.competitor_occupancy_sources from anon, authenticated;
grant select, insert, update on public.competitor_occupancy_sources to authenticated;

create policy "approved team reads competitor occupancy sources"
on public.competitor_occupancy_sources for select to authenticated
using (public.has_active_app_access());

create policy "approved team inserts competitor occupancy sources"
on public.competitor_occupancy_sources for insert to authenticated
with check (public.has_active_app_access() and uploaded_by = (select auth.uid()));

create policy "approved team updates competitor occupancy sources"
on public.competitor_occupancy_sources for update to authenticated
using (public.has_active_app_access())
with check (public.has_active_app_access() and uploaded_by = (select auth.uid()));
