import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  RefreshCw,
  Store,
  Ticket,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SportsSalesDashboard.css'

type VenueRow = { code: string; name: string; quantity: number; amount: number }
type SportsSummary = { totalQty: number; totalAmount: number; venueCount: number; averageTicket: number }
type SportsReport = { id: string; reportDate: string; summary: SportsSummary; venues: VenueRow[]; updatedAt: string }
type TicketTypeRow = { kind: string; name: string; quantity: number; amount: number }
type HourlyRow = { hour: number; quantity: number; amount: number }
type VenueDetail = { zoneName: string; ticketTypes: TicketTypeRow[]; hourly: HourlyRow[] }
type SyncEntry = { date: string; quantity: number; amount: number }

const SYNC_DAYS = 31
const emptySummary: SportsSummary = { totalQty: 0, totalAmount: 0, venueCount: 0, averageTicket: 0 }

function getKstDate(offsetDays = 0) {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86_400_000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function formatCompactWon(value: number) {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}억원`
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`
  return formatWon(value)
}

function formatLongDate(value: string) {
  return format(new Date(`${value}T00:00:00+09:00`), 'yyyy년 M월 d일 EEEE', { locale: ko })
}

function formatUpdatedAt(value: string) {
  if (!value) return '아직 동기화되지 않음'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value))
}

