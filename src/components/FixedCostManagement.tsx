import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Megaphone, MessageCircle, Plus, Save, Trash2, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
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
const normalizeHeader = (value: unknown) => String(value ?? '').replace(/\s+/g, '').toLowerCase()
const firstColumn = (headers: string[], names: string[]) => headers.findIndex(header => names.some(name => header.includes(name)))
const amountFromCell = (value: unknown) => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0
const dateFromCell = (value: unknown, fallback: string) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = String(value ?? '').trim()
  const match = text.match(/(20\d{2})[./-](\d{1,2})(?:[./-](\d{1,2}))?/)
  if (!match) return `${fallback}-01`
  return `${match[1]}-${match[2].padStart(2, '0')}-${(match[3] || '01').padStart(2, '0')}`
}

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

  const importKakaoReport = async (file: File) => {
    setSyncing(true)
    setSyncMessage('카카오모먼트 보고서를 읽는 중입니다.')
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
      const headerIndex = matrix.findIndex(row => row.some(cell => /캠페인|광고그룹|소재/.test(String(cell))) && row.some(cell => /광고비|비용|소진|spend/i.test(String(cell))))
      if (headerIndex < 0) throw new Error('캠페인명과 광고비 열을 찾지 못했습니다. 카카오모먼트 보고서 파일인지 확인해 주세요.')
      const headers = matrix[headerIndex].map(normalizeHeader)
      const nameIndex = firstColumn(headers, ['캠페인명', '캠페인', '광고그룹명', '광고그룹', '소재명'])
      const spendIndex = firstColumn(headers, ['광고비', '비용', '소진금액', '소진', 'spend'])
      const impressionsIndex = firstColumn(headers, ['노출수', '노출', 'impressions'])
      const clicksIndex = firstColumn(headers, ['클릭수', '클릭', 'clicks'])
      const reachIndex = firstColumn(headers, ['도달수', '도달', 'reach'])
      const dateIndex = firstColumn(headers, ['날짜', '일자', '기준일', 'date', '기간'])
      if (nameIndex < 0 || spendIndex < 0) throw new Error('캠페인명 또는 광고비 열을 찾지 못했습니다.')
      const imported: CostItem[] = matrix.slice(headerIndex + 1).map((row, rowIndex) => {
        const name = String(row[nameIndex] ?? '').trim()
        if (!name) return null
        const spend = amountFromCell(row[spendIndex])
        const impressions = impressionsIndex >= 0 ? amountFromCell(row[impressionsIndex]) : 0
        const clicks = clicksIndex >= 0 ? amountFromCell(row[clicksIndex]) : 0
        const reach = reachIndex >= 0 ? amountFromCell(row[reachIndex]) : 0
        const memoParts = [`노출 ${impressions.toLocaleString('ko-KR')}`, `클릭 ${clicks.toLocaleString('ko-KR')}`, `도달 ${reach.toLocaleString('ko-KR')}`]
        return { id: `kakao-import-${Date.now()}-${rowIndex}`, channel: 'kakao', date: dateFromCell(dateIndex >= 0 ? row[dateIndex] : '', month), name, budget: 0, actual: spend, status: '완료', memo: memoParts.join(' · ') }
      }).filter((item): item is CostItem => Boolean(item && item.name))
      if (!imported.length) throw new Error('가져올 캠페인 행이 없습니다.')
      setItems(current => [...current.filter(item => !(item.channel === 'kakao' && item.id.startsWith('kakao-import-'))), ...imported])
      setSyncMessage(`${imported.length}개 카카오 캠페인을 반영했습니다.`)
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '카카오 보고서를 읽지 못했습니다.')
    } finally { setSyncing(false) }
  }

  return <section className="fixed-cost-page">
    <div className="fixed-cost-hero">
      <div>
        <p className="eyebrow">MARKETING FIXED COST</p>
        <h1>고정비 관리</h1>
        <p className="hero-description">광고·메시지 채널의 월별 예산과 실제 집행액을 한눈에 관리합니다.</p>
      </div>
      <div className="fixed-hero-actions"><button className="fixed-sync-button" onClick={syncMetaAds} disabled={syncing}><Megaphone size={16} />{syncing ? '불러오는 중' : 'Meta 데이터 가져오기'}</button><label className="fixed-upload-button"><Upload size={16} /> 카카오 보고서 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={event => { const file = event.target.files?.[0]; if (file) void importKakaoReport(file); event.currentTarget.value = '' }} /></label><button className="fixed-save-button" onClick={markSaved}><Save size={16} />{saved ? '저장됨' : '저장'}</button></div>
    </div>

    <div className="fixed-cost-toolbar">
      <label><CalendarDays size={15} /> 기준월 <input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      <div className="channel-filters" role="tablist" aria-label="채널 필터">
        {(['all', 'meta', 'kakao'] as const).map(value => <button key={value} className={channel === value ? 'active' : ''} onClick={() => setChannel(value)}>{value === 'all' ? '전체' : value === 'meta' ? 'Meta 광고' : '카카오 플러스친구'}</button>)}
      </div>
    </div>
    {syncMessage && <p className="fixed-sync-message" role="status">{syncMessage}</p>}
    <details className="kakao-import-guide"><summary>카카오모먼트 보고서 가져오는 방법</summary><ol><li><a href="https://moment.kakao.com" target="_blank" rel="noreferrer">카카오모먼트</a>에 로그인합니다.</li><li>광고계정을 선택하고 보고서 또는 캠페인 성과 화면으로 이동합니다.</li><li>조회 기간을 설정한 뒤 `엑셀 다운로드`로 파일을 저장합니다.</li><li>이 화면의 `카카오 보고서 업로드` 버튼으로 파일을 등록합니다.</li></ol><p>캠페인명, 광고비, 노출, 클릭, 도달, 날짜 열을 자동 인식합니다. 카카오모먼트의 충전·결제 내역은 별도로 자동 가져오지 않으며, 광고 보고서의 집행액을 반영합니다.</p></details>

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
