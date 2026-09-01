interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  WADM_ADMIN_ID?: string;
  WADM_ADMIN_PWD?: string;
}

type InquiryListItem = {
  seq?: string | number;
  ansYmd?: string;
  tp?: string | number;
  catg?: string | number;
};

type InquiryDetail = {
  seq?: string | number;
  rgstrNm?: string;
  tp?: string | number;
  catg?: string | number;
  ttl?: string;
  cont?: string;
  inqrAns?: string;
  ansYmd?: string;
};

const WADM_API = 'https://wadm.wellihillipark.com:8060/api';
const PAGE_SIZE = 20;
const MAX_PAGES = 3;
const DETAIL_CONCURRENCY = 6;
const TIMEOUT_MS = 12_000;
const SYNC_MARKER = '[VOC_SERVER_SYNC]';

type SyncLock = { id: number; token: string };

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function dbHeaders(anonKey: string, authorization: string) {
  return { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' };
}

async function verifyUser(supabaseUrl: string, anonKey: string, authorization: string) {
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  return response.ok ? response.json() as Promise<{ id?: string }> : null;
}

async function acquireLock(supabaseUrl: string, anonKey: string, authorization: string): Promise<SyncLock | null> {
  const recent = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status?synced_by_name=eq.${encodeURIComponent(SYNC_MARKER)}&order=synced_at.desc&limit=1`, {
    headers: dbHeaders(anonKey, authorization),
  });
  if (!recent.ok) throw new Error('VOC 동기화 실행 상태를 확인하지 못했습니다.');
  const previous = await recent.json() as Array<{ synced_by_id?: string; synced_at?: string }>;
  let previousState: { status?: string; startedAt?: string } = {};
  try {
    previousState = JSON.parse(previous[0]?.synced_by_id || '{}') as { status?: string; startedAt?: string };
  } catch {
    previousState = {};
  }
  const runningFor = Date.now() - new Date(previousState.startedAt || previous[0]?.synced_at || 0).getTime();
  if (previousState.status === 'running' && Number.isFinite(runningFor) && runningFor >= 0 && runningFor < 2 * 60 * 1000) return null;

  const token = crypto.randomUUID();
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sync_status`, {
    method: 'POST',
    headers: { ...dbHeaders(anonKey, authorization), Prefer: 'return=representation' },
    body: JSON.stringify({ synced_by_name: SYNC_MARKER, synced_by_id: JSON.stringify({ token, status: 'running', startedAt: new Date().toISOString() }) }),
  });
  if (!response.ok) throw new Error('VOC 동기화 잠금 생성에 실패했습니다.');
  const rows = await response.json() as Array<{ id?: number }>;
  if (!rows[0]?.id) throw new Error('VOC 동기화 잠금 정보를 확인하지 못했습니다.');
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

async function fetchRecentInquiries(token: string) {
  const rows: InquiryListItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      pg: String(page), pgSz: String(PAGE_SIZE), schTp: '', schCatg: '', schAnsYn: '',
      schStrtYmd: '', schEndYmd: '', schExpsYn: '', schFld: 'ttl', schTxt: '', sordFld: 'rgstYmd', sordMetd: 'DESC',
    });
    const response = await fetchWithTimeout(`${WADM_API}/customer/inquiry/list?${params}`, {
      headers: { 'X-AUTH-TOKEN': token },
    });
    if (!response.ok) throw new Error(`VOC 목록을 조회하지 못했습니다. (${response.status})`);
    const body = await response.json() as { data?: { list?: InquiryListItem[]; totalPageSize?: number }; list?: InquiryListItem[]; totalPageSize?: number };
    const payload = body.data || body;
    const pageRows = Array.isArray(payload.list) ? payload.list : [];
    rows.push(...pageRows);
    if (pageRows.length === 0 || page >= Number(payload.totalPageSize || 1)) break;
  }
  return rows.filter((row) => row.seq);
}

async function fetchInquiryDetail(token: string, seq: string | number) {
  const response = await fetchWithTimeout(`${WADM_API}/customer/inquiry/detail/${encodeURIComponent(String(seq))}`, {
    headers: { 'X-AUTH-TOKEN': token },
  });
  if (!response.ok) throw new Error(`VOC 상세 내용을 조회하지 못했습니다. (${response.status})`);
  const body = await response.json() as { data?: InquiryDetail } | InquiryDetail;
  return ('data' in body ? body.data : body) || {};
}

