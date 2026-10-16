import { Fragment, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, ChevronDown, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './MetaAdsManager.css'

type Campaign = {
  id: string
  channel: 'meta'
  date: string
  name: string
  actual: number
  memo: string
  targeting?: string
}

type MetricKey = 'spend' | 'impressions' | 'clicks' | 'reach' | 'ctr'

const CHARGED_KEY = 'sales-planning-meta-charged-v1'
const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date())

const numberFromMemo = (memo: string, label: string) => Number(memo.match(new RegExp(`${label} ([\\d,]+)`))?.[1]?.replaceAll(',', '') || 0)
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const metricLabels: Record<MetricKey, string> = { spend: '광고비', impressions: '노출', clicks: '클릭', reach: '도달', ctr: 'CTR' }
const campaignMetrics = (campaign: Campaign) => {
  const impressions = numberFromMemo(campaign.memo, '노출')
  const clicks = numberFromMemo(campaign.memo, '클릭')
  return { spend: campaign.actual, impressions, clicks, reach: numberFromMemo(campaign.memo, '도달'), ctr: impressions ? clicks / impressions * 100 : 0 }
}
const chartColors = ['#315ca8', '#1c7183', '#db8b3e', '#7e67b8', '#4f8d68', '#c65b5b', '#566b86', '#a8753b']

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
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)

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
      setExpandedCampaignId(null)
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
      <div><p className="eyebrow">META ADS MANAGER</p><h1>Meta 광고 관리자</h1><p>캠페인 성과를 확인하고 집행 보고서를 내려받습니다.</p></div>
      <a href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1436358091097418" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Meta 광고 관리자 열기</a>
    </div>

    <div className="meta-manager-toolbar"><div className="meta-toolbar-fields"><label><CalendarDays size={15} /> 조회기간 <select value={period} onChange={event => setPeriod(event.target.value as 'month' | 'all')}><option value="month">월별 조회</option><option value="all">전체 기간</option></select>{period === 'month' && <input type="month" value={month} onChange={event => setMonth(event.target.value)} />}</label><label>누적 충전액 <input type="number" min="0" value={chargedAmount} onChange={event => saveChargedAmount(event.target.value)} placeholder="원" /></label></div><div className="meta-toolbar-actions"><button onClick={() => void loadCampaigns()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> 새로고침</button><button onClick={() => void downloadReport()} disabled={reporting}><Download size={15} /> {reporting ? '보고서 생성 중' : '보고서 다운로드'}</button></div></div>
    {message && <p className="meta-manager-message" role="status">{message}</p>}

    <div className="meta-manager-summary"><article><span>전체 캠페인</span><strong>{campaigns.length}개</strong><small>선택 {selectedCampaigns.length}개</small></article><article><span>광고비</span><strong>{won(totals.spend)}</strong></article><article><span>노출</span><strong>{totals.impressions.toLocaleString('ko-KR')}</strong></article><article><span>클릭</span><strong>{totals.clicks.toLocaleString('ko-KR')}</strong><small>CTR {totals.impressions ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0.00'}%</small></article></div>

    <section className="meta-dashboard-panel">
      <div className="meta-dashboard-heading"><div><p className="eyebrow">PERFORMANCE DASHBOARD</p><h2>선택 데이터 성과 대시보드</h2><p>지표와 캠페인을 선택하면 그래프와 하단 목록이 함께 바뀝니다.</p></div><label>그래프 지표<select value={metric} onChange={event => setMetric(event.target.value as MetricKey)}>{Object.entries(metricLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <details className="meta-campaign-picker"><summary><span>캠페인 선택</span><strong>{selectedCampaigns.length}개 선택</strong><ChevronDown size={16} /></summary><div className="meta-picker-actions"><button type="button" onClick={() => setSelectedCampaignIds(campaigns.map(campaign => campaign.id))}>전체 선택</button><button type="button" onClick={() => setSelectedCampaignIds([])}>전체 해제</button></div><div className="meta-picker-list">{campaigns.map(campaign => <label key={campaign.id}><input type="checkbox" checked={selectedCampaignIds.includes(campaign.id)} onChange={() => toggleCampaign(campaign.id)} /><span>{campaign.name}</span></label>)}</div></details>
      <div className="meta-chart-grid"><article className="meta-chart-card"><div className="meta-chart-card-heading"><h3>{metricLabels[metric]} 기준 캠페인 비교</h3><span>{selectedCampaigns.length}개 캠페인</span></div><div className="meta-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e9eef5" /><XAxis type="number" tick={{ fontSize: 11, fill: '#8995a6' }} tickFormatter={value => metric === 'spend' ? `${Math.round(value / 10000)}만` : metric === 'ctr' ? `${value.toFixed(1)}%` : value.toLocaleString('ko-KR')} /><YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11, fill: '#526071' }} /><Tooltip formatter={(value) => { const numeric = Number(value || 0); return metric === 'spend' ? won(numeric) : metric === 'ctr' ? `${numeric.toFixed(2)}%` : numeric.toLocaleString('ko-KR') }} /><Bar dataKey="value" fill="#315ca8" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div></article><article className="meta-chart-card meta-share-card"><div className="meta-chart-card-heading"><h3>캠페인별 광고비 비중</h3><span>상위 8개</span></div><div className="meta-chart meta-pie-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={spendShareData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={92} innerRadius={52} paddingAngle={2}>{spendShareData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => won(Number(value || 0))} /></PieChart></ResponsiveContainer></div><div className="meta-legend">{spendShareData.map((entry, index) => <span key={entry.name}><i style={{ background: chartColors[index % chartColors.length] }} />{entry.name}</span>)}</div></article></div>
    </section>

    <section className="meta-panel campaign-panel"><div className="meta-panel-heading"><div><p className="eyebrow">CAMPAIGN PERFORMANCE</p><h2>캠페인별 보기</h2></div><BarChart3 size={20} /></div><div className="meta-table-wrap"><table><thead><tr><th>캠페인</th><th>광고비</th><th>노출</th><th>클릭</th><th>도달</th><th>CTR</th><th>상세 타겟</th><th>상세</th></tr></thead><tbody>{campaigns.length === 0 ? <tr><td colSpan={8} className="meta-empty">선택한 기간의 캠페인이 없습니다.</td></tr> : campaigns.map(campaign => { const values = campaignMetrics(campaign); const expanded = expandedCampaignId === campaign.id; return <Fragment key={campaign.id}><tr><td>{campaign.name}</td><td>{won(values.spend)}</td><td>{values.impressions.toLocaleString('ko-KR')}</td><td>{values.clicks.toLocaleString('ko-KR')}</td><td>{values.reach.toLocaleString('ko-KR')}</td><td>{values.ctr.toFixed(2)}%</td><td className="meta-targeting-cell">{campaign.targeting || '확인되지 않음'}</td><td><button className="meta-detail-button" type="button" aria-expanded={expanded} onClick={() => setExpandedCampaignId(expanded ? null : campaign.id)}>{expanded ? '접기' : '상세보기'}</button></td></tr>{expanded && <tr className="meta-detail-row"><td colSpan={8}><div className="meta-detail-grid"><div><span>캠페인명</span><strong>{campaign.name}</strong></div><div><span>광고비</span><strong>{won(values.spend)}</strong></div><div><span>노출</span><strong>{values.impressions.toLocaleString('ko-KR')}</strong></div><div><span>클릭</span><strong>{values.clicks.toLocaleString('ko-KR')}</strong></div><div><span>도달</span><strong>{values.reach.toLocaleString('ko-KR')}</strong></div><div><span>CTR</span><strong>{values.ctr.toFixed(2)}%</strong></div><div className="meta-detail-wide"><span>상세 타겟</span><strong>{campaign.targeting || 'Meta API에서 타겟 정보를 확인하지 못했습니다.'}</strong></div><div className="meta-detail-wide"><span>성과 메모</span><strong>{campaign.memo}</strong></div></div></td></tr>}</Fragment>})}</tbody></table></div></section>
  </section>
}
