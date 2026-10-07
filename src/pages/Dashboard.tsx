import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNavigationSettings } from '../lib/navigationSettings'
import { categories, type Tool } from '../lib/dashboardCatalog'
import SalesOperationOffice from '../components/SalesOperationOffice'
import './Dashboard.css'

type AnalysisItem = { name?: string; quantity?: number; amount?: number }

type IntegratedSnapshot = {
  date: string
  waterparkSales: number
  waterparkProductSales: number
  waterparkVisitors: number
  waterTicketMix: Array<{ name: string; quantity: number }>
  waterCabanaUsed: number
  waterSunbedUsed: number
  waterOtherRentalUsed: number
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
    ticket_analysis?: AnalysisItem[]
    rental_analysis?: AnalysisItem[]
    room_data?: Array<{ category?: string; total?: number; member?: number; general?: number; group?: number }>
    venue_data?: Array<{ code?: string; name?: string; quantity?: number; amount?: number }>
    updated_at?: string
  }
}

const CONDO_CAPACITY = 767
// 메인 대시보드는 당일 운영 현황만 즉시 갱신한다. 과거 기간 재수집은 상세 화면에서 진행한다.
const WATERPARK_SYNC_DAYS = 1

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

function classifyWaterTicket(name: string, amount: number) {
  if (/추가요금/.test(name)) return '추가요금'
  if (/comp|무료|초대/i.test(name) || amount === 0) return '무료·COMP'
  if (/할인/.test(name)) return '할인권'
  return '일반권'
}

function getWaterRentalGroup(name: string) {
  if (/카바나/i.test(name)) return '카바나'
  if (/썬베드|선베드/i.test(name)) return '썬베드'
  return '기타'
}

