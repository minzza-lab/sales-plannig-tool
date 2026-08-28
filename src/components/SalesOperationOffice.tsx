import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronDown, Play, Settings2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SalesOperationOffice.css'

type TaskStatus = 'todo' | 'in_progress' | 'done'
type OfficeTone = 'teal' | 'blue' | 'amber' | 'violet'
type DepartmentKey = 'analysis' | 'planning' | 'design' | 'video' | 'sns' | 'operations'
type WorkTask = { id: string; title: string; status: TaskStatus }
type OfficePreferences = { title: string; tone: OfficeTone; compact: boolean; visible: Record<DepartmentKey, boolean> }
type Props = { syncState: 'idle' | 'running' | 'completed' | 'failed'; syncProgress: number; hasSnapshot: boolean; onSync: () => void }

const preferenceKey = 'sales-pixel-office-preferences-v2'
const defaultPreferences: OfficePreferences = { title: '세일즈 운영실', tone: 'teal', compact: false, visible: { analysis: true, planning: true, design: true, video: true, sns: true, operations: true } }
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
  return { title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.slice(0, 28) : defaultPreferences.title, tone, compact: Boolean(candidate.compact), visible: { ...defaultPreferences.visible, ...(candidate.visible || {}) } }
}

function Agent({ name, role, className, speech, tone, box = false }: { name: string; role: string; className: string; speech: string; tone: string; box?: boolean }) {
  return <div className={`office-agent ${className}`} style={{ '--agent-tone': tone } as CSSProperties}>
    <span className="agent-bubble">{speech}</span><span className="agent-tag"><b>{name}</b><i>{role}</i></span>
    <span className="agent-body"><i className="agent-shadow" /><i className="agent-leg left" /><i className="agent-leg right" /><i className="agent-torso" /><i className="agent-arm left" /><i className="agent-arm right" /><i className="agent-head"><b /><b /></i><i className="agent-hair" />{box ? <i className="agent-box" /> : null}</span>
  </div>
}

