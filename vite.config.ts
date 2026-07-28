import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'

type CrawlerTarget = 'waterpark' | 'season-pass'
type CrawlerState = {
  target: CrawlerTarget
  status: 'idle' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  logs: string[]
  startedAt: string | null
  finishedAt: string | null
}

const crawlerStates = new Map<CrawlerTarget, CrawlerState>()
let activeCrawler: ChildProcessWithoutNullStreams | null = null

const initialCrawlerState = (target: CrawlerTarget): CrawlerState => ({
  target,
  status: 'idle',
  progress: 0,
  message: '동기화 대기 중',
  logs: [],
  startedAt: null,
  finishedAt: null,
})

function crawlerProgress(target: CrawlerTarget, line: string, current: number) {
  if (target === 'waterpark') {
    if (line.includes('자동 수집기 가동')) return { progress: 8, message: '수집 범위를 준비하고 있습니다.' }
    if (line.includes('수집 중') || line.includes('데이터 가공')) return { progress: Math.max(current, 35), message: '워터파크 매출을 수집하고 있습니다.' }
    if (line.includes('상세')) return { progress: Math.max(current, 62), message: '상품별 상세 매출을 정리하고 있습니다.' }
    if (line.includes('수집 완료')) return { progress: Math.min(92, current + 15), message: '수집 데이터를 저장하고 있습니다.' }
  } else {
    if (line.includes('크롤러 시작')) return { progress: 6, message: '시즌권 동기화를 준비하고 있습니다.' }
    if (line.includes('로그인')) return { progress: 18, message: '관리자 시스템에 접속하고 있습니다.' }
    if (line.includes('90일') || line.includes('검색')) return { progress: 35, message: '시즌권 주문을 조회하고 있습니다.' }
    if (line.includes('다운로드')) return { progress: 55, message: '주문 엑셀을 내려받고 있습니다.' }
    if (line.includes('파싱')) return { progress: 72, message: '주문 데이터를 분석하고 있습니다.' }
    if (line.includes('업로드') || line.includes('저장')) return { progress: 86, message: '최신 데이터를 저장하고 있습니다.' }
    if (line.includes('모든 작업 완료')) return { progress: 98, message: '동기화 결과를 화면에 반영하고 있습니다.' }
  }
  return { progress: current, message: line.slice(0, 100) || '동기화 중입니다.' }
}

function crawlerControlPlugin(): Plugin {
  return {
    name: 'local-crawler-control',
    configureServer(server) {
      server.middlewares.use('/api/crawler-sync', (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        const url = new URL(request.url || '/', 'http://localhost')
        const target = url.searchParams.get('target') as CrawlerTarget | null
        if (!target || !['waterpark', 'season-pass'].includes(target)) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: '지원하지 않는 동기화 대상입니다.' }))
          return
        }

        if (request.method === 'GET') {
          response.end(JSON.stringify(crawlerStates.get(target) || initialCrawlerState(target)))
          return
        }
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.end(JSON.stringify({ error: '허용되지 않은 요청입니다.' }))
          return
        }
        if (activeCrawler) {
          response.statusCode = 409
          response.end(JSON.stringify({ error: '다른 동기화 작업이 이미 실행 중입니다.' }))
          return
        }

        const script = target === 'waterpark' ? 'waterpark_crawler.cjs' : 'season_pass_crawler.cjs'
        const state: CrawlerState = {
          ...initialCrawlerState(target),
          status: 'running',
          progress: 3,
          message: '크롤러를 시작하고 있습니다.',
          startedAt: new Date().toISOString(),
        }
        crawlerStates.set(target, state)
        const args = [
          path.resolve(process.cwd(), script),
          ...(target === 'season-pass' ? ['--once'] : target === 'waterpark' ? ['missing'] : []),
        ]
        const child = spawn(process.execPath, args, {
          cwd: process.cwd(),
          env: process.env,
        })
        activeCrawler = child

        const consume = (chunk: Buffer) => {
          const lines = chunk.toString().split(/\r?\n/).map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(Boolean)
          for (const line of lines) {
            const next = crawlerProgress(target, line, state.progress)
            state.progress = next.progress
            state.message = next.message
            state.logs = [...state.logs, line].slice(-30)
          }
          crawlerStates.set(target, { ...state })
        }
        child.stdout.on('data', consume)
        child.stderr.on('data', consume)
        child.on('close', (code) => {
          activeCrawler = null
          state.status = code === 0 ? 'completed' : 'failed'
          state.progress = code === 0 ? 100 : state.progress
          state.message = code === 0 ? '최신 데이터 동기화가 완료되었습니다.' : '동기화 중 오류가 발생했습니다.'
          state.finishedAt = new Date().toISOString()
          crawlerStates.set(target, { ...state })
        })
        response.statusCode = 202
        response.end(JSON.stringify(state))
      })
    },
  }
}

function localGeminiProxy(apiKey: string): Plugin {
  return {
    name: 'local-gemini-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini', (request, response, next) => {
        if (request.method !== 'POST') return next()
        const chunks: Buffer[] = []
        request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        request.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
            const model = String(body.model || 'gemini-2.5-flash')
            delete body.model
            const googleResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              },
            )
            response.statusCode = googleResponse.status
            response.setHeader('Content-Type', 'application/json')
            response.end(await googleResponse.text())
          } catch (error) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Local Gemini proxy failed' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.GOOGLE_API_KEY
  return {
    plugins: [react(), crawlerControlPlugin(), ...(apiKey ? [localGeminiProxy(apiKey)] : [])],
  }
})
