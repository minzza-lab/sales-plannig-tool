import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrawlerSyncButton from './CrawlerSyncButton'
import './CSResponseCenter.css'

type FAQ = {
  id: string; category: string; subcategory: string | null; question: string
  customer_question_example: string | null; answer: string | null; keywords: string[] | null
  additional_guidance: string | null; internal_notes: string | null; handling_procedure: string | null
  담당부서?: string | null; response_type: string; status: string; view_count: number; updated_at: string
  voc_source_id?: string | null; voc_source_date?: string | null; voc_answer_date?: string | null; source_note?: string | null
}
type Consultation = { id: string; customer_name: string | null; customer_phone: string | null; order_number: string | null; category: string; inquiry_type: string | null; inquiry_content: string; response_content: string | null; linked_faq_id: string | null; assigned_to: string | null; status: string; internal_memo: string | null; created_at: string; completed_at: string | null }
type VOCInquiry = { id: string; seq_id: string; category: string | null; title: string | null; content: string | null; answer: string | null; status: string; created_at: string }

const categories = ['전체', '장비보관소', '시즌패스', '스노우파크', '워터플래닛', '객실', '기타']
const lockerTypes = ['상품 및 요금', '구매 및 결제', '보관함 배정', '와이즈클럽', '시설 및 이용', '취소 및 환불', '민원 및 예외사항']
const responseTypes = ['즉시 안내', '담당자 확인', '관리자 승인', '현장 이관']
const faqStatuses = ['초안', '검토 중', '게시', '비활성화']
const consultationStatuses = ['접수', '확인 중', '처리 완료', '보류']
const emptyFaq: Partial<FAQ> = { category: '장비보관소', subcategory: '상품 및 요금', response_type: '담당자 확인', status: '초안', keywords: [] }

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-'
const badgeClass = (value: string) => value.replace(/\s/g, '-')

