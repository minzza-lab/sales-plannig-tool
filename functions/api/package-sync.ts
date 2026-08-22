interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  WADM_ADMIN_ID?: string;
  WADM_ADMIN_PWD?: string;
}

type WadmPackage = {
  ordNo?: string | number;
  chnl?: string;
  prodTp?: string | number;
  mbrTp?: string | number;
  ordNm?: string;
  ordId?: string;
  amt?: string | number;
  stat?: string | number;
  rgstYmd?: string;
  rgstHis?: string;
  orderProductPackag?: {
    pkgTpNm?: string;
    pkgNm?: string;
    useEndYmd?: string;
    pkgKind?: string | number;
    fmtn?: string;
    orderProductPackagDetails?: Array<{ optNm?: string; rmRsvNo?: string }>;
  };
  payment?: {
    mthd?: string;
    lstPmtAmt?: string | number;
    pmtYmd?: string;
    pmtHis?: string;
  };
};

type SyncLock = { id: number; token: string };

const WADM_API = 'https://wadm.wellihillipark.com:8060/api';
const SYNC_MARKER = '[PACKAGE_SERVER_SYNC]';
const PAGE_SIZE = 50;
const MAX_PAGES = 120;
const REQUEST_DELAY_MS = 120;
const TIMEOUT_MS = 12_000;

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizePackageName(name: string) {
  return name
    .replace(/\(\d{1,2}\/\d{1,2}\)/g, '')
    .replace(/\s+\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?(\s*\(.*?\))?.*$/, '')
    .replace(/^\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?\s*/, '')
    .trim() || '알 수 없음';
}

function dateString(daysAgo: number) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
}

function numberValue(value: unknown) {
  return Number(String(value ?? '').replace(/[^0-9-]/g, '')) || 0;
}

function statusName(status: unknown) {
  const code = String(status ?? '');
  return code === '00' ? '입금대기' : code === '01' ? '결제완료' : code === '02' ? '취소완료' : code;
}

function memberTypeName(type: unknown) {
  const code = String(type ?? '');
  const names: Record<string, string> = { '31': '사이버회원', '11': '콘도', '12': '스키', '13': '골프', '21': '스페셜카드', S01: '신안종합리조트', S19: '신안그룹사', S27: 'SWM' };
  return names[code] || code;
}

function paymentMethodName(method: unknown) {
  const code = String(method ?? '');
  const names: Record<string, string> = { CARD: '신용카드', BANK: '계좌이체', VBANK: '가상계좌' };
  return names[code] || code;
}

function makeOrder(row: WadmPackage) {
  const product = row.orderProductPackag || {};
  const detail = product.orderProductPackagDetails?.[0];
  const rawName = String(product.pkgNm || '');
  return {
    order_id: String(row.ordNo || '').trim(),
    channel: row.chnl === 'PC' ? 'PC' : 'Mobile',
    package_type: product.pkgTpNm || '',
    raw_package_name: rawName,
    normalized_package_name: normalizePackageName(rawName),
    reservation_date: String(product.useEndYmd || ''),
    components: product.pkgKind && String(product.pkgKind) !== '1001' ? (detail?.optNm || '') : (product.fmtn || ''),
    member_type: memberTypeName(row.mbrTp),
    customer_info: [row.ordNm, row.ordId].filter(Boolean).join(' '),
    payment_method: paymentMethodName(row.payment?.mthd),
    order_amount: numberValue(row.amt),
    payment_amount: numberValue(row.payment?.lstPmtAmt),
    status: statusName(row.stat),
    order_date: [row.rgstYmd, row.rgstHis].filter(Boolean).join(' '),
  };
}

function dbHeaders(anonKey: string, authorization: string) {
  return { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' };
}

async function verifyUser(supabaseUrl: string, anonKey: string, authorization: string) {
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!response.ok) return null;
  return response.json() as Promise<{ id?: string }>;
}

async function acquireLock(supabaseUrl: string, anonKey: string, authorization: string): Promise<SyncLock | null> {
  const recent = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status?synced_by_name=eq.${encodeURIComponent(SYNC_MARKER)}&order=synced_at.desc&limit=1`, {
    headers: dbHeaders(anonKey, authorization),
  });
  if (!recent.ok) throw new Error('동기화 실행 상태를 확인하지 못했습니다.');
  const previous = await recent.json() as Array<{ synced_by_id?: string; synced_at?: string }>;
  const previousState = previous[0]?.synced_by_id ? JSON.parse(previous[0].synced_by_id) as { status?: string } : null;
  if (previousState?.status === 'running') return null;

  const token = crypto.randomUUID();
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status`, {
    method: 'POST',
    headers: { ...dbHeaders(anonKey, authorization), Prefer: 'return=representation' },
    body: JSON.stringify({ synced_by_name: SYNC_MARKER, synced_by_id: JSON.stringify({ token, status: 'running', startedAt: new Date().toISOString() }) }),
  });
  if (!response.ok) throw new Error('동기화 잠금 생성에 실패했습니다.');
  const rows = await response.json() as Array<{ id?: number }>;
  if (!rows[0]?.id) throw new Error('동기화 잠금 정보를 확인하지 못했습니다.');
  return { id: rows[0].id, token };
}

