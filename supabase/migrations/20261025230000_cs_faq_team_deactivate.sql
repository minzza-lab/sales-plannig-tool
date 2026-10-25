-- 삭제는 수정 로그를 보존하기 위해 게시 FAQ를 비활성화하는 방식으로 처리한다.
drop policy if exists "cs faqs team deactivate" on public.cs_faqs;
create policy "cs faqs team deactivate" on public.cs_faqs
  for update to authenticated
  using (public.has_active_app_access() and status = '게시')
  with check (public.has_active_app_access() and status in ('게시', '비활성화'));
