interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface DateInfo {
  dbDate: string;
  apiDate: string;
}

interface PortalRow {
  zone?: string;
  zonecode?: string;
  sub?: string;
  price?: number | string;
  cnt?: number | string;
}

const PORTAL_URL = 'https://wapi.wellihillipark.com/sub2/portal/portal.asp';
const RECENT_DAYS = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getRecentKstDates(daysCount: number): DateInfo[] {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return Array.from({ length: daysCount }, (_, index) => {
    const date = new Date(nowKst.getTime() - index * 24 * 60 * 60 * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return { dbDate: `${year}-${month}-${day}`, apiDate: `${year}${month}${day}` };
  });
}

async function fetchPortalRows(apiDate: string, zonecode = ''): Promise<PortalRow[]> {
  const body = new URLSearchParams({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: zonecode,
    p_sub_code: zonecode ? '1' : '',
  });
  const response = await fetch(PORTAL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });
  if (!response.ok) throw new Error(`매출 시스템 응답 오류: ${response.status}`);
  const result = await response.json() as { datalist?: PortalRow[] };
  return Array.isArray(result.datalist) ? result.datalist : [];
}

async function collectDate(date: DateInfo) {
  const zones = await fetchPortalRows(date.apiDate);
  const chartData = zones.map((zone) => ({
    name: zone.zone || '기타',
    amount: Number(zone.price) || 0,
    quantity: Number(zone.cnt) || 0,
  })).sort((left, right) => right.amount - left.amount);

  const detailGroups = await Promise.all(zones.map(async (zone) => {
    const category = zone.zone || '기타';
    const amount = Number(zone.price) || 0;
    const quantity = Number(zone.cnt) || 0;
    try {
      const details = await fetchPortalRows(date.apiDate, zone.zonecode || '');
      if (details.length === 0) {
        return [{ category, name: `${category} 전체`, quantity, amount }];
      }
      const merged = new Map<string, { category: string; name: string; quantity: number; amount: number }>();
      for (const detail of details) {
        const name = detail.sub || '기타';
        const current = merged.get(name) || { category, name, quantity: 0, amount: 0 };
        current.quantity += Number(detail.cnt) || 0;
        current.amount += Number(detail.price) || 0;
        merged.set(name, current);
      }
      return [...merged.values()];
    } catch {
      return [{ category, name: `${category} 전체`, quantity, amount }];
    }
  }));

  return {
    report_date: date.dbDate,
    report_type: 'REALTIME_SALES',
    data: {
      summary: {
        totalAmount: chartData.reduce((total, row) => total + row.amount, 0),
        totalQty: chartData.reduce((total, row) => total + row.quantity, 0),
        label: '실시간 총 매출(원)',
        qtyLabel: '실시간 총 발권수',
      },
      chart_data: chartData,
      table_data: detailGroups.flat(),
      updated_at: new Date().toISOString(),
      source: 'Cloudflare server sync',
    },
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const authorization = context.request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: '서버의 데이터베이스 연결 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);

    const dates = getRecentKstDates(RECENT_DAYS);
    const settled = await Promise.allSettled(dates.map(collectDate));
    const reports = settled
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof collectDate>>> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failed = settled.length - reports.length;
    if (reports.length === 0) throw new Error('매출 시스템에서 데이터를 가져오지 못했습니다.');

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/daily_reports?on_conflict=report_date,report_type`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(reports),
    });
    if (!saveResponse.ok) {
      const detail = await saveResponse.text();
      throw new Error(`수집 데이터 저장 실패: ${detail.slice(0, 200)}`);
    }

    return jsonResponse({
      status: 'completed',
      progress: 100,
      syncedDays: reports.length,
      failedDays: failed,
      message: failed > 0
        ? `최근 ${reports.length}일 매출을 동기화했습니다. ${failed}일은 다시 시도해주세요.`
        : `최근 ${reports.length}일 매출 동기화가 완료되었습니다.`,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : '매출 동기화 중 오류가 발생했습니다.' }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
