-- CS 응대센터 독립 모듈. 기존 knowledge_base / voc_inquiries는 변경하지 않습니다.
create table if not exists public.cs_faq_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique, display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.cs_faqs (
  id uuid primary key default gen_random_uuid(), category text not null, subcategory text,
  question text not null, customer_question_example text, answer text, keywords text[] not null default '{}',
  additional_guidance text, internal_notes text, handling_procedure text, 담당부서 text, response_type text not null default '담당자 확인' check (response_type in ('즉시 안내','담당자 확인','관리자 승인','현장 이관')),
  status text not null default '초안' check (status in ('초안','검토 중','게시','비활성화')), view_count integer not null default 0,
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.cs_consultations (
  id uuid primary key default gen_random_uuid(), customer_name text, customer_phone text, order_number text,
  category text not null, inquiry_type text, inquiry_content text not null, response_content text, linked_faq_id uuid references public.cs_faqs(id) on delete set null,
  assigned_to text, status text not null default '접수' check (status in ('접수','확인 중','처리 완료','보류')), internal_memo text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.cs_faq_revisions (
  id uuid primary key default gen_random_uuid(), faq_id uuid not null references public.cs_faqs(id) on delete cascade,
  changed_by uuid references auth.users(id), snapshot jsonb not null, changed_at timestamptz not null default now()
);
create or replace function public.touch_cs_faq_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists cs_faqs_updated_at on public.cs_faqs;
create trigger cs_faqs_updated_at before update on public.cs_faqs for each row execute function public.touch_cs_faq_updated_at();
create or replace function public.record_cs_faq_revision() returns trigger language plpgsql security invoker as $$ begin insert into public.cs_faq_revisions (faq_id, changed_by, snapshot) values (old.id, auth.uid(), to_jsonb(old)); return new; end; $$;
drop trigger if exists cs_faqs_revision on public.cs_faqs;
create trigger cs_faqs_revision before update on public.cs_faqs for each row execute function public.record_cs_faq_revision();
create unique index if not exists cs_faqs_question_unique on public.cs_faqs (question);
alter table public.cs_faq_categories enable row level security; alter table public.cs_faqs enable row level security; alter table public.cs_consultations enable row level security; alter table public.cs_faq_revisions enable row level security;
drop policy if exists "cs categories active read" on public.cs_faq_categories; create policy "cs categories active read" on public.cs_faq_categories for select to authenticated using (public.has_active_app_access());
drop policy if exists "cs categories admin write" on public.cs_faq_categories; create policy "cs categories admin write" on public.cs_faq_categories for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "cs faqs published read" on public.cs_faqs; create policy "cs faqs published read" on public.cs_faqs for select to authenticated using (public.has_active_app_access() and (status = '게시' or public.is_app_admin()));
drop policy if exists "cs faqs admin write" on public.cs_faqs; create policy "cs faqs admin write" on public.cs_faqs for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "cs consultations active access" on public.cs_consultations; create policy "cs consultations active access" on public.cs_consultations for all to authenticated using (public.has_active_app_access()) with check (public.has_active_app_access());
drop policy if exists "cs revisions admin read" on public.cs_faq_revisions; create policy "cs revisions admin read" on public.cs_faq_revisions for select to authenticated using (public.is_app_admin());
insert into public.cs_faq_categories (name, display_order) values ('장비보관소', 1),('시즌패스',2),('스노우파크',3),('워터플래닛',4),('객실',5),('기타',6) on conflict (name) do nothing;
insert into public.cs_faqs (category, subcategory, question, customer_question_example, answer, keywords, internal_notes, response_type, status)
values
('장비보관소','보관함 배정','기존 보관함과 같은 위치를 유지할 수 있나요?','지난 시즌 보관함과 같은 위치를 사용할 수 있나요?','정책 확인 필요. 위치 유지 가능 여부는 담당자에게 확인 후 안내해 주세요.',array['기존','위치','유지'],'확정 전 임의 확정 안내 금지','담당자 확인','초안'),
('장비보관소','보관함 배정','보관함 자동배정 기준이 어떻게 되나요?','보관함은 어떤 기준으로 배정되나요?','정책 확인 필요. 배정 기준을 확인한 후 안내해 주세요.',array['자동배정','배정기준'],'정책 확인 전 게시 금지','담당자 확인','초안'),
('장비보관소','보관함 배정','보관함 번호를 변경할 수 있나요?','배정받은 번호를 바꿀 수 있나요?','정책 확인 필요. 변경 가능 여부와 절차를 확인해 주세요.',array['번호','변경'],'정책 확인 전 게시 금지','담당자 확인','초안'),
('장비보관소','와이즈클럽','와이즈클럽에 장비보관함 혜택이 포함되나요?','와이즈클럽이면 보관함을 이용할 수 있나요?','와이즈클럽에는 4인용 장비보관함 이용 혜택이 포함되어 있습니다.',array['와이즈클럽','4인용','혜택'],'혜택 범위의 세부 조건은 확인 후 안내','즉시 안내','초안'),
('장비보관소','와이즈클럽','와이즈클럽 보관함 위치를 지정할 수 있나요?','구매할 때 원하는 위치를 고를 수 있나요?','와이즈클럽 구매 당시 특정 보관함 위치를 지정하여 판매하지 않았습니다.',array['와이즈클럽','위치','지정'],'추가 위치 변경 가능 여부는 정책 확인 필요','즉시 안내','초안'),
('장비보관소','와이즈클럽','와이즈클럽 주차등록은 어떻게 하나요?','차량을 등록해야 하나요?','와이즈클럽 미등록 차량은 2026년 10월 30일까지 등록을 요청해 주세요.',array['와이즈클럽','주차','차량등록'],'기한 이후 처리 기준은 별도 확인','즉시 안내','초안'),
('장비보관소','시설 및 이용','기존 3인 보관함과 신규 4인 보관함은 무엇이 다른가요?','4인 보관함으로 바뀌는 이유가 무엇인가요?','기존 일부 3인 보관함을 신규 4인 보관함으로 교체했으며, 신규 설치 수량은 160개입니다.',array['3인','4인','교체','160개'],'세부 배정은 담당자 확인','즉시 안내','초안'),
('장비보관소','상품 및 요금','연간보관과 시즌보관은 어떻게 다른가요?','연간과 시즌 상품의 차이가 무엇인가요?','정책 확인 필요. 기간과 요금은 확인된 기준으로 안내해 주세요.',array['연간보관','시즌보관'],'요금 임의 작성 금지','담당자 확인','초안'),
('장비보관소','상품 및 요금','회원요금이 적용되나요?','회원이면 할인받을 수 있나요?','정책 확인 필요. 적용 대상과 요금을 확인해 주세요.',array['회원','요금'],'요금 임의 작성 금지','담당자 확인','초안'),
('장비보관소','상품 및 요금','1인 락커와 대형 물품보관함 PKG가 있나요?','대형 물품보관함만 구매할 수 있나요?','대형 물품보관함은 1인 락커 결합 PKG로 판매됩니다.',array['대형','물품보관함','PKG'],'구성 및 요금은 확인 후 안내','즉시 안내','초안'),
('장비보관소','상품 및 요금','중형 물품보관함을 구매할 수 있나요?','중형 물품보관함은 언제 구매하나요?','기존 중형 물품보관함은 스키장 개장 후 현장 판매 예정입니다.',array['중형','현장판매'],'판매 일정 변경 여부 확인','즉시 안내','초안'),
('장비보관소','취소 및 환불','구매를 취소하고 환불받을 수 있나요?','취소와 환불 규정이 어떻게 되나요?','정책 확인 필요. 환불 규정을 확인하기 전 확정 안내하지 마세요.',array['취소','환불'],'관리자 승인 필요 여부 확인','관리자 승인','초안'),
('장비보관소','시설 및 이용','보관함 시설이 고장났어요.','잠금장치가 작동하지 않아요.','장비보관소 시설 고장은 현장 조치가 필요합니다. 장비보관소(033-340-3393)로 문의해 주세요.',array['고장','잠금장치','시설'],'현장 조치 여부를 확인','현장 이관','초안'),
('장비보관소','시설 및 이용','보관함 이용기간은 언제까지인가요?','언제까지 이용할 수 있나요?','정책 확인 필요. 구매 상품의 이용기간을 확인해 주세요.',array['이용기간'],'기간 임의 작성 금지','담당자 확인','초안'),
('장비보관소','시설 및 이용','보관함 배치도와 구역을 확인할 수 있나요?','배치도는 어디서 볼 수 있나요?','정책 확인 필요. 최신 배치도와 구역 안내 자료를 확인해 주세요.',array['배치도','구역'],'구버전 배치도 사용 금지','담당자 확인','초안')
on conflict do nothing;
