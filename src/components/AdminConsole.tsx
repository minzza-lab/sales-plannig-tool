import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './AdminConsole.css'

type AccessUser = { user_id: string; email: string; full_name: string | null; department: string | null; role: 'admin' | 'member'; status: 'pending' | 'approved' | 'suspended'; created_at: string; approved_at: string | null }
type AuditRow = { id: number; target_user_id: string; previous_role: string; previous_status: string; next_role: string; next_status: string; created_at: string }

const label: Record<AccessUser['status'], string> = { pending: '승인 대기', approved: '사용 중', suspended: '사용 중지' }

export default function AdminConsole() {
  const [users, setUsers] = useState<AccessUser[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    const [userResult, auditResult] = await Promise.all([
      supabase.from('app_user_access').select('*').order('created_at', { ascending: false }),
      supabase.from('app_access_audit').select('*').order('created_at', { ascending: false }).limit(12),
    ])
    if (userResult.error) setError(userResult.error.code === '42P01' ? '보안 설정이 아직 적용되지 않았습니다. 관리자에게 설정 SQL 실행을 요청해주세요.' : '관리자 권한이 없거나 정보를 불러오지 못했습니다.')
    else { setUsers(userResult.data as AccessUser[]); setAudit((auditResult.data ?? []) as AuditRow[]) }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const update = async (user: AccessUser, change: Partial<Pick<AccessUser, 'role' | 'status'>>) => {
    setSaving(user.user_id); setError('')
    const next = { ...change, approved_at: change.status === 'approved' && !user.approved_at ? new Date().toISOString() : user.approved_at }
    const { error: updateError } = await supabase.from('app_user_access').update(next).eq('user_id', user.user_id)
    if (updateError) setError('권한 변경에 실패했습니다. 관리자 권한을 다시 확인해주세요.')
    await load(); setSaving(null)
  }

  return <section className="admin-console">
    <header><p>ADMINISTRATION</p><h1>관리자 페이지</h1><span>계정 승인과 이용 권한을 관리합니다.</span></header>
    {error && <div className="admin-console__error">{error}</div>}
    <div className="admin-console__summary"><b>전체 {users.length}명</b><span>승인 대기 {users.filter((user) => user.status === 'pending').length}명</span><span>사용 중 {users.filter((user) => user.status === 'approved').length}명</span></div>
    <section className="admin-console__card"><div className="admin-console__card-title"><h2>사용자 승인</h2><button onClick={() => void load()}>새로고침</button></div>{loading ? <p className="admin-console__empty">불러오는 중...</p> : <div className="admin-console__table-wrap"><table><thead><tr><th>사용자</th><th>부서</th><th>상태</th><th>권한</th><th>관리</th></tr></thead><tbody>{users.map((user) => <tr key={user.user_id}><td><b>{user.full_name || '이름 미입력'}</b><small>{user.email.replace('@wellyhilly.com', '')}</small></td><td>{user.department || '-'}</td><td><span className={`admin-status admin-status--${user.status}`}>{label[user.status]}</span></td><td><select value={user.role} onChange={(event) => void update(user, { role: event.target.value as AccessUser['role'] })} disabled={saving === user.user_id}><option value="member">일반 팀원</option><option value="admin">관리자</option></select></td><td><div className="admin-actions">{user.status !== 'approved' && <button onClick={() => void update(user, { status: 'approved' })} disabled={saving === user.user_id}>승인</button>}{user.status === 'approved' && <button className="admin-actions__pause" onClick={() => void update(user, { status: 'suspended' })} disabled={saving === user.user_id}>중지</button>}{user.status === 'suspended' && <button onClick={() => void update(user, { status: 'approved' })} disabled={saving === user.user_id}>재승인</button>}</div></td></tr>)}</tbody></table></div>}</section>
    <section className="admin-console__card"><h2>최근 권한 변경</h2>{audit.length ? <ul className="admin-audit">{audit.map((item) => <li key={item.id}><b>{item.previous_status} · {item.previous_role}</b><span>→</span><b>{item.next_status} · {item.next_role}</b><time>{new Date(item.created_at).toLocaleString('ko-KR')}</time></li>)}</ul> : <p className="admin-console__empty">아직 변경 이력이 없습니다.</p>}</section>
  </section>
}
