import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, DatabaseZap, LoaderCircle, TriangleAlert, X } from 'lucide-react'
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
const WATERPARK_SYNC_DAYS = 5
const WATERPARK_TERMINAL_CATEGORIES = [
  { key: 'admission', code: 'TICKET', label: '입장권' },
  { key: 'food', code: 'F&B', label: '식음' },
  { key: 'rental', code: 'RENTAL', label: '물품대여' },
] as const

type WaterparkCategoryTotals = {
  admission: { quantity: number; amount: number }
  food: { quantity: number; amount: number }
  rental: { quantity: number; amount: number }
}

type WaterparkModalState = {
  open: boolean
  phase: 'running' | 'completed' | 'failed'
  progress: number
  message: string
  completedDays: number
  activeDate: string | null
  entries: Array<{ date: string; categories: WaterparkCategoryTotals }>
}

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

function getRecentKstDateStrings(daysCount: number): string[] {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return Array.from({ length: daysCount }, (_, index) => {
    const date = new Date(nowKst.getTime() - index * 24 * 60 * 60 * 1000)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
}

function formatSyncDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}월 ${Number(day)}일`
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
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [waterparkModal, setWaterparkModal] = useState<WaterparkModalState>({
    open: false,
    phase: 'running',
    progress: 0,
    message: '매출 수집을 준비하고 있습니다.',
    completedDays: 0,
    activeDate: null,
    entries: [],
  })
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const fetchLastSyncedAt = useCallback(async () => {
    if (target !== 'waterpark') return
    const { data, error: latestError } = await supabase
      .from('daily_reports')
      .select('data')
      .eq('report_type', 'REALTIME_SALES')
      .order('report_date', { ascending: false })
      .limit(31)
    if (latestError) return

    const latest = (data || [])
      .map((row) => typeof row.data?.updated_at === 'string' ? row.data.updated_at : null)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
    setLastSyncedAt(latest || null)
  }, [target])

  useEffect(() => {
    void fetchLastSyncedAt()
  }, [fetchLastSyncedAt])

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
        const dates = getRecentKstDateStrings(WATERPARK_SYNC_DAYS)
        const batchId = crypto.randomUUID()
        setWaterparkModal({
          open: true,
          phase: 'running',
          progress: 0,
          message: '로그인 정보와 수집 범위를 확인하고 있습니다.',
          completedDays: 0,
          activeDate: null,
          entries: [],
        })
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const accessToken = sessionData.session?.access_token
        if (!accessToken) throw new Error('로그인 정보가 없습니다. 다시 로그인해주세요.')

        for (let index = 0; index < dates.length; index += 1) {
          const date = dates[index]
          setWaterparkModal((current) => ({
            ...current,
            message: `${date} 매출을 안전하게 수집하고 있습니다.`,
            activeDate: date,
          }))
          const response = await fetch(`/api/waterpark-sync?date=${encodeURIComponent(date)}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Sync-Batch-Id': batchId,
            },
          })
          const result = await response.json().catch(() => ({})) as {
            error?: string
            syncedDate?: string
            totalQty?: number
            totalAmount?: number
            categories?: WaterparkCategoryTotals
          }
          if (!response.ok) throw new Error(result.error || `${date} 매출을 수집하지 못했습니다.`)

          const completedDays = index + 1
          setWaterparkModal((current) => ({
            ...current,
            progress: Math.round((completedDays / dates.length) * 100),
            message: `${date} 매출 수집을 완료했습니다.`,
            completedDays,
            activeDate: null,
            entries: [
              ...current.entries,
              {
                date: result.syncedDate || date,
                categories: result.categories || {
                  admission: { quantity: 0, amount: 0 },
                  food: { quantity: 0, amount: 0 },
                  rental: { quantity: 0, amount: 0 },
                },
              },
            ],
          }))
        }

        await onCompleteRef.current()
        const finishedAt = new Date().toISOString()
        setLastSyncedAt(finishedAt)
        setState({
          id: null,
          status: 'completed',
          progress: 100,
          message: `최근 ${WATERPARK_SYNC_DAYS}일 매출 동기화가 완료되었습니다.`,
          startedAt: null,
          finishedAt,
        })
        setWaterparkModal((current) => ({
          ...current,
          open: true,
          phase: 'completed',
          progress: 100,
          message: '최신 매출을 모두 안전하게 불러왔습니다.',
          completedDays: dates.length,
          activeDate: null,
        }))
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
      if (target === 'waterpark') {
        setWaterparkModal((current) => ({
          ...current,
          open: true,
          phase: 'failed',
          message,
        }))
      }
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
  const lastSyncedText = lastSyncedAt
    ? new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Seoul',
    }).format(new Date(lastSyncedAt))
    : '동기화 기록 없음'

  return (
    <div className={`crawler-sync ${state.status}`}>
      <div className="crawler-sync-action-row">
        {target === 'waterpark' && <small className="crawler-last-synced">최근 동기화<br /><b>{lastSyncedText}</b></small>}
        <button type="button" onClick={() => void start()} disabled={isStarting || isBusy}>
          {isStarting || isBusy ? <LoaderCircle size={17} className="crawler-spin" /> : <DatabaseZap size={17} />}
          {buttonLabel}
        </button>
      </div>
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
      {target === 'waterpark' && waterparkModal.open && createPortal(
        <div className="waterpark-sync-modal-backdrop" role="presentation">
          <section
            className={`waterpark-sync-modal ${waterparkModal.phase}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="waterpark-sync-modal-title"
          >
            <div className="waterpark-sync-modal-icon">
              {waterparkModal.phase === 'running'
                ? <LoaderCircle size={28} className="crawler-spin" />
                : waterparkModal.phase === 'completed'
                  ? <CheckCircle2 size={30} />
                  : <TriangleAlert size={30} />}
            </div>
            <div className="waterpark-sync-modal-heading">
              <div>
                <span>WATERPARK SALES</span>
                <h2 id="waterpark-sync-modal-title">
                  {waterparkModal.phase === 'running'
                    ? '최신 매출 동기화 중'
                    : waterparkModal.phase === 'completed'
                      ? '동기화 완료'
                      : '동기화 중단'}
                </h2>
              </div>
              {waterparkModal.phase !== 'running' && (
                <button
                  type="button"
                  className="waterpark-sync-modal-close"
                  onClick={() => setWaterparkModal((current) => ({ ...current, open: false }))}
                  aria-label="동기화 팝업 닫기"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <p>{waterparkModal.message}</p>
            <div className="waterpark-sync-terminal" aria-live="polite">
              <div className="waterpark-sync-terminal-bar">
                <span><i /> <i /> <i /></span>
                <b>LIVE SALES STREAM</b>
                <em>{waterparkModal.phase === 'running' ? 'CONNECTED' : waterparkModal.phase.toUpperCase()}</em>
              </div>
              <div className="waterpark-sync-terminal-body">
                <div className="waterpark-sync-terminal-boot">$ secure_channel --source=waterpark_api</div>
                <div className="waterpark-sync-terminal-boot">[OK] encrypted connection established</div>
                {waterparkModal.entries.map((entry) => (
                  <div className="waterpark-sync-terminal-entry" key={entry.date}>
                    <div className="waterpark-sync-terminal-date">
                      <span>[SYNCED]</span>
                      <strong>{formatSyncDate(entry.date)}</strong>
                    </div>
                    {WATERPARK_TERMINAL_CATEGORIES.map((category) => {
                      const totals = entry.categories[category.key]
                      return (
                        <div className={`waterpark-sync-terminal-category ${category.key}`} key={category.key}>
                          <span>[{category.code}]</span>
                          <strong>{category.label}</strong>
                          <b>{totals.quantity.toLocaleString('ko-KR')}건</b>
                          <em>{totals.amount.toLocaleString('ko-KR')}원</em>
                        </div>
                      )
                    })}
                  </div>
                ))}
                {waterparkModal.phase === 'running' && (
                  <div className="waterpark-sync-terminal-scanning">
                    <span>[READING]</span>
                    {waterparkModal.activeDate ? formatSyncDate(waterparkModal.activeDate) : '수집 범위 확인 중'}
                    <i />
                  </div>
                )}
                {waterparkModal.phase === 'completed' && (
                  <div className="waterpark-sync-terminal-complete">[COMPLETE] DATA COMMIT SUCCESSFUL</div>
                )}
              </div>
            </div>
            <div className="waterpark-sync-modal-progress-row">
              <strong>{waterparkModal.progress}%</strong>
              <span>{waterparkModal.completedDays} / {WATERPARK_SYNC_DAYS}일 완료</span>
            </div>
            <div
              className="waterpark-sync-modal-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={waterparkModal.progress}
            >
              <i style={{ width: `${waterparkModal.progress}%` }} />
            </div>
            <small>
              {waterparkModal.phase === 'running'
                ? '창을 닫지 않고 잠시만 기다려주세요.'
                : waterparkModal.phase === 'completed'
                  ? '화면에 최신 매출 데이터가 반영되었습니다.'
                  : '완료된 날짜까지는 정상 저장되었습니다. 잠시 후 다시 시도해주세요.'}
            </small>
            {waterparkModal.phase !== 'running' && (
              <button
                type="button"
                className="waterpark-sync-modal-confirm"
                onClick={() => setWaterparkModal((current) => ({ ...current, open: false }))}
              >
                확인
              </button>
            )}
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}
