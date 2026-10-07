import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { buildNaverVatStep3Workbook, NAVER_VAT_CATEGORIES } from '../lib/naverVatStep3Workbook'

type Row = Record<string, unknown>
type ProductMap = Record<string, { product: string; voucher: string }>
type FeeTotal = { date: string; category: string; supply: number; tax: number; total: number; count: number }
type TaxInvoiceRow = { date: string; supplier: string; category: string; supply: number; tax: number; status: string }
const CATEGORIES = NAVER_VAT_CATEGORIES
const norm = (value: unknown) => String(value ?? '').replace(/[\s\r\n]/g, '').toLowerCase()
const money = (value: unknown) => typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0
const get = (row: Row, aliases: string[]) => { for (const alias of aliases) { const key = Object.keys(row).find(item => norm(item) === norm(alias)) || Object.keys(row).find(item => norm(item).includes(norm(alias))); if (key && row[key] !== '' && row[key] != null) return row[key] } return '' }
const baseDate = (row: Row) => {
  const value = get(row, ['정산기준일'])
  const date = value instanceof Date ? value : typeof value === 'number' ? XLSX.SSF.parse_date_code(value) : null
  if (date && value instanceof Date) return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  if (date && typeof value === 'number') return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`
  const match = String(value ?? '').match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}` : ''
}
const productName = (row: Row) => String(get(row, ['상품명']) ?? '').trim()
const feeParts = (row: Row) => {
  const direct = get(row, ['수수료금액'])
  if (direct !== '') return [{ label: String(get(row, ['수수료 구분']) || '수수료'), amount: money(direct) }]
  return [
    ['Npay 수수료(B)', ['Npay 수수료(B)', 'Npay 수수료']],
    ['매출연동 수수료(C)', ['매출연동 수수료(C)', '매출연동 수수료']],
    ['무이자할부 수수료(D)', ['무이자할부 수수료(D)', '무이자할부 수수료']],
  ].map(([label, aliases]) => ({ label: String(label), amount: money(get(row, aliases as string[])) }))
    .filter(part => part.amount !== 0)
}
const feeAmount = (row: Row) => feeParts(row).reduce((sum, part) => sum + part.amount, 0)
const parseTaxInvoiceText = (text: string): TaxInvoiceRow[] => {
  const clean = (value: string) => value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<br\s*\/?\s*>/gi, ' ').replace(/&nbsp;/gi, ' ').trim()
  return text.split(/\r?\n/).flatMap(line => {
    const trimmed = line.trim()
    if (!trimmed || /^\|?\s*:?-{2,}/.test(trimmed)) return []
    const cells = (trimmed.includes('|') ? trimmed.split('|').slice(1, trimmed.endsWith('|') ? -1 : undefined) : trimmed.split('\t')).map(cell => clean(cell))
    const date = cells[0]?.match(/20\d{2}-\d{2}-\d{2}/)?.[0]
    if (!date || cells.length < 6) return []
    const numeric = (value: string) => Number(value.replace(/[^\d.-]/g, '')) || 0
    return [{ date, supplier: cells[1], category: cells[2], supply: numeric(cells[3]), tax: numeric(cells[4]), status: cells[5] }]
  })
}
const guessCategory = (product: string) => {
  if (!product) return '취소위약금'
  if (/히든힐스/i.test(product) && /리프트/i.test(product)) return '리프트(히든힐스)'
  if (/히든힐스/i.test(product) && /렌탈|장비/i.test(product)) return '장비렌탈(히든힐스)'
  if (/히든힐스/i.test(product) && /강습/i.test(product)) return '강습(히든힐스)'
  if (/히든힐스/i.test(product)) return '히든힐스'
  if (/콘도|객실/i.test(product)) return '콘도객실'
  if (/카바나/i.test(product)) return '카바나'
  if (/워터|플래닛/i.test(product)) return '워터파크'
  return ''
}
const readCommissionFile = async (file: File) => {
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const rows: Row[] = []
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
    const headerAt = matrix.findIndex(row => row.some(cell => norm(cell) === norm('정산기준일')) && row.some(cell => norm(cell) === norm('상품명')) && (row.some(cell => norm(cell) === norm('수수료금액')) || row.some(cell => norm(cell).includes(norm('Npay 수수료')))))
    if (headerAt < 0) continue
    const seen = new Map<string, number>()
    const headers = (matrix[headerAt] ?? []).map((item,index) => { const name=String(item||`열${index+1}`).trim();const count=(seen.get(name)||0)+1;seen.set(name,count);return count===1?name:`${name}_${count}` })
    matrix.slice(headerAt+1).forEach((cells,index) => {
      const record = Object.fromEntries(headers.map((header,column) => [header,cells[column]??''])) as Row
      const order = String(get(record,['주문번호'])||get(record,['상품주문번호'])).replace(/\D/g,'')
      if (baseDate(record) && (order.length >= 8 || feeAmount(record) !== 0)) rows.push({ ...record, __sourceSheet: sheetName, __sourceRowNumber: headerAt+index+2 })
    })
  }
  if (!rows.length) throw new Error('정산기준일·상품명·수수료 열을 찾지 못했습니다. 네이버 STEP 3 수수료 상세 파일을 선택해 주세요.')
  const counts = new Map<string,number>()
  rows.forEach(row=>{const date=baseDate(row);if(date){const month=date.slice(0,7);counts.set(month,(counts.get(month)||0)+1)}})
  const month=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]
  return { rows: month ? rows.filter(row=>!baseDate(row)||baseDate(row).startsWith(month)) : rows, month: month||'' }
}
const detailFeeRows = (rows: Row[]) => rows.filter(row => feeAmount(row) !== 0)