export default function SportsSalesDashboard() {
  const [reports, setReports] = useState<SportsReport[]>([])
  const [selectedDate, setSelectedDate] = useState(getKstDate())
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(`${getKstDate()}T00:00:00+09:00`))
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(`${getKstDate()}T00:00:00+09:00`), { weekStartsOn: 1 }))
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncActiveDate, setSyncActiveDate] = useState('')
  const [syncEntries, setSyncEntries] = useState<SyncEntry[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedVenue, setSelectedVenue] = useState<VenueRow | null>(null)
  const [venueDetail, setVenueDetail] = useState<VenueDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error: queryError } = await supabase
        .from('daily_reports')
        .select('id,report_date,data')
        .eq('report_type', 'SPORTS_SALES')
        .gte('report_date', getKstDate(-92))
        .lte('report_date', getKstDate())
        .order('report_date', { ascending: true })
      if (queryError) throw queryError
      const nextReports = (data || []).map((row): SportsReport => ({
        id: String(row.id),
        reportDate: row.report_date,
        summary: { ...emptySummary, ...(row.data?.summary || {}) },
        venues: Array.isArray(row.data?.venue_data) ? row.data.venue_data : [],
        updatedAt: row.data?.updated_at || '',
      }))
      setReports(nextReports)
      if (nextReports.length > 0) {
        setSelectedDate((current) => nextReports.some((report) => report.reportDate === current)
          ? current
          : nextReports[nextReports.length - 1].reportDate)
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '스포츠 현황을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void fetchReports() }, [fetchReports])

  const activeReport = useMemo(
    () => reports.find((report) => report.reportDate === selectedDate) || null,
    [reports, selectedDate],
  )
  const reportMap = useMemo(() => new Map(reports.map((report) => [report.reportDate, report])), [reports])
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const weekSummary = useMemo(() => weekDates.reduce((total, date) => {
    const report = reportMap.get(format(date, 'yyyy-MM-dd'))
    return {
      quantity: total.quantity + (report?.summary.totalQty || 0),
      amount: total.amount + (report?.summary.totalAmount || 0),
      venues: Math.max(total.venues, report?.summary.venueCount || 0),
    }
  }, { quantity: 0, amount: 0, venues: 0 }), [reportMap, weekDates])
  const calendarDates = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 })
    const days = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1
    return Array.from({ length: days }, (_, index) => addDays(gridStart, index))
  }, [calendarMonth])
  const monthSummary = useMemo(() => {
    const monthly = reports.filter((report) => isSameMonth(new Date(`${report.reportDate}T00:00:00+09:00`), calendarMonth))
    return monthly.reduce((total, report) => ({
      quantity: total.quantity + report.summary.totalQty,
      amount: total.amount + report.summary.totalAmount,
      days: total.days + 1,
    }), { quantity: 0, amount: 0, days: 0 })
  }, [calendarMonth, reports])

  const startSync = async () => {
    setError('')
    setMessage('')
    setIsSyncing(true)
    setSyncProgress(0)
    setSyncEntries([])
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('로그인 정보가 없습니다. 다시 로그인해주세요.')
      const entries: SyncEntry[] = []
      for (let index = SYNC_DAYS - 1; index >= 0; index -= 1) {
        const date = getKstDate(-index)
        setSyncActiveDate(date)
        const response = await fetch(`/api/sports-sync?date=${encodeURIComponent(date)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json().catch(() => ({})) as {
          error?: string
          syncedDate?: string
          summary?: SportsSummary
        }
        if (!response.ok) throw new Error(result.error || `${date} 스포츠 발권 현황을 수집하지 못했습니다.`)
        entries.push({
          date: result.syncedDate || date,
          quantity: result.summary?.totalQty || 0,
          amount: result.summary?.totalAmount || 0,
        })
        setSyncEntries([...entries])
        setSyncProgress(Math.round(entries.length / SYNC_DAYS * 100))
      }
      await fetchReports()
      setSelectedDate(getKstDate())
      setCalendarMonth(new Date(`${getKstDate()}T00:00:00+09:00`))
      setWeekStart(startOfWeek(new Date(`${getKstDate()}T00:00:00+09:00`), { weekStartsOn: 1 }))
      setMessage('최근 스포츠 발권 현황 동기화를 완료했습니다.')
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '스포츠 현황 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncActiveDate('')
      setIsSyncing(false)
    }
  }

  const openVenueDetail = async (venue: VenueRow) => {
    setSelectedVenue(venue)
    setVenueDetail(null)
    setIsDetailLoading(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('로그인 정보가 없습니다. 다시 로그인해주세요.')
      const response = await fetch(`/api/sports-sync?mode=detail&date=${encodeURIComponent(selectedDate)}&zonecode=${encodeURIComponent(venue.code)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({})) as VenueDetail & { error?: string }
      if (!response.ok) throw new Error(result.error || '업장 상세 정보를 불러오지 못했습니다.')
      setVenueDetail(result)
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '업장 상세 정보를 불러오지 못했습니다.')
    } finally {
      setIsDetailLoading(false)
    }
  }

  useEffect(() => {
    setSelectedVenue(null)
    setVenueDetail(null)
  }, [selectedDate])

  return (
    <div className="sports-page">
      <header className="sports-hero">
        <div><span>RESORT TICKETING</span><h1>리조트 발권 현황</h1><p>리조트 스포츠 시설의 일자별 발권수와 매출을 비교하고 업장·권종·시간대별 상세 실적을 확인합니다.</p></div>
        <div className="sports-hero-actions"><small>마지막 갱신<br /><b>{formatUpdatedAt(activeReport?.updatedAt || '')}</b></small><button type="button" onClick={() => void startSync()} disabled={isSyncing}>{isSyncing ? <LoaderCircle className="sports-spin" size={18} /> : <RefreshCw size={18} />}{isSyncing ? `${syncProgress}% 수집 중` : '최신 데이터 동기화'}</button></div>
      </header>

      {(isSyncing || syncEntries.length > 0) && <section className="sports-sync-panel"><div className="sports-sync-heading"><span>{isSyncing ? <LoaderCircle className="sports-spin" size={18} /> : <CheckCircle2 size={18} />}<b>{isSyncing ? `${syncActiveDate} 발권 데이터를 수집하고 있습니다.` : '스포츠 발권 데이터 수집을 완료했습니다.'}</b></span><strong>{syncProgress}%</strong></div><div className="sports-sync-track"><i style={{ width: `${syncProgress}%` }} /></div><div className="sports-sync-log">{syncEntries.slice(-6).map((entry) => <span key={entry.date}>{entry.date.slice(5).replace('-', '.')} <b>{entry.quantity.toLocaleString()}건</b> · {formatCompactWon(entry.amount)}</span>)}</div></section>}
      {error && <div className="sports-alert error">{error}</div>}
      {message && <div className="sports-alert success">{message}</div>}

      {isLoading ? <div className="sports-loading"><LoaderCircle className="sports-spin" /><span>스포츠 발권 현황을 불러오고 있습니다.</span></div> : reports.length === 0 ? <div className="sports-empty"><Ticket size={34} /><h2>수집된 스포츠 발권 데이터가 없습니다.</h2><p>최신 데이터 동기화를 실행하면 최근 일자별 발권수와 매출이 달력에 저장됩니다.</p><button type="button" onClick={() => void startSync()} disabled={isSyncing}>최신 데이터 동기화</button></div> : <>
        <section className="sports-period-board">
          <div className="sports-period-heading"><div><span>MONTH TO DATE</span><h2>{format(calendarMonth, 'yyyy년 M월')} 리조트 발권 누적 실적</h2></div><em>{monthSummary.days}일 수집 기준</em></div>
          <div className="sports-period-cards"><article><span>누적 매출</span><strong>{formatCompactWon(monthSummary.amount)}</strong><small>리조트 스포츠 전체</small></article><article><span>누적 발권수</span><strong>{monthSummary.quantity.toLocaleString()}<em>건</em></strong><small>업장 전체 발권 합계</small></article><article><span>건당 평균</span><strong>{formatWon(monthSummary.quantity > 0 ? monthSummary.amount / monthSummary.quantity : 0)}</strong><small>누적 매출 ÷ 누적 발권수</small></article></div>
        </section>

        <section className="sports-week-board">
          <div className="sports-week-heading"><div><span>MONDAY — SUNDAY</span><h2>{format(weekStart, 'yyyy년 M월 d일')} — {format(addDays(weekStart, 6), 'M월 d일')}</h2><p>워터파크 현황과 같은 주간 흐름으로 일별 발권과 매출을 비교합니다.</p></div><div className="sports-week-actions"><button onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={15} /> 이전 7일</button><button onClick={() => setWeekStart(startOfWeek(new Date(`${getKstDate()}T00:00:00+09:00`), { weekStartsOn: 1 }))}>오늘 기준</button><button onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={format(weekStart, 'yyyy-MM-dd') === format(startOfWeek(new Date(`${getKstDate()}T00:00:00+09:00`), { weekStartsOn: 1 }), 'yyyy-MM-dd')}>다음 7일 <ChevronRight size={15} /></button></div></div>
          <div className="sports-week-kpis"><span><small>7일 총매출</small><b>{formatCompactWon(weekSummary.amount)}</b></span><span><small>총 발권수</small><b>{weekSummary.quantity.toLocaleString()}건</b></span><span><small>최대 운영 업장</small><b>{weekSummary.venues}개</b></span></div>
          <div className="sports-week-grid">{weekDates.map((date) => {
            const dateKey = format(date, 'yyyy-MM-dd')
            const report = reportMap.get(dateKey)
            const topVenue = report?.venues[0]
            return <button type="button" key={dateKey} className={`${dateKey === selectedDate ? 'selected' : ''} ${dateKey === getKstDate() ? 'today' : ''}`} disabled={!report} onClick={() => { setSelectedDate(dateKey); setCalendarMonth(date) }}><div className="sports-week-day-head"><span>{format(date, 'E', { locale: ko })}</span><b>{format(date, 'M/d')}</b></div>{report ? <><small>일 매출 합계</small><strong>{formatCompactWon(report.summary.totalAmount)}</strong><div className="sports-week-ticket"><Ticket size={13} /><span>발권수</span><b>{report.summary.totalQty.toLocaleString()}건</b></div><div className="sports-week-venue"><span>TOP 업장</span><b>{topVenue?.name || '—'}</b><em>{topVenue ? formatCompactWon(topVenue.amount) : '—'}</em></div><p>{report.summary.venueCount}개 업장 운영</p></> : <i>수집된 데이터 없음</i>}</button>
          })}</div>
        </section>

        <details className="sports-calendar-accordion">
          <summary><div><span>MONTHLY VIEW</span><strong>{format(calendarMonth, 'yyyy년 M월')} 전체 달력 보기</strong><small>월요일 시작 · 날짜를 선택하면 업장별 상세 표시</small></div><div><b>{monthSummary.quantity.toLocaleString()}건</b><span>발권</span><b>{formatCompactWon(monthSummary.amount)}</b><span>매출</span></div><ChevronRight size={18} /></summary>
          <section className={`sports-calendar ${isSyncing ? 'syncing' : ''}`}>
            <div className="sports-calendar-heading"><div><span>DAILY CALENDAR</span><h2>{format(calendarMonth, 'yyyy년 M월')} 리조트 발권</h2><p>날짜를 선택하면 해당 일자의 업장별 실적이 아래에 표시됩니다.</p></div><div className="sports-calendar-summary"><span><small>월 발권</small><b>{monthSummary.quantity.toLocaleString()}건</b></span><span><small>월 매출</small><b>{formatCompactWon(monthSummary.amount)}</b></span></div><div className="sports-calendar-actions"><button onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} aria-label="이전 달"><ChevronLeft size={16} /></button><button onClick={() => setCalendarMonth(new Date(`${getKstDate()}T00:00:00+09:00`))}>오늘</button><button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} disabled={isSameMonth(calendarMonth, new Date(`${getKstDate()}T00:00:00+09:00`))} aria-label="다음 달"><ChevronRight size={16} /></button></div></div>
            <div className="sports-weekdays">{['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="sports-calendar-grid">{calendarDates.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd')
              const report = reportMap.get(dateKey)
              const outside = !isSameMonth(date, calendarMonth)
              return <button type="button" key={dateKey} className={`sports-calendar-day ${outside ? 'outside' : ''} ${dateKey === selectedDate ? 'selected' : ''} ${dateKey === getKstDate() ? 'today' : ''}`} disabled={outside || !report} onClick={() => { setSelectedDate(dateKey); setWeekStart(startOfWeek(date, { weekStartsOn: 1 })) }}><div><strong>{format(date, 'd')}</strong>{report && <span>{report.summary.venueCount}개 업장</span>}</div>{report ? <><b>{report.summary.totalQty.toLocaleString()}<small>건</small></b><em>{formatCompactWon(report.summary.totalAmount)}</em></> : !outside && <i>수집 전</i>}</button>
            })}</div>
          </section>
        </details>

        <section className="sports-kpis daily">
          <article className="tickets"><div><Ticket size={17} /><span>선택일 발권수</span></div><strong>{(activeReport?.summary.totalQty || 0).toLocaleString()}<small>건</small></strong><p>{formatLongDate(selectedDate)} 기준</p></article>
          <article className="revenue"><div><CircleDollarSign size={17} /><span>선택일 매출</span></div><strong>{formatCompactWon(activeReport?.summary.totalAmount || 0)}</strong><p>실제 발권 매출 합계</p></article>
          <article><div><Store size={17} /><span>운영 업장</span></div><strong>{activeReport?.summary.venueCount || 0}<small>개</small></strong><p>발권 또는 매출 발생 업장</p></article>
          <article><div><BarChart3 size={17} /><span>건당 평균</span></div><strong>{formatWon(activeReport?.summary.averageTicket || 0)}</strong><p>총매출 ÷ 총 발권수</p></article>
        </section>

        <section className="sports-venue-card">
          <div className="sports-card-heading"><div><span>VENUE BREAKDOWN</span><h2>{formatLongDate(selectedDate)} 업장별 실적</h2></div><em>업장을 선택하면 권종·시간대 상세 표시</em></div>
          <div className="sports-venue-table"><table><thead><tr><th>순위</th><th>업장</th><th>발권수</th><th>매출</th><th>매출 비중</th><th>상세</th></tr></thead><tbody>{(activeReport?.venues || []).map((venue, index) => {
            const share = activeReport?.summary.totalAmount ? venue.amount / activeReport.summary.totalAmount * 100 : 0
            return <tr key={venue.code}><td><span className="sports-rank">{index + 1}</span></td><td><strong>{venue.name}</strong><small>{venue.code}</small></td><td>{venue.quantity.toLocaleString()}건</td><td>{formatWon(venue.amount)}</td><td><div className="sports-share"><i style={{ width: `${Math.min(share, 100)}%` }} /></div><b>{share.toFixed(1)}%</b></td><td><button type="button" onClick={() => void openVenueDetail(venue)}>상세보기</button></td></tr>
          })}</tbody></table></div>
        </section>

        {selectedVenue && <section className="sports-detail-card"><div className="sports-card-heading"><div><span>VENUE DETAIL</span><h2>{selectedVenue.name} 상세 발권</h2></div><button type="button" onClick={() => { setSelectedVenue(null); setVenueDetail(null) }}>닫기</button></div>{isDetailLoading ? <div className="sports-detail-loading"><LoaderCircle className="sports-spin" /> 상세 데이터를 불러오고 있습니다.</div> : venueDetail && <div className="sports-detail-grid"><div><h3>권종별 실적</h3><div className="sports-detail-table"><table><thead><tr><th>구분</th><th>권종</th><th>수량</th><th>금액</th></tr></thead><tbody>{venueDetail.ticketTypes.map((row, index) => <tr key={`${row.kind}-${row.name}-${index}`}><td>{row.kind}</td><td>{row.name}</td><td>{row.quantity.toLocaleString()}건</td><td>{formatWon(row.amount)}</td></tr>)}</tbody></table></div></div><div><h3>시간대별 실적</h3><div className="sports-hourly-list">{venueDetail.hourly.length > 0 ? venueDetail.hourly.map((row) => <article key={row.hour}><span>{String(row.hour).padStart(2, '0')}:00</span><b>{row.quantity.toLocaleString()}건</b><em>{formatCompactWon(row.amount)}</em></article>) : <p>시간대별 발권 내역이 없습니다.</p>}</div></div></div>}</section>}
      </>}
      <p className="sports-source-note"><CalendarDays size={12} /> 출처: 웰리힐리파크 리조트 발권 매출현황 · 원본 조회 가능 기간 2020년 7월 10일부터 오늘까지</p>
    </div>
  )
}
