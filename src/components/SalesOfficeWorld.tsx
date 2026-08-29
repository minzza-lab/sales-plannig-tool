import { useEffect, useMemo, useRef, useState } from 'react'
import OfficeWorld from './office-engine/OfficeWorld'
import { Company, type Agent } from './office-engine/sim'
import { roomOf } from './office-engine/world'
import type { InvestigationPlan, ProposalRequest } from './SalesOperationOffice'
import './office-engine/office-world.css'
import './SalesOfficeWorld.css'
import './SalesOfficeProposal.css'

export default function SalesOfficeWorld({ syncState, onAgentAction, onPlanInvestigation, onAskProposal }: { syncState: 'idle' | 'running' | 'completed' | 'failed'; onAgentAction: (department: string) => void; onPlanInvestigation: (instruction: string, requestedDepartment: string) => InvestigationPlan; onAskProposal: (request: ProposalRequest) => Promise<string> }) {
  const engine = useMemo(() => {
    const office = new Company()
    // 첫 동기화 전에도 빈 사무실이 아니라 상시 근무 장면을 보여준다.
    office.settleSalesSync()
    return office
  }, [])
  const [snapshot, setSnapshot] = useState(() => engine.snapshot())
  const [selected, setSelected] = useState<Agent | null>(null)
  const [proposal, setProposal] = useState('')
  const [proposalError, setProposalError] = useState('')
  const [proposalLoading, setProposalLoading] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [meetingFinished, setMeetingFinished] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const previous = useRef(syncState)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => { engine.tick((now - last) / 1000); last = now; setSnapshot(engine.snapshot()); frame = requestAnimationFrame(loop) }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [engine])
  useEffect(() => {
    if (syncState === 'running' && previous.current !== 'running') engine.beginSalesSync()
    if (syncState === 'completed' && previous.current === 'running') engine.settleSalesSync()
    if (syncState === 'failed' && previous.current === 'running') engine.settleSalesSync()
    previous.current = syncState
  }, [engine, syncState])

  const department = selected ? roomOf(selected.deptId) : null
  const runsSync = selected ? ['research', 'brand', 'strategy1'].includes(selected.deptId) : false
  const requestProposal = async () => {
    if (!selected || proposalLoading) return
    const text = instruction.trim()
    if (!text) { setProposalError('업무 지시를 입력해주세요.'); return }
    const plan = onPlanInvestigation(text, selected.deptId)
    const started = engine.startInvestigation(text, plan.departments, selected.id, () => setMeetingFinished(true))
    if (!started) { setProposalError('현재 진행 중인 회의가 끝난 뒤 다시 요청해주세요.'); return }
    setProposalLoading(true); setProposalError(''); setProposal(''); setMeetingFinished(false); setReportOpen(false)
    try {
      const report = await onAskProposal({ name: selected.name, role: selected.role, department: selected.deptId, instruction: text, participantLabels: plan.labels })
      setProposal(report)
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : '보고를 불러오지 못했습니다.')
    } finally {
      setProposalLoading(false)
    }
  }

  useEffect(() => {
    if (meetingFinished && (proposal || proposalError)) setReportOpen(true)
  }, [meetingFinished, proposal, proposalError])

  return <div className="sales-original-world">
    <OfficeWorld engine={engine} snap={snapshot} selectedId={selected?.id ?? null} follow onSelect={setSelected} />
    {selected ? <aside className="office-agent-profile" aria-live="polite"><button type="button" className="office-profile-close" onClick={() => { setSelected(null); setProposal(''); setProposalError(''); setInstruction(''); setReportOpen(false) }} aria-label="직원 정보 닫기">×</button><p>STAFF PROFILE</p><h3>{selected.name}</h3><strong>{department?.name || '세일즈 운영실'}</strong><dl><div><dt>역할</dt><dd>{selected.role}</dd></div><div><dt>현재 상태</dt><dd>{selected.status}</dd></div><div><dt>현재 업무</dt><dd>{selected.taskLabel || department?.name || '업무 현황 확인'}</dd></div></dl><label className="office-instruction"><span>업무 지시</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={240} placeholder="예: 전년 대비 동월 매출 증감 조사" /></label><div className="office-profile-buttons"><button type="button" className="office-profile-action" onClick={() => onAgentAction(selected.deptId)}>{runsSync ? '최신 데이터 동기화 실행' : '담당 업무 도구 열기'}</button><button type="button" className="office-profile-proposal" onClick={() => void requestProposal()} disabled={proposalLoading}>{proposalLoading ? '담당자 회의 중…' : '제안 받기'}</button></div>{proposalError && !reportOpen ? <p className="office-agent-proposal error">{proposalError}</p> : null}</aside> : null}
    {reportOpen ? <div className="office-report-backdrop" role="presentation"><section className="office-report-modal" role="dialog" aria-modal="true" aria-label="업무 보고"><button type="button" className="office-report-close" onClick={() => setReportOpen(false)} aria-label="보고 닫기">×</button><p>WORK REPORT</p><h3>{selected?.name || '세일즈 운영실'} 보고</h3><div className={`office-report-body ${proposalError ? 'error' : ''}`}>{proposalError || proposal}</div><button type="button" className="office-report-confirm" onClick={() => setReportOpen(false)}>확인</button></section></div> : null}
  </div>
}