export default function NaverVatStep3() {
  const [file,setFile]=useState('');const [month,setMonth]=useState('');const [rows,setRows]=useState<Row[]>([])
  const [taxInvoiceText,setTaxInvoiceText]=useState('')
  const [mappings,setMappings]=useState<ProductMap>({});const [saved,setSaved]=useState<ProductMap>({});const [message,setMessage]=useState('STEP 3 수수료 로우데이터를 올려 주세요. 업로드한 파일의 상품명을 분류하고 같은 파일의 수수료를 집계합니다.');const [busy,setBusy]=useState(false)
  const productFor=(row:Row)=>productName(row)||'〈상품명 없음〉'
  const feeRows=useMemo(()=>detailFeeRows(rows),[rows])
  const products=useMemo(()=>Array.from(new Set(feeRows.map(productFor))).sort((a,b)=>a.localeCompare(b,'ko')),[feeRows])
  const totals=useMemo<FeeTotal[]>(()=>{
    const grouped=new Map<string,FeeTotal>()
    feeRows.forEach(row=>{const date=baseDate(row);if(!date||!date.startsWith(month))return;const rawName=productFor(row);const mapping=mappings[rawName];const category=mapping?.voucher||guessCategory(rawName)||'';const fee=Math.abs(feeAmount(row));const key=`${date}\u0000${category}`;const current=grouped.get(key)||{date,category,supply:0,tax:0,total:0,count:0};current.total+=fee;current.count++;grouped.set(key,current)})
    return [...grouped.values()].map(item=>{item.supply=item.total/1.1;item.tax=item.total-item.supply;return item}).sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category,'ko'))
  },[feeRows,month,mappings])
  const taxInvoices=useMemo(()=>parseTaxInvoiceText(taxInvoiceText).filter(row=>row.date.startsWith(month)),[taxInvoiceText,month])
  const unsaved=JSON.stringify(mappings)!==JSON.stringify(saved)
  const unassigned=products.filter(product=>!(mappings[product]?.voucher||guessCategory(product)))
  const dates=useMemo(()=>Array.from(new Set(totals.map(item=>item.date))).sort(),[totals])
  const feeGrandTotal=totals.reduce((sum,item)=>sum+item.total,0)
  const invoiceGrandTotal=taxInvoices.reduce((sum,row)=>sum+row.supply+row.tax,0)
  const invoiceDifference=invoiceGrandTotal-feeGrandTotal

  const loadShared=async()=>{const {data,error}=await supabase.from('naver_vat_step3_settings').select('product_mappings').eq('id','main').maybeSingle();if(error)throw error;const shared=(data?.product_mappings&&typeof data.product_mappings==='object'?data.product_mappings:{}) as ProductMap;setMappings(shared);setSaved(shared)}
  const uploadCommission=async(next?:File)=>{if(!next)return;setBusy(true);setRows([]);setFile(next.name);try{const parsed=await readCommissionFile(next);setRows(parsed.rows);setMonth(parsed.month);await loadShared();setMessage(`${parsed.rows.length.toLocaleString()}건을 읽었습니다. 정산기준일 ${parsed.month} 기준으로 집계하며, 수수료가 0원인 상세행은 일별 금액에서 제외합니다.`)}catch(error){setMessage(error instanceof Error?error.message:'수수료 로우데이터를 읽지 못했습니다.')}finally{setBusy(false)}}
  const save=async()=>{setBusy(true);try{const {data:auth}=await supabase.auth.getUser();const {error}=await supabase.from('naver_vat_step3_settings').upsert({id:'main',product_mappings:mappings,updated_at:new Date().toISOString(),updated_by:auth.user?.id??null},{onConflict:'id'});if(error)throw error;setSaved(mappings);setMessage('상품별 수수료 구분을 팀 공용 설정으로 저장했습니다.')}catch(error){setMessage(`공유 설정을 저장하지 못했습니다. ${error instanceof Error?error.message:''}`)}finally{setBusy(false)}}
  const update=(product:string,value:string)=>setMappings(current=>({...current,[product]:{product:current[product]?.product??product,voucher:value}}))

  const exportExcel=async()=>{
    const {saveAs}=await import('file-saver')
    const template=await fetch('/templates/naver-vat-step3-template.xlsx')
    if(!template.ok)throw new Error('수수료 내역 양식 파일을 불러오지 못했습니다.')
    const details=feeRows.filter(row=>baseDate(row).startsWith(month)).map(row=>{const product=productFor(row);const parts=feeParts(row);const amount=(label:string)=>parts.find(part=>part.label===label)?.amount||0;return{date:baseDate(row),product,order:get(row,['주문번호']),productOrder:get(row,['상품주문번호']),npayFee:amount('Npay 수수료(B)'),salesFee:amount('매출연동 수수료(C)'),installmentFee:amount('무이자할부 수수료(D)'),total:Math.abs(feeAmount(row)),category:mappings[product]?.voucher||guessCategory(product)||'미분류'}})
    const result=await buildNaverVatStep3Workbook({template:await template.arrayBuffer(),month,dates,totals,details})
    saveAs(new Blob([result.slice().buffer as ArrayBuffer]),file.replace(/\.(xlsx|xls)$/i,'')+'_최종수수료내역.xlsx')
  }

  return <section className="naver-settlement-card naver-vat-step3"><div className="naver-verification-heading"><div><span>STEP 03 · VAT & VOUCHER</span><h2>부가세 정산 · 월별 수수료 내역</h2><p>STEP 3에 올린 수수료 원본의 상품명을 분류하고, 같은 파일에 있는 수수료 금액을 정산기준일별로 집계해 월별 수수료 내역으로 출력합니다.</p></div><FileSpreadsheet size={30}/></div>
    <div className="naver-vat-step3-uploads"><label className="naver-bank-upload"><UploadCloud size={21}/><span><b>STEP 3 수수료 로우데이터 <em>필수</em></b><small>{busy?'파일을 처리하고 있습니다…':file||'상품명·정산기준일·수수료 열이 있는 네이버 정산 상세 엑셀을 선택하세요.'}</small></span><input type="file" accept=".xlsx,.xls" onChange={event=>void uploadCommission(event.target.files?.[0])}/></label></div>
    <p className="naver-verification-message" role="status">{message}</p>
    {rows.length>0&&<><div className="naver-verification-summary"><span>수수료 원본 <b>{rows.length.toLocaleString()}행</b></span><span>계산 대상 수수료 <b>{feeRows.length.toLocaleString()}건</b></span><span>정산기준월 <b>{month}</b></span><span>일자 <b>{dates.length}일</b></span></div>
      <div className="naver-vat-step3-mapping"><h3>상품별 월별표 구분</h3><p>상품명 기준으로 구분을 제안합니다. 비어 있는 상품명처럼 분류가 불확실한 항목은 직접 선택해 저장하세요.</p><div className="naver-vat-step3-list">{products.map(product=><label key={product}><span title={product}>{product}</span><select value={mappings[product]?.voucher||guessCategory(product)} onChange={event=>update(product,event.target.value)} aria-label={`${product} 월별표 구분`}><option value="">구분 선택</option>{CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}</select></label>)}</div><div className="naver-step2-savebar"><span className={unsaved?'unsaved':'saved'}>{unsaved?'저장되지 않은 변경이 있습니다.':unassigned.length?`미분류 상품 ${unassigned.length}종`:'팀 공용 기준과 일치합니다.'}</span><button type="button" disabled={!unsaved||busy} onClick={()=>void save()}>{busy?'저장 중…':'구분 기준 저장'}</button></div></div>
      <h3>{month} 날짜별 수수료 집계</h3><div className="naver-verification-table-wrap"><table><thead><tr><th>정산기준일</th><th>월별표 구분</th><th>공급가액</th><th>세액</th><th>소계</th><th>수수료 건수</th></tr></thead><tbody>{totals.map(item=><tr key={`${item.date}-${item.category}`}><td>{item.date}</td><td>{item.category||'미분류'}</td><td>{item.supply.toLocaleString(undefined,{maximumFractionDigits:2})}원</td><td>{item.tax.toLocaleString(undefined,{maximumFractionDigits:2})}원</td><td>{item.total.toLocaleString()}원</td><td>{item.count}건</td></tr>)}</tbody></table></div>
      <div className="naver-vat-step3-mapping naver-vat-invoice-check"><h3>세금계산서 금액 검증</h3><p>네이버 세금계산서 목록의 표를 복사해 붙여넣으면 날짜와 공급가액·세액을 자동으로 읽어 이번 달 수수료 합계와 비교합니다.</p><textarea value={taxInvoiceText} onChange={event=>setTaxInvoiceText(event.target.value)} rows={5} placeholder="네이버 세금계산서 목록을 복사해 여기에 붙여넣으세요." aria-label="세금계산서 목록 붙여넣기"/>{taxInvoices.length>0&&<><div className="naver-verification-table-wrap"><table><thead><tr><th>발행일</th><th>공급자</th><th>구분</th><th>공급가액</th><th>세액</th><th>상태</th><th>합계</th></tr></thead><tbody>{taxInvoices.map((row,index)=><tr key={`${row.date}-${index}`}><td>{row.date}</td><td>{row.supplier}</td><td>{row.category}</td><td>{row.supply.toLocaleString()}원</td><td>{row.tax.toLocaleString()}원</td><td>{row.status}</td><td>{(row.supply+row.tax).toLocaleString()}원</td></tr>)}</tbody></table></div><p className={invoiceDifference===0?'naver-vat-invoice-match':'naver-vat-invoice-mismatch'}>로우데이터 수수료 합계 {feeGrandTotal.toLocaleString()}원 · 세금계산서 합계 {invoiceGrandTotal.toLocaleString()}원 · 차이 {invoiceDifference.toLocaleString()}원 {invoiceDifference===0?'일치':'확인 필요'}</p></>}</div>
      <div className="naver-verification-actions"><button className="primary" type="button" disabled={unsaved||busy||unassigned.length>0||totals.length===0} onClick={()=>void exportExcel()}><Download size={16}/>최종 수수료 내역 엑셀 다운로드</button>{unassigned.length>0&&<span className="naver-verification-message">모든 상품의 월별표 구분을 입력하고 저장해야 다운로드할 수 있습니다.</span>}</div>
    </>}
  </section>
}
