-- VOC 화면의 기준일은 수집일이 아니라 WADM 답변 등록일입니다.
alter table public.voc_inquiries
  add column if not exists answer_date date;
