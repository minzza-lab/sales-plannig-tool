import { useEffect, useMemo, useRef, useState } from 'react'
import OfficeWorld from './office-engine/OfficeWorld'
import { Company, type Agent } from './office-engine/sim'
import { roomOf } from './office-engine/world'
import './office-engine/office-world.css'
import './SalesOfficeWorld.css'

export default function SalesOfficeWorld({ syncState, onAgentAction }: { syncState: 'idle' | 'running' | 'completed' | 'failed'; onAgentAction: (department: string) => void }) {
  const engine = useMemo(() => {
    const office = new Company()
    // 첫 동기화 전에도 빈 사무실이 아니라 상시 근무 장면을 보여준다.
    office.settleSalesSync()
    return office
  }, [])
  const [snapshot, setSnapshot] = useState(() => engine.snapshot())
  const [selected, setSelected] = useState<Agent | null>(null)
  const previous = useRef(syncState)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => { engine.tick((now - last) / 1000); last = now; setSnapshot(engine.snapshot()); frame = requestAnimationFrame(loop) }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [engine])
  useEffect(() => {
    if (syncState === 'running' && previous.current !== 'running') engine.start()
    if (syncState === 'completed' && previous.current === 'running') engine.settleSalesSync()
    if (syncState === 'failed' && previous.current === 'running') engine.settleSalesSync()
    previous.current = syncState
  }, [engine, syncState])

  const department = selected ? roomOf(selected.deptId) : null
  const runsSync = selected ? ['research', 'brand', 'strategy1'].includes(selected.deptId) : false

  return <div className="sales-original-world">
    <OfficeWorld engine={engine} snap={snapshot} selectedId={selected?.id ?? null} follow onSelect={setSelected} />
    {selected ? <aside className="office-agent-profile" aria-live="polite"><button type="button" className="office-profile-close" onClick={() => setSelected(null)} aria-label="직원 정보 닫기">×</button><p>STAFF PROFILE</p><h3>{selected.name}</h3><strong>{department?.name || '세일즈 운영실'}</strong><dl><div><dt>역할</dt><dd>{selected.role}</dd></div><div><dt>현재 상태</dt><dd>{selected.status}</dd></div><div><dt>현재 업무</dt><dd>{selected.taskLabel || department?.name || '업무 현황 확인'}</dd></div></dl><button type="button" className="office-profile-action" onClick={() => onAgentAction(selected.deptId)}>{runsSync ? '최신 데이터 동기화 실행' : '담당 업무 도구 열기'}</button></aside> : null}
  </div>
}
