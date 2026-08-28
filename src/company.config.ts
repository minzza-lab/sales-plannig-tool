export const CEO_PROFILE = { name: '세일즈 리더', callsign: '리더', role: '세일즈 운영 총괄', hair: '#34434d', shirt: '#476cbe', accent: '#ffdf77', skin: '#ffdcc4', thoughts: ['현황을 보고 다음 행동을 결정합니다.'] }

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

export const STAFF_LIST: Array<{ dept: string; rank: 'lead' | 'member'; name: string; role: string; colors: [string, string, string]; thoughts: string[]; callsign?: string }> = DEPARTMENTS.map((department, index) => ({
  dept: department.id, rank: 'lead' as const, name: department.name.replace(/실|데스크/g, ' 담당'), role: department.task, colors: [['#3c4f58', '#4f78c9', '#f0d36d'], ['#654637', '#3b9d93', '#d9efea'], ['#473455', '#8b67c5', '#f3e5b9']][index % 3] as [string, string, string], thoughts: [department.report],
}))

export const PENDING_INTEGRATIONS: Record<string, string> = {}
