-- 운영 편의를 위해 기존 FAQ를 모두 검색 노출 상태로 전환한다.
update public.cs_faqs
set status = '게시', updated_at = now()
where status in ('초안', '검토 중');