export default function CSResponseCenter() {
  const location = useLocation()
  const mode = location.pathname.endsWith('/history') ? 'history' : location.pathname.endsWith('/admin') ? 'admin' : location.pathname.endsWith('/search') ? 'search' : 'dashboard'
  const [faqs, setFaqs] = useState<FAQ[]>([]); const [consultations, setConsultations] = useState<Consultation[]>([]); const [vocRows, setVocRows] = useState<VOCInquiry[]>([])
  const [selected, setSelected] = useState<FAQ | null>(null); const [query, setQuery] = useState(''); const [category, setCategory] = useState('전체')
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [isAdmin, setIsAdmin] = useState(false); const [editing, setEditing] = useState<Partial<FAQ> | null>(null)
  const [consultationFaq, setConsultationFaq] = useState<FAQ | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [faqResult, consultationResult, userResult] = await Promise.all([
      supabase.from('cs_faqs').select('*').order('updated_at', { ascending: false }),
      supabase.from('cs_consultations').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.auth.getUser(),
    ])
    if (faqResult.error) setError(`FAQ를 불러오지 못했습니다: ${faqResult.error.message}`); else setFaqs((faqResult.data || []) as FAQ[])
    if (!consultationResult.error) setConsultations((consultationResult.data || []) as Consultation[])
    const vocResult = await supabase.from('voc_inquiries').select('id,seq_id,category,title,content,answer,status,created_at').eq('status', 'answered').order('created_at', { ascending: false }).limit(8)
    if (!vocResult.error) setVocRows((vocResult.data || []) as VOCInquiry[])
    const userId = userResult.data.user?.id
    if (userId) { const { data } = await supabase.from('app_user_access').select('role,status').eq('user_id', userId).maybeSingle(); setIsAdmin(data?.role === 'admin' && data?.status === 'approved') }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const visibleFaqs = useMemo(() => faqs.filter(faq => (mode === 'admin' || faq.status === '게시') && (category === '전체' || faq.category === category) && [faq.question, faq.customer_question_example, faq.answer, ...(faq.keywords || []), faq.category, faq.subcategory].join(' ').toLowerCase().includes(query.toLowerCase())), [faqs, mode, category, query])
  const postedFaqs = faqs.filter(faq => faq.status === '게시')
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2500) }
  const copyAnswer = async (faq: FAQ) => { if (!faq.answer) return; await navigator.clipboard.writeText(faq.answer); await supabase.from('cs_faqs').update({ view_count: (faq.view_count || 0) + 1 }).eq('id', faq.id); showNotice('표준 응대 문안을 복사했습니다.') }
  const openFaq = (faq: FAQ) => { setSelected(faq); void supabase.from('cs_faqs').update({ view_count: (faq.view_count || 0) + 1 }).eq('id', faq.id) }

  const saveFaq = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing?.question?.trim()) return
    const payload = { ...editing, keywords: typeof editing.keywords === 'string' ? (editing.keywords as unknown as string).split(',').map(v => v.trim()).filter(Boolean) : editing.keywords }
    const result = editing.id ? await supabase.from('cs_faqs').update(payload).eq('id', editing.id) : await supabase.from('cs_faqs').insert(payload)
    if (result.error) showNotice(`저장 실패: ${result.error.message}`); else { showNotice('FAQ를 저장했습니다.'); setEditing(null); await load() }
  }
  const saveConsultation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const data = Object.fromEntries(form.entries())
    const result = await supabase.from('cs_consultations').insert({ ...data, linked_faq_id: consultationFaq?.id || null, category: consultationFaq?.category || data.category })
    if (result.error) showNotice(`상담 이력 등록 실패: ${result.error.message}`); else { showNotice('상담 이력을 등록했습니다.'); setConsultationFaq(null); await load() }
  }

  const tabs = [['dashboard', 'CS 대시보드', '/tools/cs-center'], ['search', 'FAQ 검색', '/tools/cs-center/search'], ['history', '상담 이력 관리', '/tools/cs-center/history'], ...(isAdmin ? [['admin', 'FAQ 관리', '/tools/cs-center/admin']] : [])]
  return <div className="cs-page">
    <div className="cs-heading"><div><p className="cs-eyebrow">CUSTOMER SERVICE</p><h1>CS 응대센터</h1><p>확인된 운영정보를 기준으로 고객 문의에 일관되게 응대합니다.</p><p className="cs-source-note">※ 현재 FAQ는 실제 고객 VOC 답변을 기준으로 작성되었습니다. VOC 기준일자에 따라 운영정책과 응대내용이 달라질 수 있으니, 답변 전 기준일자를 확인하세요.</p></div><Link className="cs-primary" to="/tools/cs-center/search">FAQ 바로 찾기</Link></div>
    <nav className="cs-tabs">{tabs.map(([key, title, path]) => <Link key={key} className={mode === key ? 'active' : ''} to={path}>{title}</Link>)}</nav>
    {notice && <div className="cs-notice">{notice}</div>}{error && <div className="cs-error">{error}<button onClick={() => void load()}>다시 시도</button></div>}
    {mode === 'dashboard' && <Dashboard faqs={postedFaqs} consultations={consultations} vocRows={vocRows} onOpen={openFaq} onCopy={copyAnswer} onVocSync={() => void load()} />}
    {mode === 'search' && <Search faqs={visibleFaqs} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onOpen={openFaq} onCopy={copyAnswer} onConsult={setConsultationFaq} />}
    {mode === 'history' && <History consultations={consultations} />}
    {mode === 'admin' && (isAdmin ? <Admin faqs={faqs} editing={editing} setEditing={setEditing} onSave={saveFaq} onReload={load} /> : <div className="cs-empty">FAQ 관리 화면은 관리자만 이용할 수 있습니다.</div>)}
    {selected && <FaqDetail faq={selected} onClose={() => setSelected(null)} onCopy={copyAnswer} onConsult={() => { setConsultationFaq(selected); setSelected(null) }} />}
    {consultationFaq && <ConsultationForm faq={consultationFaq} onClose={() => setConsultationFaq(null)} onSubmit={saveConsultation} />}
    {loading && <div className="cs-loading">CS 데이터를 불러오는 중...</div>}
  </div>
}

