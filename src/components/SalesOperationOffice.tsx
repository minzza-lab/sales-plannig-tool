import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Play, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SalesOfficeWorld from './SalesOfficeWorld'
import './SalesOperationOffice.css'
import './SalesOperationOfficeMotion.css'

type TaskStatus = 'todo' | 'in_progress' | 'done'
type OfficeTone = 'teal' | 'blue' | 'amber' | 'violet'
type DepartmentKey = 'analysis' | 'planning' | 'design' | 'video' | 'sns' | 'operations'
type StaffId = 'ops' | 'data' | 'water' | 'stay' | 'sports' | 'creative'
type WorkTask = { id: string; title: string; status: TaskStatus }
type StaffStyle = { name: string; outfit: string; hair: 'short' | 'wave' | 'cap' }
type OfficePreferences = { title: string; tone: OfficeTone; compact: boolean; visible: Record<DepartmentKey, boolean>; staff: Record<StaffId, StaffStyle> }
type Props = { syncState: 'idle' | 'running' | 'completed' | 'failed'; syncProgress: number; hasSnapshot: boolean; onSync: () => void }

const preferenceKey = 'sales-pixel-office-preferences-v2'
const defaultStaff: Record<StaffId, StaffStyle> = {
  ops: { name: '운영 매니저', outfit: '#5d72d6', hair: 'short' }, data: { name: '분석 담당', outfit: '#3c9f91', hair: 'wave' }, water: { name: '워터파크 담당', outfit: '#2f9ebe', hair: 'cap' }, stay: { name: '객실 담당', outfit: '#e0a53a', hair: 'short' }, sports: { name: '스포츠 담당', outfit: '#8a68c9', hair: 'wave' }, creative: { name: '기획 담당', outfit: '#d18b4a', hair: 'cap' },
}
const defaultPreferences: OfficePreferences = { title: '세일즈 운영실', tone: 'teal', compact: false, visible: { analysis: true, planning: true, design: true, video: true, sns: true, operations: true }, staff: defaultStaff }
const departments: Array<{ key: DepartmentKey; label: string; match: RegExp }> = [
  { key: 'analysis', label: '분석실', match: /매출|판매|객실|패키지|정산|시즌권|분석/i },
  { key: 'planning', label: '상품 기획실', match: /상품|기획|제안|캠페인|프로모션/i },
  { key: 'design', label: '디자인실', match: /디자인|썸네일|배너|이미지|카드/i },
  { key: 'video', label: '미디어실', match: /영상|릴스|reels|tts|음성|콘티/i },
  { key: 'sns', label: 'SNS 데스크', match: /sns|인스타|instagram|게시|콘텐츠|블로그/i },
  { key: 'operations', label: '운영실', match: /동기화|수집|크롤러|운영|자동화/i },
]

function normalizePreferences(value: unknown): OfficePreferences {
  if (!value || typeof value !== 'object') return defaultPreferences
  const candidate = value as Partial<OfficePreferences>
  const tone = ['teal', 'blue', 'amber', 'violet'].includes(String(candidate.tone)) ? candidate.tone as OfficeTone : defaultPreferences.tone
  const storedStaff = candidate.staff && typeof candidate.staff === 'object' ? candidate.staff as Partial<Record<StaffId, Partial<StaffStyle>>> : {}
  const staff = Object.fromEntries((Object.keys(defaultStaff) as StaffId[]).map((id) => [id, { ...defaultStaff[id], ...storedStaff[id], name: typeof storedStaff[id]?.name === 'string' && storedStaff[id]!.name!.trim() ? storedStaff[id]!.name!.slice(0, 12) : defaultStaff[id].name }])) as Record<StaffId, StaffStyle>
  return { title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.slice(0, 28) : defaultPreferences.title, tone, compact: Boolean(candidate.compact), visible: { ...defaultPreferences.visible, ...(candidate.visible || {}) }, staff }
}