async function finishLock(supabaseUrl: string, anonKey: string, authorization: string, lock: SyncLock, status: 'completed' | 'failed', detail: Record<string, unknown>) {
  await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status?id=eq.${lock.id}`, {
    method: 'PATCH',
    headers: dbHeaders(anonKey, authorization),
    body: JSON.stringify({ synced_by_id: JSON.stringify({ token: lock.token, status, finishedAt: new Date().toISOString(), ...detail }) }),
  }).catch(() => undefined);
}

async function getAdminToken(id: string, pwd: string) {
  const response = await fetchWithTimeout(`${WADM_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pwd }),
  });
  if (!response.ok) throw new Error('관리자 시스템 로그인에 실패했습니다. 서버 계정 설정을 확인해주세요.');
  const body = await response.json() as { data?: { 'X-AUTH-TOKEN'?: string }; 'X-AUTH-TOKEN'?: string };
  const token = body.data?.['X-AUTH-TOKEN'] || body['X-AUTH-TOKEN'];
  if (!token) throw new Error('관리자 시스템 인증 정보를 확인하지 못했습니다.');
  return token;
}

async function collectOrders(token: string, days: number) {
  const start = dateString(days - 1);
  const end = dateString(0);
  const all: WadmPackage[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      pg: String(page), pgSz: String(PAGE_SIZE), schChnl: '', schMbrTp: '', schPkgTp: '', schStatList: '', schMthdList: '',
      schYmdTp: 'orderYmd', schStrtYmd: start, schEndYmd: end, schFld: 'ordNo', schTxt: '', schPkgKind: '1001', schPkgSubKind: '', sordFld: 'rgstYmd', schPkgSaleCardTp: '',
    });
    const response = await fetchWithTimeout(`${WADM_API}/order/packag/listbasis?${query}`, { headers: { 'X-AUTH-TOKEN': token } });
    if (!response.ok) throw new Error(`관리자 주문 조회에 실패했습니다. (${response.status})`);
    const body = await response.json() as { data?: { list?: WadmPackage[]; totalPageSize?: number }; list?: WadmPackage[]; totalPageSize?: number };
    const payload = body.data || body;
    const rows = Array.isArray(payload.list) ? payload.list : [];
    all.push(...rows);
    if (rows.length === 0 || page >= Number(payload.totalPageSize || 1)) break;
    await delay(REQUEST_DELAY_MS);
  }
  return all;
}

async function saveOrders(supabaseUrl: string, anonKey: string, authorization: string, rows: WadmPackage[]) {
  const orders = rows.map(makeOrder).filter((order) => order.order_id && (order.status.includes('결제완료') || order.status.includes('예약완료')));
  for (let offset = 0; offset < orders.length; offset += 100) {
    const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/package_orders?on_conflict=order_id`, {
      method: 'POST',
      headers: { ...dbHeaders(anonKey, authorization), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(orders.slice(offset, offset + 100)),
    });
    if (!response.ok) throw new Error(`패키지 주문 저장에 실패했습니다. (${response.status})`);
  }
  return orders.length;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const adminId = context.env.WADM_ADMIN_ID;
  const adminPwd = context.env.WADM_ADMIN_PWD;
  const authorization = context.request.headers.get('Authorization');
  const requestedDays = Number(new URL(context.request.url).searchParams.get('days') || '7');
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: '서버의 데이터베이스 연결 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  if (!adminId || !adminPwd) return jsonResponse({ error: '서버 직접 동기화 설정이 아직 완료되지 않았습니다. 관리자 계정 환경변수를 등록해주세요.' }, 503);

  const user = await verifyUser(supabaseUrl, anonKey, authorization);
  if (!user?.id) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);

  let lock: SyncLock | null = null;
  let result: Record<string, unknown> = {};
  let state: 'completed' | 'failed' = 'failed';
  try {
    lock = await acquireLock(supabaseUrl, anonKey, authorization);
    if (!lock) return jsonResponse({ error: '패키지 동기화가 이미 진행 중입니다. 잠시 후 다시 확인해주세요.' }, 409);
    const token = await getAdminToken(adminId, adminPwd);
    const sourceRows = await collectOrders(token, days);
    const savedCount = await saveOrders(supabaseUrl, anonKey, authorization, sourceRows);
    result = { status: 'completed', days, sourceCount: sourceRows.length, savedCount, finishedAt: new Date().toISOString(), message: `최근 ${days}일 패키지 주문 ${savedCount.toLocaleString()}건을 동기화했습니다.` };
    state = 'completed';
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '관리자 시스템 응답이 지연되어 안전하게 동기화를 중단했습니다.'
      : error instanceof Error ? error.message : '패키지 동기화 중 오류가 발생했습니다.';
    result = { error: message };
    return jsonResponse(result, 500);
  } finally {
    if (lock) await finishLock(supabaseUrl, anonKey, authorization, lock, state, result);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
