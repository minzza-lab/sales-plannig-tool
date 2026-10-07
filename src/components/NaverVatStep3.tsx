import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Row = Record<string, unknown>
type ProductMap = Record<string, { product: string; voucher: string }>
type FeeTotal = { date: string; category: string; supply: number; tax: number; total: number; count: number }
const CATEGORIES = ['콘도객실','히든힐스','리프트(히든힐스)','장비렌탈(히든힐스)','강습(히든힐스)','취소위약금','카바나','워터파크']
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
const cellBorder = { top:{style:'thin' as const,color:{argb:'FFB7C5D0'}},bottom:{style:'thin' as const,color:{argb:'FFB7C5D0'}},left:{style:'thin' as const,color:{argb:'FFB7C5D0'}},right:{style:'thin' as const,color:{argb:'FFB7C5D0'}} }

export default function NaverVatStep3() {
  const [file,setFile]=useState('');const [month,setMonth]=useState('');const [rows,setRows]=useState<Row[]>([])
  const [mappings,setMappings]=useState<ProductMap>({});const [saved,setSaved]=useState<ProductMap>({});const [message,setMessage]=useState('STEP 3 수수료 로우데이터를 올려 주세요. 업로드한 파일의 상품명을 분류하고 같은 파일의 수수료를 집계합니다.');const [busy,setBusy]=useState(false)
  const productFor=(row:Row)=>productName(row)||'〈상품명 없음〉'
  const feeRows=useMemo(()=>detailFeeRows(rows),[rows])
  const products=useMemo(()=>Array.from(new Set(feeRows.map(productFor))).sort((a,b)=>a.localeCompare(b,'ko')),[feeRows])
  const totals=useMemo<FeeTotal[]>(()=>{
    const grouped=new Map<string,FeeTotal>()
    feeRows.forEach(row=>{const date=baseDate(row);if(!date||!date.startsWith(month))return;const rawName=productFor(row);const mapping=mappings[rawName];const category=mapping?.voucher||guessCategory(rawName)||'';const fee=Math.abs(feeAmount(row));const key=`${date}\u0000${category}`;const current=grouped.get(key)||{date,category,supply:0,tax:0,total:0,count:0};current.total+=fee;current.count++;grouped.set(key,current)})
    return [...grouped.values()].map(item=>{item.tax=Math.round(item.total/11);item.supply=item.total-item.tax;return item}).sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category,'ko'))
  },[feeRows,month,mappings])
  const unsaved=JSON.stringify(mappings)!==JSON.stringify(saved)
  const unassigned=products.filter(product=>!(mappings[product]?.voucher||guessCategory(product)))
  const dates=useMemo(()=>Array.from(new Set(totals.map(item=>item.date))).sort(),[totals])

  const loadShared=async()=>{const {data,error}=await supabase.from('naver_vat_step3_settings').select('product_mappings').eq('id','main').maybeSingle();if(error)throw error;const shared=(data?.product_mappings&&typeof data.product_mappings==='object'?data.product_mappings:{}) as ProductMap;setMappings(shared);setSaved(shared)}
  const uploadCommission=async(next?:File)=>{if(!next)return;setBusy(true);setRows([]);setFile(next.name);try{const parsed=await readCommissionFile(next);setRows(parsed.rows);setMonth(parsed.month);await loadShared();setMessage(`${parsed.rows.length.toLocaleString()}건을 읽었습니다. 정산기준일 ${parsed.month} 기준으로 집계하며, 수수료가 0원인 상세행은 일별 금액에서 제외합니다.`)}catch(error){setMessage(error instanceof Error?error.message:'수수료 로우데이터를 읽지 못했습니다.')}finally{setBusy(false)}}
  const save=async()=>{setBusy(true);try{const {data:auth}=await supabase.auth.getUser();const {error}=await supabase.from('naver_vat_step3_settings').upsert({id:'main',product_mappings:mappings,updated_at:new Date().toISOString(),updated_by:auth.user?.id??null},{onConflict:'id'});if(error)throw error;setSaved(mappings);setMessage('상품별 수수료 구분을 팀 공용 설정으로 저장했습니다.')}catch(error){setMessage(`공유 설정을 저장하지 못했습니다. ${error instanceof Error?error.message:''}`)}finally{setBusy(false)}}
  const update=(product:string,value:string)=>setMappings(current=>({...current,[product]:{product:current[product]?.product??product,voucher:value}}))

  const exportExcel=async()=>{
    const ExcelJS=await import('exceljs');const {saveAs}=await import('file-saver');const book=new ExcelJS.Workbook();book.creator='WELLIHILLI Sales Planning';const categorySlots=[...CATEGORIES,...Array.from({length:8},()=> '')];const summary=book.addWorksheet(`${month.slice(5)}월 수수료`);summary.mergeCells(1,1,1,2+categorySlots.length*3+2);summary.getCell(1,1).value=`${month.replace('-','년 ')}월 온라인 상품 판매 수수료 내역_네이버`;summary.getCell(1,1).font={name:'맑은 고딕',size:14,bold:true};summary.getCell(1,1).alignment={horizontal:'center'};summary.getCell(2,1).value='(단위 : 원)';summary.getCell(2,1).alignment={horizontal:'right'};summary.getCell(3,1).value='구분';summary.mergeCells(3,1,4,1);
    categorySlots.forEach((category,index)=>{const start=2+index*3;summary.mergeCells(3,start,3,start+2);summary.getCell(3,start).value=category||'';['공급가액','세액','소계'].forEach((label,i)=>summary.getCell(4,start+i).value=label)})
    const totalCol=2+categorySlots.length*3;summary.mergeCells(3,totalCol,3,totalCol+2);summary.getCell(3,totalCol).value='총계';['공급가액','세액','소계'].forEach((label,i)=>summary.getCell(4,totalCol+i).value=label)
    dates.forEach((date,dateIndex)=>{const r=5+dateIndex;summary.getCell(r,1).value=`${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;categorySlots.forEach((category,index)=>{const item=category?totals.find(row=>row.date===date&&row.category===category):undefined;const start=2+index*3;summary.getCell(r,start).value=item?.supply??0;summary.getCell(r,start+1).value=item?.tax??0;summary.getCell(r,start+2).value=item?.total??0});const same=totals.filter(item=>item.date===date);summary.getCell(r,totalCol).value=same.reduce((s,item)=>s+item.supply,0);summary.getCell(r,totalCol+1).value=same.reduce((s,item)=>s+item.tax,0);summary.getCell(r,totalCol+2).value=same.reduce((s,item)=>s+item.total,0)})
    const totalRow=5+dates.length;summary.getCell(totalRow,1).value='합 계';categorySlots.forEach((category,index)=>{const group=category?totals.filter(item=>item.category===category):[];const start=2+index*3;summary.getCell(totalRow,start).value=group.reduce((sum,item)=>sum+item.supply,0);summary.getCell(totalRow,start+1).value=group.reduce((sum,item)=>sum+item.tax,0);summary.getCell(totalRow,start+2).value=group.reduce((sum,item)=>sum+item.total,0)});summary.getCell(totalRow,totalCol).value=totals.reduce((sum,item)=>sum+item.supply,0);summary.getCell(totalRow,totalCol+1).value=totals.reduce((sum,item)=>sum+item.tax,0);summary.getCell(totalRow,totalCol+2).value=totals.reduce((sum,item)=>sum+item.total,0)
    summary.columns.forEach((column,index)=>{column.width=index===0?12:14});summary.views=[{state:'frozen',xSplit:1,ySplit:4}];summary.eachRow(row=>row.eachCell(cell=>{cell.border=cellBorder;cell.alignment={vertical:'middle',horizontal:cell.address.replace(/[0-9]/g,'')==='A'?'center':'right'};if(Number(row.number)<=4){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8EEF5'}};cell.font={name:'맑은 고딕',bold:true}}}));for(let col=2;col<=totalCol+2;col++)summary.getColumn(col).numFmt='#,##0;[Red]-#,##0;"-"';summary.getRow(totalRow).font={name:'맑은 고딕',bold:true};
    const byDate=new Map<string,Row[]>();feeRows.forEach(row=>{const date=baseDate(row);if(date.startsWith(month))byDate.set(date,[...(byDate.get(date)||[]),row])});for(const [date,items] of byDate){const sheet=book.addWorksheet(date.slice(5).replace('-','.'));sheet.addRow(['정산기준일',date]);sheet.addRow(['원본 상품명','주문번호','상품주문번호','Npay 수수료','매출연동 수수료','무이자할부 수수료','수수료 합계','월별표 구분']);items.forEach(row=>{const product=productFor(row);const parts=feeParts(row);const amount=(label:string)=>parts.find(part=>part.label===label)?.amount||0;sheet.addRow([product,get(row,['주문번호']),get(row,['상품주문번호']),amount('Npay 수수료(B)'),amount('매출연동 수수료(C)'),amount('무이자할부 수수료(D)'),Math.abs(feeAmount(row)),mappings[product]?.voucher||guessCategory(product)||'미분류'])});const detailEnd=sheet.rowCount;sheet.addRow([]);sheet.addRow(['월별표 구분 합계','','','','','','']);const dateTotals=totals.filter(item=>item.date===date);dateTotals.forEach(item=>sheet.addRow([item.category,'','','','','',item.total]));sheet.getRow(2).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17365D'}};sheet.views=[{state:'frozen',ySplit:2}];sheet.columns.forEach((column,index)=>{column.width=[36,20,22,19,21,21,16,24][index]||14});for(let r=3;r<=detailEnd;r++)for(let c=4;c<=7;c++)sheet.getCell(r,c).numFmt='#,##0;[Red]-#,##0;"-"';for(let r=detailEnd+2;r<=sheet.rowCount;r++)sheet.getCell(r,7).numFmt='#,##0;[Red]-#,##0;"-"'}
    const output=await book.xlsx.writeBuffer();saveAs(new Blob([new Uint8Array(output).buffer]),`${file.replace(/\.(xlsx|xls)$/i,'')}_최종수수료내역.xlsx`)
  }

  return <section className="naver-settlement-card naver-vat-step3"><div className="naver-verification-heading"><div><span>STEP 03 · VAT & VOUCHER</span><h2>부가세 정산 · 월별 수수료 내역</h2><p>STEP 3에 올린 수수료 원본의 상품명을 분류하고, 같은 파일에 있는 수수료 금액을 정산기준일별로 집계해 월별 수수료 내역으로 출력합니다.</p></div><FileSpreadsheet size={30}/></div>
    <div className="naver-vat-step3-uploads"><label className="naver-bank-upload"><UploadCloud size={21}/><span><b>STEP 3 수수료 로우데이터 <em>필수</em></b><small>{busy?'파일을 처리하고 있습니다…':file||'상품명·정산기준일·수수료 열이 있는 네이버 정산 상세 엑셀을 선택하세요.'}</small></span><input type="file" accept=".xlsx,.xls" onChange={event=>void uploadCommission(event.target.files?.[0])}/></label></div>
    <p className="naver-verification-message" role="status">{message}</p>
    {rows.length>0&&<><div className="naver-verification-summary"><span>수수료 원본 <b>{rows.length.toLocaleString()}행</b></span><span>계산 대상 수수료 <b>{feeRows.length.toLocaleString()}건</b></span><span>정산기준월 <b>{month}</b></span><span>일자 <b>{dates.length}일</b></span></div>
      <div className="naver-vat-step3-mapping"><h3>상품별 월별표 구분</h3><p>상품명 기준으로 구분을 제안합니다. 비어 있는 상품명처럼 분류가 불확실한 항목은 직접 선택해 저장하세요.</p><div className="naver-vat-step3-list">{products.map(product=><label key={product}><span title={product}>{product}</span><select value={mappings[product]?.voucher||guessCategory(product)} onChange={event=>update(product,event.target.value)} aria-label={`${product} 월별표 구분`}><option value="">구분 선택</option>{CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}</select></label>)}</div><div className="naver-step2-savebar"><span className={unsaved?'unsaved':'saved'}>{unsaved?'저장되지 않은 변경이 있습니다.':unassigned.length?`미분류 상품 ${unassigned.length}종`:'팀 공용 기준과 일치합니다.'}</span><button type="button" disabled={!unsaved||busy} onClick={()=>void save()}>{busy?'저장 중…':'구분 기준 저장'}</button></div></div>
      <h3>{month} 날짜별 수수료 집계</h3><div className="naver-verification-table-wrap"><table><thead><tr><th>정산기준일</th><th>월별표 구분</th><th>공급가액</th><th>세액</th><th>소계</th><th>수수료 건수</th></tr></thead><tbody>{totals.map(item=><tr key={`${item.date}-${item.category}`}><td>{item.date}</td><td>{item.category||'미분류'}</td><td>{item.supply.toLocaleString()}원</td><td>{item.tax.toLocaleString()}원</td><td>{item.total.toLocaleString()}원</td><td>{item.count}건</td></tr>)}</tbody></table></div>
      <div className="naver-verification-actions"><button className="primary" type="button" disabled={unsaved||busy||unassigned.length>0||totals.length===0} onClick={()=>void exportExcel()}><Download size={16}/>최종 수수료 내역 엑셀 다운로드</button>{unassigned.length>0&&<span className="naver-verification-message">모든 상품의 월별표 구분을 입력하고 저장해야 다운로드할 수 있습니다.</span>}</div>
    </>}
  </section>
}
