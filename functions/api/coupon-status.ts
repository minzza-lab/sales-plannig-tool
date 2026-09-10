interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  COUPON_LOOKUP_ALLOWED_HOSTS?: string;
  COUPON_LOOKUP_TIMEOUT_MS?: string;
  COUPON_LOOKUP_MAX_REDIRECTS?: string;
}

type PagesFunction<TEnv = Record<string, unknown>> = (context: {
  env: TEnv;
  request: Request;
}) => Promise<Response>;

export type LookupMode = 'url' | 'api' | 'auto';
type LookupRequest = { url?: unknown; barcode?: unknown; mode?: unknown };
type TicketDetail = { barcode: string; productName: string; used: boolean | null };

export type LookupResult = {
  status: 'used' | 'unused' | 'error';
  method: 'API' | 'URL 직접조회' | '조회실패';
  barcode: string;
  productName: string;
  reason: string;
  error: string;
  barcodeMatched: boolean | null;
  details: TicketDetail[];
};

const DEFAULT_ALLOWED_HOSTS = ['tket.me', 'www.ticketchannelmanager.com'];
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;

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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 2_000) : '';
}

export function allowedHosts(env: Env): Set<string> {
  const configured = cleanText(env.COUPON_LOOKUP_ALLOWED_HOSTS)
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_HOSTS);
}

function isForbiddenIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const nums = parts.map(Number);
  if (nums.some((part) => part > 255)) return true;
  const [a, b] = nums;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

export function validateLookupUrl(rawUrl: string, hosts: Set<string>): URL {
  if (!rawUrl || rawUrl.length > 2_000) throw new Error('조회 URL이 올바르지 않습니다.');
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error('조회 URL이 올바르지 않습니다.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http 또는 https URL만 조회할 수 있습니다.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.includes(':') || isForbiddenIpv4(hostname) || /^\d+(?:\.\d+){3}$/.test(hostname)) {
    throw new Error('IP 주소 또는 내부망 주소는 조회할 수 없습니다.');
  }
  if (!hosts.has(hostname)) throw new Error('허용되지 않은 조회 도메인입니다.');
  url.username = '';
  url.password = '';
  return url;
}

async function fetchLimited(url: URL, init: RequestInit, hosts: Set<string>, timeoutMs: number, maxRedirects: number) {
  let current = url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    validateLookupUrl(current.toString(), hosts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) throw new Error('리다이렉트 주소가 없습니다.');
    if (redirectCount === maxRedirects) throw new Error('리다이렉트 횟수 제한을 초과했습니다.');
    current = validateLookupUrl(new URL(location, current).toString(), hosts);
    if (response.status === 303) init = { ...init, method: 'GET', body: undefined };
  }
  throw new Error('리다이렉트 처리에 실패했습니다.');
}

async function safeResponseText(response: Response): Promise<string> {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error('조회 응답 크기 제한을 초과했습니다.');
  const text = await response.text();
  return text.slice(0, MAX_RESPONSE_BYTES);
}

function textOnly(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function judgeDirectText(rawText: string): { status: 'used' | 'unused' | 'error'; reason: string } {
  const text = textOnly(rawText).slice(0, 500);
  const invalid = ['유효하지 않은 쿠폰', '존재하지 않는 쿠폰', '잘못된 쿠폰'];
  const used = ['사용 완료', '이미 사용된 쿠폰', '사용 처리', '사용되었습니다'];
  const unused = ['사용 가능', '미사용', '사용 전'];
  const matched = invalid.find((word) => text.includes(word));
  if (matched) return { status: 'error', reason: `${matched} 문구 확인` };
  const usedMatch = used.find((word) => text.includes(word));
  if (usedMatch) return { status: 'used', reason: `${usedMatch} 문구 확인` };
  const unusedMatch = unused.find((word) => text.includes(word));
  if (unusedMatch) return { status: 'unused', reason: `${unusedMatch} 문구 확인` };
  return { status: 'error', reason: text ? `판정 불가: ${text.slice(0, 180)}` : '판정할 화면 문구가 없습니다.' };
}

function findBarcodeInText(text: string, expected: string): string {
  if (expected && text.includes(expected)) return expected;
  const labeled = text.match(/(?:barcode|바코드|쿠폰번호|쿠폰코드)[^0-9A-Za-z]{0,15}([0-9A-Za-z-]{5,})/i);
  return labeled?.[1] || '';
}

async function directLookup(finalUrl: URL, expectedBarcode: string, hosts: Set<string>, timeoutMs: number, maxRedirects: number): Promise<LookupResult> {
  const { response } = await fetchLimited(finalUrl, {
    method: 'GET',
    headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; WHP-CouponLookup/1.0)' },
  }, hosts, timeoutMs, maxRedirects);
  if (!response.ok) throw new Error(`조회 페이지 응답 오류 (${response.status})`);
  const raw = await safeResponseText(response);
  if (/모바일\s*티켓\s*보기|getConfirmedMobileTicketInfo|mobileTicketList/i.test(raw)) {
    try {
      const ticketResult = await apiLookup(finalUrl, raw, expectedBarcode, hosts, timeoutMs, maxRedirects);
      return {
        ...ticketResult,
        method: 'URL 직접조회',
        reason: `모바일 티켓 보기 조회 · ${ticketResult.reason}`,
      };
    } catch {
      // 모바일 티켓 조회가 불가능한 페이지는 기존 화면 문구 판정으로 계속 처리한다.
    }
  }
  const plain = textOnly(raw);
  const judged = judgeDirectText(raw);
  const foundBarcode = findBarcodeInText(plain, expectedBarcode);
  return {
    status: judged.status,
    method: 'URL 직접조회',
    barcode: foundBarcode,
    productName: '',
    reason: `${judged.reason}${expectedBarcode ? foundBarcode ? ` · 바코드 ${foundBarcode === expectedBarcode ? '일치' : '불일치'}` : ' · 바코드 확인 불가' : ''}`,
    error: judged.status === 'error' ? judged.reason : '',
    barcodeMatched: expectedBarcode ? (foundBarcode ? foundBarcode === expectedBarcode : null) : null,
    details: [],
  };
}

