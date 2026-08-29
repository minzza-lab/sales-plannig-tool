import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Play, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { callGeminiWithFallback } from '../utils/apiProxy'
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
export type InvestigationPlan = { departments: string[]; labels: string[] }
export type ProposalRequest = { name: string; role: string; department: string; instruction: string; participantLabels: string[] }
export type MeetingReport = { title: string; summary: string; discussion: Array<{ team: string; detail: string }>; actions: string[]; checks: string[] }
type Props = { syncState: 'idle' | 'running' | 'completed' | 'failed'; syncProgress: number; hasSnapshot: boolean; salesContext: string; onSync: () => void }

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

function planInvestigation(instruction: string, requestedDepartment: string): InvestigationPlan {
  const text = instruction.toLowerCase()
  const labelByDepartment: Record<string, string> = { research: '워터파크 수집', brand: '객실 수집', strategy1: '스포츠 수집', qa: '데이터 검수', strategy2: '상품 기획', reels: '영상 제작', carousel: '디자인', partner: 'SNS', finance: '정산', review: '성과 분석', ops: '자동화 운영', secretary: '운영 지원' }
  const createPlan = (...ids: string[]) => {
    const departments = [...new Set([requestedDepartment, ...ids])]
    return { departments, labels: departments.map((department) => labelByDepartment[department] || '세일즈 운영') }
  }
  if (/전년|전월|동월|증감|비교|매출|실적|판매|추이/.test(text)) return createPlan('research', 'brand', 'strategy1', 'review')
  if (/상품|패키지|기획|구성|프로모션|가격/.test(text)) return createPlan('strategy2', 'review', 'finance')
  if (/디자인|배너|썸네일|이미지|카드/.test(text)) return createPlan('carousel', 'strategy2', 'partner')
  if (/영상|릴스|콘티|음성|촬영/.test(text)) return createPlan('reels', 'strategy2', 'partner')
  if (/sns|인스타|콘텐츠|게시|블로그/.test(text)) return createPlan('partner', 'strategy2', 'carousel')
  if (/정산|취소|결제|입금/.test(text)) return createPlan('finance', 'review', 'qa')
  return createPlan('review', 'secretary')
}

function normalizePreferences(value: unknown): OfficePreferences {
  if (!value || typeof value !== 'object') return defaultPreferences
  const candidate = value as Partial<OfficePreferences>
  const tone = ['teal', 'blue', 'amber', 'violet'].includes(String(candidate.tone)) ? candidate.tone as OfficeTone : defaultPreferences.tone
  const storedStaff = candidate.staff && typeof candidate.staff === 'object' ? candidate.staff as Partial<Record<StaffId, Partial<StaffStyle>>> : {}
  const staff = Object.fromEntries((Object.keys(defaultStaff) as StaffId[]).map((id) => [id, { ...defaultStaff[id], ...storedStaff[id], name: typeof storedStaff[id]?.name === 'string' && storedStaff[id]!.name!.trim() ? storedStaff[id]!.name!.slice(0, 12) : defaultStaff[id].name }])) as Record<StaffId, StaffStyle>
  return { title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.slice(0, 28) : defaultPreferences.title, tone, compact: Boolean(candidate.compact), visible: { ...defaultPreferences.visible, ...(candidate.visible || {}) }, staff }
}

