import { useEffect, useMemo, useRef, useState } from 'react'
import OfficeWorld from './office-engine/OfficeWorld'
import { Company, type Agent } from './office-engine/sim'
import { roomOf } from './office-engine/world'
import './office-engine/office-world.css'
import './SalesOfficeWorld.css'
import './SalesOfficeProposal.css'

type ProposalRequest = { name: string; role: string; department: string }
export default function SalesOfficeWorld({ syncState, onAgentAction, onAskProposal }: { syncState: 'idle' | 'running' | 'completed' | 'failed'; onAgentAction: (department: string) => void; onAskProposal: (request: ProposalRequest) => Promise<string> }) {
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
    setProposalLoading(true); setProposalError(''); setProposal('')
    try { setProposal(await onAskProposal({ name: selected.name, role: selected.role, department: selected.deptId })) }
    catch (error) { setProposalError(error instanceof Error ? error.message : '제안을 불러오지 못했습니다.') }
    finally { setProposalLoading(false) }
  }

  return <div className="sales-original-world">
    <OfficeWorld engine={engine} snap={snapshot} selectedId={selected?.id ?? null} follow onSelect={setSelected} />
    {selected ? <aside className="office-agent-profile" aria-live="polite"><button type="button" className="office-profile-close" onClick={() => { setSelected(null); setProposal(''); setProposalError('') }} aria-label="직원 정보 닫기">×</button><p>STAFF PROFILE</p><h3>{selected.name}</h3><strong>{department?.name || '세일즈 운영실'}</strong><dl><div><dt>역할</dt><dd>{selected.role}</dd></div><div><dt>현재 상태</dt><dd>{selected.status}</dd></div><div><dt>현재 업무</dt><dd>{selected.taskLabel || department?.name || '업무 현황 확인'}</dd></div></dl><div className="office-profile-buttons"><button type="button" className="office-profile-action" onClick={() => onAgentAction(selected.deptId)}>{runsSync ? '최신 데이터 동기화 실행' : '담당 업무 도구 열기'}</button><button type="button" className="office-profile-proposal" onClick={() => void requestProposal()} disabled={proposalLoading}>{proposalLoading ? '제안 정리 중…' : '제안 받기'}</button></div>{proposal ? <div className="office-agent-proposal">{proposal}</div> : null}{proposalError ? <p className="office-agent-proposal error">{proposalError}</p> : null}</aside> : null}
  </div>
}
