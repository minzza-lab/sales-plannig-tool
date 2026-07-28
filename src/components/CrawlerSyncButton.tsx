import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, DatabaseZap, LoaderCircle, TriangleAlert } from 'lucide-react'
import './CrawlerSyncButton.css'

type SyncTarget = 'waterpark' | 'season-pass'
type SyncState = {
  status: 'idle' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  logs: string[]
  startedAt: string | null
  finishedAt: string | null
}

export default function CrawlerSyncButton({
  target,
  label,
  onComplete,
}: {
  target: SyncTarget
  label: string
  onComplete: () => void | Promise<void>
}) {
  const [state, setState] = useState<SyncState>({ status: 'idle', progress: 0, message: '동기화 대기 중', logs: [], startedAt: null, finishedAt: null })
  const [error, setError] = useState('')
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/crawler-sync?target=${target}`)
    if (!response.ok) return
    const next = await response.json() as SyncState
    setState((current) => {
      if (current.status === 'running' && next.status === 'completed') void onCompleteRef.current()
      return next
    })
  }, [target])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (state.status !== 'running') return
    const timer = window.setInterval(() => void fetchStatus(), 1200)
    return () => window.clearInterval(timer)
  }, [fetchStatus, state.status])

  const start = async () => {
    setError('')
    const response = await fetch(`/api/crawler-sync?target=${target}`, { method: 'POST' })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || '동기화를 시작하지 못했습니다.')
      return
    }
    setState(result)
  }

  return (
    <div className={`crawler-sync ${state.status}`}>
      <button onClick={() => void start()} disabled={state.status === 'running'}>
        {state.status === 'running' ? <LoaderCircle size={17} className="crawler-spin" /> : <DatabaseZap size={17} />}
        {state.status === 'running' ? '데이터 동기화 중' : label}
      </button>
      {state.status !== 'idle' && (
        <div className="crawler-sync-status">
          <div><span>{state.status === 'completed' ? <CheckCircle2 size={14} /> : state.status === 'failed' ? <TriangleAlert size={14} /> : <LoaderCircle size={14} className="crawler-spin" />}{state.message}</span><strong>{state.progress}%</strong></div>
          <div className="crawler-sync-track"><i style={{ width: `${state.progress}%` }} /></div>
        </div>
      )}
      {error && <small className="crawler-sync-error">{error}</small>}
    </div>
  )
}
