import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, ListTodo, MessageCircle, Palmtree, Plus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './TeamWorkspace.css'

type View = 'calendar' | 'tracker'
type TaskStatus = 'todo' | 'in_progress' | 'done'

interface CalendarEvent { id: string; title: string; description?: string; start_at: string; end_at: string; all_day: boolean; color: string; assignee_names: string[]; created_by_name: string }
interface WorkTask { id: string; title: string; description?: string; status: TaskStatus; priority: 'low' | 'medium' | 'high'; due_date?: string; assignee_names: string[]; created_by_name: string; created_at: string }
interface TaskComment { id: string; task_id: string; content: string; author_name: string; created_at: string }

const colors = ['blue', 'purple', 'orange', 'green']
const statusLabels: Record<TaskStatus, string> = { todo: '할 일', in_progress: '진행 중', done: '완료' }
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDateTime = (date: Date) => `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const displayDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value))

export default function TeamWorkspace() {
  const [view, setView] = useState<View>('calendar')
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [composer, setComposer] = useState<'event' | 'leave' | 'task' | null>(null)
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const [eventResult, taskResult] = await Promise.all([
      supabase.from('team_calendar_events').select('*').order('start_at'),
      supabase.from('work_tasks').select('*').order('created_at', { ascending: false }),
    ])
    if (eventResult.error) setNotice('공유 기능을 사용하려면 Supabase 설정 SQL을 먼저 실행해 주세요.')
    else setEvents((eventResult.data ?? []) as CalendarEvent[])
    if (!taskResult.error) setTasks((taskResult.data ?? []) as WorkTask[])
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase.channel('team-workspace-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_calendar_events' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_tasks' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_task_comments' }, () => selectedTask && void loadComments(selectedTask.id))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, selectedTask?.id])

  const loadComments = async (taskId: string) => {
    const { data } = await supabase.from('work_task_comments').select('*').eq('task_id', taskId).order('created_at')
    setComments((data ?? []) as TaskComment[])
  }
  const openTask = async (task: WorkTask) => { setSelectedTask(task); await loadComments(task.id) }

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first); start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => { const day = new Date(start); day.setDate(start.getDate() + i); return day })
  }, [month])
  const eventByDay = useMemo(() => events.reduce<Record<string, CalendarEvent[]>>((map, event) => {
    const key = dateKey(new Date(event.start_at)); (map[key] ??= []).push(event); return map
  }, {}), [events])
  const myName = async () => {
    const { data } = await supabase.auth.getUser(); const user = data.user
    return { id: user?.id, name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '사용자', department: user?.user_metadata?.department || null }
  }

  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const owner = await myName()
    const start = String(form.get('start_at')); const end = String(form.get('end_at'))
    if (new Date(end) < new Date(start)) { setNotice('종료 일시는 시작 일시보다 빠를 수 없습니다.'); return }
    const isLeave = composer === 'leave'
    const leaveType = String(form.get('leave_type'))
    setIsSaving(true)
    const { error } = await supabase.from('team_calendar_events').insert({
      title: isLeave ? `[휴무 · ${leaveType}] ${owner.name}` : String(form.get('title')).trim(), description: String(form.get('description')).trim() || null, start_at: start,
      end_at: end, all_day: isLeave || form.get('all_day') === 'on', color: isLeave ? 'pink' : String(form.get('color')), assignee_names: isLeave ? [owner.name] : String(form.get('assignees')).split(',').map(v => v.trim()).filter(Boolean),
      created_by: owner.id, created_by_name: owner.name, department: owner.department,
    })
    setIsSaving(false); if (error) setNotice(`일정 저장에 실패했습니다: ${error.message}`); else { setComposer(null); setNotice(isLeave ? '개인 휴무 일정이 팀 캘린더에 공유되었습니다.' : '공유 일정이 저장되었습니다.'); await load() }
  }
  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const owner = await myName(); setIsSaving(true)
    const { error } = await supabase.from('work_tasks').insert({
      title: String(form.get('title')).trim(), description: String(form.get('description')).trim() || null, priority: String(form.get('priority')),
      due_date: String(form.get('due_date')) || null, assignee_names: String(form.get('assignees')).split(',').map(v => v.trim()).filter(Boolean),
      created_by: owner.id, created_by_name: owner.name, department: owner.department,
    })
    setIsSaving(false); if (error) setNotice(`업무 저장에 실패했습니다: ${error.message}`); else { setComposer(null); setNotice('업무가 팀 트래커에 등록되었습니다.'); await load() }
  }
  const moveTask = async (task: WorkTask, status: TaskStatus) => {
    const { error } = await supabase.from('work_tasks').update({ status, completed_at: status === 'done' ? new Date().toISOString() : null }).eq('id', task.id)
    if (error) setNotice(`상태 변경에 실패했습니다: ${error.message}`); else await load()
  }
  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedTask) return; const form = new FormData(event.currentTarget); const content = String(form.get('comment')).trim(); if (!content) return
    const owner = await myName(); const { error } = await supabase.from('work_task_comments').insert({ task_id: selectedTask.id, content, author_id: owner.id, author_name: owner.name })
    if (!error) { event.currentTarget.reset(); await loadComments(selectedTask.id) }
  }

  return <div className="team-workspace animate-fade-in">
    <header className="team-workspace-header"><div><p className="workspace-eyebrow"><Users size={15} /> TEAM WORKSPACE</p><h1>공유 스케줄 · 업무 트래커</h1><p>팀 일정과 담당 업무를 공유하고, 개인 휴무 일정도 함께 확인합니다.</p></div><div className="workspace-header-actions">{view === 'calendar' ? <><button className="workspace-secondary" onClick={() => setComposer('leave')}><Palmtree size={17} /> 개인 휴무 등록</button><button className="workspace-primary" onClick={() => setComposer('event')}><Plus size={18} /> 일정 등록</button></> : <button className="workspace-primary" onClick={() => setComposer('task')}><Plus size={18} /> 업무 등록</button>}</div></header>
    <div className="workspace-tabs"><button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={17} />공유 스케줄</button><button className={view === 'tracker' ? 'active' : ''} onClick={() => setView('tracker')}><ListTodo size={17} />업무 트래커 <span>{tasks.filter(t => t.status !== 'done').length}</span></button></div>
    {notice && <div className="workspace-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    {view === 'calendar' ? <section className="calendar-panel"><div className="calendar-toolbar"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={19} /></button><strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={19} /></button><button className="today-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>오늘</button></div><div className="calendar-grid calendar-weekdays">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid calendar-days">{days.map(day => { const key = dateKey(day); const today = key === dateKey(new Date()); return <div className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'other-month' : ''} ${today ? 'today' : ''}`} key={key}><time>{day.getDate()}</time>{(eventByDay[key] ?? []).slice(0, 3).map(item => <button key={item.id} title={item.description} className={`calendar-event ${item.color}`}><span>{item.all_day ? '종일' : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.start_at))}</span>{item.title}</button>)}{(eventByDay[key]?.length ?? 0) > 3 && <small>+{eventByDay[key].length - 3}개 일정</small>}</div> })}</div></section> : <section className="tracker-board">{(['todo', 'in_progress', 'done'] as TaskStatus[]).map(status => <div className="task-column" key={status}><header><h2>{statusLabels[status]}</h2><span>{tasks.filter(task => task.status === status).length}</span></header><div className="task-list">{tasks.filter(task => task.status === status).map(task => <article className="task-card" key={task.id} onClick={() => void openTask(task)}><div className="task-card-top"><span className={`priority ${task.priority}`}>{task.priority === 'high' ? '높음' : task.priority === 'low' ? '낮음' : '보통'}</span>{task.status !== 'done' && <button title="다음 상태로" onClick={e => { e.stopPropagation(); void moveTask(task, status === 'todo' ? 'in_progress' : 'done') }}><Check size={15} /></button>}</div><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<footer>{task.due_date ? <span className={new Date(`${task.due_date}T23:59:59`) < new Date() ? 'overdue' : ''}>마감 {displayDate(task.due_date)}</span> : <span>마감일 없음</span>}{task.assignee_names?.length > 0 && <span>👤 {task.assignee_names.join(', ')}</span>}</footer></article>)}{tasks.filter(task => task.status === status).length === 0 && <p className="empty-column">등록된 업무가 없습니다.</p>}</div></div>)}</section>}
    {composer && <div className="workspace-modal-backdrop" onMouseDown={() => setComposer(null)}><form className="workspace-modal" onSubmit={composer === 'task' ? saveTask : saveEvent} onMouseDown={e => e.stopPropagation()}><header><h2>{composer === 'event' ? '공유 일정 등록' : composer === 'leave' ? '개인 휴무 등록' : '업무 등록'}</h2><button type="button" onClick={() => setComposer(null)}>×</button></header>{composer === 'leave' && <p className="leave-help">등록한 휴무 일정은 팀 캘린더에 이름과 함께 표시됩니다.</p>}{composer === 'leave' && <label>휴무 유형<select name="leave_type"><option value="연차">연차</option><option value="반차">반차</option><option value="대체휴무">대체휴무</option><option value="기타 휴무">기타 휴무</option></select></label>}<label>{composer === 'leave' ? '참고 제목' : '제목'}<input name="title" required placeholder={composer === 'event' ? '예: 9월 판촉 회의' : composer === 'leave' ? '예: 오후 휴무' : '예: 추석 패키지 안내문 검토'} autoFocus /></label>{composer !== 'task' ? <><div className="two-fields"><label>시작<input name="start_at" type="datetime-local" defaultValue={localDateTime(new Date())} required /></label><label>종료<input name="end_at" type="datetime-local" defaultValue={localDateTime(new Date(Date.now() + 3600000))} required /></label></div>{composer === 'event' && <><label className="check-label"><input name="all_day" type="checkbox" /> 종일 일정</label><label>색상<select name="color">{colors.map(color => <option key={color} value={color}>{color === 'blue' ? '파랑' : color === 'purple' ? '보라' : color === 'orange' ? '주황' : '초록'}</option>)}</select></label></>}</> : <><div className="two-fields"><label>마감일<input name="due_date" type="date" /></label><label>우선순위<select name="priority"><option value="medium">보통</option><option value="high">높음</option><option value="low">낮음</option></select></label></div></>}<label>담당자 <small>{composer === 'leave' ? '휴무 등록자는 자동 반영됩니다.' : '쉼표로 구분'}</small><input name="assignees" disabled={composer === 'leave'} placeholder={composer === 'leave' ? '등록자 자동 반영' : '예: 김영업, 이기획'} /></label><label>내용<textarea name="description" rows={4} placeholder={composer === 'leave' ? '인수인계나 팀에 공유할 참고사항을 적어주세요.' : '팀원이 알아야 할 업무 내용과 참고사항을 적어주세요.'} /></label><button className="workspace-primary" disabled={isSaving}>{isSaving ? '저장 중...' : composer === 'leave' ? '휴무 일정 공유하기' : '팀에 공유하기'}</button></form></div>}
    {selectedTask && <div className="workspace-modal-backdrop" onMouseDown={() => setSelectedTask(null)}><section className="workspace-modal task-detail" onMouseDown={e => e.stopPropagation()}><header><div><span className={`priority ${selectedTask.priority}`}>{selectedTask.priority === 'high' ? '높음' : selectedTask.priority === 'low' ? '낮음' : '보통'}</span><h2>{selectedTask.title}</h2></div><button onClick={() => setSelectedTask(null)}>×</button></header><p className="detail-description">{selectedTask.description || '등록된 상세 내용이 없습니다.'}</p><div className="detail-meta"><span>{statusLabels[selectedTask.status]}</span><span>{selectedTask.due_date ? `마감 ${displayDate(selectedTask.due_date)}` : '마감일 없음'}</span><span>담당 {selectedTask.assignee_names?.join(', ') || '미정'}</span></div><div className="comment-section"><h3><MessageCircle size={16} /> 진행 공유</h3>{comments.map(comment => <article key={comment.id}><strong>{comment.author_name}</strong><span>{new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(comment.created_at))}</span><p>{comment.content}</p></article>)}<form onSubmit={addComment}><input name="comment" placeholder="진행 상황이나 요청 사항을 남겨주세요." /><button type="submit">등록</button></form></div></section></div>}
  </div>
}
