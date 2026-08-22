import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  Hotel,
  LoaderCircle,
  RefreshCw,
  Users,
} from 'lucide-react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { supabase } from '../lib/supabase'
import './RoomStateDashboard.css'

type RoomRow = {
  category: string
  member: number
  general: number
  group: number
  total: number
}

type GroupRow = {
  name: string
  arrivalDate: string
  departureDate: string
  condoQty: number
  youthQty: number
}

type RoomSummary = {
  totalQty: number
  memberQty: number
  generalQty: number
  groupQty: number
  groupCount: number
  label: string
  qtyLabel: string
}

type RoomStateReport = {
  id: string
  reportDate: string
  summary: RoomSummary
  roomData: RoomRow[]
  groupData: GroupRow[]
  condoAvailability: Record<string, boolean>
  updatedAt: string
}

type SyncEntry = {
  date: string
  total: number
  groups: number
}

const SYNC_DAYS = 31
const CONDO_CAPACITY = 767
const CONDO_ROOM_TYPES = ['스탠다드 A', '스탠다드 B', '패밀리', '스위트 A', '스위트 B', '럭셔리 A', '럭셔리 B', '하우스']

function getFacility(report: RoomStateReport | null, category: string): RoomRow {
  return report?.roomData.find((row) => row.category === category) || {
    category,
    member: 0,
    general: 0,
    group: 0,
    total: 0,
  }
}

function getCondoOcc(total: number) {
  return total / CONDO_CAPACITY * 100
}

function getKstDate(offsetDays = 0) {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function formatShortDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}.${Number(day)}`
}

function formatLongDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`)
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

