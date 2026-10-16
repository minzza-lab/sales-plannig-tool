import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, ChevronDown, Download, ExternalLink, RefreshCw, Receipt, Upload, WalletCards } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import * as XLSX from 'xlsx'
import './MetaAdsManager.css'

type Campaign = {
  id: string
  channel: 'meta'
  date: string
  name: string
  actual: number
  memo: string
  targeting?: string
  details?: CampaignDetails
}

type MetaAction = { action_type?: string; value?: string }
type CampaignDetails = {
  campaignId: string
  period: { start: string; end: string }
  metadata: { status?: string; effective_status?: string; objective?: string; buying_type?: string; daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string; created_time?: string; updated_time?: string }
  adSets: { id: string; name: string; status: string; effectiveStatus: string; dailyBudget: number; lifetimeBudget: number; optimizationGoal: string; billingEvent: string; startTime: string; endTime: string; targeting: string }[]
  metrics: { frequency: number; cpm: number; cpp: number; ctr: number; cpc: number; costPerInlineLinkClick: number; inlineLinkClicks: number; inlineLinkCtr: number; outboundClicks: number; outboundCtr: number; uniqueClicks: number; uniqueCtr: number; uniqueInlineLinkClicks: number; uniqueOutboundClicks: number; socialSpend: number; videoPlays: number; video25: number; video50: number; video75: number; video95: number; video100: number; thruplays: number; video15: number; video30: number; avgVideoSeconds: number }
  actions: MetaAction[]
  actionValues: MetaAction[]
  costPerAction: MetaAction[]
  conversions: MetaAction[]
  conversionValues: MetaAction[]
  purchaseRoas: MetaAction[]
  websitePurchaseRoas: MetaAction[]
}

type MetricKey = 'spend' | 'impressions' | 'clicks' | 'reach' | 'ctr'
type PaymentKind = '충전' | '사용' | '기타'
type PaymentActivity = { id: string; date: string; transactionId: string; amount: number; paymentMethod: string; status: string; invoiceId: string; kind: PaymentKind }

const CHARGED_KEY = 'sales-planning-meta-charged-v1'
const PAYMENTS_KEY = 'sales-planning-meta-payments-v1'
const PAYMENTS_IMPORTED_AT_KEY = 'sales-planning-meta-payments-imported-at-v1'
const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date())

