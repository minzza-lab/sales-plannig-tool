export const CEO_PROFILE = { name: '세일즈 리더', callsign: '리더', role: '세일즈 운영 총괄', hair: '#34434d', shirt: '#476cbe', accent: '#ffdf77', skin: '#ffdcc4', thoughts: ['현황을 보고 다음 행동을 결정합니다.', '오늘 우선순위가 무엇인지 다시 볼게요.', '각 팀의 다음 연결 지점을 확인 중입니다.', '숫자와 고객 반응을 함께 보고 판단할게요.'] }

export const DEPARTMENTS = [
  ['research', '워터파크 수집실', 'water.sales', '🌊', '워터파크 매출 수집', '최신 판매 현황을 가져옵니다.'],
  ['brand', '객실 수집실', 'room.status', '🛏️', '객실 상태 수집', '객실 판매와 재고를 확인합니다.'],
  ['strategy1', '스포츠 수집실', 'sports.sales', '⚽', '스포츠 판매 수집', '스포츠 데이터를 정리합니다.'],
  ['qa', '데이터 검수실', 'data.qa', '🛡️', '수집 결과 검증', '누락과 오류를 확인합니다.'],
  ['strategy2', '상품 기획실', 'product.plan', '💡', '상품 구성 기획', '판매 가능한 상품안을 만듭니다.'],
  ['reels', '영상 제작실', 'video.edit', '🎬', '영상 제작', '콘티와 영상 초안을 준비합니다.'],
  ['carousel', '디자인실', 'design.studio', '🖼️', '디자인 제작', '배너와 썸네일을 제작합니다.'],
  ['partner', 'SNS 데스크', 'social.post', '📣', 'SNS 발행 준비', '채널별 콘텐츠를 정리합니다.'],
  ['finance', '정산실', 'settlement.xls', '🧾', '정산 확인', '판매와 취소 내역을 검토합니다.'],
  ['review', '성과 분석실', 'sales.review', '📈', '성과 분석', '판매 지표를 분석합니다.'],
  ['ops', '자동화 운영실', 'automation.ops', '⚙️', '동기화 운영', '수집·실패·재시도를 관리합니다.'],
  ['secretary', '운영 지원실', 'operations.hq', '📋', '업무 브리핑', '전체 진행 상황을 정리합니다.'],
].map(([id, name, short, icon, task, report]) => ({ id, name, short, icon, task, report }))

const DEPARTMENT_THOUGHTS: Record<string, string[]> = {
  research: ['파도풀·슬라이드별 흐름을 다시 맞춰볼게요.', '어제 같은 시간대랑 비교해보면 답이 보여요.', '입장권과 부대 매출을 분리해서 보고 있어요.', '날씨 영향을 같이 표시해두면 좋겠네요.'],
  brand: ['객실 판매와 잔여 재고를 함께 확인 중이에요.', '주말 체크인 흐름이 바뀌었는지 보고 있어요.', '패키지별 객실 점유 차이를 정리하고 있어요.', '취소분이 어느 객실 타입에 몰렸는지 볼게요.'],
  strategy1: ['스포츠 상품은 시간대별 반응을 나눠볼게요.', '종목별 판매 속도를 다시 비교 중이에요.', '주말 수요가 평일과 얼마나 다른지 체크해요.', '묶음 상품으로 제안할 조합을 메모하고 있어요.'],
  qa: ['합계와 원본 수치가 맞는지 한 번 더 볼게요.', '누락된 날짜가 없는지 점검 중이에요.', '같은 기준으로 비교됐는지 확인하고 있어요.', '이상치만 따로 표시해서 넘길게요.'],
  strategy2: ['고객이 바로 이해할 상품 구성을 고민 중이에요.', '혜택이 겹치지 않도록 조합을 다듬고 있어요.', '판매 포인트를 한 문장으로 정리해볼게요.', '다음 주에 바로 실행할 안부터 추리고 있어요.'],
  reels: ['첫 3초에 시선이 머무를 장면을 찾고 있어요.', '콘티 흐름이 자연스러운지 다시 볼게요.', '짧아도 핵심 혜택이 보이게 편집해야죠.', '현장 분위기가 느껴지는 컷을 골라볼게요.'],
  carousel: ['한눈에 읽히는 이미지 순서를 잡고 있어요.', '카피와 이미지가 같은 말을 하는지 볼게요.', '모바일에서 작게 보여도 읽히게 다듬는 중이에요.', '첫 장에서 혜택이 바로 보이도록 해볼게요.'],
  partner: ['채널마다 말투를 조금씩 바꿔야겠어요.', '댓글로 나올 질문도 미리 적어두고 있어요.', '발행 시간대와 소재를 같이 맞춰볼게요.', '확정된 내용만 게시물 초안에 넣고 있어요.'],
  finance: ['판매·취소·순매출 기준을 다시 맞춰볼게요.', '정산 누락이 없는지 거래 건을 확인 중이에요.', '할인 적용 후 금액까지 같이 보고 있어요.', '숫자가 맞아야 다음 판단도 정확해져요.'],
  review: ['증감 원인을 숫자와 함께 정리하고 있어요.', '전년 동월 기준으로 다시 비교해볼게요.', '눈에 띄는 변화만 먼저 표시하고 있어요.', '다음 행동으로 이어질 지표를 찾는 중이에요.'],
  ops: ['자동 수집 상태와 실패 기록을 확인 중이에요.', '재시도할 항목을 먼저 분류하고 있어요.', '동기화 시간도 함께 체크해둘게요.', '다음 실행 때 막히지 않게 흐름을 다듬는 중이에요.'],
  secretary: ['각 부서의 핵심만 모아 보고 형태로 정리 중이에요.', '결정이 필요한 항목부터 위로 올릴게요.', '회의에서 나온 약속을 빠뜨리지 않고 적고 있어요.', '다음 담당자에게 넘길 일을 정리하고 있어요.'],
}

export const STAFF_LIST: Array<{ dept: string; rank: 'lead' | 'member'; name: string; role: string; colors: [string, string, string]; thoughts: string[]; callsign?: string }> = DEPARTMENTS.map((department, index) => ({
  dept: department.id, rank: 'lead' as const, name: department.name.replace(/실|데스크/g, ' 담당'), role: department.task, colors: [['#3c4f58', '#4f78c9', '#f0d36d'], ['#654637', '#3b9d93', '#d9efea'], ['#473455', '#8b67c5', '#f3e5b9']][index % 3] as [string, string, string], thoughts: DEPARTMENT_THOUGHTS[department.id] ?? [department.report],
}))

export const PENDING_INTEGRATIONS: Record<string, string> = {}
