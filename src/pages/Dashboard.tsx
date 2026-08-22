import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

interface Tool {
  id: string
  title: string
  description: string
  icon: string
  path: string
}

interface ToolCategory {
  id: string
  eyebrow: string
  title: string
  description: string
  tools: Tool[]
}

const categories: ToolCategory[] = [
  {
    id: 'work',
    eyebrow: 'WORKSPACE',
    title: '핵심 업무와 협업',
    description: '팀의 요청, 지식, 문서와 고객 응대를 한곳에서 관리합니다.',
    tools: [
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
      { id: 'waterpark-sales', title: '워터파크 매출 관리', description: '일별 실적과 날씨, 전년 데이터를 함께 분석합니다.', icon: '🌊', path: '/tools/waterpark-sales' },
      { id: 'water-operations-analysis', title: '워터 권종·대여 분석', description: '권종 구성·취소와 대여 상품 사용 현황을 분석합니다.', icon: '🛟', path: '/tools/water-operations-analysis' },
      { id: 'room-state', title: '객실 투숙 현황', description: '날짜별 객실 구성과 단체 입·퇴실 일정을 확인합니다.', icon: '🏨', path: '/tools/room-state' },
      { id: 'sports-sales', title: '리조트 발권 현황', description: '일자별 스포츠 발권수와 업장별 매출을 확인합니다.', icon: '🎟️', path: '/tools/sports-sales' },
      { id: 'nicepay-settlement', title: '나이스페이 정산 자동화', description: '날짜별 품목 분류와 안분·수수료·부가세 엑셀을 처리합니다.', icon: '💳', path: '/tools/nicepay-settlement' },
      { id: 'deposit-reconciliation', title: '입금 내역 검증', description: '회사 입금액과 나이스정보통신 정산액을 날짜별로 대조합니다.', icon: '🔐', path: '/tools/deposit-reconciliation' },
      { id: 'season-pass-tracker', title: '시즌권 주문 추적', description: '목표 대비 판매 실적과 권종별 주문을 관리합니다.', icon: '🎟️', path: '/tools/season-pass-tracker' },
      { id: 'package-sales', title: '패키지 판매 현황', description: '월별·일별 패키지 판매와 주문 상세를 조회합니다.', icon: '📦', path: '/tools/package-sales' },
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

const toolCount = categories.reduce((total, category) => total + category.tools.length, 0) + 1

type IntegratedSnapshot = {
  date: string
  waterparkSales: number
  waterparkProductSales: number
  waterparkVisitors: number
  condoRooms: number
  condoOcc: number
  condoMember: number
  condoGeneral: number
  condoGroup: number
  sportsTickets: number
  sportsSales: number
  sportsVenues: number
  updatedAt: string | null
}

type DashboardReportRow = {
  report_date: string
  report_type: string
  data?: {
    summary?: { totalAmount?: number }
    table_data?: Array<{ category?: string; name?: string; quantity?: number; amount?: number }>
    room_data?: Array<{ category?: string; total?: number; member?: number; general?: number; group?: number }>
    venue_data?: Array<{ code?: string; name?: string; quantity?: number; amount?: number }>
    updated_at?: string
  }
}

const CONDO_CAPACITY = 767
const WATERPARK_SYNC_DAYS = 5

function getKstToday() {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getRecentKstDates(daysCount: number) {
  const today = new Date(`${getKstToday()}T00:00:00+09:00`)
  return Array.from({ length: daysCount }, (_, index) => {
    const date = new Date(today.getTime() - index * 86_400_000)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}

function formatCurrentKstTime(date: Date) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}년 ${value('month')}월 ${value('day')}일 ${value('hour')}시 ${value('minute')}분 ${value('second')}초`
}

function formatCompactWon(amount?: number) {
  if (!Number.isFinite(amount)) return '—'
  const safeAmount = amount as number
  if (Math.abs(safeAmount) >= 100_000_000) return `${(safeAmount / 100_000_000).toFixed(2)}억원`
  if (Math.abs(safeAmount) >= 10_000) return `${Math.round(safeAmount / 10_000).toLocaleString('ko-KR')}만원`
  return `${safeAmount.toLocaleString('ko-KR')}원`
}

function formatSnapshotDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<IntegratedSnapshot | null>(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [syncState, setSyncState] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')

  const fetchIntegratedSnapshot = useCallback(async () => {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('report_date,report_type,data')
        .in('report_type', ['REALTIME_SALES', 'ROOM_STATE', 'SPORTS_SALES'])
        .lte('report_date', getKstToday())
        .order('report_date', { ascending: false })
        .limit(60)

      if (error) throw error

      const rows = (data || []) as DashboardReportRow[]
      const waterpark = rows.find((row) => row.report_type === 'REALTIME_SALES')
      const room = rows.find((row) => row.report_type === 'ROOM_STATE')
      const sports = rows.find((row) => row.report_type === 'SPORTS_SALES')
      if (!waterpark && !room && !sports) return

      const normalize = (value: unknown) => String(value || '').replace(/\s/g, '')
      const admissionRows: Array<{ category?: string; name?: string; quantity?: number; amount?: number }> = Array.isArray(waterpark?.data?.table_data) ? waterpark.data.table_data : []
      const isAdmission = (row: { category?: string; name?: string }) => (
        ['매표소', '입장권'].includes(normalize(row.category)) || ['매표소', '입장권'].includes(normalize(row.name))
      )
      const ticketRows = admissionRows.filter(isAdmission)
      const productRows = admissionRows.filter((row) => !isAdmission(row))
      const waterparkVisitors = ticketRows
        .reduce((total, row) => total + (Number(row.quantity) || 0), 0)
      const roomRows: Array<{ category?: string; total?: number; member?: number; general?: number; group?: number }> = Array.isArray(room?.data?.room_data) ? room.data.room_data : []
      const condo = roomRows.find((row) => row.category === '콘도')
      const condoRooms = Number(condo?.total) || 0
      const sportsRows = Array.isArray(sports?.data?.venue_data) ? sports.data.venue_data : []
      const updatedValues = [waterpark?.data?.updated_at, room?.data?.updated_at, sports?.data?.updated_at]
        .filter((value): value is string => typeof value === 'string')
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())

      setSnapshot({
        date: waterpark?.report_date || room?.report_date || sports?.report_date || getKstToday(),
        waterparkSales: ticketRows.reduce((total, row) => total + (Number(row.amount) || 0), 0),
        waterparkProductSales: productRows.reduce((total, row) => total + (Number(row.amount) || 0), 0),
        waterparkVisitors,
        condoRooms,
        condoOcc: condoRooms / CONDO_CAPACITY * 100,
        condoMember: Number(condo?.member) || 0,
        condoGeneral: Number(condo?.general) || 0,
        condoGroup: Number(condo?.group) || 0,
        sportsTickets: sportsRows.reduce((total, row) => total + (Number(row.quantity) || 0), 0),
        sportsSales: sportsRows.reduce((total, row) => total + (Number(row.amount) || 0), 0),
        sportsVenues: sportsRows.filter((row) => (Number(row.quantity) || 0) > 0 || (Number(row.amount) || 0) > 0).length,
        updatedAt: updatedValues[0] || null,
      })
  }, [])

  useEffect(() => {
    void fetchIntegratedSnapshot().catch(() => undefined)
  }, [fetchIntegratedSnapshot])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const startIntegratedSync = async () => {
    setSyncState('running')
    setSyncProgress(0)
    setSyncMessage('워터·객실 최신 데이터를 확인하고 있습니다.')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('로그인 정보가 없습니다. 다시 로그인해주세요.')

      const dates = getRecentKstDates(WATERPARK_SYNC_DAYS)
      const totalSteps = dates.length + 2
      let completedSteps = 0
      const finishStep = () => {
        completedSteps += 1
        setSyncProgress(Math.round(completedSteps / totalSteps * 100))
      }
      const batchId = crypto.randomUUID()

      const syncWaterpark = async () => {
        for (const date of dates) {
          setSyncMessage(`${date} 워터파크 매출을 수집하고 있습니다.`)
          const response = await fetch(`/api/waterpark-sync?date=${encodeURIComponent(date)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'X-Sync-Batch-Id': batchId },
          })
          const result = await response.json().catch(() => ({})) as { error?: string }
          if (!response.ok) throw new Error(result.error || `${date} 워터파크 매출을 수집하지 못했습니다.`)
          finishStep()
        }
      }

      const syncRooms = async () => {
        const date = getKstToday()
        const response = await fetch(`/api/roomstate-sync?date=${encodeURIComponent(date)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(result.error || `${date} 객실 현황을 수집하지 못했습니다.`)
        finishStep()
      }

      const syncSports = async () => {
        const date = getKstToday()
        const response = await fetch(`/api/sports-sync?date=${encodeURIComponent(date)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(result.error || `${date} 스포츠 발권 현황을 수집하지 못했습니다.`)
        finishStep()
      }

      await Promise.all([syncWaterpark(), syncRooms(), syncSports()])
      await fetchIntegratedSnapshot()
      setSyncState('completed')
      setSyncMessage('최신 데이터 동기화를 완료했습니다.')
    } catch (syncError) {
      setSyncState('failed')
      setSyncMessage(syncError instanceof Error ? syncError.message : '최신 데이터 동기화에 실패했습니다.')
    }
  }

  const updatedText = snapshot?.updatedAt
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(snapshot.updatedAt))
    : '최신 데이터를 불러오는 중'

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">WELLIHILLI SALES PLANNING</p>
          <h1>오늘의 업무를<br />한곳에서 시작하세요.</h1>
          <p>매출 관리부터 AI 콘텐츠 제작까지, 실제 사용하는 도구만 보기 쉽게 정리했습니다.</p>
        </div>
        <div className="dashboard-summary">
          <strong>{toolCount}</strong>
          <span>사용 가능한 도구</span>
        </div>
      </header>

      <section className="integrated-spotlight">
        <div className="integrated-heading">
          <div className="integrated-title-row">
            <div><span>INTEGRATED SALES &amp; OPERATION</span><h2>통합 매출·운영 현황</h2></div>
            <time dateTime={currentTime.toISOString()}><small>현재 시각</small><b>{formatCurrentKstTime(currentTime)}</b></time>
          </div>
          <div className="integrated-meta-row">
            <div><p>{snapshot ? `${formatSnapshotDate(snapshot.date)} 기준` : '오늘 기준 데이터를 준비하고 있습니다.'} · 최근 갱신 {updatedText}</p>{syncMessage && <small className={`dashboard-sync-message ${syncState}`}>{syncMessage}</small>}</div>
            <button type="button" className={`dashboard-sync-button ${syncState}`} onClick={() => void startIntegratedSync()} disabled={syncState === 'running'}>
              {syncState === 'running' ? <LoaderCircle size={14} /> : syncState === 'completed' ? <CheckCircle2 size={14} /> : <RefreshCw size={14} />}
              {syncState === 'running' ? `${syncProgress}% 동기화 중` : syncState === 'completed' ? '동기화 완료' : '최신 데이터 동기화'}
            </button>
          </div>
        </div>
        <div className="integrated-domains">
          <article className="integrated-domain-card water-domain">
            <div className="domain-title"><span>🌊</span><div><small>WATERPARK</small><h3>워터 현황</h3></div><Link to="/tools/waterpark-sales" aria-label="워터파크 상세 열기">→</Link></div>
            <div className="domain-primary water-visitor-primary"><small>입장객</small><strong>{snapshot ? snapshot.waterparkVisitors.toLocaleString('ko-KR') : '—'}<em>명</em></strong></div>
            <div className="water-sales-lines">
              <span><small>입장권 매출</small><b>{snapshot ? formatCompactWon(snapshot.waterparkSales) : '—'}</b></span>
              <span><small>상품 매출</small><b>{snapshot ? formatCompactWon(snapshot.waterparkProductSales) : '—'}</b></span>
            </div>
          </article>

          <article className="integrated-domain-card room-domain">
            <div className="domain-title"><span>🏨</span><div><small>ROOMS</small><h3>객실 현황</h3></div><Link to="/tools/room-state" aria-label="객실 상세 열기">→</Link></div>
            <div className="room-primary-row"><span><small>콘도 객실</small><strong>{snapshot ? snapshot.condoRooms.toLocaleString('ko-KR') : '—'}<em>실</em></strong></span><i>/</i><span className="room-occ-value"><small>가동률 OCC</small><strong>{snapshot ? snapshot.condoOcc.toFixed(1) : '—'}<em>%</em></strong></span></div>
            <div className="room-customer-mix">
              <span><small>회원</small><b>{snapshot ? snapshot.condoMember.toLocaleString('ko-KR') : '—'}실</b></span>
              <span><small>일반</small><b>{snapshot ? snapshot.condoGeneral.toLocaleString('ko-KR') : '—'}실</b></span>
              <span><small>단체</small><b>{snapshot ? snapshot.condoGroup.toLocaleString('ko-KR') : '—'}실</b></span>
            </div>
          </article>

          <article className="integrated-domain-card sports-domain">
            <div className="domain-title"><span>🎟️</span><div><small>SPORTS</small><h3>스포츠 현황</h3></div><Link to="/tools/sports-sales" aria-label="스포츠 상세 열기">→</Link></div>
            <div className="domain-primary sports-ticket-primary"><small>발권수</small><strong>{snapshot ? snapshot.sportsTickets.toLocaleString('ko-KR') : '—'}<em>건</em></strong></div>
            <div className="sports-summary-lines"><span><small>발권 매출</small><b>{snapshot ? formatCompactWon(snapshot.sportsSales) : '—'}</b></span><span><small>운영 업장</small><b>{snapshot ? `${snapshot.sportsVenues.toLocaleString('ko-KR')}개` : '—'}</b></span></div>
          </article>
        </div>
      </section>

      <div className="dashboard-sections">
        {categories.map((category) => (
          <section key={category.id} className={`dashboard-section category-${category.id}`}>
            <div className="section-heading">
              <div>
                <span>{category.eyebrow}</span>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
              </div>
              <em>{category.tools.length} tools</em>
            </div>
            <div className="tool-grid">
              {category.tools.map((tool) => (
                <Link key={tool.id} to={tool.path} className="tool-card">
                  <div className="tool-icon">{tool.icon}</div>
                  <div className="tool-info">
                    <h3>{tool.title}</h3>
                    <p>{tool.description}</p>
                  </div>
                  <span className="tool-arrow">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
