import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './AdminConsole.css'
import { activitySections } from '../lib/activitySections'

type AccessUser = { user_id: string; email: string; full_name: string | null; department: string | null; role: 'admin' | 'member'; status: 'pending' | 'approved' | 'suspended'; created_at: string; approved_at: string | null }
type AuditRow = { id: number; target_user_id: string; previous_role: string; previous_status: string; next_role: string; next_status: string; created_at: string }

type ActivityRow = { user_id: string; last_login_at: string; last_seen_at: string; last_section_path: string }
type LoginRow = { session_id: string; user_id: string; logged_in_at: string }
const formatTime = (value?: string) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음'

const label: Record<AccessUser['status'], string> = { pending: '승인 대기', approved: '사용 중', suspended: '사용 중지' }

export default function AdminConsole() {
  const [users, setUsers] = useState<AccessUser[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [logins, setLogins] = useState<LoginRow[]>([])
  const [activityError, setActivityError] = useState('')
  const [allowed, setAllowed] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [passwordUser, setPasswordUser] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    const { data: admin, error: adminError } = await supabase.rpc('is_app_admin')
    if (adminError || admin !== true) {
      setAllowed(false); setUsers([]); setAudit([]); setActivity([]); setLogins([])
      setError(adminError ? '관리자 권한을 확인하지 못했습니다. 다시 시도해주세요.' : '관리자만 이용할 수 있는 페이지입니다.')
      setLoading(false); return
    }
    setAllowed(true)
    const [userResult, auditResult, activityResult, loginResult] = await Promise.all([
      supabase.from('app_user_access').select('*').order('created_at', { ascending: false }),
      supabase.from('app_access_audit').select('*').order('created_at', { ascending: false }).limit(12),
      supabase.from('app_user_activity').select('*').order('last_seen_at', { ascending: false }),
      supabase.from('app_login_history').select('*').order('logged_in_at', { ascending: false }).limit(100),
    ])
    if (userResult.error) setError(userResult.error.code === '42P01' ? '보안 설정이 아직 적용되지 않았습니다. 관리자에게 설정 SQL 실행을 요청해주세요.' : '관리자 권한이 없거나 정보를 불러오지 못했습니다.')
    else { setUsers(userResult.data as AccessUser[]); setAudit((auditResult.data ?? []) as AuditRow[]) }
    setActivityError(activityResult.error || loginResult.error ? '접속 기록을 불러오지 못했습니다. 최초 설정 시 supabase_activity_schema.sql을 적용한 뒤 새로고침해주세요.' : '')
    setActivity((activityResult.data ?? []) as ActivityRow[])
    setLogins((loginResult.data ?? []) as LoginRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const update = async (user: AccessUser, change: Partial<Pick<AccessUser, 'role' | 'status'>>) => {
    setSaving(user.user_id); setError('')
    const next = { ...change, approved_at: change.status === 'approved' && !user.approved_at ? new Date().toISOString() : user.approved_at }
    const { error: updateError } = await supabase.from('app_user_access').update(next).eq('user_id', user.user_id)
    if (updateError) setError('권한 변경에 실패했습니다. 관리자 권한을 다시 확인해주세요.')
    else await load(); setSaving(null)
  }

  const manageUser = async (user: AccessUser, action: 'reset_password' | 'delete_user') => {
    if (action === 'reset_password' && (newPassword.length < 8 || newPassword.length > 72)) { setError('새 비밀번호는 8~72자로 입력해주세요.'); return }
    if (action === 'delete_user' && !window.confirm(`${user.full_name || user.email} 계정을 명단과 로그인 계정에서 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.`)) return
    setSaving(user.user_id); setError(''); setMessage('')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) { setError('로그인 정보가 만료되었습니다. 다시 로그인해주세요.'); setSaving(null); return }
    try {
      const response = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action, userId: user.user_id, ...(action === 'reset_password' ? { password: newPassword } : {}) }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || '계정 관리 요청에 실패했습니다.')
      setMessage(action === 'delete_user' ? `${user.full_name || user.email} 계정을 삭제했습니다.` : `${user.full_name || user.email}의 비밀번호를 변경했습니다.`)
      setPasswordUser(null); setNewPassword(''); await load()
    } catch (manageError) {
      setError(manageError instanceof Error ? manageError.message : '계정 관리에 실패했습니다.')
    } finally { setSaving(null) }
  }

  const activityByUser = new Map(activity.map((row) => [row.user_id, row]))
  const visibleUsers = users.filter((user) => `${user.full_name ?? ''} ${user.email} ${user.department ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (activityByUser.get(b.user_id)?.last_seen_at ?? '').localeCompare(activityByUser.get(a.user_id)?.last_seen_at ?? ''))
  if (!allowed) return <section className="admin-console"><h1>관리자 페이지</h1><p role="status">{loading ? '관리자 권한 확인 중...' : error}</p>{!loading && <button onClick={() => void load()}>다시 시도</button>}</section>

  return <section className="admin-console">
    <header><p>ADMINISTRATION</p><h1>관리자 페이지</h1><span>계정 승인, 최근 접속 기록과 팀원의 마지막 이용 구역을 확인합니다.</span></header>
    {error && <div className="admin-console__error" role="alert">{error}</div>}
    {message && <div className="admin-console__success" role="status">{message}</div>}
    <div className="admin-console__summary"><b>전체 {users.length}명</b><span>승인 대기 {users.filter((user) => user.status === 'pending').length}명</span><span>사용 중 {users.filter((user) => user.status === 'approved').length}명</span></div>
    <section className="admin-console__card">
      <div className="admin-console__card-title"><h2>팀원별 최근 접속</h2><button disabled={loading} onClick={() => void load()}>{loading ? '불러오는 중...' : '새로고침'}</button></div>
      <p className="admin-console__hint">마지막 이용 구역은 가장 최근에 연 메뉴 화면입니다. 시간은 한국 시간 기준이며, 기록 기능 적용 이후부터 수집됩니다.</p>
      <label className="admin-console__search">팀원 검색<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름 · 사번 · 부서" /></label>
      {activityError ? <p role="alert" className="admin-console__error">{activityError}</p> : <div className="admin-console__table-wrap"><table><thead><tr><th>팀원</th><th>부서</th><th>최근 로그인</th><th>마지막 이용 구역</th><th>최근 활동</th></tr></thead><tbody>
        {visibleUsers.map((user) => { const record = activityByUser.get(user.user_id); return <tr key={user.user_id}><td><b>{user.full_name || '이름 미입력'}</b><small>{user.email.replace('@wellyhilly.com', '')}</small></td><td>{user.department || '-'}</td><td>{formatTime(record?.last_login_at)}</td><td><b className="admin-console__section">{record ? activitySections[record.last_section_path] || record.last_section_path : '기록 없음'}</b></td><td>{formatTime(record?.last_seen_at)}</td></tr> })}
        {!visibleUsers.length && <tr><td colSpan={5}>검색 결과가 없습니다.</td></tr>}
      </tbody></table></div>}
    </section>
    <section className="admin-console__card">
      <div className="admin-console__card-title"><h2>최근 로그인 이력</h2><label>팀원 <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}><option value="">전체 팀원</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.full_name || user.email}</option>)}</select></label></div>
      <p className="admin-console__hint">전체 최근 100건 내에서 표시합니다. 새로고침과 자동 인증 갱신은 로그인 횟수에 중복 반영하지 않습니다.</p>
      {activityError ? <p className="admin-console__empty">접속 기록 설정 또는 연결을 확인해주세요.</p> : <div className="admin-console__table-wrap"><table><thead><tr><th>팀원</th><th>부서</th><th>로그인 시각</th></tr></thead><tbody>{logins.filter((row) => !selectedUser || row.user_id === selectedUser).map((row) => { const user = users.find((item) => item.user_id === row.user_id); return <tr key={row.session_id}><td><b>{user?.full_name || '이름 미입력'}</b><small>{user?.email.replace('@wellyhilly.com', '')}</small></td><td>{user?.department || '-'}</td><td>{formatTime(row.logged_in_at)}</td></tr> })}{!logins.some((row) => !selectedUser || row.user_id === selectedUser) && <tr><td colSpan={3}>아직 로그인 기록이 없습니다.</td></tr>}</tbody></table></div>}
    </section>
    <section className="admin-console__card"><div className="admin-console__card-title"><h2>사용자 관리</h2><button onClick={() => void load()}>새로고침</button></div><p className="admin-console__hint">복잡한 개별 권한 설정 없이 비밀번호 변경과 사용자 삭제를 바로 처리합니다.</p>{loading ? <p className="admin-console__empty">불러오는 중...</p> : <div className="admin-console__table-wrap"><table><thead><tr><th>사용자</th><th>부서</th><th>상태</th><th>권한</th><th>관리</th></tr></thead><tbody>{users.map((user) => <tr key={user.user_id}><td><b>{user.full_name || '이름 미입력'}</b><small>{user.email.replace('@wellyhilly.com', '')}</small></td><td>{user.department || '-'}</td><td><span className={`admin-status admin-status--${user.status}`}>{label[user.status]}</span></td><td><select value={user.role} onChange={(event) => void update(user, { role: event.target.value as AccessUser['role'] })} disabled={saving === user.user_id}><option value="member">일반 팀원</option><option value="admin">관리자</option></select></td><td><div className="admin-actions">{user.status !== 'approved' && <button onClick={() => void update(user, { status: 'approved' })} disabled={saving === user.user_id}>승인</button>}{user.status === 'approved' && <button className="admin-actions__pause" onClick={() => void update(user, { status: 'suspended' })} disabled={saving === user.user_id}>중지</button>}{user.status === 'suspended' && <button onClick={() => void update(user, { status: 'approved' })} disabled={saving === user.user_id}>재승인</button>}<button className="admin-actions__password" onClick={() => { setPasswordUser(passwordUser === user.user_id ? null : user.user_id); setNewPassword(''); setError(''); setMessage('') }} disabled={saving === user.user_id}>비밀번호 변경</button><button className="admin-actions__delete" onClick={() => void manageUser(user, 'delete_user')} disabled={saving === user.user_id}>삭제</button></div>{passwordUser === user.user_id && <form className="admin-password" onSubmit={(event) => { event.preventDefault(); void manageUser(user, 'reset_password') }}><label htmlFor={`password-${user.user_id}`}>새 비밀번호</label><input id={`password-${user.user_id}`} type="password" minLength={8} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="8자 이상 직접 입력" autoComplete="new-password" autoFocus /><button type="submit" disabled={saving === user.user_id}>{saving === user.user_id ? '변경 중...' : '이 비밀번호로 변경'}</button><button type="button" className="admin-password__cancel" onClick={() => { setPasswordUser(null); setNewPassword('') }}>취소</button></form>}</td></tr>)}</tbody></table></div>}</section>
    <section className="admin-console__card"><h2>최근 권한 변경</h2>{audit.length ? <ul className="admin-audit">{audit.map((item) => <li key={item.id}><b>{item.previous_status} · {item.previous_role}</b><span>→</span><b>{item.next_status} · {item.next_role}</b><time>{new Date(item.created_at).toLocaleString('ko-KR')}</time></li>)}</ul> : <p className="admin-console__empty">아직 변경 이력이 없습니다.</p>}</section>
  </section>
}
