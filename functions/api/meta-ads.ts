interface Env {
  META_ACCESS_TOKEN?: string
  META_AD_ACCOUNT_ID?: string
  META_GRAPH_API_VERSION?: string
}

type MetaInsight = {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  reach?: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = env.META_ACCESS_TOKEN
  if (!token) return json({ error: 'Meta API secret is not configured.' }, 503)

  const url = new URL(request.url)
  const period = url.searchParams.get('period') || 'month'
  const month = url.searchParams.get('month')
  if (period !== 'all' && (!month || !/^\d{4}-\d{2}$/.test(month))) return json({ error: 'month must be YYYY-MM.' }, 400)

  const [year, monthNumber] = month ? month.split('-').map(Number) : [0, 0]
  const since = period === 'all' ? null : `${month}-01`
  const until = period === 'all' ? null : new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
  const accountId = env.META_AD_ACCOUNT_ID || 'act_1436358091097418'
  const version = env.META_GRAPH_API_VERSION || 'v23.0'
  const endpoint = new URL(`https://graph.facebook.com/${version}/${accountId}/insights`)
  endpoint.searchParams.set('access_token', token)
  endpoint.searchParams.set('level', 'campaign')
  endpoint.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,clicks,reach')
  if (period === 'all') endpoint.searchParams.set('date_preset', 'maximum')
  else endpoint.searchParams.set('time_range', JSON.stringify({ since, until }))
  endpoint.searchParams.set('limit', '500')

  const response = await fetch(endpoint)
  const payload = await response.json() as { data?: MetaInsight[]; error?: { message?: string; code?: number } }
  if (!response.ok || payload.error) {
    return json({ error: payload.error?.message || 'Meta API request failed.', code: payload.error?.code }, response.status >= 400 ? response.status : 502)
  }

  const items = (payload.data || []).map((row) => ({
    id: `meta-api-${row.campaign_id || row.campaign_name || 'unknown'}-${period === 'all' ? 'all' : month}`,
    channel: 'meta' as const,
    date: since || '전체 기간',
    name: row.campaign_name || row.campaign_id || '이름 없는 캠페인',
    budget: 0,
    actual: Number(row.spend || 0),
    status: '완료' as const,
    memo: `노출 ${Number(row.impressions || 0).toLocaleString('ko-KR')} · 클릭 ${Number(row.clicks || 0).toLocaleString('ko-KR')} · 도달 ${Number(row.reach || 0).toLocaleString('ko-KR')}`,
  }))

  return json({ period, month: month || null, since, until, items })
}
