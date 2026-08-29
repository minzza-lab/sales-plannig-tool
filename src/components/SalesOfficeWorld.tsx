import { useEffect, useMemo, useRef, useState } from 'react'
import OfficeWorld from './office-engine/OfficeWorld'
import { Company, type Agent } from './office-engine/sim'
import './office-engine/office-world.css'

export default function SalesOfficeWorld({ syncState }: { syncState: 'idle' | 'running' | 'completed' | 'failed' }) {
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

  return <div className="sales-original-world">
    <OfficeWorld engine={engine} snap={snapshot} selectedId={selected?.id ?? null} follow onSelect={setSelected} />
    <p className="sales-original-caption">직원을 클릭하면 역할을 확인할 수 있습니다. 동기화 중에는 원본 엔진의 경로 탐색과 걷기 모션이 동작하며, 완료하면 각자의 책상으로 복귀합니다.</p>
  </div>
}
