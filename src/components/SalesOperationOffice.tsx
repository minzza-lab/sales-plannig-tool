import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Play, Settings2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SalesOperationOffice.css'

type TaskStatus = 'todo' | 'in_progress' | 'done'
type OfficeTone = 'teal' | 'blue' | 'amber' | 'violet'
type DepartmentKey = 'analysis' | 'planning' | 'design' | 'video' | 'sns' | 'operations'
type WorkTask = { id: string; title: string; status: TaskStatus }

type OfficePreferences = { title: string; tone: OfficeTone; compact: boolean; visible: Record<DepartmentKey, boolean> }
type Props = { syncState: 'idle' | 'running' | 'completed' | 'failed'; syncProgress: number; hasSnapshot: boolean; onSync: () => void }

const preferenceKey = 'sales-pixel-office-preferences-v1'
const defaultPreferences: OfficePreferences = { title: '세일즈 운영실', tone: 'teal', compact: false, visible: { analysis: true, planning: true, design: true, video: true, sns: true, operations: true } }

const departments: Array<{ key: DepartmentKey; label: string; code: string; path: string; match: RegExp }> = [
  { key: 'analysis', label: '분석실', code: 'DATA LAB', path: '/tools/package-sales', match: /매출|판매|객실|패키지|정산|시즌권|분석/i },
  { key: 'planning', label: '상품 기획실', code: 'PLAN DESK', path: '/tools/product-proposals', match: /상품|기획|제안|캠페인|프로모션/i },
  { key: 'design', label: '디자인실', code: 'DESIGN', path: '/tools/thumbnail-generator', match: /디자인|썸네일|배너|이미지|카드/i },
  { key: 'video', label: '미디어실', code: 'MEDIA', path: '/ai-studio', match: /영상|릴스|reels|tts|음성|콘티/i },
  { key: 'sns', label: 'SNS 데스크', code: 'SOCIAL', path: '/tools/field-sketch', match: /sns|인스타|instagram|게시|콘텐츠|블로그/i },
  { key: 'operations', label: '운영실', code: 'OPS', path: '/tools/team-workspace', match: /동기화|수집|크롤러|운영|자동화/i },
]

function normalizePreferences(value: unknown): OfficePreferences {
  if (!value || typeof value !== 'object') return defaultPreferences
  const candidate = value as Partial<OfficePreferences>
  const tone = ['teal', 'blue', 'amber', 'violet'].includes(String(candidate.tone)) ? candidate.tone as OfficeTone : defaultPreferences.tone
  return { title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.slice(0, 28) : defaultPreferences.title, tone, compact: Boolean(candidate.compact), visible: { ...defaultPreferences.visible, ...(candidate.visible || {}) } }
}

function taskStatusFor(tasks: WorkTask[], department: DepartmentKey): TaskStatus {
  const match = departments.find((item) => item.key === department)!.match
  const matching = tasks.filter((task) => match.test(task.title))
  if (matching.some((task) => task.status === 'in_progress')) return 'in_progress'
  if (matching.some((task) => task.status === 'todo')) return 'todo'
  return 'done'
}

function PixelStaff({ name, className, carrying = false }: { name: string; className: string; carrying?: boolean }) {
  return <div className={`pixel-staff ${className}`} title={name} aria-label={name}><i className="pixel-hair" /><i className="pixel-head"><b /><b /></i><i className="pixel-body" />{carrying ? <i className="pixel-box" /> : null}<i className="pixel-leg left" /><i className="pixel-leg right" /></div>
}

