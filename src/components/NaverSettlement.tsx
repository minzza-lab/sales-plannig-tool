import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, FileSpreadsheet, GitCompareArrows, Printer, UploadCloud } from 'lucide-react'
import * as XLSX from 'xlsx'
import { parseNicepayCalendarText } from './nicepayCalendarText'
import './NaverSettlement.css'

type BankRow = Record<string, unknown>
type DailyResult = { date: string; expected: number; bankAmount: number; difference: number; transactions: number; status: '정상' | '확인 필요' }
type ParsedBank = { rows: BankRow[]; headers: string[] }

const headerKey = (value: unknown) => String(value ?? '').replace(/[\s\r\n]/g, '').toLowerCase()
const getCell = (row: BankRow, names: string[]) => {
  for (const name of names) {
    const key = headerKey(name)
    const found = Object.keys(row).find(column => headerKey(column) === key)
      ?? Object.keys(row).find(column => headerKey(column).includes(key))
    if (found && row[found] !== '' && row[found] != null) return row[found]
  }
  return ''
}
const money = (value: unknown) => typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0
const dateValue = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (typeof value === 'number' && value > 20_000) {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  const match = String(value ?? '').trim().match(/(20\d{2})[^0-9]?(1[0-2]|0?[1-9])[^0-9]?([12]\d|3[01]|0?[1-9])(?!\d)/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
}
const parseBankFile = async (file: File): Promise<ParsedBank> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('엑셀 첫 번째 시트를 읽지 못했습니다.')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
  const headerIndex = matrix.slice(0, 30).reduce((best, row, index, rows) => {
    const score = (candidate: unknown[]) => ['거래일자', '입금일', '적요', '입금액'].filter(key => candidate.some(cell => headerKey(cell).includes(headerKey(key)))).length
    return score(row) > score(rows[best] ?? []) ? index : best
  }, 0)
  const headers = (matrix[headerIndex] ?? []).map((value, index) => String(value || `열${index + 1}`).trim())
  if (!headers.some(value => /적요|내용|거래내용|입금자명|보낸분/.test(value)) || !headers.some(value => /입금액|입금금액|거래금액|금액/.test(value)))
    throw new Error('첫 번째 시트에서 적요와 입금액 열을 찾지 못했습니다.')
  const rows = matrix.slice(headerIndex + 1).filter(row => row.some(value => value !== '' && value != null)).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  return { rows, headers }
}
const depositDate = (row: BankRow) => dateValue(getCell(row, ['입금일', '거래일자', '거래일', '일자', '거래일시']))
const depositAmount = (row: BankRow) => money(getCell(row, ['입금액', '입금금액', '거래금액', '금액']))
const depositMemo = (row: BankRow) => String(getCell(row, ['적요', '내용', '거래내용', '입금자명', '보낸분']))
const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`

const sourceItems = [
  { icon: FileSpreadsheet, title: '네이버 정산내역', description: '정산 기간 한 달치 엑셀 원본' },
  { icon: UploadCloud, title: '입금전표·계좌 입금내역', description: '같은 기간의 실제 입금액을 확인할 수 있는 파일' },
  { icon: FileSpreadsheet, title: '완성한 결과 예시', description: '현재 수작업으로 제출하는 엑셀 또는 전표 양식' },
]
const stepTitles = ['입금 내역 검증', '정산내역 시트 분리', '부가세 정산']

export default function NaverSettlement() {
  const [searchParams, setSearchParams] = useSearchParams()
  const step = searchParams.get('step') === '2' ? 2 : searchParams.get('step') === '3' ? 3 : 1
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7))
  const [bankFile, setBankFile] = useState<File>()
  const [dailyText, setDailyText] = useState('')
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [bankRows, setBankRows] = useState<BankRow[]>([])
  const [bankHeaders, setBankHeaders] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const matchedRows = useMemo(() => bankRows.filter(row => /Npay정산/i.test(depositMemo(row)) && depositDate(row).startsWith(month) && depositAmount(row) > 0), [bankRows, month])
  const dailyResults = useMemo<DailyResult[]>(() => {
    const bankByDate = new Map<string, { amount: number; transactions: number }>()
    matchedRows.forEach(row => {
      const date = depositDate(row)
      const current = bankByDate.get(date) ?? { amount: 0, transactions: 0 }
      bankByDate.set(date, { amount: current.amount + depositAmount(row), transactions: current.transactions + 1 })
    })
    const dates = Array.from(new Set([...Object.keys(expected).filter(date => date.startsWith(month)), ...bankByDate.keys()])).sort()
    return dates.map(date => {
      const expectedAmount = expected[date] ?? 0
      const bankAmount = bankByDate.get(date)?.amount ?? 0
      const difference = bankAmount - expectedAmount
      const status = difference === 0 && (expectedAmount > 0 || bankAmount === 0) ? '정상' : '확인 필요'
      return { date, expected: expectedAmount, bankAmount, difference, transactions: bankByDate.get(date)?.transactions ?? 0, status }
    })
  }, [expected, matchedRows, month])
  const checkedCount = dailyResults.filter(row => row.status === '정상').length
  const issueCount = dailyResults.length - checkedCount

  const handleFile = async (file?: File) => {
    setBankFile(file); setBankRows([]); setMessage('')
    if (!file) return
    try {
      const parsed = await parseBankFile(file)
      setBankRows(parsed.rows); setBankHeaders(parsed.headers)
      const discovered = parsed.rows.map(row => depositDate(row)).find(Boolean)
      if (discovered) setMonth(discovered.slice(0, 7))
      setMessage(`은행 원본 ${parsed.rows.length.toLocaleString()}건을 읽었습니다. 적요에 Npay정산이 있는 입금만 검증합니다.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '은행 엑셀을 읽지 못했습니다.') }
  }
  const runVerification = async () => {
    setMessage('')
    if (!bankFile) return setMessage('빠른계좌조회 입금 내역 엑셀을 먼저 선택해 주세요.')
    if (!dailyText.trim()) return setMessage('네이버 정산내역에서 월·날짜·금액을 복사해 붙여넣어 주세요.')
    setBusy(true)
    try {
      const parsedText = parseNicepayCalendarText(dailyText, month)
      const parsedBank = await parseBankFile(bankFile)
      const deposits = parsedBank.rows.filter(row => /Npay정산/i.test(depositMemo(row)) && depositDate(row).startsWith(month) && depositAmount(row) > 0)
      if (deposits.length === 0) throw new Error(`${month} 은행 내역에서 적요가 'Npay정산'인 입금 건을 찾지 못했습니다.`)
      setExpected(parsedText.amounts); setBankRows(parsedBank.rows); setBankHeaders(parsedBank.headers)
      setMessage(`${month} 네이버 정산 기준 ${parsedText.amountCount}일 · ${Object.values(parsedText.amounts).reduce((sum, amount) => sum + amount, 0).toLocaleString('ko-KR')}원과 Npay정산 입금 ${deposits.length.toLocaleString()}건을 대조했습니다.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '입금 내역 검증에 실패했습니다.') }
    finally { setBusy(false) }
  }
  const updateExpected = (date: string, value: number) => setExpected(previous => ({ ...previous, [date]: Number.isFinite(value) ? value : 0 }))
  const exportResults = () => {
    if (!dailyResults.length) return
    const workbook = XLSX.utils.book_new()
    const summary = dailyResults.map(row => ({ 날짜: row.date, '네이버 정산 기준액': row.expected, 'Npay정산 입금액': row.bankAmount, 차이: row.difference, 입금건수: row.transactions, 검증: row.status }))
    const summarySheet = XLSX.utils.json_to_sheet(summary)
    summarySheet['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(workbook, summarySheet, '날짜별 검증')
    const detail = matchedRows.map(row => ({ 날짜: depositDate(row), 적요: depositMemo(row), 입금액: depositAmount(row), ...Object.fromEntries(bankHeaders.filter(header => !['날짜', '적요', '입금액'].includes(header)).map(header => [header, row[header]])) }))
    const detailSheet = XLSX.utils.json_to_sheet(detail)
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Npay정산 입금내역')
    XLSX.writeFile(workbook, `${month.replace('-', '')}_네이버페이_입금검증.xlsx`)
  }
  const printResults = () => {
    if (!dailyResults.length) return
    const printWindow = window.open('', '_blank', 'width=1100,height=850')
    if (!printWindow) return setMessage('인쇄 창이 차단되었습니다. 브라우저의 팝업을 허용해 주세요.')
    const body = dailyResults.map(row => `<tr><td>${escapeHtml(row.date)}</td><td>${won(row.expected)}</td><td>${won(row.bankAmount)}</td><td>${won(row.difference)}</td><td>${row.transactions}</td><td>${row.status}</td></tr>`).join('')
    printWindow.document.open()
    printWindow.document.write(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${month} 네이버페이 입금 검증</title><style>body{font:14px Arial,sans-serif;padding:24px;color:#18304b}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbc9cf;padding:8px;text-align:right}th{background:#eaf1f5}td:first-child,th:first-child,td:last-child,th:last-child{text-align:center}@media print{button{display:none}}</style><h1>${month} 네이버페이 입금 내역 검증</h1><p>적요 'Npay정산' · MID 구분 없음 · 정상 ${checkedCount}일 / 확인 필요 ${issueCount}일</p><table><thead><tr><th>입금일</th><th>네이버 기준액</th><th>은행 입금액</th><th>차이</th><th>건수</th><th>검증</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></html>`)
    printWindow.document.close()
  }

  return <main className="naver-settlement">
    <header className="naver-settlement-hero"><span>NAVER SETTLEMENT</span><h1>네이버 정산</h1><p>은행 적요의 Npay정산 입금액과 네이버 정산의 날짜별 기준 금액을 대조합니다. MID 구분은 사용하지 않습니다.</p></header>
    <nav className="naver-settlement-steps" aria-label="네이버 정산 단계">
      {stepTitles.map((title, index) => <button key={title} type="button" className={step === index + 1 ? 'active' : ''} onClick={() => setSearchParams({ step: String(index + 1) })} aria-current={step === index + 1 ? 'step' : undefined}><small>STEP {index + 1}{index > 0 ? ' · 준비 중' : ''}</small><strong>{title}</strong></button>)}
    </nav>
    {step === 1 ? <section className="naver-settlement-card naver-verification">
      <div className="naver-verification-heading"><div><span>STEP 01 · DEPOSIT CHECK</span><h2>입금 내역 검증</h2><p>빠른계좌조회 엑셀과 네이버 정산일별 금액을 확인합니다.</p></div><GitCompareArrows size={30} /></div>
      <div className="naver-verification-inputs">
        <label className="naver-bank-upload"><UploadCloud size={21} /><span><b>빠른계좌조회 입금 총내역</b><small>{bankFile?.name || '적요·입금일·입금액이 포함된 엑셀을 선택하세요.'}</small></span><input type="file" accept=".xlsx,.xls,.csv" onChange={event => void handleFile(event.target.files?.[0])} /></label>
        <label className="naver-month"><span>검증 대상 월</span><input type="month" value={month} onChange={event => { setMonth(event.target.value); setExpected({}) }} /></label>
        <label className="naver-daily-text"><span>네이버 정산 날짜별 금액 붙여넣기</span><small>정산내역에서 월·날짜·금액을 복사해 넣으면 자동 추출합니다. 전체 날짜가 포함되어야 하며, MID는 입력하지 않습니다.</small><textarea value={dailyText} onChange={event => { setDailyText(event.target.value); setExpected({}) }} rows={8} placeholder={'2026.09\n일\t월\t화\t수\t목\t금\t토\n1\n301,603\n2\n48,724\n...'} /></label>
      </div>
      <div className="naver-verification-actions"><button type="button" className="primary" disabled={busy} onClick={() => void runVerification()}><GitCompareArrows size={17} />{busy ? '검증 중...' : '입금 내역 검증'}</button>{dailyResults.length > 0 && <><button type="button" onClick={exportResults}><Download size={16} /> 검증 결과 엑셀</button><button type="button" onClick={printResults}><Printer size={16} /> 인쇄</button></>}</div>
      {message && <p className="naver-verification-message" role="status">{message}</p>}
      {dailyResults.length > 0 && <div className="naver-verification-results"><div className="naver-verification-summary"><span>정상 <b>{checkedCount}일</b></span><span className={issueCount ? 'has-issues' : ''}>확인 필요 <b>{issueCount}일</b></span><span>은행 Npay정산 입금 <b>{matchedRows.length.toLocaleString()}건</b></span></div><div className="naver-verification-table-wrap"><table><thead><tr><th>입금일</th><th>네이버 기준액</th><th>Npay정산 입금액</th><th>차이</th><th>건수</th><th>검증</th></tr></thead><tbody>{dailyResults.map(row => <tr key={row.date}><td>{row.date}</td><td><input type="number" value={row.expected} onChange={event => updateExpected(row.date, Number(event.target.value))} aria-label={`${row.date} 네이버 기준 금액`} /></td><td>{won(row.bankAmount)}</td><td className={row.difference !== 0 ? 'has-issues' : ''}>{won(row.difference)}</td><td>{row.transactions}</td><td><b className={row.status === '정상' ? 'pass' : 'fail'}>{row.status}</b></td></tr>)}</tbody></table></div><h3>Npay정산 은행 입금내역</h3><div className="naver-verification-table-wrap"><table><thead><tr><th>거래일</th><th>적요</th><th>입금액</th></tr></thead><tbody>{matchedRows.map((row, index) => <tr key={`${depositDate(row)}-${index}`}><td>{depositDate(row)}</td><td>{depositMemo(row)}</td><td>{won(depositAmount(row))}</td></tr>)}</tbody></table></div></div>}
    </section> : <section className="naver-settlement-card" aria-labelledby="naver-source-title"><h2 id="naver-source-title">STEP {step} · {stepTitles[step - 1]} — 준비 중</h2><p>네이버 정산 전체 흐름을 연결하기 위한 자료가 필요합니다. 계좌번호와 개인정보는 가려도 됩니다.</p><div className="naver-settlement-sources">{sourceItems.map(({ icon: Icon, title, description }) => <div key={title} className="naver-settlement-source"><Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><small>{description}</small></div></div>)}</div></section>}
  </main>
}
