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
  cancelflag?: string;
}

const PORTAL_URL = 'https://wapi.wellihillipark.com/sub2/portal/portal.asp';
const RECENT_DAYS = 5;
const PORTAL_TIMEOUT_MS = 8_000;
const DETAIL_REQUEST_DELAY_MS = 150;
const SYNC_LOCK_MARKER = '[WATERPARK_SERVER_SYNC]';
const SYNC_LOCK_TTL_MS = 10 * 60 * 1000;
const SYNC_COOLDOWN_MS = 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Sync-Batch-Id',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Waterpark-Sync-Protection': 'safe-v5',
    },
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = PORTAL_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
  const response = await fetchWithTimeout(PORTAL_URL, {
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

  const detailGroups = [];
  const ticketAnalysis: Array<{ name: string; status: string; quantity: number; amount: number }> = [];
  const rentalAnalysis: Array<{ name: string; status: string; quantity: number; amount: number }> = [];
  for (const zone of zones) {
    const category = zone.zone || '기타';
    const amount = Number(zone.price) || 0;
    const quantity = Number(zone.cnt) || 0;
    try {
      await delay(DETAIL_REQUEST_DELAY_MS);
      const details = await fetchPortalRows(date.apiDate, zone.zonecode || '');
      if (details.length === 0) {
        detailGroups.push({ category, name: `${category} 전체`, quantity, amount });
        continue;
      }
      const merged = new Map<string, { category: string; name: string; quantity: number; amount: number }>();
      for (const detail of details) {
        const name = detail.sub || '기타';
        const status = detail.cancelflag || '판매';
        const current = merged.get(name) || { category, name, quantity: 0, amount: 0 };
        current.quantity += Number(detail.cnt) || 0;
        current.amount += Number(detail.price) || 0;
        merged.set(name, current);
        const raw = { name, status, quantity: Number(detail.cnt) || 0, amount: Number(detail.price) || 0 };
        if (category.replace(/\s/g, '') === '매표소' || category.replace(/\s/g, '') === '입장권') ticketAnalysis.push(raw);
        if (['물품대여', '카바나', '썬베드'].includes(category.replace(/\s/g, ''))) rentalAnalysis.push(raw);
      }
      detailGroups.push(...merged.values());
    } catch {
      detailGroups.push({ category, name: `${category} 전체`, quantity, amount });
    }
  }

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
      table_data: detailGroups,
      ticket_analysis: ticketAnalysis,
      rental_analysis: rentalAnalysis,
      updated_at: new Date().toISOString(),
      source: 'Cloudflare server sync',
    },
  };
}

function getCategoryBreakdown(report: Awaited<ReturnType<typeof collectDate>>) {
  const rows = report.data.table_data;
  const summarize = (predicate: (row: (typeof rows)[number]) => boolean) => rows
    .filter(predicate)
    .reduce((total, row) => ({
      quantity: total.quantity + (Number(row.quantity) || 0),
      amount: total.amount + (Number(row.amount) || 0),
    }), { quantity: 0, amount: 0 });
  const normalizedCategory = (row: (typeof rows)[number]) => row.category.replace(/\s/g, '');
  const foodCategories = new Set(['푸드게이트', '나로', '아폴로', '트레일러1', '트레일러2', '트레일러3']);

  return {
    admission: summarize((row) => (
      (normalizedCategory(row) === '매표소' || normalizedCategory(row) === '입장권')
    )),
    food: summarize((row) => foodCategories.has(normalizedCategory(row))),
    rental: summarize((row) => normalizedCategory(row) === '물품대여'),
  };
}

type SyncLock = {
  rowId: number;
  token: string;
  batchId: string;
  userId: string;
};

