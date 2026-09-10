interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

type PagesFunction<TEnv = Record<string, unknown>> = (context: { env: TEnv; request: Request }) => Promise<Response>;
type AdminUserRequest = { action?: unknown; userId?: unknown; password?: unknown };
type AuthUser = { id?: string };
type AccessRow = { role?: string; status?: string };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: '서버의 계정 관리 설정이 없습니다.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  let body: AdminUserRequest;
  try { body = await request.json() as AdminUserRequest; }
  catch { return jsonResponse({ error: '요청 내용이 올바르지 않습니다.' }, 400); }

  const action = body.action;
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if ((action !== 'reset_password' && action !== 'delete_user') || !userId) return jsonResponse({ error: '계정 관리 요청이 올바르지 않습니다.' }, 400);
  if (action === 'reset_password' && (password.length < 8 || password.length > 72)) return jsonResponse({ error: '새 비밀번호는 8~72자로 입력해주세요.' }, 400);

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
    const actor = await userResponse.json().catch(() => ({})) as AuthUser;
    if (!userResponse.ok || !actor.id) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401);

    const accessResponse = await fetch(`${supabaseUrl}/rest/v1/app_user_access?user_id=eq.${encodeURIComponent(actor.id)}&select=role,status`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    const accessRows = await accessResponse.json().catch(() => []) as AccessRow[];
    if (!accessResponse.ok || accessRows[0]?.role !== 'admin' || accessRows[0]?.status !== 'approved') return jsonResponse({ error: '관리자만 계정을 관리할 수 있습니다.' }, 403);
    if (action === 'delete_user' && actor.id === userId) return jsonResponse({ error: '현재 로그인한 관리자 본인 계정은 삭제할 수 없습니다.' }, 400);

    const adminResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: action === 'delete_user' ? 'DELETE' : 'PUT',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      ...(action === 'reset_password' ? { body: JSON.stringify({ password }) } : {}),
    });
    if (!adminResponse.ok) {
      const detail = await adminResponse.json().catch(() => ({})) as { msg?: string; message?: string };
      console.error('Supabase admin user operation failed', adminResponse.status, detail.msg || detail.message || 'unknown');
      return jsonResponse({ error: action === 'delete_user' ? '사용자 삭제에 실패했습니다.' : '비밀번호 변경에 실패했습니다.' }, 502);
    }
    return jsonResponse({ ok: true, action });
  } catch (error) {
    console.error('Admin user API failed', error);
    return jsonResponse({ error: '계정 관리 중 서버 오류가 발생했습니다.' }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders });
