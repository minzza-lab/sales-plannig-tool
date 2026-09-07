export const activitySections: Record<string, string> = {
  "/": "대시보드",
  "/tools/app-access": "앱 설치 · 빠른 접속",
  "/virtual-office": "가상 사무실",
  "/tools/automation-request": "자동화 요청 게시판",
  "/tools/knowledge-base": "공유 지식 베이스",
  "/tools/team-workspace": "공유 스케줄 · 업무 트래커",
  "/tools/sales-schedule-performance": "판매 스케줄 · 실적 관리",
  "/tools/approvals": "품의서 보관함",
  "/tools/approval-cover-splitter": "품의 갑지 분리기",
  "/tools/product-proposals": "상품안 보관함",
  "/tools/official-letter": "발송공문제작기",
  "/tools/proposal-generator": "AI 상품 구성안 생성기",
  "/tools/voc-assistant": "고객의 소리(VOC) 어시스턴트",
  "/tools/water-operations": "워터 운영 통합 현황",
  "/tools/waterpark-sales": "워터파크 매출 관리",
  "/tools/water-operations-analysis": "워터 권종·대여 분석",
  "/tools/room-state": "객실 투숙 현황",
  "/tools/sports-sales": "리조트 발권 현황",
  "/tools/nicepay-settlement": "나이스페이 정산 자동화",
  "/tools/deposit-reconciliation": "입금 내역 검증 (사내용)",
  "/tools/season-pass-tracker": "시즌권 주문 추적 관리",
  "/tools/package-sales": "패키지 판매 현황",
  "/tools/field-sketch": "현장 스케치 생성기",
  "/tools/tts-generator": "안내방송용 TTS 생성기",
  "/tools/sms-generator": "문자 메시지 생성기",
  "/tools/thumbnail-generator": "상품 썸네일 제작기",
  "/tools/lunch-roulette": "점심 내기 룰렛",
  "/tools/qr-generator": "QR 코드 생성기",
  "/tools/qr-verifier": "대체업장 조회 도구",
  "/tools/url-shortener": "URL 단축기",
  "/tools/barcode-generator": "바코드 생성기",
  "/tools/admin": "관리자 페이지",
  "/ai-studio": "AI 스튜디오"
}

export function activitySectionPath(path: string): string | null {
  if (path.startsWith("/ai-studio/")) return "/ai-studio"
  return Object.hasOwn(activitySections, path) ? path : null
}