export default function SalesOperationOffice({ syncState, syncProgress, hasSnapshot, onSync }: Props) {
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [taskSourceReady, setTaskSourceReady] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  const activeDepartments = useMemo(() => departments.filter((department) => preferences.visible[department.key]), [preferences.visible])
  const activeTask = (department: DepartmentKey) => tasks.find((task) => departments.find((item) => item.key === department)!.match.test(task.title) && task.status !== 'done')
  const updatePreferences = (patch: Partial<OfficePreferences>) => setPreferences((current) => ({ ...current, ...patch }))
  const toggleDepartment = (key: DepartmentKey) => setPreferences((current) => ({ ...current, visible: { ...current.visible, [key]: !current.visible[key] } }))
  const missionTitle = collecting ? `현장 자료 수집 중 · ${syncProgress}%` : completed ? '자료 도착 · 분석실 전달 완료' : syncState === 'failed' ? '수집 확인 필요 · 운영실 알림' : hasSnapshot ? '오늘의 운영 현황' : '데이터를 준비하고 있습니다'

  return <section className={`sales-office pixel-office pixel-office-${preferences.tone} ${preferences.compact ? 'is-compact' : ''}`} aria-label="세일즈 픽셀 운영실">
    <header className="sales-office-head"><div><p>LIVE SALES OFFICE</p><h2>{preferences.title}</h2><span>업무 상태에 맞춰 직원들이 실제로 움직이는 운영 장면입니다.</span></div><button type="button" className="sales-office-settings" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}><Settings2 size={16} /> 화면 설정 <ChevronDown size={14} /></button></header>
    {settingsOpen ? <div className="sales-office-customizer"><label>관제실 이름<input value={preferences.title} maxLength={28} onChange={(event) => updatePreferences({ title: event.target.value })} /></label><fieldset><legend>강조 색상</legend><div className="office-tone-options">{(['teal', 'blue', 'amber', 'violet'] as OfficeTone[]).map((tone) => <button type="button" key={tone} className={preferences.tone === tone ? 'selected' : ''} onClick={() => updatePreferences({ tone })}>{tone === 'teal' ? '청록' : tone === 'blue' ? '블루' : tone === 'amber' ? '앰버' : '바이올렛'}</button>)}</div></fieldset><fieldset><legend>표시할 부서</legend><div className="office-department-toggles">{departments.map((department) => <label key={department.key}><input type="checkbox" checked={preferences.visible[department.key]} onChange={() => toggleDepartment(department.key)} /> {department.label}</label>)}</div></fieldset><label className="office-compact-toggle"><input type="checkbox" checked={preferences.compact} onChange={(event) => updatePreferences({ compact: event.target.checked })} /> 간단히 보기</label></div> : null}
    <div className="pixel-command-bar"><div className={`pixel-mission ${syncState}`}><i /><strong>{missionTitle}</strong><span>{taskSourceReady ? '공유 업무 트래커 연결됨' : '공유 업무 트래커 확인 필요'}</span></div><button type="button" onClick={onSync} disabled={collecting}><Play size={14} /> {collecting ? '직원들이 자료 수집 중' : '매출 동기화 명령'}</button></div>
    <div className={`office-world ${collecting ? 'mission-running' : ''} ${completed ? 'mission-complete' : ''}`}>
      <div className="world-grid" /><div className="world-window"><i /><i /><i /></div><div className="world-clock">10:24</div><div className="world-title">SALES OPS · FLOOR 01</div>
      <div className="office-room room-water"><b>워터파크</b><small>DATA PICKUP</small><i className="room-monitor" /><i className="room-shelf" /></div><div className="office-room room-stay"><b>객실</b><small>ROOM STATUS</small><i className="room-monitor" /><i className="room-bed" /></div><div className="office-room room-sports"><b>스포츠</b><small>SALES PICKUP</small><i className="room-monitor" /><i className="room-racket" /></div>
      <div className="office-room room-data"><b>분석실</b><small>DATA LAB</small><i className="room-monitor" /><i className="room-chart" /></div><div className="office-room room-work"><b>운영 데스크</b><small>CONTROL</small><i className="room-monitor" /><i className="room-plant" /></div><div className="office-room room-creative"><b>기획 · 콘텐츠</b><small>CREATIVE</small><i className="room-monitor" /><i className="room-board" /></div>
      <div className="office-route route-water" /><div className="office-route route-stay" /><div className="office-route route-sports" />
      <Agent name="민지" role="운영" className="agent-ops" tone="#5d72d6" speech={collecting ? '세 곳에 수집 요청 보냈어요.' : completed ? '동기화 결과를 확인할게요.' : '오늘도 운영 현황을 살펴볼까요?'} />
      <Agent name="도윤" role="분석" className="agent-data" tone="#3c9f91" speech={collecting ? '들어오는 자료를 정리 중이에요.' : completed ? '세 데이터, 분석 준비 완료!' : activeTask('analysis')?.title || '매출 데이터를 기다리고 있어요.'} />
      <Agent name="하린" role="수집" className="agent-water" tone="#2f9ebe" speech={collecting ? '워터파크 자료 찾고 올게요!' : completed ? '워터파크 자료 도착!' : '워터파크 데이터 대기 중'} box={collecting || completed} />
      <Agent name="준호" role="수집" className="agent-stay" tone="#e0a53a" speech={collecting ? '객실 현황 받아올게요!' : completed ? '객실 자료 도착!' : '객실 데이터 대기 중'} box={collecting || completed} />
      <Agent name="유진" role="수집" className="agent-sports" tone="#8a68c9" speech={collecting ? '스포츠 판매 자료 수집 중!' : completed ? '스포츠 자료 도착!' : '스포츠 데이터 대기 중'} box={collecting || completed} />
      <Agent name="소연" role="기획" className="agent-creative" tone="#d18b4a" speech={activeTask('planning')?.title || '다음 상품안을 정리하고 있어요.'} />
      <div className="office-feed"><b>LIVE LOG</b><span className={collecting ? 'live' : ''}>{collecting ? '● 현장 3곳 수집 진행' : completed ? '✓ 분석실 전달 완료' : '○ 동기화 명령 대기'}</span></div>{activeDepartments.length === 0 ? <p className="office-empty">화면 설정에서 표시할 부서를 선택해주세요.</p> : null}
    </div>
    <footer>동기화 명령을 내리면 각 현장 담당자의 말풍선과 이동 경로가 실시간으로 바뀝니다.</footer>
  </section>
}