async function fetchInquiryConfig(token: string) {
  const response = await fetchWithTimeout(`${WADM_API}/customer/inquiry/config_info`, {
    headers: { 'X-AUTH-TOKEN': token },
  });
  if (!response.ok) return { inquiryTypes: {} as Record<string, string>, inquiryCatgTypes: {} as Record<string, string> };
  const body = await response.json() as { data?: { inquiryTypes?: Record<string, string>; inquiryCatgTypes?: Record<string, string> } };
  return {
    inquiryTypes: body.data?.inquiryTypes || {},
    inquiryCatgTypes: body.data?.inquiryCatgTypes || {},
  };
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

async function saveInquiries(supabaseUrl: string, anonKey: string, authorization: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/voc_inquiries?on_conflict=seq_id`, {
    method: 'POST',
    headers: { ...dbHeaders(anonKey, authorization), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`VOC 저장에 실패했습니다. (${response.status})`);
}

async function saveSyncStamp(supabaseUrl: string, anonKey: string, authorization: string) {
  const headers = dbHeaders(anonKey, authorization);
  await fetchWithTimeout(`${supabaseUrl}/rest/v1/knowledge_base?title=eq.${encodeURIComponent('[SYSTEM] LAST_SYNC')}`, {
    method: 'DELETE', headers,
  });
  await fetchWithTimeout(`${supabaseUrl}/rest/v1/knowledge_base`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      title: '[SYSTEM] LAST_SYNC',
      content: JSON.stringify({
        synced_at: new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        synced_by_name: '웹 수동 동기화',
        synced_by_id: 'server-voc-sync',
      }),
      author: 'SYSTEM',
      category: '시스템',
    }),
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const adminId = context.env.WADM_ADMIN_ID;
  const adminPwd = context.env.WADM_ADMIN_PWD;
  const authorization = context.request.headers.get('Authorization');

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
    if (!lock) return jsonResponse({ error: '다른 VOC 동기화가 진행 중입니다. 잠시 후 다시 시도해주세요.' }, 409);
    const adminToken = await getAdminToken(adminId, adminPwd);
    const [sourceRows, config] = await Promise.all([
      fetchRecentInquiries(adminToken),
      fetchInquiryConfig(adminToken),
    ]);
    const savedRows: Array<Record<string, unknown>> = [];
    let failedCount = 0;

    for (let offset = 0; offset < sourceRows.length; offset += DETAIL_CONCURRENCY) {
      const group = sourceRows.slice(offset, offset + DETAIL_CONCURRENCY);
      const results = await Promise.allSettled(group.map(async (item) => {
        const detail = await fetchInquiryDetail(adminToken, item.seq!);
        return {
          seq_id: text(detail.seq || item.seq),
          customer_name: text(detail.rgstrNm),
          category: `${config.inquiryTypes[text(detail.tp || item.tp)] || text(detail.tp || item.tp)} / ${config.inquiryCatgTypes[text(detail.catg || item.catg)] || text(detail.catg || item.catg)}`,
          title: text(detail.ttl),
          content: text(detail.cont),
          answer: text(detail.inqrAns),
          status: text(detail.ansYmd || item.ansYmd) ? 'answered' : 'unanswered',
        };
      }));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.seq_id) savedRows.push(result.value);
        else failedCount += 1;
      }
    }

    await saveInquiries(supabaseUrl, anonKey, authorization, savedRows);
    await saveSyncStamp(supabaseUrl, anonKey, authorization);
    result = {
      status: 'completed',
      sourceCount: sourceRows.length,
      savedCount: savedRows.length,
      failedCount,
      finishedAt: new Date().toISOString(),
      message: `최신 VOC ${savedRows.length}건을 수집하고 처리했습니다.${failedCount ? ` (${failedCount}건 확인 실패)` : ''}`,
    };
    state = 'completed';
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '관리자 시스템 응답이 지연되어 안전하게 동기화를 중단했습니다.'
      : error instanceof Error ? error.message : 'VOC 동기화 중 오류가 발생했습니다.';
    result = { error: message };
    return jsonResponse(result, 500);
  } finally {
    if (lock) await finishLock(supabaseUrl, anonKey, authorization, lock, state, result);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
