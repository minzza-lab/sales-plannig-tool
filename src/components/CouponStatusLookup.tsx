import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import './CouponStatusLookup.css'

type Mode = 'url' | 'api' | 'auto'
type Status = 'used' | 'unused' | 'error'
type Result = {
  rowIndex: number
  status: Status
  method: 'API' | 'URL 직접조회' | '조회실패'
  barcode: string
  productName: string
  reason: string
  error: string
  barcodeMatched: boolean | null
  details: Array<{ barcode: string; productName: string; used: boolean | null }>
}

const URL_HEADERS = ['url', '조회url', '링크', '주소', '단축url']
const BARCODE_HEADERS = ['바코드', 'barcordno', '쿠폰번호', '쿠폰코드', 'barcode']
const RESULT_HEADERS = ['조회방식', '조회상태', '조회된바코드', '상품명', '사용여부', '판정근거', '오류사유']
const MAX_ROWS = 500

function normalizedHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function findColumn(headers: unknown[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizedHeader)
  return headers.findIndex((header) => normalizedCandidates.includes(normalizedHeader(header)))
}

function cellText(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function maskUrl(value: string) {
  try {
    const url = new URL(value)
    const tail = url.pathname.length > 9 ? `${url.pathname.slice(0, 5)}•••${url.pathname.slice(-3)}` : url.pathname
    return `${url.origin}${tail}${url.search ? '?••••' : ''}`
  } catch {
    return value.length > 18 ? `${value.slice(0, 12)}••••${value.slice(-4)}` : value
  }
}

function statusLabel(status: Status) {
  return status === 'used' ? '사용' : status === 'unused' ? '미사용' : '오류'
}

export default function CouponStatusLookup() {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [fileName, setFileName] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [rows, setRows] = useState<unknown[][]>([])
  const [urlColumn, setUrlColumn] = useState(-1)
  const [barcodeColumn, setBarcodeColumn] = useState(-1)
  const [mode, setMode] = useState<Mode>('auto')
  const [results, setResults] = useState<Map<number, Result>>(new Map())
  const [running, setRunning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const headers = rows[0] || []
  const dataRows = rows.slice(1)

  const loadSheet = (book: XLSX.WorkBook, nextSheet: string) => {
    const sheet = book.Sheets[nextSheet]
    const parsed = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
    const safeRows = parsed.filter((row, index) => index === 0 || row.some((cell) => cellText(cell)))
    const nextHeaders = safeRows[0] || []
    setSheetName(nextSheet)
    setRows(safeRows)
    setUrlColumn(findColumn(nextHeaders, URL_HEADERS))
    setBarcodeColumn(findColumn(nextHeaders, BARCODE_HEADERS))
    setResults(new Map())
    setMessage(safeRows.length - 1 > MAX_ROWS ? `최대 ${MAX_ROWS.toLocaleString()}행까지만 조회할 수 있습니다.` : '')
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    setMessage('')
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      if (!book.SheetNames.length) throw new Error('읽을 수 있는 시트가 없습니다.')
      setWorkbook(book)
      setFileName(file.name)
      loadSheet(book, book.SheetNames[0])
    } catch {
      setWorkbook(null)
      setRows([])
      setMessage('파일을 읽지 못했습니다. xlsx, xls 또는 csv 파일인지 확인해주세요.')
    }
  }

  const startLookup = async () => {
    if (urlColumn < 0) return setMessage('조회 URL 열을 선택해주세요.')
    if (!dataRows.length) return setMessage('조회할 데이터 행이 없습니다.')
    if (dataRows.length > MAX_ROWS) return setMessage(`행 수가 너무 많습니다. ${MAX_ROWS.toLocaleString()}행 이하로 나눠주세요.`)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return setMessage('로그인 정보가 만료되었습니다. 다시 로그인해주세요.')
    const controller = new AbortController()
    abortRef.current = controller
    setCancelled(false)
    setRunning(true)
    setResults(new Map())
    setMessage('')
    for (let index = 0; index < dataRows.length; index += 1) {
      if (controller.signal.aborted) break
      const url = cellText(dataRows[index][urlColumn])
      const barcode = barcodeColumn >= 0 ? cellText(dataRows[index][barcodeColumn]) : ''
      let result: Result
      if (!url) {
        result = { rowIndex: index, status: 'error', method: '조회실패', barcode: '', productName: '', reason: '조회 URL이 비어 있습니다.', error: '조회 URL이 비어 있습니다.', barcodeMatched: null, details: [] }
      } else {
        try {
          const response = await fetch('/api/coupon-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ url, barcode, mode }),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(response.status === 401 ? '로그인 정보가 만료되었습니다.' : '조회 요청을 처리하지 못했습니다.')
          result = { rowIndex: index, ...await response.json() as Omit<Result, 'rowIndex'> }
        } catch (error) {
          if (controller.signal.aborted) break
          const reason = error instanceof Error ? error.message : '조회에 실패했습니다.'
          result = { rowIndex: index, status: 'error', method: '조회실패', barcode: '', productName: '', reason, error: reason, barcodeMatched: null, details: [] }
        }
      }
      setResults((previous) => new Map(previous).set(index, result))
    }
    setRunning(false)
    abortRef.current = null
  }

  const cancelLookup = () => {
    setCancelled(true)
    abortRef.current?.abort()
    setRunning(false)
  }

  const counts = useMemo(() => {
    const values = [...results.values()]
    return {
      used: values.filter((result) => result.status === 'used').length,
      unused: values.filter((result) => result.status === 'unused').length,
      error: values.filter((result) => result.status === 'error').length,
    }
  }, [results])

  const visibleRows = useMemo(() => dataRows.map((row, index) => ({ row, index, result: results.get(index) }))
    .filter(({ result }) => filter === 'all' || result?.status === filter)
    .filter(({ row, result }) => {
      const query = search.trim().toLowerCase()
      if (!query) return true
      return [row[urlColumn], barcodeColumn >= 0 ? row[barcodeColumn] : '', result?.barcode, result?.productName, result?.reason]
        .some((value) => cellText(value).toLowerCase().includes(query))
    }), [dataRows, results, filter, search, urlColumn, barcodeColumn])

  const appendResult = (row: unknown[], index: number) => {
    const result = results.get(index)
    return [...row, result?.method || '', result ? statusLabel(result.status) : '', result?.barcode || '', result?.productName || '', result ? statusLabel(result.status) : '', result?.reason || '', result?.error || '']
  }

  const downloadCsv = () => {
    const output = [[...headers, ...RESULT_HEADERS], ...dataRows.map(appendResult)]
    const csvBook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(csvBook, XLSX.utils.aoa_to_sheet(output), '원본_결과')
    XLSX.writeFile(csvBook, `${fileName.replace(/\.[^.]+$/, '') || '쿠폰조회'}_결과.csv`, { bookType: 'csv' })
  }

  const downloadXlsx = () => {
    const output = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet([[...headers, ...RESULT_HEADERS], ...dataRows.map(appendResult)]), '원본_결과')
    const details: unknown[][] = [['원본 행 번호', '원본 바코드/쿠폰번호', '조회된 바코드', '상품명', '사용여부', '조회방식']]
    results.forEach((result, index) => {
      const originalBarcode = barcodeColumn >= 0 ? cellText(dataRows[index][barcodeColumn]) : ''
      const ticketRows = result.details.length ? result.details : [{ barcode: result.barcode, productName: result.productName, used: result.status === 'error' ? null : result.status === 'used' }]
      ticketRows.forEach((detail) => details.push([index + 2, originalBarcode, detail.barcode, detail.productName, detail.used == null ? '오류' : detail.used ? '사용' : '미사용', result.method]))
    })
    XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet(details), '바코드_상세')
    const errors: unknown[][] = [['원본 행 번호', '조회 URL', '원본 바코드/쿠폰번호', '오류사유', '판정근거']]
    results.forEach((result, index) => {
      if (result.status === 'error') errors.push([index + 2, cellText(dataRows[index][urlColumn]), barcodeColumn >= 0 ? cellText(dataRows[index][barcodeColumn]) : '', result.error, result.reason])
    })
    XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet(errors), '조회_오류')
    XLSX.writeFile(output, `${fileName.replace(/\.[^.]+$/, '') || '쿠폰조회'}_결과.xlsx`)
  }

  const progress = dataRows.length ? Math.round(results.size / dataRows.length * 100) : 0
  return (
    <div className="coupon-lookup">
      <header><p className="eyebrow">SALES OPERATIONS</p><h1>쿠폰/바코드 사용조회</h1><p>기존 URL 화면 판정과 티켓채널 API 정밀 조회를 함께 지원합니다.</p></header>

      <section className="lookup-panel setup-grid">
        <label className="file-drop"><span>1. 엑셀·CSV 업로드</span><strong>{fileName || '파일 선택'}</strong><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0])} /></label>
        <label><span>2. 시트 선택</span><select value={sheetName} disabled={!workbook || running} onChange={(event) => workbook && loadSheet(workbook, event.target.value)}>{workbook?.SheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>3. 조회 URL 열</span><select value={urlColumn} disabled={!headers.length || running} onChange={(event) => setUrlColumn(Number(event.target.value))}><option value={-1}>열을 선택하세요</option>{headers.map((header, index) => <option key={index} value={index}>{cellText(header) || `(빈 열 ${index + 1})`}</option>)}</select></label>
        <label><span>바코드/쿠폰번호 열</span><select value={barcodeColumn} disabled={!headers.length || running} onChange={(event) => setBarcodeColumn(Number(event.target.value))}><option value={-1}>선택 안 함</option>{headers.map((header, index) => <option key={index} value={index}>{cellText(header) || `(빈 열 ${index + 1})`}</option>)}</select></label>
      </section>

      <section className="lookup-panel"><h2>4. 조회 방식 선택</h2><div className="mode-options">
        {([['url', '기존 방식: URL 직접 조회', '화면·응답 문구로 순서대로 판정'], ['api', '정밀 방식: 티켓채널 API 조회', '바코드·상품명·사용 여부 정밀 확인'], ['auto', '자동 방식', 'API 우선, 불가능하면 URL 직접조회']] as const).map(([value, title, description]) => <label className={mode === value ? 'selected' : ''} key={value}><input type="radio" name="mode" value={value} checked={mode === value} disabled={running} onChange={() => setMode(value)} /><strong>{title}</strong><small>{description}</small></label>)}
      </div><div className="lookup-actions"><button className="primary" disabled={running || !dataRows.length} onClick={startLookup}>조회 시작</button>{running && <button className="danger" onClick={cancelLookup}>조회 취소</button>}<span>{cancelled ? '사용자가 조회를 취소했습니다.' : message}</span></div></section>

      <section className="stats" aria-live="polite"><div><span>전체</span><strong>{dataRows.length}</strong></div><div><span>완료</span><strong>{results.size}</strong></div><div><span>사용</span><strong>{counts.used}</strong></div><div><span>미사용</span><strong>{counts.unused}</strong></div><div><span>오류</span><strong>{counts.error}</strong></div></section>
      <div className="progress"><span style={{ width: `${progress}%` }} /><em>{progress}%</em></div>

      <section className="lookup-panel results-panel"><div className="result-toolbar"><div><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button><button className={filter === 'used' ? 'active' : ''} onClick={() => setFilter('used')}>사용</button><button className={filter === 'unused' ? 'active' : ''} onClick={() => setFilter('unused')}>미사용</button><button className={filter === 'error' ? 'active' : ''} onClick={() => setFilter('error')}>오류</button></div><input placeholder="바코드, 상품명, 판정근거 검색" value={search} onChange={(event) => setSearch(event.target.value)} /><div><button disabled={!results.size} onClick={downloadCsv}>CSV 다운로드</button><button disabled={!results.size} onClick={downloadXlsx}>XLSX 다운로드</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>원본 행</th><th>조회 URL</th><th>원본 바코드</th><th>조회된 바코드</th><th>상품명</th><th>사용 상태</th><th>조회 방식</th><th>판정 근거 / 오류</th></tr></thead><tbody>{visibleRows.map(({ row, index, result }) => <tr key={index}><td>{index + 2}</td><td>{maskUrl(cellText(row[urlColumn]))}</td><td>{barcodeColumn >= 0 ? cellText(row[barcodeColumn]) : '-'}</td><td>{result?.barcode || '-'}</td><td>{result?.productName || '-'}</td><td><span className={`status ${result?.status || 'pending'}`}>{result ? statusLabel(result.status) : '대기'}</span></td><td>{result?.method || '-'}</td><td title={result?.reason}>{result?.reason || '-'}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  )
}