function deepTicketLists(value: unknown, seen = new Set<unknown>()): unknown[] {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => deepTicketLists(item, seen));
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.mobileTicketList)) return record.mobileTicketList;
  return Object.values(record).flatMap((item) => deepTicketLists(item, seen));
}

export function parseTicketDetails(payload: unknown): TicketDetail[] {
  return deepTicketLists(payload).map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const flag = String(row.barcode_use_yn ?? '').trim().toUpperCase();
    return {
      barcode: String(row.barcode ?? '').trim(),
      productName: String(row.barcode_name ?? '').trim(),
      used: flag === 'Y' ? true : flag === 'N' ? false : null,
    };
  }).filter((row) => row.barcode || row.productName || row.used !== null);
}

function pageValue(html: string, name: string): string {
  const patterns = [
    new RegExp(`${name}\\s*:\\s*['"]([^'"]*)['"]`, 'i'),
    new RegExp(`name=['"]${name}['"][^>]*value=['"]([^'"]*)['"]`, 'i'),
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1] || '').find(Boolean) || '';
}

function apiRequestUrl(finalUrl: URL, pageHtml: string): { url: URL; body: URLSearchParams; ticketType: 'ONE_TICKET' | 'ALL_TICKET' } {
  const ticketType = finalUrl.searchParams.get('command') === 'reservedMainRsInfo' ? 'ALL_TICKET' : 'ONE_TICKET';
  const url = new URL('/rsInfo.do', finalUrl.origin);
  const body = new URLSearchParams();
  body.set('command', 'getConfirmedMobileTicketInfo');
  body.set('mainRsSeqInspect', pageValue(pageHtml, 'mainRsSeqInspect') || finalUrl.searchParams.get('rs_seq') || '');
  body.set('rsSeqInspect', pageValue(pageHtml, 'rsSeqInspect'));
  body.set('prodSeq', pageValue(pageHtml, 'prodSeq'));
  body.set('callType', ticketType);
  body.set('rs_chk', pageValue(pageHtml, 'rs_chk') || finalUrl.searchParams.get('rs_chk') || '');
  return { url, body, ticketType };
}

