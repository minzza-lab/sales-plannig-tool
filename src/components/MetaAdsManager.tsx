import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, ExternalLink, FilePlus2, RefreshCw, Save } from 'lucide-react'
import './MetaAdsManager.css'

type Campaign = {
  id: string
  channel: 'meta'
  date: string
  name: string
  actual: number
  memo: string
}

type Draft = {
  name: string
  objective: string
  dailyBudget: string
  headline: string
  primaryText: string
  link: string
}

const DRAFT_KEY = 'sales-planning-meta-ad-draft-v1'
const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date())
const emptyDraft: Draft = { name: '', objective: 'OUTCOME_TRAFFIC', dailyBudget: '', headline: '', primaryText: '', link: '' }

const numberFromMemo = (memo: string, label: string) => Number(memo.match(new RegExp(`${label} ([\\d,]+)`))?.[1]?.replaceAll(',', '') || 0)
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`

export default function MetaAdsManager() {
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const [month, setMonth] = useState(currentMonth)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState<Draft>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || emptyDraft } catch { return emptyDraft }
  })

  const loadCampaigns = async () => {
    setLoading(true)
    setMessage('Meta 캠페인 성과를 불러오는 중입니다.')
    try {
      const query = period === 'all' ? 'period=all' : `month=${encodeURIComponent(month)}`
      const response = await fetch(`/api/meta-ads?${query}`)
      const payload = await response.json() as { items?: Campaign[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Meta 데이터를 불러오지 못했습니다.')
      setCampaigns(payload.items || [])
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

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    setMessage('광고 제작 초안을 이 브라우저에 저장했습니다. 실제 게시 전 Meta 검토가 필요합니다.')
  }

  return <section className="meta-manager-page">
    <div className="meta-manager-hero">
      <div><p className="eyebrow">META ADS MANAGER</p><h1>Meta 광고 관리자</h1><p>캠페인 성과를 확인하고 다음 광고 제작 초안을 준비합니다.</p></div>
      <a href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1436358091097418" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Meta 광고 관리자 열기</a>
    </div>

    <div className="meta-manager-toolbar"><label><CalendarDays size={15} /> 조회기간 <select value={period} onChange={event => setPeriod(event.target.value as 'month' | 'all')}><option value="month">월별 조회</option><option value="all">전체 기간</option></select>{period === 'month' && <input type="month" value={month} onChange={event => setMonth(event.target.value)} />}</label><button onClick={() => void loadCampaigns()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> 새로고침</button></div>
    {message && <p className="meta-manager-message" role="status">{message}</p>}

    <div className="meta-manager-summary"><article><span>캠페인</span><strong>{campaigns.length}개</strong></article><article><span>광고비</span><strong>{won(totals.spend)}</strong></article><article><span>노출</span><strong>{totals.impressions.toLocaleString('ko-KR')}</strong></article><article><span>클릭</span><strong>{totals.clicks.toLocaleString('ko-KR')}</strong><small>CTR {totals.impressions ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0.00'}%</small></article></div>

    <div className="meta-manager-grid">
      <article className="meta-panel campaign-panel"><div className="meta-panel-heading"><div><p className="eyebrow">CAMPAIGN PERFORMANCE</p><h2>캠페인 성과</h2></div><BarChart3 size={20} /></div><div className="meta-table-wrap"><table><thead><tr><th>캠페인</th><th>광고비</th><th>노출</th><th>클릭</th><th>도달</th><th>CTR</th></tr></thead><tbody>{campaigns.length === 0 ? <tr><td colSpan={6} className="meta-empty">선택한 월의 캠페인이 없습니다.</td></tr> : campaigns.map(campaign => { const impressions = numberFromMemo(campaign.memo, '노출'); const clicks = numberFromMemo(campaign.memo, '클릭'); return <tr key={campaign.id}><td>{campaign.name}</td><td>{won(campaign.actual)}</td><td>{impressions.toLocaleString('ko-KR')}</td><td>{clicks.toLocaleString('ko-KR')}</td><td>{numberFromMemo(campaign.memo, '도달').toLocaleString('ko-KR')}</td><td>{impressions ? `${(clicks / impressions * 100).toFixed(2)}%` : '0.00%'}</td></tr> })}</tbody></table></div></article>

      <article className="meta-panel draft-panel"><div className="meta-panel-heading"><div><p className="eyebrow">AD DRAFT</p><h2>광고 제작 초안</h2></div><FilePlus2 size={20} /></div><p className="draft-note">초안을 저장한 뒤 실제 게시 전에 타겟·소재·예산을 확인합니다.</p><label>캠페인 이름<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="예: 겨울 시즌패스 전환 광고" /></label><label>목표<select value={draft.objective} onChange={event => setDraft({ ...draft, objective: event.target.value })}><option value="OUTCOME_TRAFFIC">웹사이트 방문</option><option value="OUTCOME_SALES">판매/전환</option><option value="OUTCOME_AWARENESS">인지도</option><option value="OUTCOME_ENGAGEMENT">참여</option></select></label><label>일일 예산<input type="number" min="0" value={draft.dailyBudget} onChange={event => setDraft({ ...draft, dailyBudget: event.target.value })} placeholder="원" /></label><label>광고 제목<input value={draft.headline} onChange={event => setDraft({ ...draft, headline: event.target.value })} placeholder="짧은 광고 제목" /></label><label>본문<textarea value={draft.primaryText} onChange={event => setDraft({ ...draft, primaryText: event.target.value })} placeholder="광고 본문을 입력하세요." rows={3} /></label><label>랜딩 URL<input type="url" value={draft.link} onChange={event => setDraft({ ...draft, link: event.target.value })} placeholder="https://" /></label><button className="draft-save" onClick={saveDraft}><Save size={15} /> 초안 저장</button></article>
    </div>
  </section>
}
