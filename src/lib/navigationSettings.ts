import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type NavigationOverride = {
  title?: string
  description?: string
  dashboardVisible?: boolean
  sidebarVisible?: boolean
  dashboardOrder?: number
  sidebarOrder?: number
}

export type NavigationSettings = Record<string, NavigationOverride>

export type SidebarEntry = { id: string; title: string; icon: string; path: string; section: string; provider?: string }

export const sidebarEntries: SidebarEntry[] = [
  { id: 'app-access', title: '앱 설치 · 빠른 접속', icon: '📲', path: '/tools/app-access', section: 'top' },
  { id: 'virtual-office', title: '가상 사무실', icon: '🏢', path: '/virtual-office', section: 'top' },
  { id: 'automation-request', title: '자동화 요청 게시판', icon: '⚡', path: '/tools/automation-request', section: 'top' },
  { id: 'knowledge-base', title: '공유 지식 베이스', icon: '🤝', path: '/tools/knowledge-base', section: 'top' },
  { id: 'team-workspace', title: '공유 스케줄 · 업무 트래커', icon: '🗓️', path: '/tools/team-workspace', section: 'top' },
  { id: 'sales-schedule-performance', title: '판매 스케줄 · 실적 관리', icon: '📈', path: '/tools/sales-schedule-performance', section: 'top' },
  { id: 'approvals', title: '품의서 보관함', icon: '📄', path: '/tools/approvals', section: 'top' },
  { id: 'approval-cover-splitter', title: '품의 갑지 분리기', icon: '📄', path: '/tools/approval-cover-splitter', section: 'top' },
  { id: 'product-proposals', title: '상품안 보관함', icon: '💡', path: '/tools/product-proposals', section: 'top' },
  { id: 'proposal-generator', title: 'AI 상품 구성안 생성기', icon: '🎁', path: '/tools/proposal-generator', section: 'top' },
  { id: 'voc-assistant', title: '고객의 소리(VOC) 어시스턴트', icon: '🎧', path: '/tools/voc-assistant', section: 'top' },
  { id: 'water-operations', title: '워터 운영 통합 현황', icon: '📍', path: '/tools/water-operations', section: 'sales' },
  { id: 'waterpark-sales', title: '워터파크 매출 관리', icon: '🌊', path: '/tools/waterpark-sales', section: 'sales' },
  { id: 'water-operations-analysis', title: '워터 권종·대여 분석', icon: '🛟', path: '/tools/water-operations-analysis', section: 'sales' },
  { id: 'room-state', title: '객실 투숙 현황', icon: '🏨', path: '/tools/room-state', section: 'sales' },
  { id: 'sports-sales', title: '리조트 발권 현황', icon: '🎟️', path: '/tools/sports-sales', section: 'sales' },
  { id: 'season-pass-tracker', title: '시즌권 주문 추적 관리', icon: '🎟️', path: '/tools/season-pass-tracker', section: 'sales' },
  { id: 'package-sales', title: '패키지 판매 현황', icon: '📦', path: '/tools/package-sales', section: 'sales' },
  { id: 'nicepay-step-1', title: 'STEP 1 · 입금 내역 검증', icon: '', path: '/tools/nicepay-settlement?step=1', section: 'settlement', provider: 'nicepay' },
  { id: 'nicepay-step-2', title: 'STEP 2 · 정산내역 시트 분리', icon: '', path: '/tools/nicepay-settlement?step=2', section: 'settlement', provider: 'nicepay' },
  { id: 'nicepay-step-3', title: 'STEP 3 · 부가세 정산', icon: '', path: '/tools/nicepay-vat-settlement', section: 'settlement', provider: 'nicepay' },
  { id: 'naver-step-1', title: 'STEP 1 · 입금 내역 검증 (준비 중)', icon: '', path: '/tools/naver-settlement?step=1', section: 'settlement', provider: 'naver' },
  { id: 'naver-step-2', title: 'STEP 2 · 정산내역 시트 분리 (준비 중)', icon: '', path: '/tools/naver-settlement?step=2', section: 'settlement', provider: 'naver' },
  { id: 'naver-step-3', title: 'STEP 3 · 부가세 정산 (준비 중)', icon: '', path: '/tools/naver-settlement?step=3', section: 'settlement', provider: 'naver' },
  { id: 'field-sketch', title: '현장 스케치 생성기', icon: '📸', path: '/tools/field-sketch', section: 'promo' },
  { id: 'tts-generator', title: '안내방송용 TTS 생성기', icon: '🎙️', path: '/tools/tts-generator', section: 'promo' },
  { id: 'sms-generator', title: '문자 메시지 생성기', icon: '💬', path: '/tools/sms-generator', section: 'promo' },
  { id: 'thumbnail-generator', title: '상품 썸네일 제작기', icon: '🎨', path: '/tools/thumbnail-generator', section: 'promo' },
  { id: 'lunch-roulette', title: '점심 내기 룰렛', icon: '🎲', path: '/tools/lunch-roulette', section: 'util' },
  { id: 'qr-generator', title: 'QR 코드 생성기', icon: '🔍', path: '/tools/qr-generator', section: 'util' },
  { id: 'qr-verifier', title: '대체업장 조회 도구', icon: '📷', path: '/tools/qr-verifier', section: 'util' },
  { id: 'url-shortener', title: 'URL 단축기', icon: '🔗', path: '/tools/url-shortener', section: 'util' },
  { id: 'barcode-generator', title: '바코드 생성기', icon: '📊', path: '/tools/barcode-generator', section: 'util' },
  { id: 'coupon-status', title: '쿠폰/바코드 사용조회', icon: '🎫', path: '/tools/coupon-status', section: 'util' },
]

export const sidebarSections = [
  { id: 'sales', title: '매출/운영 관리', icon: '📊' },
  { id: 'settlement', title: '정산관리', icon: '🧾' },
  { id: 'promo', title: '홍보/마케팅 파트', icon: '📢' },
  { id: 'util', title: '유틸리티 모음', icon: '🛠️' },
]

export const settlementProviders = [
  { id: 'nicepay', title: '나이스페이', icon: '💳' },
  { id: 'naver', title: '네이버', icon: '🟢' },
]

export const visibleEntries = (entries: SidebarEntry[], settings: NavigationSettings) => entries
  .filter(entry => settings[entry.id]?.sidebarVisible !== false)
  .sort((a, b) => (settings[a.id]?.sidebarOrder ?? sidebarEntries.indexOf(a)) - (settings[b.id]?.sidebarOrder ?? sidebarEntries.indexOf(b)))

export async function loadNavigationSettings(): Promise<NavigationSettings> {
  const { data, error } = await supabase.from('app_navigation_settings').select('settings').eq('id', 'main').maybeSingle()
  if (error) throw error
  const settings = data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? structuredClone(data.settings) as NavigationSettings : {}
  for (const id of ['naver-step-1', 'naver-step-2', 'naver-step-3']) {
    const entry = settings[id]
    if (!entry) continue
    if (entry.title) entry.title = entry.title.replace(/\s*\(준비\s*중\)/g, '').trim()
    if (entry.description?.startsWith('준비 중')) delete entry.description
  }
  return settings
}

export function useNavigationSettings() {
  const [settings, setSettings] = useState<NavigationSettings>({})
  useEffect(() => {
    let active = true
    const refresh = () => { void loadNavigationSettings().then(value => { if (active) setSettings(value) }).catch(() => {}) }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('navigation-settings-updated', refresh)
    const interval = window.setInterval(refresh, 60_000)
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('navigation-settings-updated', refresh); window.clearInterval(interval) }
  }, [])
  return settings
}
