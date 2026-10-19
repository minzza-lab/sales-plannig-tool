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
  frequency?: string
  cpm?: string
  cpp?: string
  ctr?: string
  cpc?: string
  cost_per_inline_link_click?: string
  cost_per_conversion?: { action_type?: string; value?: string }[]
  inline_link_clicks?: string
  inline_link_click_ctr?: string
  outbound_clicks_ctr?: { action_type?: string; value?: string }[]
  unique_inline_link_clicks?: string
  unique_outbound_clicks?: string
  website_ctr?: { action_type?: string; value?: string }[]
  social_spend?: string
  outbound_clicks?: { action_type?: string; value?: string }[]
  unique_clicks?: string
  unique_ctr?: string
  video_play_actions?: { action_type?: string; value?: string }[]
  video_p25_watched_actions?: { action_type?: string; value?: string }[]
  video_p50_watched_actions?: { action_type?: string; value?: string }[]
  video_p75_watched_actions?: { action_type?: string; value?: string }[]
  video_p95_watched_actions?: { action_type?: string; value?: string }[]
  video_p100_watched_actions?: { action_type?: string; value?: string }[]
  video_thruplay_watched_actions?: { action_type?: string; value?: string }[]
  video_15_sec_watched_actions?: { action_type?: string; value?: string }[]
  video_30_sec_watched_actions?: { action_type?: string; value?: string }[]
  video_avg_time_watched_actions?: { action_type?: string; value?: string }[]
  actions?: { action_type?: string; value?: string }[]
  action_values?: { action_type?: string; value?: string }[]
  cost_per_action_type?: { action_type?: string; value?: string }[]
  conversions?: { action_type?: string; value?: string }[]
  conversion_values?: { action_type?: string; value?: string }[]
  purchase_roas?: { action_type?: string; value?: string }[]
  website_purchase_roas?: { action_type?: string; value?: string }[]
  date_start?: string
  date_stop?: string
}

type MetaAdSet = {
  id?: string
  campaign_id?: string
  name?: string
  status?: string
  effective_status?: string
  daily_budget?: string
  lifetime_budget?: string
  optimization_goal?: string
  billing_event?: string
  start_time?: string
  end_time?: string
  targeting?: {
    age_min?: number
    age_max?: number
    genders?: number[]
    geo_locations?: { countries?: string[]; regions?: { name?: string }[]; cities?: { name?: string }[] }
    interests?: { name?: string }[]
    flexible_spec?: { interests?: { name?: string }[] }[]
    excluded_custom_audiences?: { name?: string }[]
    custom_audiences?: { name?: string }[]
    publisher_platforms?: string[]
    facebook_positions?: string[]
    instagram_positions?: string[]
    device_platforms?: string[]
  }
}

type MetaCampaign = {
  id?: string
  name?: string
  status?: string
  effective_status?: string
  objective?: string
  buying_type?: string
  daily_budget?: string
  lifetime_budget?: string
  start_time?: string
  stop_time?: string
  created_time?: string
  updated_time?: string
}

