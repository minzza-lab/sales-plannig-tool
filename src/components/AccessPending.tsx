import { supabase } from '../lib/supabase'
import './AccessPending.css'

export default function AccessPending({ status }: { status: 'pending' | 'suspended' }) {
  const suspended = status === 'suspended'
  return <main className="access-pending"><section><p>SALES PLANNING</p><h1>{suspended ? '사용이 일시 중지되었습니다' : '관리자 승인 대기 중입니다'}</h1><span>{suspended ? '관리자에게 계정 상태를 문의해주세요.' : '계정이 승인되면 이 도구를 바로 이용할 수 있습니다.'}</span><button onClick={() => void supabase.auth.signOut()}>로그아웃</button></section></main>
}
