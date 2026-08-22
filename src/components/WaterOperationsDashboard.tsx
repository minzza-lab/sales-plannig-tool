import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarDays, ChartNoAxesCombined, CircleAlert, DoorOpen, Ticket, Waves } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import CrawlerSyncButton from './CrawlerSyncButton'
import './WaterOperationsDashboard.css'

type RawItem = { name: string; status: string; quantity: number; amount: number }
type Report = { date: string; total: number; totalQty: number; ticket: RawItem[]; rental: RawItem[]; updatedAt: string }
const FIXED_CAPACITY: Record<string, number> = { 카바나: 142, 썬베드: 274 }

const net = (items: RawItem[]) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
const quantity = (items: RawItem[]) => items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
const compactWon = (amount: number) => Math.abs(amount) >= 100_000_000 ? `${(amount / 100_000_000).toFixed(2)}억원` : Math.abs(amount) >= 10_000 ? `${Math.round(amount / 10_000).toLocaleString()}만원` : `${amount.toLocaleString()}원`
const classifyTicket = (name: string, amount: number) => /추가요금/.test(name) ? '추가요금' : /comp|무료|초대/i.test(name) || amount === 0 ? '무료·COMP' : /할인/.test(name) ? '할인권' : '일반권'
const rentalType = (name: string) => /카바나/i.test(name) ? '카바나' : /썬베드|선베드/i.test(name) ? '썬베드' : name

