interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

type PagesFunction<TEnv = Record<string, unknown>> = (context: {
  env: TEnv;
  request: Request;
}) => Promise<Response>;

type PortalRow = {
  todate?: string;
  totime?: number | string;
  zone?: string;
  zonecode?: string;
  kindname?: string;
  sub?: string;
  subname?: string;
  price?: number | string;
  cnt?: number | string;
};

const SPORTS_PORTAL_URL = 'https://wapi.wellihillipark.com/sub2/portal/rportal.asp';
const REQUEST_TIMEOUT_MS = 10_000;
const EARLIEST_DATE = '2020-07-10';

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

function getKstDate(): string {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function clean(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSportsPortalRows(date: string, zoneCode = '', subCode = ''): Promise<PortalRow[]> {
  const apiDate = date.replaceAll('-', '');
  const response = await fetchWithTimeout(SPORTS_PORTAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (compatible; WellihilliSportsSync/1.0)',
    },
    body: new URLSearchParams({
      p_sale_sdate: apiDate,
      p_sale_edate: apiDate,
      p_upjang_code: zoneCode,
      p_sub_code: subCode,
    }),
  });
  if (!response.ok) throw new Error(`스포츠 발권 시스템 응답 오류: ${response.status}`);
  const result = await response.json() as { datalist?: PortalRow[] };
  return Array.isArray(result.datalist) ? result.datalist : [];
}

function databaseHeaders(anonKey: string, authorization: string) {
  return { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const authorization = context.request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: '서버의 데이터베이스 연결 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const url = new URL(context.request.url);
  const requestedDate = url.searchParams.get('date') || getKstDate();
  const mode = url.searchParams.get('mode') || 'summary';
  const zoneCode = url.searchParams.get('zonecode') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || requestedDate < EARLIEST_DATE || requestedDate > getKstDate()) {
    return jsonResponse({ error: `${EARLIEST_DATE}부터 오늘까지의 날짜만 조회할 수 있습니다.` }, 400);
  }
  if (mode === 'detail' && !/^[A-Za-z0-9]{2,12}$/.test(zoneCode)) {
    return jsonResponse({ error: '조회할 업장 정보가 올바르지 않습니다.' }, 400);
  }

  try {
    const userResponse = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);

    if (mode === 'detail') {
      const [ticketRows, hourlyRows] = await Promise.all([
        fetchSportsPortalRows(requestedDate, zoneCode, '1'),
        fetchSportsPortalRows(requestedDate, zoneCode, '2'),
      ]);
      const ticketTypes = new Map<string, { kind: string; name: string; quantity: number; amount: number }>();
      for (const row of ticketRows) {
        const kind = clean(row.kindname) || '기타';
        const name = clean(row.sub) || '기타';
        const key = `${kind}::${name}`;
        const current = ticketTypes.get(key) || { kind, name, quantity: 0, amount: 0 };
        current.quantity += Number(row.cnt) || 0;
        current.amount += Number(row.price) || 0;
        ticketTypes.set(key, current);
      }
      const hourly = new Map<number, { hour: number; quantity: number; amount: number }>();
      for (const row of hourlyRows) {
        const hour = Number(row.totime) || 0;
        const current = hourly.get(hour) || { hour, quantity: 0, amount: 0 };
        current.quantity += Number(row.cnt) || 0;
        current.amount += Number(row.price) || 0;
        hourly.set(hour, current);
      }
      return jsonResponse({
        date: requestedDate,
        zoneCode,
        zoneName: clean(ticketRows[0]?.zone || hourlyRows[0]?.zone),
        ticketTypes: [...ticketTypes.values()].sort((left, right) => right.amount - left.amount),
        hourly: [...hourly.values()].sort((left, right) => left.hour - right.hour),
      });
    }

    const rows = await fetchSportsPortalRows(requestedDate);
    const venues = rows.map((row) => ({
      code: clean(row.zonecode),
      name: clean(row.zone) || '기타',
      quantity: Number(row.cnt) || 0,
      amount: Number(row.price) || 0,
    })).sort((left, right) => right.amount - left.amount);
    const totalQty = venues.reduce((sum, row) => sum + row.quantity, 0);
    const totalAmount = venues.reduce((sum, row) => sum + row.amount, 0);
    const report = {
      report_date: requestedDate,
      report_type: 'SPORTS_SALES',
      data: {
        summary: {
          totalQty,
          totalAmount,
          venueCount: venues.filter((row) => row.quantity > 0 || row.amount > 0).length,
          averageTicket: totalQty > 0 ? Math.round(totalAmount / totalQty) : 0,
          label: '스포츠 총 매출',
          qtyLabel: '스포츠 총 발권수',
        },
        venue_data: venues,
        updated_at: new Date().toISOString(),
        source: 'Wellihilli resort ticket portal server sync',
      },
    };

    const saveResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/daily_reports?on_conflict=report_date,report_type`, {
      method: 'POST',
      headers: {
        ...databaseHeaders(anonKey, authorization),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([report]),
    });
    if (!saveResponse.ok) {
      const detail = await saveResponse.text();
      throw new Error(`스포츠 발권 현황 저장 실패: ${detail.slice(0, 200)}`);
    }

    return jsonResponse({
      status: 'completed',
      syncedDate: requestedDate,
      summary: report.data.summary,
      venueData: venues,
      message: `${requestedDate} 스포츠 발권 현황 동기화가 완료되었습니다.`,
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '스포츠 발권 시스템의 응답이 지연되어 연결을 종료했습니다.'
      : error instanceof Error ? error.message : '스포츠 발권 현황 동기화 중 오류가 발생했습니다.';
    return jsonResponse({ error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
