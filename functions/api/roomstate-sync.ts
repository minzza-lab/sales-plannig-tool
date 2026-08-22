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

type RoomRow = {
  category: string;
  member: number;
  general: number;
  group: number;
  total: number;
};

type GroupRow = {
  name: string;
  arrivalDate: string;
  departureDate: string;
  condoQty: number;
  youthQty: number;
};

export type CondoAvailabilityRow = {
  date: string;
  weekday: string;
  rooms: Record<string, boolean>;
};

const ROOMSTATE_URL = 'https://wapi.wellihillipark.com/sub2/roomstate/roomstate.html';
const CONDO_AVAILABILITY_URL = 'https://wapi.wellihillipark.com/sub2/agentCondoRoom/agent_condo_room.html';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FUTURE_DAYS = 60;
const CONDO_ROOM_TYPES = ['스탠다드 A', '스탠다드 B', '패밀리', '스위트 A', '스위트 B', '럭셔리 A', '럭셔리 B', '하우스'];

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

function getKstDate(offsetDays = 0): string {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAllowedDate(value: string): boolean {
  return value >= getKstDate() && value <= getKstDate(MAX_FUTURE_DAYS);
}

function decodeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSectionTable(html: string, sectionLabel: string): string {
  const labelIndex = html.indexOf(sectionLabel);
  if (labelIndex < 0) return '';
  const remaining = html.slice(labelIndex);
  const tableStart = remaining.search(/<table\b[^>]*bgcolor=["']?#cdd2d2["']?[^>]*>/i);
  if (tableStart < 0) return '';
  const afterStart = remaining.slice(tableStart);
  const tableEnd = afterStart.search(/<\/table>/i);
  return tableEnd < 0 ? afterStart : afterStart.slice(0, tableEnd);
}

function extractRows(tableHtml: string): string[][] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => (
    [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)]
      .map((cellMatch) => decodeText(cellMatch[1]))
  ));
}

export function parseRoomState(html: string, requestedDate: string) {
  if (html.includes('조회는 현재 이후부터 가능합니다')) {
    throw new Error('객실 현황 원본 사이트는 오늘 이전 날짜를 조회할 수 없습니다.');
  }

  const reportedDate = html.match(/조회 일자[\s\S]*?<font[^>]*>(\d{4}-\d{2}-\d{2})<\/font>/i)?.[1];
  if (!reportedDate || reportedDate !== requestedDate) {
    throw new Error('요청한 날짜의 객실 현황을 확인하지 못했습니다.');
  }

  const roomRows = extractRows(extractSectionTable(html, '투숙 현황'))
    .slice(1)
    .filter((cells) => cells.length >= 5 && ['콘도', '가든', '유스'].includes(cells[0]))
    .map((cells): RoomRow => ({
      category: cells[0],
      member: Number(cells[1]) || 0,
      general: Number(cells[2]) || 0,
      group: Number(cells[3]) || 0,
      total: Number(cells[4]) || 0,
    }));

  if (roomRows.length === 0) {
    throw new Error('객실 현황 표를 해석하지 못했습니다. 원본 사이트 구조를 확인해주세요.');
  }

  const groupRows = extractRows(extractSectionTable(html, '단체 현황'))
    .slice(1)
    .filter((cells) => cells.length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(cells[1]))
    .map((cells): GroupRow => ({
      name: cells[0],
      arrivalDate: cells[1],
      departureDate: cells[2],
      condoQty: Number(cells[3]) || 0,
      youthQty: Number(cells[4]) || 0,
    }));

  const totals = roomRows.reduce((sum, row) => ({
    member: sum.member + row.member,
    general: sum.general + row.general,
    group: sum.group + row.group,
    total: sum.total + row.total,
  }), { member: 0, general: 0, group: 0, total: 0 });

  return { roomRows, groupRows, totals };
}

export function parseCondoAvailability(html: string, requestedDate: string): CondoAvailabilityRow[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)].map((cellMatch) => cellMatch[1]);
    const date = decodeText(cells[0] || '').match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (!date || cells.length < 10) return [];

    return [{
      date: `${date[1]}-${date[2]}-${date[3]}`,
      weekday: decodeText(cells[1] || ''),
      rooms: Object.fromEntries(CONDO_ROOM_TYPES.map((roomType, index) => [
        roomType,
        /icon_reserv\.gif/i.test(cells[index + 2] || ''),
      ])),
    }];
  });

  if (!rows.some((row) => row.date === requestedDate)) {
    throw new Error('객실 타입별 예약 가능 현황을 확인하지 못했습니다.');
  }

  return rows;
}

export async function fetchRoomState(date: string): Promise<string> {
  const [year, month, day] = date.split('-');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ROOMSTATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (compatible; WellihilliRoomStateSync/1.0)',
      },
      body: new URLSearchParams({ s_yy: year, s_mm: String(Number(month)), s_dd: String(Number(day)), plusminus: '' }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`객실 시스템 응답 오류: ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCondoAvailability(date: string): Promise<string> {
  const [year, month, day] = date.split('-');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(CONDO_AVAILABILITY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (compatible; WellihilliRoomStateSync/1.0)',
      },
      body: new URLSearchParams({
        yy: year,
        mm: String(Number(month)),
        dd: String(Number(day)),
        yy2: year,
        mm2: String(Number(month)),
        dd2: String(Number(day)),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`객실 타입 현황 시스템 응답 오류: ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function databaseHeaders(anonKey: string, authorization: string) {
  return {
    apikey: anonKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const authorization = context.request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: '서버의 데이터베이스 연결 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const requestedDate = new URL(context.request.url).searchParams.get('date') || getKstDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !isAllowedDate(requestedDate)) {
    return jsonResponse({ error: `오늘부터 ${MAX_FUTURE_DAYS}일 이내 날짜만 동기화할 수 있습니다.` }, 400);
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);

    const html = await fetchRoomState(requestedDate);
    const parsed = parseRoomState(html, requestedDate);
    const condoAvailability = parseCondoAvailability(await fetchCondoAvailability(requestedDate), requestedDate)
      .find((row) => row.date === requestedDate);
    const report = {
      report_date: requestedDate,
      report_type: 'ROOM_STATE',
      data: {
        summary: {
          totalQty: parsed.totals.total,
          memberQty: parsed.totals.member,
          generalQty: parsed.totals.general,
          groupQty: parsed.totals.group,
          groupCount: parsed.groupRows.length,
          label: '객실 투숙 현황',
          qtyLabel: '총 투숙 객실',
        },
        room_data: parsed.roomRows,
        group_data: parsed.groupRows,
        condo_availability: condoAvailability?.rooms || {},
        updated_at: new Date().toISOString(),
        source: 'Wellihilli roomstate server sync',
      },
    };

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/daily_reports?on_conflict=report_date,report_type`, {
      method: 'POST',
      headers: {
        ...databaseHeaders(anonKey, authorization),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([report]),
    });
    if (!saveResponse.ok) {
      const detail = await saveResponse.text();
      throw new Error(`객실 현황 저장 실패: ${detail.slice(0, 200)}`);
    }

    return jsonResponse({
      status: 'completed',
      syncedDate: requestedDate,
      summary: report.data.summary,
      roomData: parsed.roomRows,
      groupData: parsed.groupRows,
      condoAvailability: condoAvailability?.rooms || {},
      message: `${requestedDate} 객실 현황 동기화가 완료되었습니다.`,
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '객실 시스템 응답이 지연되어 연결을 종료했습니다.'
      : error instanceof Error ? error.message : '객실 현황 동기화 중 오류가 발생했습니다.';
    return jsonResponse({ error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