export default function WaterOperationsDashboard() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedDate, setSelectedDate] = useState('')

  const fetchReports = async () => {
    const { data } = await supabase.from('daily_reports').select('report_date,data').eq('report_type', 'REALTIME_SALES').order('report_date', { ascending: true })
    const parsed = (data || []).map((row) => ({
      date: row.report_date,
      total: Number(row.data?.summary?.totalAmount) || 0,
      totalQty: Number(row.data?.summary?.totalQty) || 0,
      ticket: Array.isArray(row.data?.ticket_analysis) ? row.data.ticket_analysis : [],
      rental: Array.isArray(row.data?.rental_analysis) ? row.data.rental_analysis : [],
      updatedAt: row.data?.updated_at || '',
    }))
    setReports(parsed)
    setSelectedDate((current) => current || parsed.at(-1)?.date || '')
  }

  useEffect(() => { void fetchReports() }, [])
  const active = reports.find((report) => report.date === selectedDate) || reports.at(-1)
  const lastSynced = reports.map((report) => report.updatedAt).filter(Boolean).sort().at(-1)
  const ticketGroups = useMemo(() => {
    const groups = new Map<string, { amount: number; quantity: number }>()
    for (const item of active?.ticket || []) {
      const key = classifyTicket(item.name, item.amount)
      const current = groups.get(key) || { amount: 0, quantity: 0 }
      current.amount += Number(item.amount) || 0
      current.quantity += Number(item.quantity) || 0
      groups.set(key, current)
    }
    return ['일반권', '할인권', '무료·COMP', '추가요금'].map((name) => ({ name, ...(groups.get(name) || { amount: 0, quantity: 0 }) }))
  }, [active])
  const rentals = useMemo(() => {
    const groups = new Map<string, RawItem[]>()
    for (const item of active?.rental || []) {
      const type = rentalType(item.name)
      const name = FIXED_CAPACITY[type] ? type : '기타 대여상품'
      groups.set(name, [...(groups.get(name) || []), item])
    }
    const admissions = Math.max(0, quantity(active?.ticket || []))
    return [...groups].map(([name, items]) => ({ name, used: Math.max(0, quantity(items)), amount: net(items), capacity: FIXED_CAPACITY[name] || admissions, fixed: Boolean(FIXED_CAPACITY[name]) })).sort((left, right) => (FIXED_CAPACITY[right.name] ? 1 : 0) - (FIXED_CAPACITY[left.name] ? 1 : 0))
  }, [active])
  const cabana = rentals.find((item) => item.name === '카바나')
  const sunbed = rentals.find((item) => item.name === '썬베드')
  const rentalUsage = rentals.reduce((sum, item) => sum + item.used, 0)
  const ticketAmount = net(active?.ticket || [])
  const rentalAmount = net(active?.rental || [])
  const trend = reports.slice(-7).map((report) => ({ date: report.date.slice(5).replace('-', '/'), 매출: Math.round(report.total / 10_000), 입장객: Math.max(0, quantity(report.ticket)) }))
  const formatDate = (date?: string) => date ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00+09:00`)) : '수집된 데이터 없음'

  if (!active) return <div className="water-hub empty"><CircleAlert size={28}/><h1>워터 운영 데이터를 준비하고 있습니다.</h1><p>최신 매출 동기화를 실행하면 통합 운영 현황을 표시합니다.</p><CrawlerSyncButton target="waterpark" label="최신 매출 동기화" onComplete={fetchReports} /></div>

  return <div className="water-hub">
    <header className="water-hub-hero">
      <div><span>WATERPARK OPERATIONS HUB</span><h1>워터 운영 통합 현황</h1><p>매출, 입장객, 권종 구성과 대여상품 가동률을 한 화면에서 확인합니다.</p></div>
      <div className="water-hub-actions"><small>최근 동기화<br/><b>{lastSynced ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(lastSynced)) : '—'}</b></small><CrawlerSyncButton target="waterpark" label="최신 매출 동기화" onComplete={fetchReports} /></div>
    </header>

    <section className="water-hub-toolbar"><div><CalendarDays size={18}/><label htmlFor="water-hub-date">기준 일자</label><select id="water-hub-date" value={active.date} onChange={(event) => setSelectedDate(event.target.value)}>{reports.slice().reverse().map((report) => <option key={report.date} value={report.date}>{formatDate(report.date)}</option>)}</select></div><p><b>{formatDate(active.date)}</b> 운영 현황 · 상세 데이터는 아래 바로가기에서 계속 분석할 수 있습니다.</p></section>

    <section className="water-hub-kpis">
      <Kpi icon={<ChartNoAxesCombined/>} label="일일 전체 매출" value={compactWon(active.total)} note={`권종 순매출 ${compactWon(ticketAmount)}`}/>
      <Kpi icon={<Ticket/>} label="입장객" value={`${Math.max(0, quantity(active.ticket)).toLocaleString()}명`} note={`총 발권 ${active.totalQty.toLocaleString()}건`}/>
      <Kpi icon={<Waves/>} label="대여 사용" value={`${rentalUsage.toLocaleString()}개`} note={`대여 매출 ${compactWon(rentalAmount)}`}/>
      <Kpi icon={<DoorOpen/>} label="카바나 가동률" value={cabana?.capacity ? `${(cabana.used / cabana.capacity * 100).toFixed(1)}%` : '—'} note={`${cabana?.used.toLocaleString() || 0} / 142개`}/>
      <Kpi icon={<DoorOpen/>} label="선베드 가동률" value={sunbed?.capacity ? `${(sunbed.used / sunbed.capacity * 100).toFixed(1)}%` : '—'} note={`${sunbed?.used.toLocaleString() || 0} / 274개`}/>
    </section>

    <section className="water-hub-grid">
      <article className="water-hub-card ticket-mix"><header><div><span>TICKET MIX</span><h2>권종 구성</h2></div><Link to="/tools/water-operations-analysis">상세 분석 →</Link></header><div className="ticket-mix-list">{ticketGroups.map((item) => <div key={item.name}><span>{item.name}</span><b>{compactWon(item.amount)}</b><small>{item.quantity.toLocaleString()}건</small><i><em style={{ width: `${ticketAmount ? Math.min(100, Math.abs(item.amount) / Math.abs(ticketAmount) * 100) : 0}%` }}/></i></div>)}</div><footer>전체 매출 {compactWon(active.total)} = 권종 {compactWon(ticketAmount)} + 기타 {compactWon(active.total - ticketAmount)}</footer></article>
      <article className="water-hub-card rental-status"><header><div><span>RENTAL UTILIZATION</span><h2>대여상품 가동 현황</h2></div><Link to="/tools/water-operations-analysis">대여 상세 →</Link></header><div className="rental-status-list">{rentals.length ? rentals.map((item) => { const rate = item.capacity ? item.used / item.capacity * 100 : 0; return <div key={item.name}><div><b>{item.name}</b><span>{item.used.toLocaleString()}개 · {compactWon(item.amount)}</span></div><strong>{rate.toFixed(1)}%</strong><i><em style={{ width: `${Math.min(100, rate)}%` }}/></i><small>{item.fixed ? `보유 ${item.capacity.toLocaleString()}개 중` : `당일 발권객 ${item.capacity.toLocaleString()}명 대비`}</small></div> }) : <p className="no-detail">이 일자의 대여 상세 수집 데이터가 없습니다.</p>}</div></article>
      <article className="water-hub-card seven-day"><header><div><span>7-DAY TREND</span><h2>최근 7일 매출 흐름</h2></div><Link to="/tools/waterpark-sales">매출 상세 →</Link></header><div className="trend-chart"><ResponsiveContainer width="100%" height={200}><BarChart data={trend}><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis hide/><Tooltip/><Bar dataKey="매출" fill="#0d766d" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div><footer>막대는 전체 매출 기준이며, 일자를 바꿔 상세 실적을 확인할 수 있습니다.</footer></article>
      <article className="water-hub-card quick-links"><header><div><span>WORKFLOW</span><h2>상세 업무로 이동</h2></div></header><Link to="/tools/waterpark-sales"><BarChart3/><span><b>워터파크 매출 관리</b><small>날씨·전년·일별 매출 분석</small></span><em>→</em></Link><Link to="/tools/water-operations-analysis"><Waves/><span><b>워터 권종·대여 분석</b><small>권종·취소·대여상품 점유율</small></span><em>→</em></Link></article>
    </section>
  </div>
}

function Kpi({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) { return <article><span>{icon}</span><small>{label}</small><strong>{value}</strong><p>{note}</p></article> }
