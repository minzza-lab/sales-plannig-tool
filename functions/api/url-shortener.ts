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

type ShortenRequest = {
  url?: unknown;
  alias?: unknown;
};

type IsGdResponse = {
  shorturl?: string;
  errorcode?: number;
  errormessage?: string;
};

const IS_GD_API_URL = 'https://is.gd/create.php';
const REQUEST_TIMEOUT_MS = 10_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'X-URL-Shortener-Version': 'safe-v2',
    },
  });
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

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_000) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractShortUrl(responseText: string): string | null {
  const trimmed = responseText.trim();
  if (/^https:\/\/is\.gd\/[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as IsGdResponse;
    return typeof parsed.shorturl === 'string' ? parsed.shorturl : null;
  } catch {
    const match = trimmed.match(/"shorturl"\s*:\s*"(https:\/\/is\.gd\/[A-Za-z0-9_-]+)"/);
    return match?.[1] || null;
  }
}

function extractIsGdError(responseText: string): IsGdResponse | null {
  try {
    return JSON.parse(responseText) as IsGdResponse;
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  const authorization = context.request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: '서버의 로그인 연결 설정이 없습니다.' }, 500);
  }
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  }

  let body: ShortenRequest;
  try {
    body = await context.request.json() as ShortenRequest;
  } catch {
    return jsonResponse({ error: '요청 내용이 올바르지 않습니다.' }, 400);
  }

  try {
    const userResponse = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) {
      return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);
    }

    const targetUrl = normalizeUrl(body.url);
    const alias = typeof body.alias === 'string' ? body.alias.trim() : '';

    if (!targetUrl) {
      return jsonResponse({ error: '올바른 http 또는 https 주소를 입력해주세요.' }, 400);
    }
    if (alias && (alias.length < 5 || alias.length > 30 || !/^[a-zA-Z0-9_]+$/.test(alias))) {
      return jsonResponse({ error: '맞춤 이름은 5~30자의 영문, 숫자, 언더바만 사용할 수 있습니다.' }, 400);
    }

    const apiUrl = new URL(IS_GD_API_URL);
    apiUrl.searchParams.set('format', 'json');
    apiUrl.searchParams.set('url', targetUrl);
    if (alias) apiUrl.searchParams.set('shorturl', alias);

    const response = await fetchWithTimeout(apiUrl.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Wellihilli-Sales-Planning-Tool/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`단축 서비스 응답 오류: ${response.status}`);
    }

    const responseText = await response.text();
    const shortUrl = extractShortUrl(responseText);
    if (shortUrl) return jsonResponse({ shorturl: shortUrl });

    const result = extractIsGdError(responseText);
    if (result?.errorcode === 2) {
      return jsonResponse({ error: '이미 다른 사람이 사용 중인 이름입니다.' }, 409);
    }
    if (result?.errormessage) return jsonResponse({ error: result.errormessage }, 502);

    // 일부 네트워크에서는 JSON 응답이 변형되므로 단순 텍스트 형식으로 한 번 더 요청합니다.
    apiUrl.searchParams.set('format', 'simple');
    const fallbackResponse = await fetchWithTimeout(apiUrl.toString(), {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; WellihilliURLShortener/1.0)',
      },
    });
    const fallbackText = await fallbackResponse.text();
    const fallbackShortUrl = extractShortUrl(fallbackText);
    if (fallbackResponse.ok && fallbackShortUrl) {
      return jsonResponse({ shorturl: fallbackShortUrl });
    }
    return jsonResponse({ error: '외부 단축 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.' }, 502);
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '단축 서비스의 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
      : error instanceof Error
          ? error.message
          : 'URL 단축 중 오류가 발생했습니다.';
    return jsonResponse({ error: message }, 502);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
