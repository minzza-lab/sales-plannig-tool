import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { BarChart3, ChevronLeft, ChevronRight, FileText, FolderPlus, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Category = 'direct' | 'wholesale' | 'ota' | 'other'
type Product = { id: string; title: string; category: Category; company_id?: string; company_name: string; sales_start: string; sales_end: string; target_amount: number; memo?: string; color: string; source_uid?: string; source_status?: string; source_created_at?: string; source_updated_at?: string; source_calendar_name?: string }
type Company = { id: string; category: Category; name: string }
type Result = { id: string; product_id: string; result_date: string; quantity: number; amount: number; memo?: string }
type ProductFile = { id: string; product_id: string; storage_path: string; original_name: string }

const labels: Record<Category, string> = { direct: '직영', wholesale: '대매', ota: 'OTA', other: '기타(B2B 등)' }
const categoryColors: Record<Category, string> = { direct: 'blue', wholesale: 'purple', ota: 'orange', other: 'green' }
const money = (value: number) => new Intl.NumberFormat('ko-KR').format(value || 0)
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateInput = () => dateKey(new Date())

export default function SalesScheduler() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [products, setProducts] = useState<Product[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [files, setFiles] = useState<ProductFile[]>([])
  const [modal, setModal] = useState<'product' | 'company' | 'result' | 'detail' | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category>('direct')
  const [proposalFile, setProposalFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const load = async () => {
    const [productData, companyData, resultData, fileData] = await Promise.all([
      supabase.from('sales_products').select('*').order('sales_start'), supabase.from('sales_companies').select('*').order('name'),
      supabase.from('sales_daily_results').select('*').order('result_date'), supabase.from('sales_product_files').select('*'),
    ])
    if (productData.error) setNotice('판매 스케줄러 설정 SQL을 먼저 실행해 주세요.')
    else setProducts((productData.data ?? []) as Product[])
    setCompanies((companyData.data ?? []) as Company[]); setResults((resultData.data ?? []) as Result[]); setFiles((fileData.data ?? []) as ProductFile[])
  }
  useEffect(() => { void load() }, [])

  const calendarDays = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1); start.setDate(1 - start.getDay())
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day })
  }, [month])
  const visibleProducts = useMemo(() => products.filter(product => product.sales_start <= dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)) && product.sales_end >= dateKey(new Date(month.getFullYear(), month.getMonth(), 1))), [products, month])
  const totals = useMemo(() => ({
    active: products.filter(product => product.sales_start <= dateInput() && product.sales_end >= dateInput()).length,
    target: products.reduce((sum, product) => sum + Number(product.target_amount), 0),
    actual: results.reduce((sum, result) => sum + Number(result.amount), 0),
    quantity: results.reduce((sum, result) => sum + Number(result.quantity), 0),
  }), [products, results])
  const selectedResults = selected ? results.filter(result => result.product_id === selected.id) : []
  const selectedFile = selected ? files.find(file => file.product_id === selected.id) : undefined

  const currentUser = async () => { const { data } = await supabase.auth.getUser(); return { id: data.user?.id, name: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || '사용자' } }
  const saveCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('company_name')).trim(); if (!name) return
    const user = await currentUser(); const { error } = await supabase.from('sales_companies').insert({ category: form.get('category'), name, created_by: user.id })
    if (error) setNotice(error.code === '23505' ? '이미 등록된 업체입니다.' : `업체 저장 실패: ${error.message}`); else { setModal(null); await load() }
  }
  const convertToPdf = async (file: File) => {
    if (file.type === 'application/pdf') return file
    if (!file.type.startsWith('image/')) throw new Error('현재는 PDF 또는 이미지 상품안만 업로드할 수 있습니다.')
    const { jsPDF } = await import('jspdf'); const image = new Image(); const source = URL.createObjectURL(file)
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.')); image.src = source })
    const portrait = image.height >= image.width; const pdf = new jsPDF({ orientation: portrait ? 'p' : 'l', unit: 'px', format: [image.width, image.height] })
    pdf.addImage(image, 'JPEG', 0, 0, image.width, image.height); URL.revokeObjectURL(source)
    return new File([pdf.output('blob')], `${file.name.replace(/\.[^.]+$/, '')}.pdf`, { type: 'application/pdf' })
  }
  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const start = String(form.get('sales_start')); const end = String(form.get('sales_end'))
    if (end < start) { setNotice('판매 종료일은 시작일보다 빠를 수 없습니다.'); return }
    setSaving(true); const user = await currentUser(); const companyId = String(form.get('company_id')); const company = companies.find(item => item.id === companyId)
    const { data, error } = await supabase.from('sales_products').insert({ title: String(form.get('title')).trim(), category: form.get('category'), company_id: companyId || null, company_name: company?.name || String(form.get('company_name')).trim() || '미분류', sales_start: start, sales_end: end, target_amount: Number(form.get('target_amount')) || 0, memo: String(form.get('memo')).trim() || null, color: categoryColors[String(form.get('category')) as Category], created_by: user.id, created_by_name: user.name }).select().single()
    if (error || !data) { setSaving(false); setNotice(`상품 저장 실패: ${error?.message ?? ''}`); return }
    try {
      if (proposalFile) { const pdf = await convertToPdf(proposalFile); const path = `${data.id}/${Date.now()}-${pdf.name}`; const upload = await supabase.storage.from('product-proposals').upload(path, pdf, { contentType: 'application/pdf' }); if (upload.error) throw upload.error; const saved = await supabase.from('sales_product_files').insert({ product_id: data.id, storage_path: path, original_name: pdf.name }); if (saved.error) throw saved.error }
      setModal(null); setProposalFile(null); setNotice('판매 상품과 상품안이 등록되었습니다.'); await load()
    } catch (uploadError) { setNotice(`상품은 등록됐지만 상품안 업로드에 실패했습니다: ${uploadError instanceof Error ? uploadError.message : ''}`) }
    setSaving(false)
  }
  const saveResult = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget); const user = await currentUser(); setSaving(true)
    const { error } = await supabase.from('sales_daily_results').upsert({ product_id: selected.id, result_date: form.get('result_date'), quantity: Number(form.get('quantity')) || 0, amount: Number(form.get('amount')) || 0, memo: String(form.get('memo')).trim() || null, created_by: user.id, created_by_name: user.name }, { onConflict: 'product_id,result_date' })
    setSaving(false); if (error) setNotice(`실적 저장 실패: ${error.message}`); else { setModal('detail'); await load() }
  }
  const showPreview = async () => { if (!selectedFile) return; const { data, error } = await supabase.storage.from('product-proposals').createSignedUrl(selectedFile.storage_path, 60 * 10); if (error || !data) { setNotice('상품안을 불러오지 못했습니다.'); return }; setPreviewUrl(data.signedUrl) }
  const categoryCompanies = companies.filter(company => company.category === selectedCategory)

  return <section className="sales-scheduler">
    <div className="sales-summary">{[['진행 중 판매', `${totals.active}건`], ['누적 실적', `${money(totals.actual)}원`], ['판매 수량', `${money(totals.quantity)}건`], ['목표 매출', `${money(totals.target)}원`]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="sales-actions"><div><h2><BarChart3 size={19} /> 판매 스케줄 · 실적</h2><p>상품 판매기간은 달력에서 연속 바로 표시되고, 일별 실적은 상품별로 직접 기록합니다.</p></div><div><button className="sales-secondary" onClick={() => setModal('company')}><FolderPlus size={16} /> 업체 추가</button><button className="workspace-primary" onClick={() => setModal('product')}><Plus size={17} /> 판매 상품 등록</button></div></div>
    {notice && <div className="workspace-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <section className="sales-calendar"><div className="calendar-toolbar"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={19} /></button><strong>{month.getFullYear()}년 {month.getMonth() + 1}월 판매 일정</strong><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={19} /></button><button className="today-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>오늘</button></div><div className="calendar-grid calendar-weekdays">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid sales-calendar-days">{calendarDays.map(day => { const key = dateKey(day); const productsOnDay = visibleProducts.filter(product => product.sales_start <= key && product.sales_end >= key); return <div className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'other-month' : ''}`} key={key}><time>{day.getDate()}</time>{productsOnDay.slice(0, 4).map(product => <button className={`sales-bar ${product.color} ${key === product.sales_start ? 'starts' : ''} ${key === product.sales_end ? 'ends' : ''}`} onClick={() => { setSelected(product); setModal('detail') }} key={`${product.id}-${key}`} title={`${product.company_name} · ${product.sales_start} ~ ${product.sales_end}`}><span>{key === product.sales_start ? product.company_name : ''}</span>{key === product.sales_start ? product.title : ''}</button>)}{productsOnDay.length > 4 && <small>+{productsOnDay.length - 4}개 판매</small>}</div> })}</div></section>
    <section className="sales-product-list"><h2>등록 상품 <span>{products.length}</span></h2>{products.length === 0 ? <p>판매 상품을 등록하면 판매기간 막대와 수기 실적 입력이 활성화됩니다.</p> : <div>{products.map(product => { const actual = results.filter(result => result.product_id === product.id).reduce((sum, result) => sum + Number(result.amount), 0); return <button key={product.id} onClick={() => { setSelected(product); setModal('detail') }}><i className={product.color} /><span><strong>{product.title}</strong><em>{labels[product.category]} · {product.company_name} · {product.sales_start} ~ {product.sales_end}</em></span><b>{money(actual)}원<small> / 목표 {money(Number(product.target_amount))}원</small></b></button> })}</div>}</section>
    {modal === 'company' && <Modal title="상세 업체 추가" onClose={() => setModal(null)}><form onSubmit={saveCompany}><label>대분류<select name="category" defaultValue="direct">{(Object.keys(labels) as Category[]).map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></label><label>업체명<input name="company_name" placeholder="예: 아고다" required autoFocus /></label><button className="workspace-primary">업체 저장</button></form></Modal>}
    {modal === 'product' && <Modal title="판매 상품 등록" onClose={() => setModal(null)}><form onSubmit={saveProduct}><label>상품명<input name="title" placeholder="예: 여름시즌 패키지" required autoFocus /></label><label>대분류<select name="category" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value as Category)}>{(Object.keys(labels) as Category[]).map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></label><label>상세 업체<select name="company_id" defaultValue=""><option value="">직접 입력 / 미분류</option>{categoryCompanies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select><small>목록에 없으면 ‘업체 추가’에서 팀 공용으로 등록하세요.</small></label><label>업체명 직접 입력<input name="company_name" placeholder="선택하지 않은 경우에만 입력" /></label><div className="two-fields"><label>판매 시작일<input type="date" name="sales_start" required defaultValue={dateInput()} /></label><label>판매 종료일<input type="date" name="sales_end" required defaultValue={dateInput()} /></label></div><label>목표 매출<input type="number" name="target_amount" min="0" placeholder="0" /></label><label>상품안 <small>PDF는 바로 미리보기, 이미지는 PDF로 변환됩니다.</small><input type="file" accept="application/pdf,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => setProposalFile(event.target.files?.[0] ?? null)} /></label><label>메모<textarea name="memo" rows={3} placeholder="판매 조건이나 유의사항" /></label><button className="workspace-primary" disabled={saving}>{saving ? '등록 중...' : '판매 상품 등록'}</button></form></Modal>}
    {modal === 'result' && selected && <Modal title={`${selected.title} 실적 입력`} onClose={() => setModal('detail')}><form onSubmit={saveResult}><label>실적일<input type="date" name="result_date" defaultValue={dateInput()} required /></label><div className="two-fields"><label>판매 수량<input type="number" name="quantity" min="0" defaultValue="0" /></label><label>매출액<input type="number" name="amount" min="0" defaultValue="0" /></label></div><label>메모<input name="memo" placeholder="채널별 특이사항" /></label><button className="workspace-primary" disabled={saving}>실적 저장</button></form></Modal>}
    {modal === 'detail' && selected && <Modal title={selected.title} onClose={() => { setModal(null); setPreviewUrl('') }}><div className="product-detail"><p><b>{labels[selected.category]} · {selected.company_name}</b><br />판매기간 {selected.sales_start} ~ {selected.sales_end}</p>{selected.memo && <section className="product-description"><h3>상품 · 판매 상세</h3><p>{selected.memo}</p></section>}{selected.source_uid && <section className="product-source"><h3>가져온 캘린더 정보</h3><p><b>{selected.source_calendar_name || 'OTA 캘린더'}</b>{selected.source_status && <> · {selected.source_status === 'CONFIRMED' ? '확정' : selected.source_status}</>}</p><small>{selected.source_created_at && `등록 ${new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(selected.source_created_at))}`}{selected.source_updated_at && ` · 최종 수정 ${new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(selected.source_updated_at))}`}</small></section>}<div className="product-detail-stats"><span>누적 매출 <strong>{money(selectedResults.reduce((sum, result) => sum + Number(result.amount), 0))}원</strong></span><span>판매 수량 <strong>{money(selectedResults.reduce((sum, result) => sum + Number(result.quantity), 0))}건</strong></span></div><div className="detail-buttons"><button className="workspace-primary" onClick={() => setModal('result')}><Plus size={16} /> 일별 실적 입력</button>{selectedFile && <button className="sales-secondary" onClick={() => void showPreview()}><FileText size={16} /> 상품안 보기</button>}</div>{previewUrl && <iframe className="proposal-preview" src={previewUrl} title="상품안 PDF" />}{selectedResults.length > 0 && <div className="result-history"><h3>입력 실적</h3>{selectedResults.map(result => <p key={result.id}><span>{result.result_date}</span><b>{money(Number(result.amount))}원 · {money(Number(result.quantity))}건</b><em>{result.memo}</em></p>)}</div>}</div></Modal>}
  </section>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="workspace-modal-backdrop" onMouseDown={onClose}><section className="workspace-modal sales-modal" onMouseDown={event => event.stopPropagation()}><header><h2>{title}</h2><button onClick={onClose}>×</button></header>{children}</section></div> }