export default function SalesOperationOffice({ syncState, syncProgress, hasSnapshot, onSync }: Props) {
  const navigate = useNavigate()
  const [, setTasks] = useState<WorkTask[]>([])
  const [taskSourceReady, setTaskSourceReady] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [commandResult, setCommandResult] = useState('')
  const [preferences, setPreferences] = useState<OfficePreferences>(() => { try { return normalizePreferences(JSON.parse(localStorage.getItem(preferenceKey) || 'null')) } catch { return defaultPreferences } })
  const collecting = syncState === 'running'
  const completed = syncState === 'completed'

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase.from('work_tasks').select('id,title,status').order('created_at', { ascending: false }).limit(80)
    if (error) { setTaskSourceReady(false); return }
    setTaskSourceReady(true); setTasks((data || []).filter((task): task is WorkTask => ['todo', 'in_progress', 'done'].includes(String(task.status))))
  }, [])
  useEffect(() => { void loadTasks(); const channel = supabase.channel('sales-pixel-office').on('postgres_changes', { event: '*', schema: 'public', table: 'work_tasks' }, () => void loadTasks()).subscribe(); return () => { void supabase.removeChannel(channel) } }, [loadTasks])
  useEffect(() => { localStorage.setItem(preferenceKey, JSON.stringify(preferences)) }, [preferences])

  const updatePreferences = (patch: Partial<OfficePreferences>) => setPreferences((current) => ({ ...current, ...patch }))
  const toggleDepartment = (key: DepartmentKey) => setPreferences((current) => ({ ...current, visible: { ...current.visible, [key]: !current.visible[key] } }))
  const updateStaff = (id: StaffId, patch: Partial<StaffStyle>) => setPreferences((current) => ({ ...current, staff: { ...current.staff, [id]: { ...current.staff[id], ...patch } } }))
  const missionTitle = collecting ? `현장 자료 수집 중 · ${syncProgress}%` : completed ? '자료 도착 · 분석실 전달 완료' : syncState === 'failed' ? '수집 확인 필요 · 운영실 알림' : hasSnapshot ? '오늘의 운영 현황' : '데이터를 준비하고 있습니다'
  const runDepartment = (department: string, typedCommand?: string) => {
    if (['research', 'brand', 'strategy1'].includes(department)) { onSync(); setCommandResult('워터파크·객실·스포츠 최신 데이터 동기화를 시작했습니다.'); return }
    const destinations: Record<string, [string, string]> = { strategy2: ['/tools/product-proposals', '상품 기획 도구를 열었습니다.'], reels: ['/ai-studio', '영상 제작 도구를 열었습니다.'], carousel: ['/tools/thumbnail-generator', '디자인 도구를 열었습니다.'], partner: ['/tools/field-sketch', 'SNS 콘텐츠 도구를 열었습니다.'], finance: ['/tools/nicepay-settlement', '정산 도구를 열었습니다.'], review: ['/tools/package-sales', '성과 분석 도구를 열었습니다.'], ops: ['/tools/team-workspace', '운영 도구를 열었습니다.'], secretary: ['/tools/team-workspace', '공유 업무 공간을 열었습니다.'], qa: ['/tools/package-sales', '데이터 검토 화면을 열었습니다.'] }
    const [path, message] = destinations[department] || ['/tools/team-workspace', '공유 업무 공간을 열었습니다.']
    navigate(path); setCommandResult(typedCommand ? `${message} 필요한 내용을 입력한 뒤 실행해주세요.` : message)
  }
  const runCommand = () => {
    const text = command.trim().toLowerCase()
    if (!text) { setCommandResult('예: “매출 동기화”, “상품 기획”, “영상 제작”, “SNS 콘텐츠”'); return }
    if (/동기화|매출|워터|객실|스포츠/.test(text)) runDepartment('research', text)
    else if (/상품|기획|제안/.test(text)) runDepartment('strategy2', text)
    else if (/영상|릴스|미디어/.test(text)) runDepartment('reels', text)
    else if (/디자인|배너|썸네일/.test(text)) runDepartment('carousel', text)
    else if (/sns|인스타|콘텐츠/.test(text)) runDepartment('partner', text)
    else if (/정산|결제/.test(text)) runDepartment('finance', text)
    else setCommandResult('아직 연결되지 않은 명령입니다. “매출 동기화”, “상품 기획”, “영상 제작”, “디자인”, “SNS 콘텐츠”, “정산”을 사용할 수 있습니다.')
    setCommand('')
  }

  return <section className={`sales-office pixel-office pixel-office-${preferences.tone} ${preferences.compact ? 'is-compact' : ''}`} aria-label="세일즈 픽셀 운영실">
    <header className="sales-office-head"><div><p>LIVE SALES OFFICE</p><h2>{preferences.title}</h2><span>업무 상태에 맞춰 직원들이 실제로 움직이는 운영 장면입니다.</span></div><button type="button" className="sales-office-settings" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}><Settings2 size={16} /> 화면 설정 <ChevronDown size={14} /></button></header>
    {settingsOpen ? <div className="sales-office-customizer"><label>관제실 이름<input value={preferences.title} maxLength={28} onChange={(event) => updatePreferences({ title: event.target.value })} /></label><fieldset><legend>강조 색상</legend><div className="office-tone-options">{(['teal', 'blue', 'amber', 'violet'] as OfficeTone[]).map((tone) => <button type="button" key={tone} className={preferences.tone === tone ? 'selected' : ''} onClick={() => updatePreferences({ tone })}>{tone === 'teal' ? '청록' : tone === 'blue' ? '블루' : tone === 'amber' ? '앰버' : '바이올렛'}</button>)}</div></fieldset><fieldset><legend>표시할 부서</legend><div className="office-department-toggles">{departments.map((department) => <label key={department.key}><input type="checkbox" checked={preferences.visible[department.key]} onChange={() => toggleDepartment(department.key)} /> {department.label}</label>)}</div></fieldset><label className="office-compact-toggle"><input type="checkbox" checked={preferences.compact} onChange={(event) => updatePreferences({ compact: event.target.checked })} /> 간단히 보기</label><fieldset className="office-staff-editor"><legend>직원 설정</legend>{(Object.keys(defaultStaff) as StaffId[]).map((id) => <div key={id}><span>{id === 'ops' ? '운영' : id === 'data' ? '분석' : id === 'water' ? '워터파크' : id === 'stay' ? '객실' : id === 'sports' ? '스포츠' : '기획'}</span><input value={preferences.staff[id].name} maxLength={12} aria-label={`${preferences.staff[id].name} 이름`} onChange={(event) => updateStaff(id, { name: event.target.value })} /><select value={preferences.staff[id].outfit} aria-label={`${preferences.staff[id].name} 복장`} onChange={(event) => updateStaff(id, { outfit: event.target.value })}><option value="#5d72d6">블루</option><option value="#3c9f91">청록</option><option value="#e0a53a">앰버</option><option value="#8a68c9">바이올렛</option><option value="#d18b4a">오렌지</option></select><select value={preferences.staff[id].hair} aria-label={`${preferences.staff[id].name} 헤어`} onChange={(event) => updateStaff(id, { hair: event.target.value as StaffStyle['hair'] })}><option value="short">숏컷</option><option value="wave">웨이브</option><option value="cap">캡</option></select></div>)}</fieldset></div> : null}
    <div className="pixel-command-bar"><div className={`pixel-mission ${syncState}`}><i /><strong>{missionTitle}</strong><span>{taskSourceReady ? '공유 업무 트래커 연결됨' : '공유 업무 트래커 확인 필요'}</span></div><div className="office-command-input"><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runCommand() }} placeholder="명령 입력: 매출 동기화, 상품 기획, 영상 제작" /><button type="button" onClick={runCommand} disabled={collecting}><Play size={14} /> 실행</button></div></div>
    {commandResult ? <p className="office-command-result" role="status">{commandResult}</p> : null}
    <SalesOfficeWorld syncState={syncState} onAgentAction={(department) => runDepartment(department)} />
  </section>
}
