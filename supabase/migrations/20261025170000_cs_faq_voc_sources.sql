alter table public.cs_faqs add column if not exists voc_source_id text;
alter table public.cs_faqs add column if not exists voc_source_date date;
alter table public.cs_faqs add column if not exists voc_answer_date date;
alter table public.cs_faqs add column if not exists source_note text;

insert into public.cs_faqs
  (category, subcategory, question, customer_question_example, answer, keywords, internal_notes, response_type, status, voc_source_id, voc_source_date, voc_answer_date, source_note)
values
  ('장비보관소', '보관함 배정', '와이즈클럽 락커는 지정할 수 있나요?',
   '와이즈 클럽 구매 했는데 시즌 락커는 랜덤 배정 되는 나요? 아니면 락커 판매기간에 자리 지정해야 하는 지 궁금합니다.',
   '와이즈클럽 시즌 라커는 지정된 구역(S구역) 내에서 무작위로 배정되며, 별도의 라커 구매 절차 없이 자동 배정되는 점 이용에 참고하여 주시기 바랍니다. 라커 배정이 완료되면 SMS를 통해 개별 안내드릴 예정입니다.',
   array['와이즈클럽','시즌 락커','랜덤 배정','S구역'], '실제 VOC 답변 기준. 기준일자 이후 운영정책이 변경될 수 있으므로 최신 내용을 확인하세요.', '즉시 안내', '게시', '12959', '2026-10-23', '2026-10-25', '실제 고객 VOC 답변 기준. VOC 기준일자에 따라 응대내용이 달라질 수 있음.'),
  ('장비보관소', '보관함 배정', '와이즈클럽 락커 위치를 변경할 수 있나요?',
   '미취학 아이가 있어 통로 쪽은 안전이 우려되는데, 작년에 사용한 구역으로 락커 변경이 가능한지 문의합니다.',
   '와이즈클럽 장비보관소는 무작위 배정 방식으로 운영되어 현재는 위치 변경이 어려운 점 양해 부탁드립니다. 스키장 개장 이후 장비보관소 데스크에 방문하시어 다시 한번 문의해 주시면, 희망하시는 구역의 잔여 락커 여부에 따라 변경 가능 여부를 안내받으실 수 있습니다.',
   array['와이즈클럽','위치 변경','잔여 락커','장비보관소 데스크'], '위치 변경 가능 여부는 개장 후 잔여 현황에 따라 달라질 수 있어 확정 안내하지 않습니다.', '현장 이관', '게시', '12962', '2026-10-25', '2026-10-25', '실제 고객 VOC 답변 기준. VOC 기준일자에 따라 응대내용이 달라질 수 있음.'),
  ('장비보관소', '보관함 배정', '기존 연간보관함과 와이즈클럽 4인 보관함을 함께 이용할 수 있나요?',
   '수년간 기존 락커를 사용 중인데 와이즈클럽 4인 보관함을 구매했습니다. 기존 보관소를 그대로 사용하려면 어떻게 해야 하는지 문의합니다.',
   '문의해 주신 기존 장비보관소 이용 및 와이즈클럽 4인 보관소 관련 내용은 유선으로 안내드렸습니다. 추가로 궁금하신 사항이 있을 경우 고객센터 1544-8833으로 문의해 주시면 안내드리겠습니다.',
   array['기존 락커','연간보관','와이즈클럽','4인 보관함'], '기존 보관함 유지 및 연장 가능 여부는 고객별 계약·배정 내역 확인이 필요합니다.', '담당자 확인', '게시', '12961', '2026-10-24', '2026-10-25', '실제 고객 VOC 답변 기준. VOC 기준일자에 따라 응대내용이 달라질 수 있음.'),
  ('장비보관소', '구매 및 결제', '시즌권 등록 전에도 시즌 보관소를 구매할 수 있나요?',
   '시즌권 등록이 되지 않은 상태에서 장비보관소를 구매할 수 있는지 문의합니다.',
   '시즌 보관소는 시즌권 할인요금이 기본으로 적용되어 있어 시즌권 등록 전에도 할인된 요금으로 구매하실 수 있습니다. 다만 보관소 KEY 수령 시 시즌권 확인이 필요하며, 시즌권을 증빙하지 못하실 경우 일반요금과의 차액을 추가로 결제하셔야 합니다. 현장 방문 시 실물 시즌권 카드를 반드시 지참하여 주시기 바랍니다.',
   array['시즌권','시즌 보관소','할인요금','KEY 수령'], '요금·증빙 기준은 구매 시점의 공지와 실제 운영정책을 함께 확인합니다.', '담당자 확인', '게시', '12958', '2026-10-23', '2026-10-24', '실제 고객 VOC 답변 기준. VOC 기준일자에 따라 응대내용이 달라질 수 있음.')
on conflict (question) do update set
  customer_question_example = excluded.customer_question_example,
  answer = excluded.answer,
  keywords = excluded.keywords,
  internal_notes = excluded.internal_notes,
  response_type = excluded.response_type,
  status = excluded.status,
  voc_source_id = excluded.voc_source_id,
  voc_source_date = excluded.voc_source_date,
  voc_answer_date = excluded.voc_answer_date,
  source_note = excluded.source_note,
  updated_at = now();