export default function SalesOperationOffice({ syncState, syncProgress, hasSnapshot, onSync }: Props) {
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [taskSourceReady, setTaskSourceReady] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [preferences, setPreferences] = useState<OfficePreferences>(() => { try { return normalizePreferences(JSON.parse(localStorage.getItem(preferenceKey) || 'null')) } catch { return defaultPreferences } })
  const collecting = syncState === 'running'

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase.from('work_tasks').select('id,title,status').order('created_at', { ascending: false }).limit(80)
    if (error) { setTaskSourceReady(false); return }
    setTaskSourceReady(true)
    setTasks((data || []).filter((task): task is WorkTask => ['todo', 'in_progress', 'done'].includes(String(task.status))))
  }, [])

  useEffect(() => {
    void loadTasks()
    const channel = supabase.channel('sales-pixel-office').on('postgres_changes', { event: '*', schema: 'public', table: 'work_tasks' }, () => void loadTasks()).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadTasks])
  useEffect(() => { localStorage.setItem(preferenceKey, JSON.stringify(preferences)) }, [preferences])

  const visibleDepartments = useMemo(() => departments.filter((department) => preferences.visible[department.key]), [preferences.visible])
  const updatePreferences = (patch: Partial<OfficePreferences>) => setPreferences((current) => ({ ...current, ...patch }))
  const toggleDepartment = (key: DepartmentKey) => setPreferences((current) => ({ ...current, visible: { ...current.visible, [key]: !current.visible[key] } }))
  const missionText = collecting ? `현장 자료 수집 중 · ${syncProgress}%` : syncState === 'completed' ? '자료 수집 완료 · 분석실 전달' : syncState === 'failed' ? '수집 확인 필요 · 운영실 알림' : hasSnapshot ? '오늘의 데이터 대기 중' : '데이터를 불러오는 중'

  return <section className={`sales-office pixel-office pixel-office-${preferences.tone} ${preferences.compact ? 'is-compact' : ''}`} aria-label="세일즈 운영실">
    <div className="sales-office-head">
      <div><p>LIVE PIXEL WORKFLOW</p><h2>{preferences.title}</h2><span>실제 업무 상태를 따라 직원들이 움직입니다.</span></div>
      <button type="button" className="sales-office-settings" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}><Settings2 size={16} /> 화면 설정 <ChevronDown size={14} /></button>
    </div>

    {settingsOpen ? <div className="sales-office-customizer">
      <label>관제실 이름<input value={preferences.title} maxLength={28} onChange={(event) => updatePreferences({ title: event.target.value })} /></label>
      <fieldset><legend>강조 색상</legend><div className="office-tone-options">{(['teal', 'blue', 'amber', 'violet'] as OfficeTone[]).map((tone) => <button type="button" key={tone} className={preferences.tone === tone ? 'selected' : ''} onClick={() => updatePreferences({ tone })}>{tone === 'teal' ? '청록' : tone === 'blue' ? '블루' : tone === 'amber' ? '앰버' : '바이올렛'}</button>)}</div></fieldset>
      <fieldset><legend>표시할 부서</legend><div className="office-department-toggles">{departments.map((department) => <label key={department.key}><input type="checkbox" checked={preferences.visible[department.key]} onChange={() => toggleDepartment(department.key)} /> {department.label}</label>)}</div></fieldset>
      <label className="office-compact-toggle"><input type="checkbox" checked={preferences.compact} onChange={(event) => updatePreferences({ compact: event.target.checked })} /> 간단히 보기</label>
    </div> : null}

    <div className="pixel-command-bar"><div className={`pixel-mission ${syncState}`}><i /> <strong>{missionText}</strong><span>{taskSourceReady ? '업무 트래커 연결됨' : '업무 트래커 연결 필요'}</span></div><button type="button" onClick={onSync} disabled={collecting}><Play size={14} /> {collecting ? '자료 수집 중' : '매출 동기화 명령'}</button></div>

    <div className="pixel-office-world">
      <div className="pixel-sky"><span className="pixel-cloud cloud-one" /><span className="pixel-cloud cloud-two" /></div>
      <div className="pixel-site site-water"><b>워터파크</b><i>W</i></div><div className="pixel-site site-room"><b>객실</b><i>R</i></div><div className="pixel-site site-sports"><b>스포츠</b><i>S</i></div>
      <div className="pixel-road"><i /><i /><i /><i /></div>
      <div className="pixel-building">
        <div className="pixel-building-sign">SALES OPERATION OFFICE</div>
        <div className="pixel-rooms">
          {visibleDepartments.map((department, index) => {
            const relatedTasks = tasks.filter((task) => department.match.test(task.title))
            const status = taskStatusFor(tasks, department.key)
            const currentTask = relatedTasks.find((task) => task.status !== 'done') || relatedTasks[0]
            return <Link to={department.path} key={department.key} className={`pixel-room room-${department.key} ${status}`} style={{ '--room-index': index } as CSSProperties}>
              <span className="pixel-room-label"><b>{department.label}</b><small>{department.code}</small><i /></span>
              <span className="pixel-desk"><i /><b /></span><span className="pixel-plant" />
              <p>{currentTask?.title || (taskSourceReady ? '새 업무를 기다리는 중' : '업무 상태를 연결해주세요.')}</p><em>{status === 'in_progress' ? '작업 중' : status === 'todo' ? '검토 대기' : relatedTasks.length ? '완료' : '대기'}</em>
            </Link>
          })}
        </div>
      </div>
      <PixelStaff name="분석 담당" className={`staff-analyst ${collecting ? 'processing' : ''}`} carrying={syncState === 'completed'} />
      <PixelStaff name="워터파크 수집 담당" className={`staff-water ${collecting ? 'on-mission' : syncState === 'completed' ? 'returning' : ''}`} carrying={collecting || syncState === 'completed'} />
      <PixelStaff name="객실 수집 담당" className={`staff-room ${collecting ? 'on-mission' : syncState === 'completed' ? 'returning' : ''}`} carrying={collecting || syncState === 'completed'} />
      <PixelStaff name="스포츠 수집 담당" className={`staff-sports ${collecting ? 'on-mission' : syncState === 'completed' ? 'returning' : ''}`} carrying={collecting || syncState === 'completed'} />
      <PixelStaff name="운영 매니저" className={`staff-ops ${collecting ? 'processing' : ''}`} />
      {visibleDepartments.length === 0 ? <p className="office-empty">화면 설정에서 표시할 부서를 선택해주세요.</p> : null}
    </div>
    <footer>동기화 명령을 내리면 현장 수집 담당 3명이 출발하고, 완료된 자료는 분석실로 복귀합니다. 각 방을 누르면 해당 도구로 이동합니다.</footer>
  </section>
}