function databaseHeaders(anonKey: string, authorization: string) {
  return {
    apikey: anonKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
}

async function acquireSyncLock(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  userId: string,
  batchId: string,
): Promise<SyncLock | null> {
  const token = crypto.randomUUID();
  const payload = {
    token,
    userId,
    batchId,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  const insertResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status`, {
    method: 'POST',
    headers: {
      ...databaseHeaders(anonKey, authorization),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      synced_by_name: SYNC_LOCK_MARKER,
      synced_by_id: JSON.stringify(payload),
    }),
  });
  if (!insertResponse.ok) throw new Error('동기화 잠금 생성에 실패했습니다.');
  const inserted = await insertResponse.json() as Array<{ id: number }>;
  const rowId = inserted[0]?.id;
  if (!rowId) throw new Error('동기화 잠금 정보를 확인하지 못했습니다.');

  try {
    // 거의 동시에 들어온 요청도 모두 DB에 기록될 시간을 준 뒤 가장 먼저 등록된 요청만 통과시킨다.
    await delay(250);
    const activeSince = new Date(Date.now() - SYNC_LOCK_TTL_MS).toISOString();
    const query = new URLSearchParams({
      synced_by_name: `eq.${SYNC_LOCK_MARKER}`,
      synced_at: `gte.${activeSince}`,
      select: 'id,synced_by_id',
      order: 'id.asc',
      limit: '100',
    });
    const listResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status?${query}`, {
      headers: databaseHeaders(anonKey, authorization),
    });
    if (!listResponse.ok) throw new Error('동기화 실행 상태를 확인하지 못했습니다.');
    const rows = await listResponse.json() as Array<{ id: number; synced_by_id: string }>;
    const parsedRows = rows.map((row) => {
      try {
        return {
          id: row.id,
          payload: JSON.parse(row.synced_by_id) as {
            status?: string;
            finishedAt?: string;
            batchId?: string;
            userId?: string;
          },
        };
      } catch {
        return null;
      }
    }).filter((row): row is NonNullable<typeof row> => row !== null);

    const recentlyCompleted = parsedRows.some((row) => {
      if (row.payload.status !== 'completed' || !row.payload.finishedAt) return false;
      if (row.payload.batchId === batchId && row.payload.userId === userId) return false;
      return Date.now() - new Date(row.payload.finishedAt).getTime() < SYNC_COOLDOWN_MS;
    });
    const winner = parsedRows.find((row) => row.payload.status === 'running');

    if (recentlyCompleted || winner?.id !== rowId) {
      await finishSyncLock(supabaseUrl, anonKey, authorization, { rowId, token, batchId, userId }, 'rejected');
      return null;
    }
  } catch (error) {
    await finishSyncLock(supabaseUrl, anonKey, authorization, { rowId, token, batchId, userId }, 'failed');
    throw error;
  }
  return { rowId, token, batchId, userId };
}

async function finishSyncLock(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  lock: SyncLock,
  status: 'completed' | 'failed' | 'rejected',
): Promise<void> {
  await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status?id=eq.${lock.rowId}`, {
    method: 'PATCH',
    headers: databaseHeaders(anonKey, authorization),
    body: JSON.stringify({
      synced_by_id: JSON.stringify({
        token: lock.token,
        batchId: lock.batchId,
        userId: lock.userId,
        status,
        finishedAt: new Date().toISOString(),
      }),
    }),
  }).catch(() => undefined);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const authorization = context.request.headers.get('Authorization');
  const batchId = context.request.headers.get('X-Sync-Batch-Id') || crypto.randomUUID();
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: '서버의 데이터베이스 연결 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(batchId)) return jsonResponse({ error: '동기화 요청 정보가 올바르지 않습니다.' }, 400);

  let syncLock: SyncLock | null = null;
  let lockStatus: 'completed' | 'failed' = 'failed';
  try {
    const userResponse = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);
    const user = await userResponse.json() as { id?: string };
    if (!user.id) return jsonResponse({ error: '로그인 사용자를 확인하지 못했습니다.' }, 401);

    syncLock = await acquireSyncLock(supabaseUrl, anonKey, authorization, user.id, batchId);
    if (!syncLock) {
      return jsonResponse({ error: '매출 동기화가 진행 중이거나 방금 완료되었습니다. 1분 후 다시 확인해주세요.' }, 409);
    }

    const allowedDates = getRecentKstDates(RECENT_DAYS);
    const requestedDate = new URL(context.request.url).searchParams.get('date');
    const date = requestedDate
      ? allowedDates.find((item) => item.dbDate === requestedDate)
      : allowedDates[0];
    if (!date) return jsonResponse({ error: `최근 ${RECENT_DAYS}일 이내의 날짜만 동기화할 수 있습니다.` }, 400);
    const report = await collectDate(date);
    const categories = getCategoryBreakdown(report);

    const saveResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/daily_reports?on_conflict=report_date,report_type`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([report]),
    });
    if (!saveResponse.ok) {
      const detail = await saveResponse.text();
      throw new Error(`수집 데이터 저장 실패: ${detail.slice(0, 200)}`);
    }

    lockStatus = 'completed';
    return jsonResponse({
      status: 'completed',
      progress: 100,
      syncedDays: 1,
      failedDays: 0,
      syncedDate: date.dbDate,
      totalQty: report.data.summary.totalQty,
      totalAmount: report.data.summary.totalAmount,
      categories,
      message: `${date.dbDate} 매출 동기화가 완료되었습니다.`,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '매출 시스템의 응답이 지연되어 안전하게 연결을 종료했습니다.'
      : error instanceof Error ? error.message : '매출 동기화 중 오류가 발생했습니다.';
    return jsonResponse({ error: message }, 500);
  } finally {
    if (syncLock) {
      await finishSyncLock(supabaseUrl, anonKey, authorization, syncLock, lockStatus);
    }
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