export default function Dashboard({ officeOnly = false }: { officeOnly?: boolean }) {
  const navigationSettings = useNavigationSettings()
  const configuredCategories = categories.filter(category => navigationSettings[`section:${category.id}`]?.dashboardVisible !== false)
    .map(category => {
      const configure = (tools: Tool[]) => tools.filter(tool => navigationSettings[tool.id]?.dashboardVisible !== false)
        .map(tool => ({ ...tool, title: navigationSettings[tool.id]?.title?.trim() || tool.title, description: navigationSettings[tool.id]?.description?.trim() || tool.description }))
        .sort((a, b) => (navigationSettings[a.id]?.dashboardOrder ?? tools.findIndex(tool => tool.id === a.id)) - (navigationSettings[b.id]?.dashboardOrder ?? tools.findIndex(tool => tool.id === b.id)))
      return {
        ...category,
        title: navigationSettings[`section:${category.id}`]?.title?.trim() || category.title,
        description: navigationSettings[`section:${category.id}`]?.description?.trim() || category.description,
        tools: configure(category.tools),
        groups: category.groups?.filter(group => navigationSettings[`provider:${group.id}`]?.dashboardVisible !== false).map(group => ({
          ...group,
          title: navigationSettings[`provider:${group.id}`]?.title?.trim() || group.title,
          tools: configure(group.tools),
        })).sort((a, b) => (navigationSettings[`provider:${a.id}`]?.dashboardOrder ?? category.groups!.findIndex(group => group.id === a.id)) - (navigationSettings[`provider:${b.id}`]?.dashboardOrder ?? category.groups!.findIndex(group => group.id === b.id))),
      }
    }).sort((a, b) => (navigationSettings[`section:${a.id}`]?.dashboardOrder ?? categories.findIndex(category => category.id === a.id)) - (navigationSettings[`section:${b.id}`]?.dashboardOrder ?? categories.findIndex(category => category.id === b.id)))
  const toolCount = configuredCategories.reduce((total, category) => total + category.tools.length + (category.groups?.reduce((sum, group) => sum + group.tools.length, 0) || 0), 0) + 1
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
      const ticketAnalysis = Array.isArray(waterpark?.data?.ticket_analysis) ? waterpark.data.ticket_analysis : []
      const rentalAnalysis = Array.isArray(waterpark?.data?.rental_analysis) ? waterpark.data.rental_analysis : []
      const waterparkVisitors = ticketAnalysis.length ? ticketAnalysis
        .reduce((total, row) => total + (Number(row.quantity) || 0), 0) : ticketRows
        .reduce((total, row) => total + (Number(row.quantity) || 0), 0)
      const ticketMixMap = new Map<string, number>()
      for (const item of ticketAnalysis) {
        const group = classifyWaterTicket(String(item.name || ''), Number(item.amount) || 0)
        ticketMixMap.set(group, (ticketMixMap.get(group) || 0) + (Number(item.quantity) || 0))
      }
      const rentalUsed = (group: string) => Math.max(0, rentalAnalysis.filter((item) => getWaterRentalGroup(String(item.name || '')) === group).reduce((total, item) => total + (Number(item.quantity) || 0), 0))
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
        waterTicketMix: ['일반권', '할인권', '무료·COMP', '추가요금'].map((name) => ({ name, quantity: ticketMixMap.get(name) || 0 })),
        waterCabanaUsed: rentalUsed('카바나'),
        waterSunbedUsed: rentalUsed('썬베드'),
        waterOtherRentalUsed: rentalUsed('기타'),
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

  if (officeOnly) return <section className="virtual-office-page"><SalesOperationOffice
    syncState={syncState}
    syncProgress={syncProgress}
    hasSnapshot={Boolean(snapshot)}
    snapshotDate={snapshot?.date || null}
    salesContext={snapshot
      ? `${formatSnapshotDate(snapshot.date)} 기준: 워터파크 매출 ${formatCompactWon(snapshot.waterparkSales)}, 방문 ${snapshot.waterparkVisitors.toLocaleString('ko-KR')}명, 객실 ${snapshot.condoRooms.toLocaleString('ko-KR')}실(${snapshot.condoOcc.toFixed(1)}%), 스포츠 매출 ${formatCompactWon(snapshot.sportsSales)}, 발권 ${snapshot.sportsTickets.toLocaleString('ko-KR')}건`
      : '현재 통합 매출 데이터는 아직 준비 중입니다.'}
    onSync={() => void startIntegratedSync()}
  /></section>

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
        <div className="dashboard-water-summary">
          <div className="dashboard-water-summary-heading"><div><span>WATER OPERATIONS AT A GLANCE</span><h3>워터 운영 상세 요약</h3></div><p>권종 구성과 대여상품 가동 현황을 바로 확인하세요.</p></div>
          <div className="dashboard-water-summary-grid">
            <article className="dashboard-water-ticket"><small>권종 구성</small><div>{snapshot?.waterTicketMix.map((item) => <span key={item.name}><b>{item.name}</b><em>{item.quantity.toLocaleString('ko-KR')}건</em></span>) || '—'}</div><Link to="/tools/water-operations-analysis">권종 상세 분석 →</Link></article>
            <article className="dashboard-water-rental"><small>카바나 · 선베드 가동률</small><div><span><b>카바나</b><strong>{snapshot ? `${snapshot.waterCabanaUsed.toLocaleString('ko-KR')} / 142동` : '—'}</strong><em>{snapshot ? `${(snapshot.waterCabanaUsed / 142 * 100).toFixed(1)}%` : '—'}</em></span><span><b>선베드</b><strong>{snapshot ? `${snapshot.waterSunbedUsed.toLocaleString('ko-KR')} / 274개` : '—'}</strong><em>{snapshot ? `${(snapshot.waterSunbedUsed / 274 * 100).toFixed(1)}%` : '—'}</em></span></div><Link to="/tools/water-operations">워터 운영 통합 현황 →</Link></article>
            <article className="dashboard-water-other"><small>기타 대여상품</small><strong>{snapshot ? `${snapshot.waterOtherRentalUsed.toLocaleString('ko-KR')}개` : '—'}</strong><p>{snapshot ? `당일 발권객 ${snapshot.waterparkVisitors.toLocaleString('ko-KR')}명 대비 ${snapshot.waterparkVisitors ? (snapshot.waterOtherRentalUsed / snapshot.waterparkVisitors * 100).toFixed(1) : '0.0'}%` : '데이터 준비 중'}</p><Link to="/tools/waterpark-sales">워터파크 매출 관리 →</Link></article>
          </div>
          <div className="dashboard-water-links"><Link to="/tools/water-operations"><span>📍</span><b>워터 운영 통합 현황</b><small>오늘 핵심 운영 수치</small></Link><Link to="/tools/water-operations-analysis"><span>🛟</span><b>권종·대여 분석</b><small>권종·구역별 상세</small></Link><Link to="/tools/waterpark-sales"><span>🌊</span><b>워터파크 매출 관리</b><small>일별·전년·날씨 분석</small></Link></div>
        </div>
      </section>

      <div className="dashboard-sections">
        {configuredCategories.map((category) => (
          <section key={category.id} className={`dashboard-section category-${category.id}`}>
            <div className="section-heading">
              <div>
                <span>{category.eyebrow}</span>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
              </div>
              <em>{category.tools.length + (category.groups?.reduce((sum, group) => sum + group.tools.length, 0) || 0)} tools</em>
            </div>
            {category.groups?.map(group => <div className="settlement-dashboard-group" key={group.id}>
              <h3>{group.title}</h3>
              <div className="tool-grid">{group.tools.map(tool => <Link key={tool.id} to={tool.path} className="tool-card">
                <div className="tool-icon">{tool.icon}</div>
                <div className="tool-info"><h3>{tool.title}</h3><p>{tool.description}</p></div>
                <span className="tool-arrow">→</span>
              </Link>)}</div>
            </div>)}
            {category.tools.length > 0 &&
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
            }
          </section>
        ))}
      </div>
    </div>
  )
}