function getStayNights(arrival: string, departure: string) {
  const start = new Date(`${arrival}T00:00:00+09:00`).getTime()
  const end = new Date(`${departure}T00:00:00+09:00`).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

const emptySummary: RoomSummary = {
  totalQty: 0,
  memberQty: 0,
  generalQty: 0,
  groupQty: 0,
  groupCount: 0,
  label: '객실 투숙 현황',
  qtyLabel: '총 투숙 객실',
}

export default function RoomStateDashboard() {
  const [reports, setReports] = useState<RoomStateReport[]>([])
  const [selectedDate, setSelectedDate] = useState(getKstDate())
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(`${getKstDate()}T00:00:00+09:00`))
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncActiveDate, setSyncActiveDate] = useState('')
  const [syncEntries, setSyncEntries] = useState<SyncEntry[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error: queryError } = await supabase
        .from('daily_reports')
        .select('id,report_date,data')
        .eq('report_type', 'ROOM_STATE')
        .gte('report_date', getKstDate(-31))
        .lte('report_date', getKstDate(60))
        .order('report_date', { ascending: true })
      if (queryError) throw queryError

      const nextReports = (data || []).map((row): RoomStateReport => ({
        id: String(row.id),
        reportDate: row.report_date,
        summary: { ...emptySummary, ...(row.data?.summary || {}) },
        roomData: Array.isArray(row.data?.room_data) ? row.data.room_data : [],
        groupData: Array.isArray(row.data?.group_data) ? row.data.group_data : [],
        condoAvailability: row.data?.condo_availability && typeof row.data.condo_availability === 'object' ? row.data.condo_availability : {},
        updatedAt: row.data?.updated_at || '',
      }))
      setReports(nextReports)
      if (nextReports.length > 0) {
        setSelectedDate((current) => nextReports.some((report) => report.reportDate === current)
          ? current
          : nextReports.find((report) => report.reportDate >= getKstDate())?.reportDate || nextReports[0].reportDate)
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '객실 현황을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchReports()
  }, [fetchReports])

  const activeReport = useMemo(
    () => reports.find((report) => report.reportDate === selectedDate) || null,
    [reports, selectedDate],
  )

  const calendarDates = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 })
    const days = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1
    return Array.from({ length: days }, (_, index) => addDays(gridStart, index))
  }, [calendarMonth])

  const reportMap = useMemo(() => new Map(reports.map((report) => [report.reportDate, report])), [reports])

  const calendarStats = useMemo(() => {
    const monthReports = reports.filter((report) => isSameMonth(new Date(`${report.reportDate}T00:00:00+09:00`), calendarMonth))
    if (!monthReports.length) return { averageOcc: 0 }
    const occValues = monthReports.map((report) => getCondoOcc(getFacility(report, '콘도').total))
    return {
      averageOcc: occValues.reduce((sum, value) => sum + value, 0) / occValues.length,
    }
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
      for (let index = 0; index < SYNC_DAYS; index += 1) {
        const date = getKstDate(index)
        setSyncActiveDate(date)
        const response = await fetch(`/api/roomstate-sync?date=${encodeURIComponent(date)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json().catch(() => ({})) as {
          error?: string
          syncedDate?: string
          summary?: RoomSummary
        }
        if (!response.ok) throw new Error(result.error || `${date} 객실 현황을 수집하지 못했습니다.`)
        const entry = {
          date: result.syncedDate || date,
          total: result.summary?.totalQty || 0,
          groups: result.summary?.groupCount || 0,
        }
        entries.push(entry)
        setSyncEntries([...entries])
        setSyncProgress(Math.round(((index + 1) / SYNC_DAYS) * 100))
      }

      await fetchReports()
      setSelectedDate(getKstDate())
      setMessage(`오늘부터 ${SYNC_DAYS}일간 객실 현황을 동기화했습니다.`)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '객실 현황 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncActiveDate('')
      setIsSyncing(false)
    }
  }

  const updatedText = activeReport?.updatedAt
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(activeReport.updatedAt))
    : '아직 동기화되지 않음'

  return (
    <div className="room-state-page">
      <header className="room-state-hero">
        <div>
          <span>ROOM OPERATIONS</span>
          <h1>객실 투숙 현황</h1>
          <p>콘도 767실을 기준으로 일자별 판매 객실과 OCC를 가장 먼저 확인하고, 유스 포함 전체 객실은 보조 지표로 봅니다.</p>
        </div>
        <div className="room-state-hero-actions">
          <small>마지막 갱신<br /><b>{updatedText}</b></small>
          <button type="button" onClick={() => void startSync()} disabled={isSyncing}>
            {isSyncing ? <LoaderCircle className="room-spin" size={18} /> : <DatabaseZap size={18} />}
            {isSyncing ? `${syncProgress}% 데이터 받는 중` : '최신 데이터 동기화'}
          </button>
        </div>
      </header>

      {(isSyncing || syncEntries.length > 0) && (
        <section className={`room-sync-panel ${isSyncing ? 'running' : 'done'}`}>
          <div className="room-sync-heading">
            <div>{isSyncing ? <LoaderCircle className="room-spin" size={19} /> : <CheckCircle2 size={19} />}<span><strong>{isSyncing ? '객실 데이터를 수집하고 있습니다.' : '객실 데이터 수집을 완료했습니다.'}</strong><small>{isSyncing && syncActiveDate ? `${formatLongDate(syncActiveDate)} 확인 중` : `${syncEntries.length}일 저장 완료`}</small></span></div>
            <b>{syncProgress}%</b>
          </div>
          <div className="room-sync-track"><i style={{ width: `${syncProgress}%` }} /></div>
          <div className="room-sync-log">
            {syncEntries.slice(-5).map((entry) => <span key={entry.date}><CheckCircle2 size={12} />{formatShortDate(entry.date)} <b>{entry.total.toLocaleString()}실</b> · 단체 {entry.groups}팀</span>)}
          </div>
        </section>
      )}

      {error && <div className="room-alert error">{error}</div>}
      {message && <div className="room-alert success">{message}</div>}

      {isLoading ? (
        <div className="room-loading"><LoaderCircle className="room-spin" size={28} /><span>객실 현황을 불러오고 있습니다.</span></div>
      ) : reports.length === 0 ? (
        <section className="room-empty">
          <Hotel size={40} />
          <h2>저장된 객실 현황이 없습니다.</h2>
          <p>첫 동기화를 실행하면 오늘부터 향후 {SYNC_DAYS}일 데이터를 저장하고 대시보드를 구성합니다.</p>
          <button type="button" onClick={() => void startSync()} disabled={isSyncing}><RefreshCw size={17} />첫 객실 현황 동기화</button>
        </section>
      ) : (
        <>
          <section className={`room-calendar ${isSyncing ? 'syncing' : ''}`} aria-label="콘도 객실 월간 달력">
            {isSyncing && (
              <div className="room-calendar-sync-state" role="status" aria-live="polite">
                <span className="room-sync-orbit"><DatabaseZap size={17} /></span>
                <div><strong>최신 객실 데이터를 받고 있습니다.</strong><small>{syncActiveDate ? `${formatLongDate(syncActiveDate)} 수집 중` : '원본 사이트 연결 중'}</small></div>
                <b>{syncProgress}%</b>
                <div className="room-calendar-sync-line"><i style={{ width: `${syncProgress}%` }} /></div>
              </div>
            )}
            <div className="room-calendar-heading">
              <div><span>CONDO OCC CALENDAR</span><h2>{format(calendarMonth, 'yyyy년 M월')} 콘도 가동률</h2><p>콘도 총 767실 기준 · 날짜를 누르면 상세 현황이 변경됩니다.</p></div>
              <div className="room-calendar-summary">
                <span><small>평균 OCC</small><b>{calendarStats.averageOcc.toFixed(1)}%</b></span>
              </div>
              <div className="room-calendar-actions">
                <button type="button" onClick={() => setCalendarMonth((month) => addMonths(month, -1))} aria-label="이전 달"><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => setCalendarMonth(new Date(`${getKstDate()}T00:00:00+09:00`))}>이번 달</button>
                <button type="button" onClick={() => setCalendarMonth((month) => addMonths(month, 1))} aria-label="다음 달"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="room-calendar-weekdays">{['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="room-calendar-grid">
              {calendarDates.map((date) => {
                const dateKey = format(date, 'yyyy-MM-dd')
                const report = reportMap.get(dateKey)
                const condo = getFacility(report || null, '콘도')
                const youth = getFacility(report || null, '유스')
                const garden = getFacility(report || null, '가든')
                const occ = getCondoOcc(condo.total)
                const inMonth = isSameMonth(date, calendarMonth)
                const isToday = dateKey === getKstDate()
                const occLevel = occ >= 90 ? 'critical' : occ >= 70 ? 'high' : occ >= 40 ? 'medium' : 'low'
                return (
                  <button
                    type="button"
                    key={dateKey}
                    disabled={!inMonth || !report}
                    className={`room-calendar-day ${!inMonth ? 'outside' : ''} ${isToday ? 'today' : ''} ${selectedDate === dateKey ? 'selected' : ''}`}
                    onClick={() => report && setSelectedDate(dateKey)}
                  >
                    {inMonth && <>
                      <div className="room-calendar-day-head"><strong>{format(date, 'd')}</strong>{report && <span className={occLevel}>{occ.toFixed(1)}%</span>}</div>
                      {report ? <>
                        <div className="room-calendar-condo"><small>콘도</small><b>{condo.total.toLocaleString()}<em>실</em></b></div>
                        <div className="room-calendar-occ-track"><i className={occLevel} style={{ width: `${Math.min(100, occ)}%` }} /></div>
                        <div className="room-calendar-mix">
                          <span><small>회원</small><b>{condo.member.toLocaleString()}</b></span>
                          <span><small>일반</small><b>{condo.general.toLocaleString()}</b></span>
                          <span><small>단체</small><b>{condo.group.toLocaleString()}</b></span>
                        </div>
                        <div className="room-calendar-sub"><span>유스 {youth.total.toLocaleString()}</span>{garden.total > 0 && <span>가든 {garden.total.toLocaleString()}</span>}</div>
                      </> : <div className="room-calendar-empty">수집 전</div>}
                    </>}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="room-card room-availability-card">
            <div className="room-card-heading"><div><span>CONDO TYPE AVAILABILITY</span><h2>객실 타입별 예약 가능 현황</h2></div><em>{formatLongDate(selectedDate)} · 공개 예약 시스템 기준</em></div>
            {Object.keys(activeReport?.condoAvailability || {}).length > 0 ? (
              <div className="room-availability-grid">
                {CONDO_ROOM_TYPES.map((roomType) => {
                  const available = activeReport?.condoAvailability[roomType]
                  return <article key={roomType} className={available ? 'available' : 'sold-out'}><small>{roomType}</small><strong>{available ? '예약 가능' : '예약 완료'}</strong><span>{available ? 'OPEN' : 'CLOSED'}</span></article>
                })}
              </div>
            ) : <div className="room-no-availability"><Hotel size={26} /><span>이 날짜의 타입별 현황은 다음 최신 데이터 동기화부터 표시됩니다.</span></div>}
            <p className="room-availability-note">스탠다드·패밀리·스위트·럭셔리·하우스 타입의 공실 여부를 표시합니다. 원본 시스템은 잔여 객실 수량을 제공하지 않습니다.</p>
          </section>

          <section className="room-card room-group-card">
            <div className="room-card-heading"><div><span>GROUP SCHEDULE</span><h2>단체 입·퇴실 현황</h2></div><em>{formatLongDate(selectedDate)} · {activeReport?.groupData.length || 0}개 단체</em></div>
            {activeReport?.groupData.length ? (
              <div className="room-group-table-wrap">
                <table>
                  <thead><tr><th>단체명</th><th>도착일</th><th>출발일</th><th>숙박</th><th>콘도</th><th>유스</th><th>합계</th></tr></thead>
                  <tbody>
                    {activeReport.groupData.map((group, index) => (
                      <tr key={`${group.name}-${group.arrivalDate}-${index}`}>
                        <td><span className="group-index">{String(index + 1).padStart(2, '0')}</span><strong>{group.name}</strong></td>
                        <td>{group.arrivalDate}</td>
                        <td>{group.departureDate}</td>
                        <td>{getStayNights(group.arrivalDate, group.departureDate)}박</td>
                        <td>{group.condoQty.toLocaleString()}실</td>
                        <td>{group.youthQty.toLocaleString()}실</td>
                        <td><b>{(group.condoQty + group.youthQty).toLocaleString()}실</b><ChevronRight size={14} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="room-no-groups"><Users size={28} /><span>이 날짜에 표시할 단체 투숙 정보가 없습니다.</span></div>}
          </section>

          <p className="room-source-note">데이터 출처: 웰리힐리파크 객실 투숙정보 및 실시간 객실 타입 현황 · 원본 사이트는 오늘 이전 날짜 조회를 지원하지 않아 동기화 시점부터 일자별 데이터가 누적됩니다.</p>
        </>
      )}
    </div>
  )
}