function Dashboard({ faqs, consultations, vocRows, onOpen, onCopy, onVocSync }: { faqs: FAQ[]; consultations: Consultation[]; vocRows: VOCInquiry[]; onOpen: (faq: FAQ) => void; onCopy: (faq: FAQ) => void; onVocSync: () => void }) {
  const pending = consultations.filter(row => row.status !== '처리 완료').length; const done = consultations.length - pending
  return <><div className="cs-metrics"><Metric label="등록된 FAQ" value={faqs.length} /><Metric label="전체 상담 건수" value={consultations.length} /><Metric label="처리 대기" value={pending} /><Metric label="처리 완료" value={done} /></div><div className="cs-dashboard-grid"><section className="cs-card"><div className="cs-card-title"><h2>최근 게시 FAQ</h2><Link to="/tools/cs-center/search">전체 보기</Link></div>{faqs.slice(0, 5).map(faq => <FaqRow key={faq.id} faq={faq} onOpen={onOpen} onCopy={onCopy} />)}{!faqs.length && <Empty text="게시된 FAQ가 없습니다." />}</section><section className="cs-card"><div className="cs-card-title"><h2>최근 상담 이력</h2><Link to="/tools/cs-center/history">전체 보기</Link></div>{consultations.slice(0, 5).map(row => <div className="cs-history-row" key={row.id}><b>{row.customer_name || '고객명 미입력'}</b><span>{row.inquiry_type || row.category}</span><em className={`cs-badge ${badgeClass(row.status)}`}>{row.status}</em></div>)}{!consultations.length && <Empty text="등록된 상담 이력이 없습니다." />}</section><section className="cs-card cs-voc-card"><div className="cs-card-title"><div><h2>최근 VOC 원문 · FAQ 후보</h2><p>자동 수집된 답변은 원문 기준으로 검토 후 FAQ로 게시합니다.</p></div><CrawlerSyncButton target="voc" label="최신 VOC 동기화" onComplete={onVocSync} /></div>{vocRows.map(row => <div className="cs-voc-row" key={row.id}><div><b>{row.title || '제목 없음'}</b><p>{row.answer || '답변 없음'}</p></div><small>VOC #{row.seq_id}<br />{formatDate(row.created_at)}</small></div>)}{!vocRows.length && <Empty text="자동 수집된 답변 VOC가 없습니다." />}</section></div></>
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="cs-metric"><span>{label}</span><strong>{value.toLocaleString('ko-KR')}</strong></div> }
function Search({ faqs, query, setQuery, category, setCategory, onOpen, onCopy, onConsult }: { faqs: FAQ[]; query: string; setQuery: (v: string) => void; category: string; setCategory: (v: string) => void; onOpen: (faq: FAQ) => void; onCopy: (faq: FAQ) => void; onConsult: (faq: FAQ) => void }) { return <section><div className="cs-search-box"><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="고객 문의 내용을 입력하세요. 제목·답변·키워드를 함께 검색합니다." /><span>⌘ K</span></div><div className="cs-filter-row">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="cs-result-meta">{query || category !== '전체' ? `${faqs.length}건 검색됨` : `게시된 FAQ ${faqs.length}건`}</div><div className="cs-faq-grid">{faqs.map(faq => <FaqCard key={faq.id} faq={faq} onOpen={onOpen} onCopy={onCopy} onConsult={onConsult} />)}{!faqs.length && <Empty text="조건에 맞는 FAQ가 없습니다." />}</div></section> }
function FaqCard({ faq, onOpen, onCopy, onConsult }: { faq: FAQ; onOpen: (faq: FAQ) => void; onCopy: (faq: FAQ) => void; onConsult: (faq: FAQ) => void }) { return <article className="cs-faq-card"><div className="cs-card-tags"><span>{faq.category}{faq.subcategory ? ` · ${faq.subcategory}` : ''}</span><em className={`cs-badge ${badgeClass(faq.response_type)}`}>{faq.response_type}</em></div><button className="cs-question" onClick={() => onOpen(faq)}>{faq.question}</button><p>{faq.answer || '정책 확인 필요'}</p>{faq.voc_source_id && <small className="cs-voc-meta">VOC #{faq.voc_source_id} · 문의 {faq.voc_source_date || '-'} · 답변 {faq.voc_answer_date || '-'}</small>}<footer><small>수정 {formatDate(faq.updated_at)}</small><div><button onClick={() => onConsult(faq)}>상담 등록</button><button className="cs-copy" onClick={() => onCopy(faq)}>답변 복사</button></div></footer></article> }
function FaqRow({ faq, onOpen, onCopy }: { faq: FAQ; onOpen: (faq: FAQ) => void; onCopy: (faq: FAQ) => void }) { return <div className="cs-faq-row"><button onClick={() => onOpen(faq)}><b>{faq.question}</b><small>{faq.category} · {faq.response_type}</small></button><button className="cs-copy" onClick={() => onCopy(faq)}>복사</button></div> }
function History({ consultations }: { consultations: Consultation[] }) { return <section className="cs-card"><div className="cs-card-title"><div><h2>상담 이력 관리</h2><p>고객 개인정보는 업무상 필요한 최소 항목만 기록하세요.</p></div></div><div className="cs-table-wrap"><table><thead><tr><th>접수일시</th><th>고객</th><th>문의 유형</th><th>문의 내용</th><th>담당자</th><th>상태</th></tr></thead><tbody>{consultations.map(row => <tr key={row.id}><td>{formatDate(row.created_at)}</td><td>{row.customer_name || '-'}</td><td>{row.inquiry_type || row.category}</td><td>{row.inquiry_content}</td><td>{row.assigned_to || '-'}</td><td><span className={`cs-badge ${badgeClass(row.status)}`}>{row.status}</span></td></tr>)}</tbody></table></div>{!consultations.length && <Empty text="등록된 상담 이력이 없습니다." />}</section> }
function Admin({ faqs, editing, setEditing, onSave, onReload }: { faqs: FAQ[]; editing: Partial<FAQ> | null; setEditing: (v: Partial<FAQ> | null) => void; onSave: (e: React.FormEvent) => void; onReload: () => void }) { return <section className="cs-admin"><div className="cs-card-title"><div><h2>FAQ 관리</h2><p>게시 전 운영정책과 요금을 확인하세요. 불확실한 내용은 게시하지 않습니다.</p></div><button className="cs-primary" onClick={() => setEditing({ ...emptyFaq })}>새 FAQ</button></div><div className="cs-admin-list">{faqs.map(faq => <div className="cs-admin-row" key={faq.id}><div><b>{faq.question}</b><span>{faq.category} · {faq.response_type} · {faq.status}</span></div><button onClick={() => setEditing(faq)}>수정</button></div>)}</div>{editing && <form className="cs-editor" onSubmit={onSave}><div className="cs-editor-header"><h3>{editing.id ? 'FAQ 수정' : 'FAQ 신규 등록'}</h3><button type="button" onClick={() => setEditing(null)}>닫기</button></div><label>질문 제목<input value={editing.question || ''} onChange={e => setEditing({ ...editing, question: e.target.value })} required /></label><div className="cs-form-grid"><label>카테고리<select value={editing.category || ''} onChange={e => setEditing({ ...editing, category: e.target.value })}>{categories.slice(1).map(v => <option key={v}>{v}</option>)}</select></label><label>세부 유형<select value={editing.subcategory || ''} onChange={e => setEditing({ ...editing, subcategory: e.target.value })}>{(editing.category === '장비보관소' ? lockerTypes : ['일반 문의']).map(v => <option key={v}>{v}</option>)}</select></label><label>응대 유형<select value={editing.response_type || ''} onChange={e => setEditing({ ...editing, response_type: e.target.value })}>{responseTypes.map(v => <option key={v}>{v}</option>)}</select></label><label>게시 상태<select value={editing.status || ''} onChange={e => setEditing({ ...editing, status: e.target.value })}>{faqStatuses.map(v => <option key={v}>{v}</option>)}</select></label></div><label>고객 문의 예시<textarea value={editing.customer_question_example || ''} onChange={e => setEditing({ ...editing, customer_question_example: e.target.value })} /></label><label>표준 응대 문안<textarea value={editing.answer || ''} onChange={e => setEditing({ ...editing, answer: e.target.value })} /></label><label>키워드 <small>쉼표로 구분</small><input value={Array.isArray(editing.keywords) ? editing.keywords.join(', ') : (editing.keywords || '') as string} onChange={e => setEditing({ ...editing, keywords: e.target.value as unknown as string[] })} /></label><label>내부 메모 / 주의사항<textarea value={editing.internal_notes || ''} onChange={e => setEditing({ ...editing, internal_notes: e.target.value })} /></label><button className="cs-primary" type="submit">저장</button><button type="button" onClick={onReload}>목록 새로고침</button></form>}</section> }
function FaqDetail({ faq, onClose, onCopy, onConsult }: { faq: FAQ; onClose: () => void; onCopy: (faq: FAQ) => void; onConsult: () => void }) { return <div className="cs-modal-backdrop" onClick={onClose}><article className="cs-modal" onClick={e => e.stopPropagation()}><button className="cs-modal-close" onClick={onClose}>×</button><div className="cs-card-tags"><span>{faq.category} · {faq.subcategory}</span><em className={`cs-badge ${badgeClass(faq.response_type)}`}>{faq.response_type}</em></div><h2>{faq.question}</h2><small>최종 수정 {formatDate(faq.updated_at)}</small>{faq.voc_source_id && <div className="cs-source-panel"><strong>실제 VOC 기준</strong><span>원문 #{faq.voc_source_id}</span><span>문의일 {faq.voc_source_date || '-'}</span><span>답변일 {faq.voc_answer_date || '-'}</span><p>{faq.source_note || 'VOC 답변 기준으로 등록된 내용입니다.'}</p></div>}<div className="cs-detail-section"><h3>고객 문의 예시</h3><p>{faq.customer_question_example || '-'}</p></div><div className="cs-answer-box"><h3>표준 응대 문안</h3><p>{faq.answer || '정책 확인 필요'}</p><div><button className="cs-copy" onClick={() => onCopy(faq)}>답변 복사</button><button onClick={onConsult}>상담 이력 등록</button></div></div><div className="cs-detail-section internal"><h3>내부 직원용 정보</h3><dl><dt>상담 시 확인사항</dt><dd>{faq.internal_notes || '등록된 내부 안내가 없습니다.'}</dd><dt>처리 절차</dt><dd>{faq.handling_procedure || '등록된 처리 절차가 없습니다.'}</dd></dl></div></article></div> }
function ConsultationForm({ faq, onClose, onSubmit }: { faq: FAQ; onClose: () => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) { return <div className="cs-modal-backdrop" onClick={onClose}><form className="cs-modal cs-consult-form" onSubmit={onSubmit} onClick={e => e.stopPropagation()}><button type="button" className="cs-modal-close" onClick={onClose}>×</button><h2>상담 이력 등록</h2><p className="cs-linked">연결 FAQ: {faq.question}</p><label>고객명<input name="customer_name" /></label><label>연락처<input name="customer_phone" inputMode="tel" /></label><label>주문번호<input name="order_number" /></label><label>문의 유형<input name="inquiry_type" defaultValue={faq.subcategory || faq.category} /></label><label>문의 내용<textarea name="inquiry_content" required /></label><label>응대 내용<textarea name="response_content" defaultValue={faq.answer || ''} /></label><label>처리 담당자<input name="assigned_to" /></label><label>처리 상태<select name="status" defaultValue="접수">{consultationStatuses.map(v => <option key={v}>{v}</option>)}</select></label><label>내부 메모<textarea name="internal_memo" /></label><button className="cs-primary" type="submit">상담 이력 저장</button></form></div> }
function Empty({ text }: { text: string }) { return <div className="cs-empty">{text}</div> }