const numberFromMemo = (memo: string, label: string) => Number(memo.match(new RegExp(`${label} ([\\d,]+)`))?.[1]?.replaceAll(',', '') || 0)
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const normalizeHeader = (value: unknown) => String(value ?? '').replace(/\s+/g, '').toLowerCase()
const firstColumn = (headers: string[], names: string[]) => headers.findIndex(header => names.some(name => header.includes(name)))
const amountFromCell = (value: unknown) => Math.abs(Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0)
const paymentDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = String(value ?? '').trim()
  const match = text.match(/(20\d{2})[./-](\d{1,2})(?:[./-](\d{1,2}))?/) 
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${(match[3] || '01').padStart(2, '0')}` : text || '-'
}
const metricLabels: Record<MetricKey, string> = { spend: '광고비', impressions: '노출', clicks: '클릭', reach: '도달', ctr: 'CTR' }
const campaignMetrics = (campaign: Campaign) => {
  const impressions = numberFromMemo(campaign.memo, '노출')
  const clicks = numberFromMemo(campaign.memo, '클릭')
  return { spend: campaign.actual, impressions, clicks, reach: numberFromMemo(campaign.memo, '도달'), ctr: impressions ? clicks / impressions * 100 : 0 }
}
const displayMetric = (campaign: Campaign, key: MetricKey) => {
  const value = campaignMetrics(campaign)[key]
  return key === 'spend' ? won(value) : key === 'ctr' ? `${value.toFixed(2)}%` : value.toLocaleString('ko-KR')
}
const displayDifference = (a: Campaign, b: Campaign, key: MetricKey) => {
  const difference = campaignMetrics(b)[key] - campaignMetrics(a)[key]
  return key === 'ctr' ? `${difference >= 0 ? '+' : ''}${difference.toFixed(2)}%p` : `${difference >= 0 ? '+' : ''}${key === 'spend' ? won(difference) : difference.toLocaleString('ko-KR')}`
}
const displayChangeRate = (a: Campaign, b: Campaign, key: MetricKey) => {
  const first = campaignMetrics(a)[key]
  const second = campaignMetrics(b)[key]
  if (!first) return second ? '신규' : '-'
  return `${((second - first) / Math.abs(first) * 100).toFixed(1)}%`
}
const numberValue = (value: string | number | undefined) => Number(value || 0)
const actionLabel = (value: string | undefined) => (value || '').replaceAll('_', ' ').replace(/^offsite /, '').replace(/^onsite /, '') || '기타 액션'
const actionRows = (actions: MetaAction[]) => actions.filter(action => numberValue(action.value) > 0)
const compactNumber = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
const compactWon = (value: number) => won(value)
const chartColors = ['#315ca8', '#1c7183', '#db8b3e', '#7e67b8', '#4f8d68', '#c65b5b', '#566b86', '#a8753b']

function CampaignDetailAccordion({ campaign }: { campaign: Campaign }) {
  const values = campaignMetrics(campaign)
  const details = campaign.details
  const extra = details?.metrics
  const money = (value: string | number | undefined) => compactWon(numberValue(value))
  const metadata = details?.metadata || {}
  return <div className="meta-selected-campaign"><div className="meta-selected-campaign-header"><div><span>선택한 캠페인</span><h3>{campaign.name}</h3><small>{details?.period.start || campaign.date} ~ {details?.period.end || campaign.date}</small></div><span className="meta-selected-campaign-id">ID {details?.campaignId || campaign.id}</span></div><div className="meta-selected-metrics"><article><span>광고비</span><strong>{won(values.spend)}</strong></article><article><span>노출</span><strong>{values.impressions.toLocaleString('ko-KR')}</strong></article><article><span>클릭</span><strong>{values.clicks.toLocaleString('ko-KR')}</strong></article><article><span>도달</span><strong>{values.reach.toLocaleString('ko-KR')}</strong></article><article><span>CTR</span><strong>{(extra?.ctr ?? values.ctr).toFixed(2)}%</strong></article><article><span>CPM</span><strong>{money(extra?.cpm)}</strong></article><article><span>CPC</span><strong>{money(extra?.cpc)}</strong></article><article><span>빈도</span><strong>{(extra?.frequency ?? 0).toFixed(2)}</strong></article><article><span>고유 클릭</span><strong>{compactNumber(extra?.uniqueClicks ?? 0)}</strong></article><article><span>링크 클릭</span><strong>{compactNumber(extra?.inlineLinkClicks ?? 0)}</strong></article></div>{details ? <div className="meta-detail-accordion-list"><details open><summary>전환·가치 분석 <span>{details.actions.length}개 액션</span></summary><div className="meta-action-section"><div className="meta-action-grid"><article><span>전환 수</span><strong>{compactNumber(details.conversions.reduce((sum, action) => sum + numberValue(action.value), 0))}</strong></article><article><span>전환 가치</span><strong>{money(details.conversionValues.reduce((sum, action) => sum + numberValue(action.value), 0))}</strong></article><article><span>구매 ROAS</span><strong>{details.purchaseRoas.length ? `${numberValue(details.purchaseRoas[0].value).toFixed(2)}x` : '-'}</strong></article><article><span>웹사이트 구매 ROAS</span><strong>{details.websitePurchaseRoas.length ? `${numberValue(details.websitePurchaseRoas[0].value).toFixed(2)}x` : '-'}</strong></article></div><div className="meta-action-tables"><div><h4>액션별 결과</h4><table><thead><tr><th>액션</th><th>결과</th></tr></thead><tbody>{actionRows(details.actions).map((action, index) => <tr key={`action-${action.action_type}-${index}`}><td>{actionLabel(action.action_type)}</td><td>{compactNumber(numberValue(action.value))}</td></tr>)}</tbody></table></div><div><h4>액션별 비용·가치</h4><table><thead><tr><th>액션</th><th>비용</th><th>가치</th></tr></thead><tbody>{actionRows(details.costPerAction).map((action, index) => <tr key={`cost-${action.action_type}-${index}`}><td>{actionLabel(action.action_type)}</td><td>{money(action.value)}</td><td>{money(details.actionValues.find(value => value.action_type === action.action_type)?.value)}</td></tr>)}</tbody></table></div></div></div></details><details><summary>게재·동영상 분석 <span>도달·클릭·시청</span></summary><div className="meta-detail-card-grid"><div><span>아웃바운드 클릭</span><strong>{compactNumber(extra?.outboundClicks ?? 0)}</strong></div><div><span>아웃바운드 CTR</span><strong>{(extra?.outboundCtr ?? 0).toFixed(2)}%</strong></div><div><span>고유 CTR</span><strong>{(extra?.uniqueCtr ?? 0).toFixed(2)}%</strong></div><div><span>CPP</span><strong>{money(extra?.cpp)}</strong></div><div><span>링크 클릭당 비용</span><strong>{money(extra?.costPerInlineLinkClick)}</strong></div><div><span>링크 클릭률</span><strong>{(extra?.inlineLinkCtr ?? 0).toFixed(2)}%</strong></div><div><span>고유 링크 클릭</span><strong>{compactNumber(extra?.uniqueInlineLinkClicks ?? 0)}</strong></div><div><span>고유 아웃바운드 클릭</span><strong>{compactNumber(extra?.uniqueOutboundClicks ?? 0)}</strong></div><div><span>소셜 지출</span><strong>{money(extra?.socialSpend)}</strong></div><div><span>동영상 재생</span><strong>{compactNumber(extra?.videoPlays ?? 0)}</strong></div><div><span>ThruPlay</span><strong>{compactNumber(extra?.thruplays ?? 0)}</strong></div><div><span>15초 시청</span><strong>{compactNumber(extra?.video15 ?? 0)}</strong></div><div><span>30초 시청</span><strong>{compactNumber(extra?.video30 ?? 0)}</strong></div><div><span>25% 시청</span><strong>{compactNumber(extra?.video25 ?? 0)}</strong></div><div><span>50% 시청</span><strong>{compactNumber(extra?.video50 ?? 0)}</strong></div><div><span>75% 시청</span><strong>{compactNumber(extra?.video75 ?? 0)}</strong></div><div><span>95% 시청</span><strong>{compactNumber(extra?.video95 ?? 0)}</strong></div><div><span>100% 시청</span><strong>{compactNumber(extra?.video100 ?? 0)}</strong></div><div><span>평균 시청시간</span><strong>{(extra?.avgVideoSeconds ?? 0).toFixed(1)}초</strong></div></div></details><details><summary>타겟·광고 세트 <span>{details.adSets.length}개 광고 세트</span></summary><div className="meta-adset-list">{details.adSets.length ? details.adSets.map(adSet => <article key={adSet.id}><div><strong>{adSet.name || '이름 없는 광고 세트'}</strong><span>{adSet.effectiveStatus || adSet.status || '상태 확인 안 됨'}</span></div><p>{adSet.targeting || '타겟 세부 정보 없음'}</p><small>최적화 {adSet.optimizationGoal || '-'} · 과금 {adSet.billingEvent || '-'}{adSet.dailyBudget ? ` · 일예산 ${money(adSet.dailyBudget)}` : ''}</small></article>) : <p>광고 세트 정보를 확인하지 못했습니다.</p>}</div></details><details><summary>캠페인 설정·운영 상태</summary><div className="meta-detail-card-grid"><div><span>상태</span><strong>{metadata.effective_status || metadata.status || '확인 안 됨'}</strong></div><div><span>목표</span><strong>{metadata.objective || '-'}</strong></div><div><span>구매 방식</span><strong>{metadata.buying_type || '-'}</strong></div><div><span>일예산</span><strong>{money(metadata.daily_budget)}</strong></div><div><span>생애 예산</span><strong>{money(metadata.lifetime_budget)}</strong></div><div><span>시작일</span><strong>{metadata.start_time || '-'}</strong></div><div><span>종료일</span><strong>{metadata.stop_time || '-'}</strong></div><div><span>최근 수정</span><strong>{metadata.updated_time || '-'}</strong></div></div></details><details><summary>분석 메모·원본 액션 데이터</summary><div className="meta-detail-note"><p>{campaign.memo}</p><p>{campaign.targeting || '캠페인 타겟 요약이 없습니다.'}</p></div><pre className="meta-raw-actions">{JSON.stringify({ actions: details.actions, conversions: details.conversions, purchaseRoas: details.purchaseRoas }, null, 2)}</pre></details></div> : <div className="meta-detail-note"><p>{campaign.memo}</p><p>{campaign.targeting || 'Meta API에서 상세 데이터를 확인하지 못했습니다.'}</p></div>}</div>
}

export default function MetaAdsManager() {
  const [period, setPeriod] = useState<'month' | 'all'>('all')
  const [month, setMonth] = useState(currentMonth)
  const [chargedAmount, setChargedAmount] = useState(() => localStorage.getItem(CHARGED_KEY) || '')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [message, setMessage] = useState('')
  const [metric, setMetric] = useState<MetricKey>('spend')
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [detailCampaignId, setDetailCampaignId] = useState('')
  const [payments, setPayments] = useState<PaymentActivity[]>(() => {
    try { return JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]') as PaymentActivity[] } catch { return [] }
  })
  const [lastPaymentImport, setLastPaymentImport] = useState(() => localStorage.getItem(PAYMENTS_IMPORTED_AT_KEY) || '')

  const loadCampaigns = async () => {
    setLoading(true)
    setMessage('Meta 캠페인 성과를 불러오는 중입니다.')
    try {
      const query = period === 'all' ? 'period=all' : `month=${encodeURIComponent(month)}`
      const response = await fetch(`/api/meta-ads?${query}`)
      const payload = await response.json() as { items?: Campaign[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Meta 데이터를 불러오지 못했습니다.')
      setCampaigns(payload.items || [])
      setSelectedCampaignIds((current) => {
        const nextIds = (payload.items || []).map(item => item.id)
        return current.length ? current.filter(id => nextIds.includes(id)) : nextIds
      })
      setCompareIds(current => {
        const nextIds = (payload.items || []).map(item => item.id)
        const retained = current.filter(id => nextIds.includes(id)).slice(0, 2)
        return [...retained, ...nextIds.filter(id => !retained.includes(id))].slice(0, 2)
      })
      setDetailCampaignId(current => current && (payload.items || []).some(item => item.id === current) ? current : payload.items?.[0]?.id || '')
      setMessage(`${period === 'all' ? '전체 기간' : month} 기준 ${payload.items?.length || 0}개 캠페인을 확인했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Meta 데이터를 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadCampaigns() }, [month, period])

  const totals = useMemo(() => campaigns.reduce((sum, campaign) => ({
    spend: sum.spend + campaign.actual,
    impressions: sum.impressions + numberFromMemo(campaign.memo, '노출'),
    clicks: sum.clicks + numberFromMemo(campaign.memo, '클릭'),
    reach: sum.reach + numberFromMemo(campaign.memo, '도달'),
  }), { spend: 0, impressions: 0, clicks: 0, reach: 0 }), [campaigns])

  const selectedCampaigns = useMemo(() => campaigns.filter(campaign => selectedCampaignIds.includes(campaign.id)), [campaigns, selectedCampaignIds])
  const comparisonCampaigns = useMemo(() => compareIds.map(id => campaigns.find(campaign => campaign.id === id)).filter((campaign): campaign is Campaign => Boolean(campaign)), [campaigns, compareIds])
  const detailCampaign = useMemo(() => campaigns.find(campaign => campaign.id === detailCampaignId) || campaigns[0], [campaigns, detailCampaignId])
  const paymentTotals = useMemo(() => payments.reduce((sum, payment) => ({
    charged: sum.charged + (payment.kind === '충전' ? payment.amount : 0),
    used: sum.used + (payment.kind === '사용' ? payment.amount : 0),
    other: sum.other + (payment.kind === '기타' ? payment.amount : 0),
  }), { charged: 0, used: 0, other: 0 }), [payments])
  const effectiveCharged = paymentTotals.charged || Number(chargedAmount || 0)
  const paymentApiDifference = totals.spend - paymentTotals.used
  const estimatedBalance = effectiveCharged ? effectiveCharged - (paymentTotals.used || totals.spend) : 0
  const chartData = useMemo(() => selectedCampaigns.map(campaign => {
    const values = campaignMetrics(campaign)
    return { name: campaign.name.length > 18 ? `${campaign.name.slice(0, 18)}…` : campaign.name, fullName: campaign.name, value: values[metric], campaignId: campaign.id }
  }).sort((a, b) => b.value - a.value), [selectedCampaigns, metric])
  const spendShareData = useMemo(() => selectedCampaigns.map(campaign => ({ name: campaign.name, value: campaign.actual })).filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 8), [selectedCampaigns])

  const toggleCampaign = (id: string) => setSelectedCampaignIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  const saveChargedAmount = (value: string) => {
    setChargedAmount(value)
    localStorage.setItem(CHARGED_KEY, value)
  }

  const importPaymentActivity = async (file: File) => {
    setReporting(true)
    setMessage('Meta 결제 활동 파일을 읽는 중입니다.')
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
      const headerIndex = matrix.findIndex(row => row.some(cell => /날짜|일자|date/i.test(String(cell))) && row.some(cell => /금액|amount|결제액|거래금액/i.test(String(cell))))
      if (headerIndex < 0) throw new Error('날짜와 금액 열을 찾지 못했습니다. Meta 결제 활동 다운로드 파일인지 확인해 주세요.')
      const headers = matrix[headerIndex].map(normalizeHeader)
      const dateIndex = firstColumn(headers, ['날짜', '일자', 'date'])
      const amountIndex = firstColumn(headers, ['금액', 'amount', '결제액', '거래금액'])
      const transactionIndex = firstColumn(headers, ['거래id', '거래번호', 'transactionid', 'reference'])
      const methodIndex = firstColumn(headers, ['결제수단', '결제방법', 'paymentmethod'])
      const statusIndex = firstColumn(headers, ['결제상태', '상태', 'status'])
      const invoiceIndex = firstColumn(headers, ['vat인보이스id', '인보이스id', 'invoiceid', 'invoice'])
      const kindIndex = firstColumn(headers, ['유형', '구분', '거래유형', 'type'])
      const reportContext = matrix.slice(0, headerIndex + 1).flat().map(cell => String(cell ?? '')).join(' ')
      const imported = matrix.slice(headerIndex + 1).map((row, rowIndex) => {
        const amount = amountFromCell(row[amountIndex])
        const dateValue = row[dateIndex]
        const transactionId = transactionIndex >= 0 ? String(row[transactionIndex] ?? '').trim() : ''
        if (!amount || (!dateValue && !transactionId)) return null
        const paymentMethod = methodIndex >= 0 ? String(row[methodIndex] ?? '').trim() : ''
        const kindText = `${kindIndex >= 0 ? String(row[kindIndex] ?? '') : ''} ${paymentMethod}`
        const isCardOrFundingMethod = Boolean(paymentMethod) && !/해당\s*사항\s*없음|선불\s*잔액/i.test(paymentMethod)
        const kind: PaymentKind = /충전|추가|입금|top.?up|credit/i.test(kindText) || (isCardOrFundingMethod && /청구 보고서|Meta 광고 결제|invoice summary/i.test(reportContext)) ? '충전' : /선불\s*잔액|광고|사용|청구|spend|charge/i.test(kindText) || /청구 보고서|Meta 광고 결제|invoice summary/i.test(reportContext) ? '사용' : '기타'
        return { id: `meta-payment-${Date.now()}-${rowIndex}`, date: paymentDate(dateValue), transactionId: transactionId || '-', amount, paymentMethod: paymentMethod || '-', status: statusIndex >= 0 ? String(row[statusIndex] ?? '').trim() : '-', invoiceId: invoiceIndex >= 0 ? String(row[invoiceIndex] ?? '').trim() : '-', kind }
      }).filter((item): item is PaymentActivity => Boolean(item))
      if (!imported.length) throw new Error('가져올 결제 활동 행이 없습니다.')
      const mergedByTransaction = new Map(payments.map(payment => [`${payment.transactionId}-${payment.date}`, payment]))
      imported.forEach(payment => mergedByTransaction.set(`${payment.transactionId}-${payment.date}`, payment))
      const merged = [...mergedByTransaction.values()].sort((a, b) => b.date.localeCompare(a.date))
      setPayments(merged)
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(merged))
      const importedAt = new Date().toISOString()
      setLastPaymentImport(importedAt)
      localStorage.setItem(PAYMENTS_IMPORTED_AT_KEY, importedAt)
      setMessage(`${imported.length}건을 반영했습니다. 기존 내역과 거래 ID 기준으로 중복을 정리했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '결제 활동 파일을 읽지 못했습니다.')
    } finally { setReporting(false) }
  }

  const downloadReport = async () => {
    setReporting(true)
    setMessage('전체 기간 보고서를 만드는 중입니다.')
    try {
      const reportCampaigns = period === 'all' ? campaigns : await (async () => {
        const response = await fetch('/api/meta-ads?period=all')
        const payload = await response.json() as { items?: Campaign[]; error?: string }
        if (!response.ok) throw new Error(payload.error || '전체 기간 데이터를 불러오지 못했습니다.')
        return payload.items || []
      })()
      const reportTotals = reportCampaigns.reduce((sum, campaign) => ({
        spend: sum.spend + campaign.actual,
        impressions: sum.impressions + numberFromMemo(campaign.memo, '노출'),
        clicks: sum.clicks + numberFromMemo(campaign.memo, '클릭'),
        reach: sum.reach + numberFromMemo(campaign.memo, '도달'),
      }), { spend: 0, impressions: 0, clicks: 0, reach: 0 })
      const charged = Number(chargedAmount || 0)
      const workbookModule = await import('exceljs')
      const workbook = new workbookModule.Workbook()
      workbook.creator = 'WHP Sales Planning'
      workbook.created = new Date()
      const summary = workbook.addWorksheet('보고서 요약')
      summary.columns = [{ width: 28 }, { width: 22 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }]
      summary.mergeCells('A1:F1')
      summary.getCell('A1').value = 'Meta 광고 집행 보고서'
      summary.getCell('A2').value = '조회 기준'
      summary.getCell('B2').value = 'Meta 계정 전체 기간'
      summary.getCell('D2').value = '작성일'
      summary.getCell('E2').value = new Date().toLocaleDateString('ko-KR')
      summary.mergeCells('A4:F4')
      summary.getCell('A4').value = '핵심 요약'
      summary.addTable({ name: 'SummaryTable', ref: 'A5', headerRow: true, columns: [{ name: '지표' }, { name: '값' }, { name: '산출 기준' }], rows: [
        ['누적 충전액', charged || '입력 필요', '화면 입력값'],
        ['총 광고 사용액', reportTotals.spend, 'Meta Insights 집행액'],
        ['잔액 추정', charged ? charged - reportTotals.spend : '입력 필요', '충전액 - 집행액'],
        ['사용률', charged ? `${(reportTotals.spend / charged * 100).toFixed(1)}%` : '입력 필요', '집행액 / 충전액'],
        ['집행 캠페인', reportCampaigns.length, '전체 기간 캠페인 수'],
        ['총 노출', reportTotals.impressions, '캠페인 합계'],
        ['총 클릭', reportTotals.clicks, '캠페인 합계'],
        ['전체 CTR', reportTotals.impressions ? `${(reportTotals.clicks / reportTotals.impressions * 100).toFixed(2)}%` : '0.00%', '클릭 / 노출'],
      ] })
      summary.mergeCells('A16:F16')
      summary.getCell('A16').value = '보고서 안내'
      summary.mergeCells('A17:F17')
      summary.getCell('A17').value = '누적 충전액은 Meta Insights 집행액과 별도인 입력 항목입니다.'

      const detail = workbook.addWorksheet('캠페인별 성과')
      detail.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }]
      detail.addTable({ name: 'CampaignTable', ref: 'A1', headerRow: true, columns: [{ name: '캠페인' }, { name: '광고비' }, { name: '노출' }, { name: '클릭' }, { name: '도달' }, { name: 'CTR' }, { name: '조회기간' }], rows: reportCampaigns.map(campaign => {
        const impressions = numberFromMemo(campaign.memo, '노출')
        const clicks = numberFromMemo(campaign.memo, '클릭')
        return [campaign.name, campaign.actual, impressions, clicks, numberFromMemo(campaign.memo, '도달'), impressions ? `${(clicks / impressions * 100).toFixed(2)}%` : '0.00%', '전체 기간']
      }) })
      for (const sheet of [summary, detail]) {
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '243B64' } }
        sheet.views = [{ state: 'frozen', ySplit: 1 }]
      }
      summary.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
      summary.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      summary.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1C7183' } }
      for (const row of [6, 7, 8]) summary.getCell(`B${row}`).numFmt = '#,##0"원"'
      const buffer = await workbook.xlsx.writeBuffer()
      const { saveAs } = await import('file-saver')
      saveAs(new Blob([buffer]), `Meta_광고_집행보고서_${new Date().toISOString().slice(0, 10)}.xlsx`)
      setMessage(`${reportCampaigns.length}개 캠페인 보고서를 다운로드했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '보고서를 만들지 못했습니다.')
    } finally { setReporting(false) }
  }

  return <section className="meta-manager-page">
    <div className="meta-manager-hero">
      <div><p className="eyebrow">META ADS MANAGER</p><h1>Meta 광고 관리자</h1><p>캠페인 성과를 확인하고 결제 활동·집행 보고서를 관리합니다.</p></div>
      <div className="meta-hero-actions"><label className="meta-upload-button"><Upload size={15} /> 결제 활동 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={event => { const file = event.target.files?.[0]; if (file) void importPaymentActivity(file); event.currentTarget.value = '' }} /></label><a href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1436358091097418" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Meta 광고 관리자 열기</a></div>
    </div>

    <div className="meta-manager-toolbar"><div className="meta-toolbar-fields"><label><CalendarDays size={15} /> 조회기간 <select value={period} onChange={event => setPeriod(event.target.value as 'month' | 'all')}><option value="month">월별 조회</option><option value="all">전체 기간</option></select>{period === 'month' && <input type="month" value={month} onChange={event => setMonth(event.target.value)} />}</label><label>누적 충전액 <input type="number" min="0" value={chargedAmount} onChange={event => saveChargedAmount(event.target.value)} placeholder="원" /></label></div><div className="meta-toolbar-actions"><button onClick={() => void loadCampaigns()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> 새로고침</button><button onClick={() => void downloadReport()} disabled={reporting}><Download size={15} /> {reporting ? '보고서 생성 중' : '보고서 다운로드'}</button></div></div>
    {message && <p className="meta-manager-message" role="status">{message}</p>}
    <details className="meta-payment-guide"><summary>Meta 결제 활동 가져오는 방법</summary><ol><li>Meta 광고 관리자에서 왼쪽 메뉴의 <strong>결제 활동</strong>을 엽니다.</li><li><strong>광고 계정</strong>을 선택하고 날짜 범위를 지정합니다.</li><li>오른쪽 위 <strong>다운로드</strong>를 눌러 거래내역 파일을 저장합니다.</li><li>이 화면의 <strong>결제 활동 업로드</strong> 버튼으로 파일을 등록합니다.</li></ol><p>날짜·금액·거래 ID·결제수단·결제상태·VAT 인보이스 ID·거래 유형을 자동 인식합니다. Meta 파일의 열 이름이 달라도 가능한 범위에서 매칭합니다.</p></details>
    <section className="meta-admin-overview"><div className="meta-admin-overview-heading"><div><p className="eyebrow">ADMIN OVERVIEW</p><h2>관리자 한눈 요약</h2><p>결제 CSV와 Meta 광고비 API를 구분해 보여줍니다.</p></div><span>{lastPaymentImport ? `마지막 결제자료 업로드 ${new Date(lastPaymentImport).toLocaleString('ko-KR')}` : '결제자료 업로드 전'}</span></div><div className="meta-admin-overview-grid"><article className="charged"><span>선불 추가·충전</span><strong>{won(effectiveCharged)}</strong><small>결제 활동 CSV 기준</small></article><article className="used"><span>결제 활동 사용</span><strong>{won(paymentTotals.used)}</strong><small>선불 잔액에서 실제 사용</small></article><article className="api"><span>광고비 API 집행</span><strong>{won(totals.spend)}</strong><small>Meta Insights 기준</small></article><article className={Math.abs(paymentApiDifference) > 0 ? 'difference warning' : 'difference'}><span>결제·API 차이</span><strong>{won(Math.abs(paymentApiDifference))}</strong><small>{paymentApiDifference >= 0 ? 'API 집행액이 더 큼' : '결제 활동 사용액이 더 큼'}</small></article><article className="balance"><span>추정 잔액</span><strong>{effectiveCharged ? won(estimatedBalance) : '입력 필요'}</strong><small>충전액 - 결제 활동 사용액</small></article></div><p className="meta-admin-note">결제 활동과 광고비 API는 집계 기준일이 달라 차이가 발생할 수 있습니다. 관리자는 결제 CSV를 충전하거나 결제할 때마다 업로드하면 누적 내역으로 관리됩니다.</p></section>
    <details className="meta-payment-accordion"><summary>결제 활동 원장 <span>{payments.length}건</span><ChevronDown size={16} /></summary><section className="meta-payment-panel"><div className="meta-payment-heading"><div><p className="eyebrow">BILLING ACTIVITY</p><h2>선불·결제 활동 원장</h2><p>{payments.length ? `${payments.length}건의 누적 업로드 내역` : '결제 활동 파일을 업로드하면 충전과 사용 내역이 표시됩니다.'}</p></div><Receipt size={21} /></div><div className="meta-payment-summary"><article><span><WalletCards size={14} /> 선불 추가·충전</span><strong>{won(paymentTotals.charged)}</strong></article><article><span><Receipt size={14} /> 결제 활동 사용</span><strong>{won(paymentTotals.used)}</strong></article><article><span>광고비 API 집행</span><strong>{won(totals.spend)}</strong></article><article><span>추정 잔액</span><strong>{effectiveCharged ? won(estimatedBalance) : '입력 필요'}</strong></article></div>{payments.length > 0 && <div className="meta-payment-table-wrap"><table><thead><tr><th>날짜</th><th>구분</th><th>거래 ID</th><th>금액</th><th>결제수단</th><th>상태</th><th>VAT 인보이스 ID</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td>{payment.date}</td><td><span className={`meta-payment-kind ${payment.kind}`}>{payment.kind}</span></td><td>{payment.transactionId}</td><td>{won(payment.amount)}</td><td>{payment.paymentMethod}</td><td>{payment.status}</td><td>{payment.invoiceId}</td></tr>)}</tbody></table></div>}</section></details>

    <div className="meta-manager-summary"><article><span>전체 캠페인</span><strong>{campaigns.length}개</strong><small>선택 {selectedCampaigns.length}개</small></article><article><span>광고비</span><strong>{won(totals.spend)}</strong></article><article><span>노출</span><strong>{totals.impressions.toLocaleString('ko-KR')}</strong></article><article><span>클릭</span><strong>{totals.clicks.toLocaleString('ko-KR')}</strong><small>CTR {totals.impressions ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0.00'}%</small></article></div>

    <section className="meta-dashboard-panel">
      <div className="meta-dashboard-heading"><div><p className="eyebrow">PERFORMANCE DASHBOARD</p><h2>선택 데이터 성과 대시보드</h2><p>지표와 캠페인을 선택하면 그래프와 하단 목록이 함께 바뀝니다.</p></div><label>그래프 지표<select value={metric} onChange={event => setMetric(event.target.value as MetricKey)}>{Object.entries(metricLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <details className="meta-campaign-picker"><summary><span>캠페인 선택</span><strong>{selectedCampaigns.length}개 선택</strong><ChevronDown size={16} /></summary><div className="meta-picker-actions"><button type="button" onClick={() => setSelectedCampaignIds(campaigns.map(campaign => campaign.id))}>전체 선택</button><button type="button" onClick={() => setSelectedCampaignIds([])}>전체 해제</button></div><div className="meta-picker-list">{campaigns.map(campaign => <label key={campaign.id}><input type="checkbox" checked={selectedCampaignIds.includes(campaign.id)} onChange={() => toggleCampaign(campaign.id)} /><span>{campaign.name}</span></label>)}</div></details>
      <div className="meta-chart-grid"><article className="meta-chart-card"><div className="meta-chart-card-heading"><h3>{metricLabels[metric]} 기준 캠페인 비교</h3><span>{selectedCampaigns.length}개 캠페인</span></div><div className="meta-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e9eef5" /><XAxis type="number" tick={{ fontSize: 11, fill: '#8995a6' }} tickFormatter={value => metric === 'spend' ? `${Math.round(value / 10000)}만` : metric === 'ctr' ? `${value.toFixed(1)}%` : value.toLocaleString('ko-KR')} /><YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11, fill: '#526071' }} /><Tooltip formatter={(value) => { const numeric = Number(value || 0); return metric === 'spend' ? won(numeric) : metric === 'ctr' ? `${numeric.toFixed(2)}%` : numeric.toLocaleString('ko-KR') }} /><Bar dataKey="value" fill="#315ca8" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div></article><article className="meta-chart-card meta-share-card"><div className="meta-chart-card-heading"><h3>캠페인별 광고비 비중</h3><span>상위 8개</span></div><div className="meta-chart meta-pie-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={spendShareData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={92} innerRadius={52} paddingAngle={2}>{spendShareData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => won(Number(value || 0))} /></PieChart></ResponsiveContainer></div><div className="meta-legend">{spendShareData.map((entry, index) => <span key={entry.name}><i style={{ background: chartColors[index % chartColors.length] }} />{entry.name}</span>)}</div></article></div>
    <section className="meta-compare-panel"><div className="meta-chart-card-heading"><h3>선택 캠페인 2개 비교</h3><span>{comparisonCampaigns.length === 2 ? '비교 가능' : '캠페인 2개를 선택하세요'}</span></div><div className="meta-compare-controls"><div><span>비교 캠페인 1</span><select value={compareIds[0] || ''} onChange={event => setCompareIds(current => [event.target.value, current[1] === event.target.value ? campaigns.find(campaign => campaign.id !== event.target.value)?.id || '' : current[1] || campaigns.find(campaign => campaign.id !== event.target.value)?.id || ''])}><option value="">선택 안 함</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></div><div><span>비교 캠페인 2</span><select value={compareIds[1] || ''} onChange={event => setCompareIds(current => [current[0] === event.target.value ? campaigns.find(campaign => campaign.id !== event.target.value)?.id || '' : current[0] || campaigns.find(campaign => campaign.id !== event.target.value)?.id || '', event.target.value])}><option value="">선택 안 함</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></div></div>{comparisonCampaigns.length === 2 ? <div className="meta-compare-grid"><div className="meta-compare-head"><strong>지표</strong><strong>{comparisonCampaigns[0].name}</strong><strong>{comparisonCampaigns[1].name}</strong><strong>차이</strong><strong>증감률</strong></div>{(['spend', 'impressions', 'clicks', 'reach', 'ctr'] as MetricKey[]).map(key => <div className="meta-compare-row" key={key}><span>{metricLabels[key]}</span><strong>{displayMetric(comparisonCampaigns[0], key)}</strong><strong>{displayMetric(comparisonCampaigns[1], key)}</strong><strong className={displayDifference(comparisonCampaigns[0], comparisonCampaigns[1], key).startsWith('+') ? 'positive' : 'negative'}>{displayDifference(comparisonCampaigns[0], comparisonCampaigns[1], key)}</strong><strong className={displayChangeRate(comparisonCampaigns[0], comparisonCampaigns[1], key).startsWith('-') ? 'negative' : 'positive'}>{displayChangeRate(comparisonCampaigns[0], comparisonCampaigns[1], key)}</strong></div>)}</div> : <p className="meta-compare-empty">위에서 비교할 캠페인 2개를 선택하면 광고비·노출·클릭·도달·CTR과 차이·증감률을 나란히 보여줍니다.</p>}</section>
    </section>

    <section className="meta-panel campaign-panel"><div className="meta-panel-heading"><div><p className="eyebrow">CAMPAIGN PERFORMANCE</p><h2>캠페인별 전문가 상세</h2><p>캠페인을 하나 선택하면 Meta 관리자 분석에 필요한 세부 데이터를 아코디언으로 확인할 수 있습니다.</p></div><BarChart3 size={20} /></div><div className="meta-single-campaign-select"><label>캠페인 선택<select value={detailCampaign?.id || ''} onChange={event => setDetailCampaignId(event.target.value)}><option value="">캠페인을 선택하세요</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label></div>{detailCampaign ? <CampaignDetailAccordion campaign={detailCampaign} /> : <p className="meta-empty">선택한 기간의 캠페인이 없습니다.</p>}</section>
  </section>
}
