import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, DatabaseZap, LoaderCircle, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './CrawlerSyncButton.css'

type SyncTarget = 'waterpark' | 'season-pass'
type SyncState = {
  id: string | null
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  startedAt: string | null
  finishedAt: string | null
}

type SyncRequest = {
  id: number
  target: SyncTarget
  status: Exclude<SyncState['status'], 'idle'>
  progress: number
  message: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

type SyncStatusRow = {
  id: number
  synced_by_id: string
}

const syncRequestMarker = '[CRAWLER_SYNC]'

const idleState: SyncState = {
  id: null,
  status: 'idle',
  progress: 0,
  message: '동기화 대기 중',
  startedAt: null,
  finishedAt: null,
}

function toSyncState(request: SyncRequest): SyncState {
  return {
    id: String(request.id),
    status: request.status,
    progress: request.progress || 0,
    message: request.error || request.message,
    startedAt: request.startedAt,
    finishedAt: request.finishedAt,
  }
}

function parseSyncRequest(row: SyncStatusRow): SyncRequest | null {
  try {
    return { id: row.id, ...JSON.parse(row.synced_by_id) } as SyncRequest
  } catch {
    return null
  }
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
  const [state, setState] = useState<SyncState>(idleState)
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const fetchStatus = useCallback(async () => {
    let query = supabase
      .from('sync_status')
      .select('id,synced_by_id')

    query = state.id
      ? query.eq('id', Number(state.id))
      : query.eq('synced_by_name', syncRequestMarker).order('synced_at', { ascending: false }).limit(20)

    const { data, error: queryError } = await query
    if (queryError) {
      setError(`동기화 상태 확인 실패: ${queryError.message}`)
      return
    }

    const rows = (data || []) as SyncStatusRow[]
    const request = rows.map(parseSyncRequest).find((item) => item?.target === target)
    if (!request) return
    const next = toSyncState(request)
    setState((current) => {
      if ((current.status === 'queued' || current.status === 'running') && next.status === 'completed') {
        void onCompleteRef.current()
      }
      return next
    })
  }, [state.id, target])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (state.status !== 'queued' && state.status !== 'running') return
    const timer = window.setInterval(() => void fetchStatus(), 1200)
    return () => window.clearInterval(timer)
  }, [fetchStatus, state.status])

  const start = async () => {
    setError('')
    setIsStarting(true)
    try {
      if (target === 'waterpark') {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const accessToken = sessionData.session?.access_token
        if (!accessToken) throw new Error('로그인 정보가 없습니다. 다시 로그인해주세요.')

        const response = await fetch('/api/waterpark-sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json().catch(() => ({})) as {
          error?: string
          message?: string
          finishedAt?: string
        }
        if (!response.ok) throw new Error(result.error || '서버에서 매출을 수집하지 못했습니다.')
        await onCompleteRef.current()
        setState({
          id: null,
          status: 'completed',
          progress: 100,
          message: result.message || '최신 매출 동기화가 완료되었습니다.',
          startedAt: null,
          finishedAt: result.finishedAt || new Date().toISOString(),
        })
        return
      }

      const { data: recentRows, error: recentError } = await supabase
        .from('sync_status')
        .select('id,synced_by_id')
        .eq('synced_by_name', syncRequestMarker)
        .order('synced_at', { ascending: false })
        .limit(20)

      if (recentError) throw recentError
      const active = ((recentRows || []) as SyncStatusRow[])
        .map(parseSyncRequest)
        .find((item) => item?.target === target && (item.status === 'queued' || item.status === 'running'))

      if (active) {
        setState(toSyncState(active))
        return
      }

      const request = {
        target,
        status: 'queued' as const,
        progress: 0,
        message: '전용 수집 PC에 동기화를 요청했습니다.',
        error: null,
        requestedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
      }
      const { data, error: insertError } = await supabase
        .from('sync_status')
        .insert({
          synced_by_name: syncRequestMarker,
          synced_by_id: JSON.stringify(request),
        })
        .select('id,synced_by_id')
        .single()

      if (insertError) throw insertError
      const inserted = parseSyncRequest(data as SyncStatusRow)
      if (!inserted) throw new Error('동기화 요청 응답을 해석하지 못했습니다.')
      setState(toSyncState(inserted))
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : '알 수 없는 오류'
      setError(`동기화를 시작하지 못했습니다: ${message}`)
    } finally {
      setIsStarting(false)
    }
  }

  const isBusy = state.status === 'queued' || state.status === 'running'
  const buttonLabel = isStarting
    ? target === 'waterpark' ? '서버에서 매출 수집 중' : '동기화 요청 중'
    : state.status === 'queued'
      ? '동기화 요청 대기 중'
      : state.status === 'running'
        ? '데이터 동기화 중'
        : label

  return (
    <div className={`crawler-sync ${state.status}`}>
      <button type="button" onClick={() => void start()} disabled={isStarting || isBusy}>
        {isStarting || isBusy ? <LoaderCircle size={17} className="crawler-spin" /> : <DatabaseZap size={17} />}
        {buttonLabel}
      </button>
      {isStarting && (
        <small className="crawler-sync-pending">
          {target === 'waterpark' ? '홈페이지 서버가 최신 매출을 직접 수집하고 있습니다.' : '전용 수집 PC에 요청을 보내고 있습니다.'}
        </small>
      )}
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
