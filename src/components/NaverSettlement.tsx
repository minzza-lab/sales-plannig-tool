import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, FileSpreadsheet, Printer, UploadCloud } from 'lucide-react'
import * as XLSX from 'xlsx'
import './NaverSettlement.css'

type BankRow = Record<string, unknown>
type BankMeta = { title: string; accountNumber: string; accountType: string; balance: number; availableBalance: number; period: string }
type ParsedBank = { rows: BankRow[]; headers: string[]; meta: BankMeta }
type DailyTotal = { date: string; amount: number; count: number }

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
const metaValue = (matrix: unknown[][], label: string) => {
  const target = headerKey(label)
  for (const row of matrix.slice(0, 10)) {
    const index = row.findIndex(value => headerKey(value) === target)
    if (index >= 0) for (let cursor = index + 1; cursor < row.length; cursor++) if (row[cursor] !== '' && row[cursor] != null) return row[cursor]
  }
  return ''
}
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
  return { rows, headers, meta: {
    title: String(matrix[0]?.find(value => String(value).trim()) || '예금계좌조회'),
    accountNumber: String(metaValue(matrix, '계좌번호')),
    accountType: String(metaValue(matrix, '예금종류')),
    balance: money(metaValue(matrix, '현재잔액')),
    availableBalance: money(metaValue(matrix, '인출가능금액')),
    period: String(metaValue(matrix, '조회기간')),
  } }
}
const depositDate = (row: BankRow) => dateValue(getCell(row, ['입금일', '거래일자', '거래일', '일자', '거래일시']))
const depositAmount = (row: BankRow) => money(getCell(row, ['입금액', '입금금액', '거래금액', '금액']))
const depositMemo = (row: BankRow) => String(getCell(row, ['적요', '내용', '거래내용', '입금자명', '보낸분']))
const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const REFERENCE_BORDER = { top: { style: 'thin' as const, color: { argb: 'FF000000' } }, left: { style: 'thin' as const, color: { argb: 'FF000000' } }, bottom: { style: 'thin' as const, color: { argb: 'FF000000' } }, right: { style: 'thin' as const, color: { argb: 'FF000000' } } }
const setupReferenceSheet = (sheet: import('exceljs').Worksheet, meta: BankMeta) => {
  sheet.views = [{ style: 'pageBreakPreview', zoomScale: 85, zoomScaleNormal: 100 }]
  sheet.properties.defaultRowHeight = 50.1
  Array.from({ length: 8 }, () => 14.875).forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.mergeCells('A1:D1'); sheet.getCell('A1').value = meta.title || '예금계좌조회'; sheet.getCell('A1').font = { name: 'Arial', size: 11, bold: true }; sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ;[1, 2, 3, 4].forEach(row => { sheet.getRow(row).height = 16.5 })
  sheet.mergeCells('B3:C3'); sheet.mergeCells('E3:F3'); sheet.mergeCells('B4:C4'); sheet.mergeCells('E4:F4')
  ;[['A3','계좌번호'],['B3',meta.accountNumber],['D3','예금종류'],['E3',meta.accountType],['G3','조회기간'],['H3',meta.period],['A4','현재잔액'],['B4',meta.balance],['D4','인출가능금액'],['E4',meta.availableBalance]].forEach(([cell,value]) => { sheet.getCell(cell as string).value = value as string | number })
  ;[3,4].forEach(row => sheet.getRow(row).eachCell({ includeEmpty: true }, cell => { cell.border = REFERENCE_BORDER; cell.alignment = { vertical: 'middle' } }))
  ;['A3','D3','G3','A4','D4'].forEach(address => { const cell = sheet.getCell(address); cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFBFBFBF'} }; cell.font = { name:'Arial', size:10, bold:true }; cell.alignment = { horizontal:'center', vertical:'middle' } })
  ;['B4','E4'].forEach(address => { sheet.getCell(address).numFmt = '#,##0'; sheet.getCell(address).alignment = { horizontal:'right', vertical:'middle' } })
}
const addNaverBankTable = (sheet: import('exceljs').Worksheet, rows: BankRow[], headers: string[], total: number) => {
  sheet.getRow(5).height = 50.1
  const header = sheet.getRow(6); header.values = headers.slice(0,8); header.height = 50.1
  header.eachCell({ includeEmpty:true }, cell => { cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFBFBFBF'}}; cell.font = {name:'맑은 고딕',size:11,bold:true}; cell.alignment = {horizontal:'center',vertical:'middle'}; cell.border = REFERENCE_BORDER })
  rows.forEach((item,index) => { const row=sheet.getRow(index+7); row.values=headers.slice(0,8).map(key => item[key] as never); row.height=50.1; row.eachCell({includeEmpty:true},(cell,column)=>{cell.font={name:'맑은 고딕',size:11};cell.alignment={vertical:'middle',horizontal:[4,5,6].includes(column)?'right':'left'};cell.border=REFERENCE_BORDER}); [4,5,6].forEach(column=>{row.getCell(column).numFmt='#,##0'}); row.getCell(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}} })
  const totalRowNumber=Math.max(12,7+rows.length); for(let number=7+rows.length;number<=totalRowNumber;number++){const row=sheet.getRow(number);row.height=50.1;for(let column=1;column<=8;column++)row.getCell(column).border=REFERENCE_BORDER}
  const totalRow=sheet.getRow(totalRowNumber); totalRow.getCell(3).value='합계'; totalRow.getCell(4).value={formula:rows.length?`SUM(D7:D${6+rows.length})`:'0',result:total}; [3,4].forEach(column=>{const cell=totalRow.getCell(column);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}};cell.font={name:'맑은 고딕',size:11,bold:true};cell.alignment={horizontal:column===3?'center':'right',vertical:'middle'}});totalRow.getCell(4).numFmt='#,##0'
  sheet.pageSetup={paperSize:9,orientation:'portrait',scale:60,margins:{left:.7086614173,right:.7086614173,top:.7480314961,bottom:.7480314961,header:.3149606299,footer:.3149606299}}
}

const sourceItems = [
  { icon: FileSpreadsheet, title: '네이버 정산내역', description: '정산 기간 한 달치 엑셀 원본' },
  { icon: UploadCloud, title: '입금전표·계좌 입금내역', description: '같은 기간의 실제 입금액을 확인할 수 있는 파일' },
  { icon: FileSpreadsheet, title: '완성한 결과 예시', description: '현재 수작업으로 제출하는 엑셀 또는 전표 양식' },
]
const stepTitles = ['입금 내역 확인', '정산내역 시트 분리', '부가세 정산']

export default function NaverSettlement() {
  const [searchParams, setSearchParams] = useSearchParams()
  const step = searchParams.get('step') === '2' ? 2 : searchParams.get('step') === '3' ? 3 : 1
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7))
  const [bankFile, setBankFile] = useState<File>()
  const [bankRows, setBankRows] = useState<BankRow[]>([])
  const [bankHeaders, setBankHeaders] = useState<string[]>([])
  const [bankMeta, setBankMeta] = useState<BankMeta>({ title: '예금계좌조회', accountNumber: '', accountType: '', balance: 0, availableBalance: 0, period: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const matchedRows = useMemo(() => bankRows.filter(row => /Npay정산/i.test(depositMemo(row)) && depositDate(row).startsWith(month) && depositAmount(row) > 0), [bankRows, month])
  const dailyTotals = useMemo<DailyTotal[]>(() => {
    const totals = new Map<string, DailyTotal>()
    matchedRows.forEach(row => {
      const date = depositDate(row)
      const current = totals.get(date) ?? { date, amount: 0, count: 0 }
      current.amount += depositAmount(row)
      current.count += 1
      totals.set(date, current)
    })
    return Array.from(totals.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [matchedRows])
  const totalAmount = dailyTotals.reduce((sum, row) => sum + row.amount, 0)

  const handleFile = async (file?: File) => {
    setBankFile(file); setBankRows([]); setBankHeaders([]); setMessage('')
    if (!file) return
    setBusy(true)
    try {
      const parsed = await parseBankFile(file)
      const detectedDate = parsed.rows.map(row => depositDate(row)).find(Boolean)
      if (detectedDate) setMonth(detectedDate.slice(0, 7))
      setBankRows(parsed.rows)
      setBankHeaders(parsed.headers)
      setBankMeta(parsed.meta)
      const matchingCount = parsed.rows.filter(row => /Npay정산/i.test(depositMemo(row)) && depositAmount(row) > 0).length
      setMessage(matchingCount ? `적요에서 Npay정산 입금 ${matchingCount.toLocaleString()}건을 찾았습니다.` : '파일은 읽었지만 Npay정산 입금 내역을 찾지 못했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '은행 엑셀을 읽지 못했습니다.')
    } finally { setBusy(false) }
  }

  const exportResults = async () => {
    if (!matchedRows.length) return
    const ExcelJS = await import('exceljs')
    const { saveAs } = await import('file-saver')
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'WELLIHILLI Sales Planning'; workbook.created = new Date()
    const headers = (bankHeaders.length ? bankHeaders : ['거래일자','구분','적요','입금액','출금액','잔액','거래시간','거래점']).slice(0,8)
    const base = workbook.addWorksheet('기준'); setupReferenceSheet(base, bankMeta); addNaverBankTable(base, [], headers, 0)
    const summary = workbook.addWorksheet('날짜별 입금액'); summary.addRow(['입금일','Npay정산 입금액','입금 건수']); dailyTotals.forEach(row=>summary.addRow([row.date,row.amount,row.count])); const sumRow=summary.addRow(['합계',totalAmount,matchedRows.length]);
    ;[15,22,15].forEach((width,index)=>summary.getColumn(index+1).width=width); summary.views=[{state:'frozen',ySplit:1}]; summary.getRow(1).height=28; summary.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A8A'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center'}}); for(let r=2;r<=sumRow.number;r++){summary.getRow(r).eachCell(cell=>{cell.border={bottom:{style:'hair',color:{argb:'FFE2E8F0'}}};cell.alignment={vertical:'middle'}});summary.getRow(r).getCell(2).numFmt='#,##0'} sumRow.eachCell(cell=>{cell.font={bold:true,color:{argb:'FF1E3A8A'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFF6FF'}}})
    for (const daily of dailyTotals) { const rows=matchedRows.filter(row=>depositDate(row)===daily.date); const sheet=workbook.addWorksheet(daily.date.slice(5).replace('-','')); setupReferenceSheet(sheet,bankMeta); addNaverBankTable(sheet,rows,headers,daily.amount) }
    const ledger=workbook.addWorksheet(`${Number(month.slice(5))}월 원장`);setupReferenceSheet(ledger,bankMeta);addNaverBankTable(ledger,matchedRows.filter(row=>depositDate(row).startsWith(month)),headers,totalAmount)
    const output=await workbook.xlsx.writeBuffer();saveAs(new Blob([output]),`${Number(month.slice(5))}월_입금내역_자동완성_${new Date().toISOString().slice(0,10).replaceAll('-','')}.xlsx`)
  }

  const printResults = () => {
    if (!matchedRows.length) return
    const printWindow = window.open('', '_blank', 'width=1100,height=850')
    if (!printWindow) return setMessage('인쇄 창이 차단되었습니다. 브라우저의 팝업을 허용해 주세요.')
    const headers = (bankHeaders.length ? bankHeaders : ['거래일자','구분','적요','입금액','출금액','잔액','거래시간','거래점']).slice(0,8)
    const pages = dailyTotals.map(daily => { const rows=matchedRows.filter(row=>depositDate(row)===daily.date); return `<section class="page"><div class="content"><h1>${escapeHtml(bankMeta.title || '예금계좌조회')}</h1><table class="meta"><tbody><tr><th>계좌번호</th><td>${escapeHtml(bankMeta.accountNumber)}</td><th>예금종류</th><td>${escapeHtml(bankMeta.accountType)}</td><th>조회기간</th><td>${escapeHtml(bankMeta.period)}</td></tr><tr><th>현재잔액</th><td>${Math.round(bankMeta.balance).toLocaleString('ko-KR')}</td><th>인출가능금액</th><td>${Math.round(bankMeta.availableBalance).toLocaleString('ko-KR')}</td><th>입금일</th><td>${escapeHtml(daily.date)}</td></tr></tbody></table><table class="bank"><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map((header,index)=>{const value=row[header];return `<td class="${index===3?'matched':''}">${escapeHtml(typeof value==='number'&&[3,4,5].includes(index)?value.toLocaleString('ko-KR'):value)}</td>`}).join('')}</tr>`).join('')}<tr class="total"><td colspan="2"></td><td>합계</td><td>${Math.round(daily.amount).toLocaleString('ko-KR')}</td><td colspan="4"></td></tr></tbody></table></div></section>` }).join('')
    printWindow.document.open()
    printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${month} 네이버페이 입금내역</title><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;color:#111;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif}.page{height:281mm;overflow:hidden;break-after:page;page-break-after:always;padding:8mm}.page:last-child{break-after:auto;page-break-after:auto}h1{margin:0 0 12px;text-align:center;font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}th,td{height:26px;padding:4px;border:1px solid #000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta{margin-bottom:12px}.meta th,.bank th{background:#bfbfbf;text-align:center;font-weight:700}.meta td{text-align:center}.bank td:nth-child(4),.bank td:nth-child(5),.bank td:nth-child(6){text-align:right}.bank .matched,.bank .total td:nth-child(3),.bank .total td:nth-child(4){background:#ff0}.bank .total td:nth-child(3){text-align:center;font-weight:700}.bank .total td:nth-child(4){text-align:right;font-weight:700}@media screen{body{padding:20px;background:#e5e7eb}.page{width:210mm;height:281mm;margin:0 auto 18px;background:white;box-shadow:0 4px 18px #0002}}@media print{.page{padding:0}}</style></head><body>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`)
    printWindow.document.close()
  }

  return <main className="naver-settlement">
    <header className="naver-settlement-hero"><span>NAVER SETTLEMENT</span><h1>네이버 정산</h1><p>은행 입금내역에서 적요가 Npay정산인 행을 자동으로 찾아 날짜별로 정리합니다. MID 구분이나 별도 기준 금액 입력은 필요하지 않습니다.</p></header>
    <nav className="naver-settlement-steps" aria-label="네이버 정산 단계">
      {stepTitles.map((title, index) => <button key={title} type="button" className={step === index + 1 ? 'active' : ''} onClick={() => setSearchParams({ step: String(index + 1) })} aria-current={step === index + 1 ? 'step' : undefined}><small>STEP {index + 1}{index > 0 ? ' · 준비 중' : ''}</small><strong>{title}</strong></button>)}
    </nav>
    {step === 1 ? <section className="naver-settlement-card naver-verification">
      <div className="naver-verification-heading"><div><span>STEP 01 · DEPOSIT LIST</span><h2>Npay정산 입금 내역</h2><p>은행 파일을 올리면 적요에서 자동으로 찾아 결과를 표시합니다.</p></div><FileSpreadsheet size={30} /></div>
      <div className="naver-verification-inputs naver-simple-inputs">
        <label className="naver-bank-upload"><UploadCloud size={21} /><span><b>빠른계좌조회 입금 총내역</b><small>{busy ? '파일을 읽고 있습니다…' : bankFile?.name || '입금일·적요·입금액이 포함된 엑셀을 선택하세요.'}</small></span><input type="file" accept=".xlsx,.xls,.csv" onChange={event => void handleFile(event.target.files?.[0])} /></label>
        <label className="naver-month"><span>조회할 월</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      </div>
      {message && <p className="naver-verification-message" role="status">{message}</p>}
      {bankRows.length > 0 && <div className="naver-verification-results"><div className="naver-verification-summary"><span>조회된 입금 <b>{matchedRows.length.toLocaleString()}건</b></span><span>입금 날짜 <b>{dailyTotals.length}일</b></span><span>총 입금액 <b>{won(totalAmount)}</b></span></div>
        {matchedRows.length > 0 ? <><div className="naver-verification-actions"><button type="button" onClick={exportResults}><Download size={16} /> 입금내역 엑셀</button><button type="button" onClick={printResults}><Printer size={16} /> 인쇄</button></div>
          <h3>날짜별 입금 합계</h3><div className="naver-verification-table-wrap"><table><thead><tr><th>입금일</th><th>Npay정산 입금액</th><th>입금건수</th></tr></thead><tbody>{dailyTotals.map(row => <tr key={row.date}><td>{row.date}</td><td>{won(row.amount)}</td><td>{row.count}건</td></tr>)}</tbody></table></div>
          <h3>Npay정산 입금 상세</h3><div className="naver-verification-table-wrap"><table><thead><tr><th>거래일</th><th>적요</th><th>입금액</th></tr></thead><tbody>{matchedRows.map((row, index) => <tr key={`${depositDate(row)}-${index}`}><td>{depositDate(row)}</td><td>{depositMemo(row)}</td><td>{won(depositAmount(row))}</td></tr>)}</tbody></table></div>
        </> : <p className="naver-verification-empty">{month} 은행 내역에 Npay정산 입금이 없습니다.</p>}
      </div>}
    </section> : <section className="naver-settlement-card" aria-labelledby="naver-source-title"><h2 id="naver-source-title">STEP {step} · {stepTitles[step - 1]} — 준비 중</h2><p>네이버 정산 전체 흐름을 연결하기 위한 자료가 필요합니다. 계좌번호와 개인정보는 가려도 됩니다.</p><div className="naver-settlement-sources">{sourceItems.map(({ icon: Icon, title, description }) => <div key={title} className="naver-settlement-source"><Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><small>{description}</small></div></div>)}</div></section>}
  </main>
}