export default function SalesOperationOffice({ syncState, syncProgress, hasSnapshot, salesContext, onSync }: Props) {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<WorkTask[]>([])
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
  const askForProposal = async ({ name, role, department, instruction, participantLabels }: ProposalRequest): Promise<MeetingReport> => {
    const workContext = tasks.slice(0, 12).map((task) => `- [${task.status}] ${task.title}`).join('\n') || '- 등록된 공유 업무 없음'
    const prompt = `당신은 세일즈 운영실의 ${name}(${role})입니다. 사용자 지시에 따라 관련 담당과 회의한 뒤, 바로 실행할 수 있는 상세 보고를 작성합니다. 아래의 현재 대시보드 정보와 공유 업무만 근거로 쓰세요. 수치·완료 사실·외부 발송 결과를 지어내지 마세요. 정보가 없으면 '확인 필요'로 명확히 표기하세요. 제목만 쓰거나 한 줄로 끝내면 안 됩니다.\n\n[사용자 업무 지시]\n${instruction}\n\n[회의 참석 담당]\n${participantLabels.join(', ')}\n\n[담당 부서 ID]\n${department}\n\n[현재 대시보드]\n${salesContext}\n\n[공유 업무]\n${workContext}\n\n아래 JSON만 반환하세요. 각 배열은 비어 있으면 안 됩니다. discussion은 참석 담당별로 최소 1개, actions는 4개 이상, checks는 3개 이상 작성하세요.\n{"title":"구체적인 회의 결과 제목","summary":"현재 확인 가능한 사실과 이번 회의 결론을 2~3문장으로","discussion":[{"team":"참석 담당명","detail":"해당 담당이 확인한 범위와 다음 전달 내용"}],"actions":["순서가 있는 실행 항목"],"checks":["수치나 자료 확인이 필요한 항목"]}`
    const parseReport = (raw: string): MeetingReport | null => {
      try {
        const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as Partial<MeetingReport>
        if (typeof parsed.title === 'string' && typeof parsed.summary === 'string' && Array.isArray(parsed.discussion) && Array.isArray(parsed.actions) && Array.isArray(parsed.checks)) {
        const discussion = parsed.discussion.filter((item): item is { team: string; detail: string } => Boolean(item && typeof item.team === 'string' && typeof item.detail === 'string'))
        const actions = parsed.actions.filter((item): item is string => typeof item === 'string')
        const checks = parsed.checks.filter((item): item is string => typeof item === 'string')
          if (!discussion.length || actions.length < 4 || checks.length < 3) return null
        return {
          title: parsed.title,
          summary: parsed.summary,
          discussion,
          actions,
          checks,
        }
      }
      } catch { return null }
      return null
    }
    const config = { responseMimeType: 'application/json', temperature: 0.25, maxOutputTokens: 1300 }
    const first = await callGeminiWithFallback([{ text: prompt }], ['gemini-2.5-flash', 'gemini-2.5-pro'], config)
    const initialReport = parseReport(first)
    if (initialReport) return initialReport

    const repaired = await callGeminiWithFallback([{ text: `방금 응답은 상세 보고서가 아니었습니다. 아래 초안을 버리고, 누락 없이 지정 JSON만 다시 작성하세요. 제목 한 줄이나 설명문은 금지입니다.\n\n[업무 지시]\n${instruction}\n\n[참석 담당]\n${participantLabels.join(', ')}\n\n[대시보드 정보]\n${salesContext}\n\n[형식]\n{"title":"...","summary":"2~3문장","discussion":[{"team":"...","detail":"..."}],"actions":["...","...","...","..."],"checks":["...","...","..."]}` }], ['gemini-2.5-flash', 'gemini-2.5-pro'], config)
    const repairedReport = parseReport(repaired)
    if (repairedReport) return repairedReport
    throw new Error('AI가 상세 보고서 형식으로 응답하지 않았습니다. 잠시 후 다시 요청해주세요.')
  }

  return <section className={`sales-office pixel-office pixel-office-${preferences.tone} ${preferences.compact ? 'is-compact' : ''}`} aria-label="세일즈 픽셀 운영실">
    <header className="sales-office-head"><div><p>LIVE SALES OFFICE</p><h2>{preferences.title}</h2></div><button type="button" className="sales-office-settings" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}><Settings2 size={16} /> 화면 설정 <ChevronDown size={14} /></button></header>
    {settingsOpen ? <div className="sales-office-customizer"><label>관제실 이름<input value={preferences.title} maxLength={28} onChange={(event) => updatePreferences({ title: event.target.value })} /></label><fieldset><legend>강조 색상</legend><div className="office-tone-options">{(['teal', 'blue', 'amber', 'violet'] as OfficeTone[]).map((tone) => <button type="button" key={tone} className={preferences.tone === tone ? 'selected' : ''} onClick={() => updatePreferences({ tone })}>{tone === 'teal' ? '청록' : tone === 'blue' ? '블루' : tone === 'amber' ? '앰버' : '바이올렛'}</button>)}</div></fieldset><fieldset><legend>표시할 부서</legend><div className="office-department-toggles">{departments.map((department) => <label key={department.key}><input type="checkbox" checked={preferences.visible[department.key]} onChange={() => toggleDepartment(department.key)} /> {department.label}</label>)}</div></fieldset><label className="office-compact-toggle"><input type="checkbox" checked={preferences.compact} onChange={(event) => updatePreferences({ compact: event.target.checked })} /> 간단히 보기</label><fieldset className="office-staff-editor"><legend>직원 설정</legend>{(Object.keys(defaultStaff) as StaffId[]).map((id) => <div key={id}><span>{id === 'ops' ? '운영' : id === 'data' ? '분석' : id === 'water' ? '워터파크' : id === 'stay' ? '객실' : id === 'sports' ? '스포츠' : '기획'}</span><input value={preferences.staff[id].name} maxLength={12} aria-label={`${preferences.staff[id].name} 이름`} onChange={(event) => updateStaff(id, { name: event.target.value })} /><select value={preferences.staff[id].outfit} aria-label={`${preferences.staff[id].name} 복장`} onChange={(event) => updateStaff(id, { outfit: event.target.value })}><option value="#5d72d6">블루</option><option value="#3c9f91">청록</option><option value="#e0a53a">앰버</option><option value="#8a68c9">바이올렛</option><option value="#d18b4a">오렌지</option></select><select value={preferences.staff[id].hair} aria-label={`${preferences.staff[id].name} 헤어`} onChange={(event) => updateStaff(id, { hair: event.target.value as StaffStyle['hair'] })}><option value="short">숏컷</option><option value="wave">웨이브</option><option value="cap">캡</option></select></div>)}</fieldset></div> : null}
    <div className="pixel-command-bar"><div className={`pixel-mission ${syncState}`}><i /><strong>{missionTitle}</strong><span>{taskSourceReady ? '공유 업무 트래커 연결됨' : '공유 업무 트래커 확인 필요'}</span></div><div className="office-command-input"><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runCommand() }} placeholder="명령 입력: 매출 동기화, 상품 기획, 영상 제작" /><button type="button" onClick={runCommand} disabled={collecting}><Play size={14} /> 실행</button></div></div>
    {commandResult ? <p className="office-command-result" role="status">{commandResult}</p> : null}
    <SalesOfficeWorld syncState={syncState} onAgentAction={(department) => runDepartment(department)} onPlanInvestigation={planInvestigation} onAskProposal={askForProposal} />
  </section>
}
