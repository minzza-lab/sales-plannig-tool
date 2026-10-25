-- CS센터를 팀 공용 오픈북으로 운영하기 위한 첨부자료와 댓글
create table if not exists public.cs_faq_assets (
  id uuid primary key default gen_random_uuid(),
  faq_id uuid not null references public.cs_faqs(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.cs_faq_comments (
  id uuid primary key default gen_random_uuid(),
  faq_id uuid not null references public.cs_faqs(id) on delete cascade,
  comment text not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.cs_faq_assets enable row level security;
alter table public.cs_faq_comments enable row level security;

drop policy if exists "cs faqs team create posted" on public.cs_faqs;
create policy "cs faqs team create posted" on public.cs_faqs
  for insert to authenticated
  with check (public.has_active_app_access() and status = '게시');

drop policy if exists "cs faq assets active read" on public.cs_faq_assets;
create policy "cs faq assets active read" on public.cs_faq_assets for select to authenticated
  using (public.has_active_app_access());
drop policy if exists "cs faq assets active insert" on public.cs_faq_assets;
create policy "cs faq assets active insert" on public.cs_faq_assets for insert to authenticated
  with check (public.has_active_app_access());
drop policy if exists "cs faq assets active delete" on public.cs_faq_assets;
create policy "cs faq assets active delete" on public.cs_faq_assets for delete to authenticated
  using (public.has_active_app_access());

drop policy if exists "cs faq comments active read" on public.cs_faq_comments;
create policy "cs faq comments active read" on public.cs_faq_comments for select to authenticated
  using (public.has_active_app_access());
drop policy if exists "cs faq comments active insert" on public.cs_faq_comments;
create policy "cs faq comments active insert" on public.cs_faq_comments for insert to authenticated
  with check (public.has_active_app_access() and created_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('cs-faq-assets', 'cs-faq-assets', false)
on conflict (id) do nothing;

drop policy if exists "cs faq storage active read" on storage.objects;
create policy "cs faq storage active read" on storage.objects for select to authenticated
  using (bucket_id = 'cs-faq-assets' and public.has_active_app_access());
drop policy if exists "cs faq storage active insert" on storage.objects;
create policy "cs faq storage active insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cs-faq-assets' and public.has_active_app_access());
drop policy if exists "cs faq storage active delete" on storage.objects;
create policy "cs faq storage active delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cs-faq-assets' and public.has_active_app_access());