const join = (values: unknown[] | undefined) => (values || []).filter(Boolean).join(', ')
const actionValue = (actions: { action_type?: string; value?: string }[] | undefined, names: string[]) => {
  const match = (actions || []).find(action => names.includes(action.action_type || ''))
  return match?.value || '0'
}
const numericActionValue = (actions: { action_type?: string; value?: string }[] | undefined, names: string[]) => Number(actionValue(actions, names)) || 0
const summarizeTargeting = (targeting: MetaAdSet['targeting']) => {
  if (!targeting) return ''
  const parts: string[] = []
  if (targeting.age_min || targeting.age_max) parts.push(`연령 ${targeting.age_min || 13}-${targeting.age_max || 65}`)
  if (targeting.genders?.length) parts.push(`성별 ${targeting.genders.map(gender => gender === 1 ? '남성' : gender === 2 ? '여성' : '전체').join('/')}`)
  const locations = [
    ...(targeting.geo_locations?.countries || []),
    ...(targeting.geo_locations?.regions || []).map(region => region.name),
    ...(targeting.geo_locations?.cities || []).map(city => city.name),
  ].filter(Boolean)
  if (locations.length) parts.push(`지역 ${join(locations)}`)
  const interests = [
    ...(targeting.interests || []).map(interest => interest.name),
    ...(targeting.flexible_spec || []).flatMap(spec => (spec.interests || []).map(interest => interest.name)),
  ].filter(Boolean)
  if (interests.length) parts.push(`관심사 ${join(interests)}`)
  if (targeting.custom_audiences?.length) parts.push(`맞춤 ${join(targeting.custom_audiences.map(audience => audience.name))}`)
  if (targeting.excluded_custom_audiences?.length) parts.push(`제외 맞춤 ${join(targeting.excluded_custom_audiences.map(audience => audience.name))}`)
  if (targeting.publisher_platforms?.length) parts.push(`플랫폼 ${join(targeting.publisher_platforms)}`)
  if (targeting.facebook_positions?.length || targeting.instagram_positions?.length) parts.push(`게재위치 ${join([...(targeting.facebook_positions || []), ...(targeting.instagram_positions || [])])}`)
  if (targeting.device_platforms?.length) parts.push(`기기 ${join(targeting.device_platforms)}`)
  return parts.join(' · ')
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const baseInsightFields = 'campaign_id,campaign_name,spend,impressions,clicks,reach,date_start,date_stop'
const optionalInsightFieldGroups = [
  'frequency,cpm,cpp,ctr,cpc,cost_per_inline_link_click,inline_link_clicks,unique_clicks,unique_ctr',
  'outbound_clicks,outbound_clicks_ctr,inline_link_click_ctr,unique_inline_link_clicks,unique_outbound_clicks,website_ctr,social_spend',
  'actions,action_values,cost_per_action_type,conversions,conversion_values,purchase_roas,website_purchase_roas',
  'video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions',
  'video_thruplay_watched_actions,video_15_sec_watched_actions,video_30_sec_watched_actions,video_avg_time_watched_actions',
]

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
  const buildInsightsEndpoint = (fields: string) => {
    const endpoint = new URL(`https://graph.facebook.com/${version}/${accountId}/insights`)
    endpoint.searchParams.set('access_token', token)
    endpoint.searchParams.set('level', 'campaign')
    endpoint.searchParams.set('fields', fields)
    if (period === 'all') endpoint.searchParams.set('date_preset', 'maximum')
    else endpoint.searchParams.set('time_range', JSON.stringify({ since, until }))
    endpoint.searchParams.set('limit', '500')
    return endpoint
  }

  const adSetsEndpoint = new URL(`https://graph.facebook.com/${version}/${accountId}/adsets`)
  adSetsEndpoint.searchParams.set('access_token', token)
  adSetsEndpoint.searchParams.set('fields', 'id,campaign_id,name,status,effective_status,targeting,daily_budget,lifetime_budget,optimization_goal,billing_event,start_time,end_time')
  adSetsEndpoint.searchParams.set('limit', '500')

  const campaignsEndpoint = new URL(`https://graph.facebook.com/${version}/${accountId}/campaigns`)
  campaignsEndpoint.searchParams.set('access_token', token)
  campaignsEndpoint.searchParams.set('fields', 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time')
  campaignsEndpoint.searchParams.set('limit', '500')

  const fetchInsights = async (fields: string) => {
    const response = await fetch(buildInsightsEndpoint(fields))
    const payload = await response.json() as { data?: MetaInsight[]; error?: { message?: string; code?: number } }
    return { response, payload }
  }

  const [baseInsights, ...optionalInsights] = await Promise.all([
    fetchInsights(baseInsightFields),
    ...optionalInsightFieldGroups.map(group => fetchInsights(`${baseInsightFields},${group}`)),
  ])
  const [adSetsResponse, campaignsResponse] = await Promise.all([fetch(adSetsEndpoint), fetch(campaignsEndpoint)])
  const { response, payload } = baseInsights
  const adSetsPayload = await adSetsResponse.json() as { data?: MetaAdSet[] }
  const campaignsPayload = await campaignsResponse.json() as { data?: MetaCampaign[] }
  if (!response.ok || payload.error) {
    return json({ error: payload.error?.message || 'Meta API request failed.', code: payload.error?.code }, response.status >= 400 ? response.status : 502)
  }

  const mergedInsights = new Map<string, MetaInsight>()
  const mergeInsightRows = (rows: MetaInsight[] | undefined) => {
    for (const row of rows || []) {
      const key = row.campaign_id || row.campaign_name || `unknown-${mergedInsights.size}`
      mergedInsights.set(key, { ...(mergedInsights.get(key) || {}), ...row })
    }
  }
  mergeInsightRows(payload.data)
  optionalInsights.forEach(({ response: optionalResponse, payload: optionalPayload }) => {
    if (optionalResponse.ok && !optionalPayload.error) mergeInsightRows(optionalPayload.data)
  })
  const insightRows = [...mergedInsights.values()]

  const targetingsByCampaign = new Map<string, string>()
  const adSetsByCampaign = new Map<string, MetaAdSet[]>()
  for (const adSet of adSetsPayload.data || []) {
    if (!adSet.campaign_id) continue
    const current = adSetsByCampaign.get(adSet.campaign_id) || []
    adSetsByCampaign.set(adSet.campaign_id, [...current, adSet])
    if (targetingsByCampaign.has(adSet.campaign_id)) continue
    const targeting = summarizeTargeting(adSet.targeting)
    if (targeting) targetingsByCampaign.set(adSet.campaign_id, targeting)
  }
  const campaignDetails = new Map((campaignsPayload.data || []).map(campaign => [campaign.id || '', campaign]))

  const items = insightRows.map((row) => ({
    id: `meta-api-${row.campaign_id || row.campaign_name || 'unknown'}-${period === 'all' ? 'all' : month}`,
    channel: 'meta' as const,
    date: since || '전체 기간',
    name: row.campaign_name || row.campaign_id || '이름 없는 캠페인',
    budget: 0,
    actual: Number(row.spend || 0),
    status: '완료' as const,
    targeting: targetingsByCampaign.get(row.campaign_id || '') || '',
    details: {
      campaignId: row.campaign_id || '',
      period: { start: row.date_start || since || '', end: row.date_stop || until || '' },
      metadata: campaignDetails.get(row.campaign_id || '') || {},
      adSets: (adSetsByCampaign.get(row.campaign_id || '') || []).map(adSet => ({
        id: adSet.id || '', name: adSet.name || '', status: adSet.status || '', effectiveStatus: adSet.effective_status || '',
        dailyBudget: Number(adSet.daily_budget || 0), lifetimeBudget: Number(adSet.lifetime_budget || 0), optimizationGoal: adSet.optimization_goal || '', billingEvent: adSet.billing_event || '',
        startTime: adSet.start_time || '', endTime: adSet.end_time || '', targeting: summarizeTargeting(adSet.targeting),
      })),
      metrics: {
        frequency: Number(row.frequency || 0), cpm: Number(row.cpm || 0), cpp: Number(row.cpp || 0), ctr: Number(row.ctr || 0), cpc: Number(row.cpc || 0), costPerInlineLinkClick: Number(row.cost_per_inline_link_click || 0),
        inlineLinkClicks: Number(row.inline_link_clicks || 0), inlineLinkCtr: Number(row.inline_link_click_ctr || 0), outboundClicks: numericActionValue(row.outbound_clicks, ['outbound_clicks']), outboundCtr: numericActionValue(row.outbound_clicks_ctr, ['outbound_clicks']), uniqueClicks: Number(row.unique_clicks || 0), uniqueCtr: Number(row.unique_ctr || 0), uniqueInlineLinkClicks: Number(row.unique_inline_link_clicks || 0), uniqueOutboundClicks: Number(row.unique_outbound_clicks || 0), socialSpend: Number(row.social_spend || 0),
        videoPlays: numericActionValue(row.video_play_actions, ['video_view', 'video_play']), video25: numericActionValue(row.video_p25_watched_actions, ['video_view']), video50: numericActionValue(row.video_p50_watched_actions, ['video_view']), video75: numericActionValue(row.video_p75_watched_actions, ['video_view']), video95: numericActionValue(row.video_p95_watched_actions, ['video_view']), video100: numericActionValue(row.video_p100_watched_actions, ['video_view']), thruplays: numericActionValue(row.video_thruplay_watched_actions, ['video_view']), video15: numericActionValue(row.video_15_sec_watched_actions, ['video_view']), video30: numericActionValue(row.video_30_sec_watched_actions, ['video_view']), avgVideoSeconds: numericActionValue(row.video_avg_time_watched_actions, ['video_view']),
      },
      actions: row.actions || [], actionValues: row.action_values || [], costPerAction: row.cost_per_action_type || [], conversions: row.conversions || [], conversionValues: row.conversion_values || [], purchaseRoas: row.purchase_roas || [], websitePurchaseRoas: row.website_purchase_roas || [],
    },
    memo: `노출 ${Number(row.impressions || 0).toLocaleString('ko-KR')} · 클릭 ${Number(row.clicks || 0).toLocaleString('ko-KR')} · 도달 ${Number(row.reach || 0).toLocaleString('ko-KR')}${targetingsByCampaign.get(row.campaign_id || '') ? ` · 타겟 ${targetingsByCampaign.get(row.campaign_id || '')}` : ''}`,
  }))

  const hasUnavailableOptionalFields = optionalInsights.some(({ response: optionalResponse, payload: optionalPayload }) => !optionalResponse.ok || Boolean(optionalPayload.error))
  return json({
    period,
    month: month || null,
    since,
    until,
    items,
    warnings: hasUnavailableOptionalFields ? ['일부 상세 지표는 Meta 계정 또는 API 버전에서 제공되지 않아 제외되었습니다.'] : [],
  })
}
