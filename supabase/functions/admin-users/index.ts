import { createClient } from 'npm:@supabase/supabase-js@2.105.3'

type AdminUserRequest = {
  action?: unknown
  userId?: unknown
  password?: unknown
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '지원하지 않는 요청입니다.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authorization = request.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: '서버의 계정 관리 설정이 없습니다.' }, 500)
  if (!authorization.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401)

  let body: AdminUserRequest
  try { body = await request.json() as AdminUserRequest }
  catch { return jsonResponse({ error: '요청 내용이 올바르지 않습니다.' }, 400) }

  const action = body.action
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if ((action !== 'reset_password' && action !== 'delete_user') || !userId) return jsonResponse({ error: '계정 관리 요청이 올바르지 않습니다.' }, 400)
  if (action === 'reset_password' && (password.length < 8 || password.length > 72)) return jsonResponse({ error: '새 비밀번호는 8~72자로 입력해주세요.' }, 400)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const token = authorization.slice('Bearer '.length)
  const { data: { user: actor }, error: userError } = await userClient.auth.getUser(token)
  if (userError || !actor) return jsonResponse({ error: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.' }, 401)

  const { data: access, error: accessError } = await userClient.from('app_user_access').select('role,status').eq('user_id', actor.id).single()
  if (accessError || access?.role !== 'admin' || access?.status !== 'approved') return jsonResponse({ error: '관리자만 계정을 관리할 수 있습니다.' }, 403)
  if (action === 'delete_user' && actor.id === userId) return jsonResponse({ error: '현재 로그인한 관리자 본인 계정은 삭제할 수 없습니다.' }, 400)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const result = action === 'delete_user'
    ? await adminClient.auth.admin.deleteUser(userId)
    : await adminClient.auth.admin.updateUserById(userId, { password })
  if (result.error) {
    console.error('Admin user operation failed', result.error.message)
    return jsonResponse({ error: action === 'delete_user' ? '사용자 삭제에 실패했습니다.' : '비밀번호 변경에 실패했습니다.' }, 502)
  }

  return jsonResponse({ ok: true, action })
})
