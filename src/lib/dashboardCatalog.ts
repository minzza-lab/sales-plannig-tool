export interface Tool {
  id: string
  title: string
  description: string
  icon: string
  path: string
}

export interface ToolCategory {
  id: string
  eyebrow: string
  title: string
  description: string
  tools: Tool[]
  groups?: { id: string; title: string; tools: Tool[] }[]
}

export const categories: ToolCategory[] = [
  {
    id: 'work',
    eyebrow: 'WORKSPACE',
    title: '핵심 업무와 협업',
    description: '팀의 요청, 지식, 문서와 고객 응대를 한곳에서 관리합니다.',
    tools: [
      { id: 'team-workspace', title: '공유 스케줄 · 업무 트래커', description: '팀 일정·개인 휴무와 담당 업무, 진행 상황을 함께 관리합니다.', icon: '🗓️', path: '/tools/team-workspace' },
      { id: 'sales-schedule-performance', title: '판매 스케줄 · 실적 관리', description: '판매 기간, 업체, 목표와 상품별 최종 실적을 관리합니다.', icon: '📈', path: '/tools/sales-schedule-performance' },
      { id: 'automation-request', title: '자동화 요청 게시판', description: '반복 업무와 필요한 기능을 등록하고 함께 검토합니다.', icon: '⚡', path: '/tools/automation-request' },
      { id: 'knowledge-base', title: '공유 지식 베이스', description: '업무 노하우와 참고 자료를 팀원들과 축적합니다.', icon: '🤝', path: '/tools/knowledge-base' },
      { id: 'approvals', title: '품의서 보관함', description: '품의서를 보관하고 Gemini로 핵심 내용을 요약합니다.', icon: '📄', path: '/tools/approvals' },
      { id: 'product-proposals', title: '상품안 보관함', description: '상품안과 의견을 관리하고 AI 요약을 확인합니다.', icon: '💡', path: '/tools/product-proposals' },
      { id: 'voc-assistant', title: 'VOC 어시스턴트', description: '고객 문의를 분석해 답변 초안을 빠르게 작성합니다.', icon: '🎧', path: '/tools/voc-assistant' },
    ],
  },
  {
    id: 'sales',
    eyebrow: 'SALES & OPERATION',
    title: '매출과 운영 관리',
    description: '현장 판매 데이터를 비교하고 운영 현황을 빠르게 파악합니다.',
    tools: [
      { id: 'water-operations', title: '워터 운영 통합 현황', description: '매출·권종·대여상품 가동률을 한 화면에서 확인합니다.', icon: '📍', path: '/tools/water-operations' },
      { id: 'waterpark-sales', title: '워터파크 매출 관리', description: '일별 실적과 날씨, 전년 데이터를 함께 분석합니다.', icon: '🌊', path: '/tools/waterpark-sales' },
      { id: 'water-operations-analysis', title: '워터 권종·대여 분석', description: '권종 구성·취소와 대여 상품 사용 현황을 분석합니다.', icon: '🛟', path: '/tools/water-operations-analysis' },
      { id: 'room-state', title: '객실 투숙 현황', description: '날짜별 객실 구성과 단체 입·퇴실 일정을 확인합니다.', icon: '🏨', path: '/tools/room-state' },
      { id: 'sports-sales', title: '리조트 발권 현황', description: '일자별 스포츠 발권수와 업장별 매출을 확인합니다.', icon: '🎟️', path: '/tools/sports-sales' },
      { id: 'season-pass-tracker', title: '시즌권 주문 추적', description: '목표 대비 판매 실적과 권종별 주문을 관리합니다.', icon: '🎟️', path: '/tools/season-pass-tracker' },
      { id: 'package-sales', title: '패키지 판매 현황', description: '월별·일별 패키지 판매와 주문 상세를 조회합니다.', icon: '📦', path: '/tools/package-sales' },
    ],
  },
  {
    id: 'settlement',
    eyebrow: 'SETTLEMENT',
    title: '정산관리',
    description: '결제사별 정산 작업을 STEP 순서대로 진행합니다.',
    tools: [],
    groups: [
      { id: 'nicepay', title: '💳 나이스페이', tools: [
        { id: 'nicepay-step-1', title: 'STEP 1 · 입금 내역 검증', description: '입금액과 정산액을 날짜별로 대조합니다.', icon: '①', path: '/tools/nicepay-settlement?step=1' },
        { id: 'nicepay-step-2', title: 'STEP 2 · 정산내역 시트 분리', description: '상품 매핑과 수수료 안분을 적용해 날짜별로 분리합니다.', icon: '②', path: '/tools/nicepay-settlement?step=2' },
        { id: 'nicepay-step-3', title: 'STEP 3 · 부가세 정산', description: '부가세 정산과 전표 제출 자료를 만듭니다.', icon: '③', path: '/tools/nicepay-vat-settlement' },
      ] },
      { id: 'naver', title: '🟢 네이버', tools: [
        { id: 'naver-step-1', title: 'STEP 1 · 입금 내역 검증', description: '준비 중 · 원본 자료 확인 후 연결합니다.', icon: '①', path: '/tools/naver-settlement?step=1' },
        { id: 'naver-step-2', title: 'STEP 2 · 정산내역 시트 분리', description: '준비 중 · 원본 자료 확인 후 연결합니다.', icon: '②', path: '/tools/naver-settlement?step=2' },
        { id: 'naver-step-3', title: 'STEP 3 · 부가세 정산', description: '준비 중 · 제출 양식 확인 후 연결합니다.', icon: '③', path: '/tools/naver-settlement?step=3' },
      ] },
    ],
  },
  {
    id: 'marketing',
    eyebrow: 'AI MARKETING',
    title: '홍보 콘텐츠 제작',
    description: 'Gemini를 활용해 현장 콘텐츠와 홍보물을 제작합니다.',
    tools: [
      { id: 'field-sketch', title: '현장 스케치 생성기', description: '현장 사진을 블로그와 SNS용 콘텐츠로 변환합니다.', icon: '📸', path: '/tools/field-sketch' },
      { id: 'tts-generator', title: '안내방송 TTS', description: '상황에 맞는 안내 대본과 음성을 제작합니다.', icon: '🎙️', path: '/tools/tts-generator' },
      { id: 'thumbnail-generator', title: '상품 썸네일 제작기', description: '홍보 배경과 카피를 조합해 썸네일을 만듭니다.', icon: '🎨', path: '/tools/thumbnail-generator' },
    ],
  },
  {
    id: 'utility',
    eyebrow: 'QUICK TOOLS',
    title: '빠른 현장 도구',
    description: '자주 쓰는 코드 생성과 현장 조회 기능을 모았습니다.',
    tools: [
      { id: 'qr-generator', title: 'QR 코드 생성기', description: '단일 또는 대량 QR 코드를 생성하고 내려받습니다.', icon: '🔍', path: '/tools/qr-generator' },
      { id: 'qr-verifier', title: '대체업장 조회', description: 'QR을 스캔해 사용 가능한 업장과 혜택을 확인합니다.', icon: '📷', path: '/tools/qr-verifier' },
      { id: 'url-shortener', title: 'URL 단축기', description: '긴 인터넷 주소를 고객 전달용 주소로 줄입니다.', icon: '🔗', path: '/tools/url-shortener' },
      { id: 'barcode-generator', title: '바코드 생성기', description: '상품 번호와 식별 코드를 바코드로 변환합니다.', icon: '▥', path: '/tools/barcode-generator' },
    ],
  },
]
