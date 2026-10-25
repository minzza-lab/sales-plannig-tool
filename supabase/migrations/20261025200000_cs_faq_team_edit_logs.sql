-- 게시 FAQ는 승인 절차 없이 팀원이 직접 보완하고, 이전 내용은 수정 이력으로 남긴다.
drop policy if exists "cs faqs team edit published" on public.cs_faqs;
create policy "cs faqs team edit published" on public.cs_faqs
  for update to authenticated
  using (public.has_active_app_access() and status = '게시')
  with check (public.has_active_app_access() and status = '게시');

drop policy if exists "cs revisions active read" on public.cs_faq_revisions;
create policy "cs revisions active read" on public.cs_faq_revisions
  for select to authenticated using (public.has_active_app_access());

drop policy if exists "cs revisions active insert" on public.cs_faq_revisions;
create policy "cs revisions active insert" on public.cs_faq_revisions
  for insert to authenticated with check (public.has_active_app_access());