async function apiLookup(finalUrl: URL, pageHtml: string, expectedBarcode: string, hosts: Set<string>, timeoutMs: number, maxRedirects: number): Promise<LookupResult> {
  if (finalUrl.hostname.toLowerCase() !== 'www.ticketchannelmanager.com') throw new Error('티켓채널 최종 URL을 확인하지 못했습니다.');
  const request = apiRequestUrl(finalUrl, pageHtml);
  if (!request.body.get('mainRsSeqInspect') || !request.body.get('rs_chk')) throw new Error('모바일 티켓 조회에 필요한 예약 정보를 찾지 못했습니다.');
  const postJson = async (body: URLSearchParams) => {
    const { response } = await fetchLimited(request.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Referer: finalUrl.toString(),
        'User-Agent': 'Mozilla/5.0 (compatible; WHP-CouponLookup/1.0)',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    }, hosts, timeoutMs, maxRedirects);
    if (!response.ok) throw new Error(`티켓채널 API 응답 오류 (${response.status})`);
    try { return JSON.parse(await safeResponseText(response)) as unknown; }
    catch { throw new Error('티켓채널 API 응답 형식을 확인할 수 없습니다.'); }
  };

  let reservationSeqs = [request.body.get('rsSeqInspect') || ''];
  if (request.ticketType === 'ONE_TICKET') {
    const listBody = new URLSearchParams({
      command: 'rsConfirmRdList',
      rs_seq: request.body.get('mainRsSeqInspect') || '',
      rs_chk: request.body.get('rs_chk') || '',
    });
    const listPayload = await postJson(listBody) as { list?: Array<Record<string, unknown>> };
    const listed = Array.isArray(listPayload?.list) ? listPayload.list : [];
    reservationSeqs = listed
      .filter((row) => String(row.rs_status_cd || '') !== 'D' && String(row.mobile_ticket_active_check_code || '') !== '0001')
      .map((row) => String(row.rs_seq_inspect || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!reservationSeqs.length) reservationSeqs = [''];
  }

  const allDetails: TicketDetail[] = [];
  for (const reservationSeq of reservationSeqs) {
    const ticketBody = new URLSearchParams(request.body);
    ticketBody.set('rsSeqInspect', reservationSeq);
    allDetails.push(...parseTicketDetails(await postJson(ticketBody)));
  }
  const details = allDetails.filter((detail, index, list) => !detail.barcode || list.findIndex((candidate) => candidate.barcode === detail.barcode) === index);
  if (!details.length) throw new Error('티켓채널 API에 바코드 정보가 없습니다.');
  const selected = expectedBarcode ? details.find((row) => row.barcode === expectedBarcode) : details[0];
  if (!selected) {
    return { status: 'error', method: 'API', barcode: details.map((row) => row.barcode).filter(Boolean).join(', '), productName: details.map((row) => row.productName).filter(Boolean).join(', '), reason: `API 조회 성공 · ${request.ticketType} · 원본 바코드 불일치`, error: '원본 바코드와 일치하는 티켓이 없습니다.', barcodeMatched: false, details };
  }
  if (selected.used === null) throw new Error('API 사용 여부 값이 불완전합니다.');
  return { status: selected.used ? 'used' : 'unused', method: 'API', barcode: selected.barcode, productName: selected.productName, reason: `barcode_use_yn=${selected.used ? 'Y' : 'N'} · ${request.ticketType}`, error: '', barcodeMatched: expectedBarcode ? selected.barcode === expectedBarcode : null, details };
}

export async function lookupCoupon(input: { url: string; barcode: string; mode: LookupMode }, env: Env): Promise<LookupResult> {
  const hosts = allowedHosts(env);
  const timeoutMs = Math.min(Math.max(Number(env.COUPON_LOOKUP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 1_000), 30_000);
  const maxRedirects = Math.min(Math.max(Number(env.COUPON_LOOKUP_MAX_REDIRECTS) || DEFAULT_MAX_REDIRECTS, 0), 10);
  const initialUrl = validateLookupUrl(input.url, hosts);
  const resolved = await fetchLimited(initialUrl, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WHP-CouponLookup/1.0)' } }, hosts, timeoutMs, maxRedirects);
  const finalUrl = resolved.finalUrl;
  if (input.mode === 'url') return directLookup(finalUrl, input.barcode, hosts, timeoutMs, maxRedirects);
  const pageHtml = await safeResponseText(resolved.response);
  try {
    return await apiLookup(finalUrl, pageHtml, input.barcode, hosts, timeoutMs, maxRedirects);
  } catch (apiError) {
    if (input.mode === 'api') throw apiError;
    try {
      const direct = await directLookup(finalUrl, input.barcode, hosts, timeoutMs, maxRedirects);
      return { ...direct, reason: `API 조회 불가 후 URL 직접조회 · ${direct.reason}` };
    } catch {
      throw new Error('API와 URL 직접조회 모두 완료하지 못했습니다.');
    }
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const authorization = context.request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: '서버의 로그인 연결 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!userResponse.ok) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);

  let body: LookupRequest;
  try { body = await context.request.json() as LookupRequest; } catch { return jsonResponse({ error: '요청 내용이 올바르지 않습니다.' }, 400); }
  const url = cleanText(body.url);
  const barcode = cleanText(body.barcode).slice(0, 200);
  const mode = body.mode;
  if (!['url', 'api', 'auto'].includes(String(mode))) return jsonResponse({ error: '조회 방식이 올바르지 않습니다.' }, 400);
  try {
    return jsonResponse(await lookupCoupon({ url, barcode, mode: mode as LookupMode }, context.env));
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '조회 시간이 초과되었습니다.'
      : error instanceof Error ? error.message : '조회에 실패했습니다.';
    return jsonResponse({ status: 'error', method: '조회실패', barcode: '', productName: '', reason: message, error: message, barcodeMatched: null, details: [] }, 200);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
