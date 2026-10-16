import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Megaphone, MessageCircle, Plus, Save, Trash2 } from 'lucide-react'
import './FixedCostManagement.css'

type Channel = 'meta' | 'kakao'
type CostItem = {
  id: string
  channel: Channel
  date: string
  name: string
  budget: number
  actual: number
  status: '예정' | '집행중' | '완료'
  memo: string
}

const STORAGE_KEY = 'sales-planning-fixed-costs-v1'
const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date())

const seedItems: CostItem[] = [
  { id: 'meta-1', channel: 'meta', date: `${currentMonth}-01`, name: '메타 월간 캠페인', budget: 0, actual: 0, status: '예정', memo: '캠페인별 집행액을 입력하세요.' },
  { id: 'kakao-1', channel: 'kakao', date: `${currentMonth}-01`, name: '카카오 플러스친구 운영', budget: 0, actual: 0, status: '예정', memo: '메시지 발송·친구추가 등 운영비를 입력하세요.' },
]

const formatWon = (value: number) => `${Math.round(value || 0).toLocaleString('ko-KR')}원`
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function FixedCostManagement() {
  const [items, setItems] = useState<CostItem[]>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : seedItems
    } catch { return seedItems }
  })
  const [month, setMonth] = useState(currentMonth)
  const [channel, setChannel] = useState<'all' | Channel>('all')
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const visibleItems = useMemo(() => items.filter(item => item.date.startsWith(month) && (channel === 'all' || item.channel === channel)), [items, month, channel])
  const totals = useMemo(() => visibleItems.reduce((sum, item) => ({
    budget: sum.budget + Number(item.budget || 0),
    actual: sum.actual + Number(item.actual || 0),
  }), { budget: 0, actual: 0 }), [visibleItems])
  const variance = totals.budget - totals.actual
  const utilization = totals.budget ? Math.round(totals.actual / totals.budget * 100) : 0

  const updateItem = (id: string, patch: Partial<CostItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
  const addItem = (nextChannel: Channel) => setItems(current => [...current, { id: newId(), channel: nextChannel, date: `${month}-01`, name: nextChannel === 'meta' ? '메타 광고 항목' : '카카오 운영 항목', budget: 0, actual: 0, status: '예정', memo: '' }])
  const removeItem = (id: string) => setItems(current => current.filter(item => item.id !== id))
  const markSaved = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1800) }
  const syncMetaAds = async () => {
    setSyncing(true)
    setSyncMessage('Meta 캠페인 데이터를 불러오는 중입니다.')
    try {
      const response = await fetch(`/api/meta-ads?month=${encodeURIComponent(month)}`)
      const payload = await response.json() as { items?: CostItem[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Meta 데이터를 불러오지 못했습니다.')
      const imported = payload.items || []
      setItems(current => [...current.filter(item => !(item.channel === 'meta' && item.id.startsWith('meta-api-') && item.date.startsWith(month))), ...imported])
      setSyncMessage(`${imported.length}개 캠페인을 반영했습니다.`)
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Meta 데이터를 불러오지 못했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  return <section className="fixed-cost-page">
    <div className="fixed-cost-hero">
      <div>
        <p className="eyebrow">MARKETING FIXED COST</p>
        <h1>고정비 관리</h1>
        <p className="hero-description">광고·메시지 채널의 월별 예산과 실제 집행액을 한눈에 관리합니다.</p>
      </div>
      <div className="fixed-hero-actions"><button className="fixed-sync-button" onClick={syncMetaAds} disabled={syncing}><Megaphone size={16} />{syncing ? '불러오는 중' : 'Meta 데이터 가져오기'}</button><button className="fixed-save-button" onClick={markSaved}><Save size={16} />{saved ? '저장됨' : '저장'}</button></div>
    </div>

    <div className="fixed-cost-toolbar">
      <label><CalendarDays size={15} /> 기준월 <input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      <div className="channel-filters" role="tablist" aria-label="채널 필터">
        {(['all', 'meta', 'kakao'] as const).map(value => <button key={value} className={channel === value ? 'active' : ''} onClick={() => setChannel(value)}>{value === 'all' ? '전체' : value === 'meta' ? 'Meta 광고' : '카카오 플러스친구'}</button>)}
      </div>
    </div>
    {syncMessage && <p className="fixed-sync-message" role="status">{syncMessage}</p>}

    <div className="fixed-summary-grid">
      <article><span>이번 달 예산</span><strong>{formatWon(totals.budget)}</strong><small>{visibleItems.length}개 항목</small></article>
      <article><span>실제 집행액</span><strong>{formatWon(totals.actual)}</strong><small>집행률 {utilization}%</small></article>
      <article className={variance < 0 ? 'warning' : ''}><span>잔여 예산</span><strong>{formatWon(variance)}</strong><small>{variance < 0 ? '예산 초과' : '예산 내 집행'}</small></article>
    </div>

    <div className="fixed-channel-grid">
      {(['meta', 'kakao'] as Channel[]).map(value => {
        const list = visibleItems.filter(item => item.channel === value)
        const total = list.reduce((sum, item) => sum + Number(item.actual || 0), 0)
        return <article className="channel-card" key={value}>
          <div className="channel-card-head"><div className={`channel-icon ${value}`} >{value === 'meta' ? <Megaphone size={19} /> : <MessageCircle size={19} />}</div><div><p>{value === 'meta' ? 'Meta 광고' : '카카오 플러스친구'}</p><small>{list.length}개 항목 · 실집행 {formatWon(total)}</small></div></div>
          <div className="channel-bar"><span style={{ width: `${Math.min(100, list.reduce((sum, item) => sum + Number(item.budget || 0), 0) ? total / list.reduce((sum, item) => sum + Number(item.budget || 0), 0) * 100 : 0)}%` }} /></div>
        </article>
      })}
    </div>

    <div className="fixed-cost-list-card">
      <div className="list-heading"><div><p className="eyebrow">MONTHLY LEDGER</p><h2>{month.replace('-', '년 ')}월 운영비 내역</h2></div><div className="add-actions"><button onClick={() => addItem('meta')}><Plus size={15} /> Meta 항목</button><button onClick={() => addItem('kakao')}><Plus size={15} /> 카카오 항목</button></div></div>
      <div className="fixed-table-wrap"><table><thead><tr><th>채널</th><th>운영 항목</th><th>기준일</th><th>예산</th><th>실집행액</th><th>상태</th><th>메모</th><th aria-label="삭제" /></tr></thead><tbody>
        {visibleItems.length === 0 && <tr><td colSpan={8} className="empty-row">선택한 조건의 항목이 없습니다.</td></tr>}
        {visibleItems.map(item => <tr key={item.id}>
          <td><span className={`table-channel ${item.channel}`}>{item.channel === 'meta' ? 'Meta' : '카카오'}</span></td>
          <td><input value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} /></td>
          <td><input type="date" value={item.date} onChange={event => updateItem(item.id, { date: event.target.value })} /></td>
          <td><input className="number-input" type="number" min="0" value={item.budget} onChange={event => updateItem(item.id, { budget: Number(event.target.value) })} /></td>
          <td><input className="number-input" type="number" min="0" value={item.actual} onChange={event => updateItem(item.id, { actual: Number(event.target.value) })} /></td>
          <td><label className="status-select"><select value={item.status} onChange={event => updateItem(item.id, { status: event.target.value as CostItem['status'] })}><option>예정</option><option>집행중</option><option>완료</option></select><ChevronDown size={13} /></label></td>
          <td><input value={item.memo} placeholder="메모 입력" onChange={event => updateItem(item.id, { memo: event.target.value })} /></td>
          <td><button className="delete-button" aria-label="항목 삭제" onClick={() => removeItem(item.id)}><Trash2 size={15} /></button></td>
        </tr>)}
      </tbody></table></div>
      <p className="storage-note">현재 입력 내용은 이 브라우저에 자동 저장됩니다. 팀 공용 자료로 운영하려면 다음 단계에서 공용 저장소를 연결할 수 있습니다.</p>
    </div>
  </section>
}
