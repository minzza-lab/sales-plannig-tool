import { useEffect, useMemo, useState } from 'react'
import { addMonths, format, isSameMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, CircleAlert, Ticket, Waves } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './WaterOperationsAnalysis.css'

type RawItem = { name: string; status: string; quantity: number; amount: number }
type Report = { date: string; total: number; ticket: RawItem[]; rental: RawItem[]; updatedAt: string }
const FIXED_CAPACITY: Record<string, number> = { 카바나: 142, 썬베드: 274 }

const classifyTicket = (name: string, amount: number) => {
  if (/추가요금/.test(name)) return '추가요금'
  if (/comp|무료|초대/i.test(name) || amount === 0) return '무료·COMP'
  if (/할인/.test(name)) return '할인권'
  return '일반권'
}
const net = (items: RawItem[]) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
const used = (items: RawItem[]) => items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)

export default function WaterOperationsAnalysis() {
  const [reports, setReports] = useState<Report[]>([])
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('daily_reports').select('report_date,data').eq('report_type', 'REALTIME_SALES').order('report_date', { ascending: true })
      setReports((data || []).map((row) => ({
        date: row.report_date,
        total: Number(row.data?.summary?.totalAmount) || 0,
        ticket: Array.isArray(row.data?.ticket_analysis) ? row.data.ticket_analysis : [],
        rental: Array.isArray(row.data?.rental_analysis) ? row.data.rental_analysis : [],
        updatedAt: row.data?.updated_at || '',
      })))
    })()
  }, [])

  const active = reports.find((report) => report.date === selected) || null
  const lastSynced = reports.map((report) => report.updatedAt).filter(Boolean).sort().at(-1)
  const ticketGroups = useMemo(() => {
    const grouped = new Map<string, { sales: number; cancel: number; net: number; quantity: number }>()
    for (const item of active?.ticket || []) {
      const key = classifyTicket(item.name, item.amount)
      const current = grouped.get(key) || { sales: 0, cancel: 0, net: 0, quantity: 0 }
      current.net += item.amount
      current.quantity += item.quantity
      if (item.status === '취소') current.cancel += Math.abs(item.amount)
      else current.sales += item.amount
      grouped.set(key, current)
    }
    return [...grouped].map(([name, value]) => ({ name, ...value }))
  }, [active])
  const rentals = useMemo(() => {
    const grouped = new Map<string, RawItem[]>()
    for (const item of active?.rental || []) grouped.set(item.name, [...(grouped.get(item.name) || []), item])
    const dailyAdmissions = Math.max(0, used(active?.ticket || []))
    return [...grouped].map(([name, items]) => ({ name, used: Math.max(0, used(items)), revenue: net(items), capacity: FIXED_CAPACITY[name] || dailyAdmissions, basis: FIXED_CAPACITY[name] ? '보유 수량' : '당일 발권객' }))
  }, [active])
  const days = Array.from({ length: 42 }, (_, index) => {
    const start = startOfMonth(month)
    const offset = (start.getDay() + 6) % 7
    const date = new Date(start.getFullYear(), start.getMonth(), index - offset + 1)
    return date
  })
  return <div className="water-ops-page">
    <header className="water-ops-hero"><div><span>WATER OPERATIONS ANALYSIS</span><h1>워터 권종·대여 분석</h1><p>매출관리 원본과 같은 일별 데이터를 사용합니다. 권종 순매출과 전체 매출을 대조하고, 대여상품의 사용 현황을 관리합니다.</p></div><small>최근 동기화<br/><b>{lastSynced ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(lastSynced)) : '아직 동기화되지 않음'}</b></small></header>
    <section className="water-ops-card">
      <div className="water-ops-heading"><div><Ticket size={19}/><div><span>TICKET MIX</span><h2>{selected} 권종 분석</h2></div></div><small>동기화 후부터 판매·취소 상세가 누적됩니다.</small></div>
      {active?.ticket.length ? <>
        <div className="ticket-grid">{ticketGroups.map((item) => <article key={item.name}><small>{item.name}</small><strong>{item.net.toLocaleString()}원</strong><span>판매 {item.sales.toLocaleString()} · 취소 {item.cancel.toLocaleString()}</span><em>{item.quantity.toLocaleString()}건</em></article>)}</div>
        <div className="reconcile"><span>전체 매출 <b>{active.total.toLocaleString()}원</b></span><i>=</i><span>권종 순매출 <b>{net(active.ticket).toLocaleString()}원</b></span><i>+</i><span>기타 매출 <b>{(active.total - net(active.ticket)).toLocaleString()}원</b></span><strong>일치</strong></div>
      </> : <Empty text="이 날짜는 권종 상세 수집 전 데이터입니다. 최신 매출 동기화 후 표시됩니다." />}
    </section>
    <section className="water-ops-card">
      <div className="water-ops-heading"><div><Waves size={19}/><div><span>RENTAL UTILIZATION</span><h2>대여상품 월별 사용 현황</h2></div></div><small>카바나 142개 · 선베드 274개 / 그 외 품목은 당일 발권객 기준</small></div>
      <div className="rental-month-actions"><button onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={16}/></button><b>{format(month, 'yyyy년 M월')}</b><button onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16}/></button></div>
      <div className="rental-calendar">{['월','화','수','목','금','토','일'].map((day) => <b key={day}>{day}</b>)}{days.map((date) => { const key = format(date, 'yyyy-MM-dd'); const report = reports.find((item) => item.date === key); const count = Math.max(0, used(report?.rental || [])); return <button key={key} className={!isSameMonth(date, month) ? 'outside' : selected === key ? 'selected' : ''} onClick={() => report && setSelected(key)} disabled={!report}><span>{format(date, 'd')}</span>{report ? <><strong>{count.toLocaleString()}건</strong><small>대여 사용</small></> : <small>—</small>}</button> })}</div>
      {active?.rental.length ? <div className="rental-products">{rentals.map((item) => { const occupancy = item.capacity ? item.used / item.capacity * 100 : 0; return <article key={item.name}><div><small>{item.name}</small><strong>{item.used.toLocaleString()}회 사용</strong><span>{item.revenue.toLocaleString()}원</span></div><div className="occupancy"><b>{occupancy.toFixed(1)}%</b><i><em style={{width: `${Math.min(100, occupancy)}%`}}/></i><small>{item.basis} {item.capacity.toLocaleString()}{item.basis === '보유 수량' ? '개 중' : '명 대비'} {item.used.toLocaleString()}회 사용</small></div></article> })}</div> : <Empty text="선택 날짜의 대여상품 상세가 없습니다." />}
    </section>
  </div>
}
function Empty({ text }: { text: string }) { return <div className="water-ops-empty"><CircleAlert size={24}/>{text}</div> }
