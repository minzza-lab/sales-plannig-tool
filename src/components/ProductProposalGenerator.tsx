import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { callGeminiWithFallback } from '../utils/apiProxy'
import './ProductProposalGenerator.css'

type ProductBrief = { productName?: string; keyBenefits?: string; targetAudience?: string; instagramBrief?: string }
type ProductPlan = { title: string; concept: string; target: string; composition: Array<{ item: string; value: string; note: string }>; priceStrategy: string; salesMessages: string[]; channelPlan: string[]; operationChecklist: string[]; confirmationItems: string[] }
type ReferenceItem = { id: string; url: string; label: string; purpose: string }
const cleanJson = (value: string) => value.trim().replace(/^```json\s*|\s*```$/g, '')
const referenceStorageKey = 'sales-product-reference-board-v1'

export default function ProductProposalGenerator() {
  const location = useLocation()
  const brief = (location.state as { productBrief?: ProductBrief } | null)?.productBrief
  const [theme, setTheme] = useState('')
  const [goal, setGoal] = useState('')
  const [target, setTarget] = useState('')
  const [resources, setResources] = useState('')
  const [plan, setPlan] = useState<ProductPlan | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [referenceUrl, setReferenceUrl] = useState('')
  const [referenceLabel, setReferenceLabel] = useState('')
  const [referencePurpose, setReferencePurpose] = useState('')
  const [referenceError, setReferenceError] = useState('')

  useEffect(() => { if (brief) { setTheme(brief.productName || ''); setGoal(brief.instagramBrief || brief.keyBenefits || ''); setTarget(brief.targetAudience || ''); setResources(brief.keyBenefits || '') } }, [brief])
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(referenceStorageKey) || '[]'); if (Array.isArray(saved)) setReferences(saved.filter((item): item is ReferenceItem => item && typeof item.url === 'string' && typeof item.label === 'string' && typeof item.purpose === 'string')) } catch { /* 저장된 레퍼런스가 없으면 비워 둔다. */ } }, [])
  useEffect(() => { localStorage.setItem(referenceStorageKey, JSON.stringify(references)) }, [references])

  const addReference = () => {
    try { new URL(referenceUrl.trim()) } catch { setReferenceError('http:// 또는 https://로 시작하는 레퍼런스 주소를 입력해주세요.'); return }
    if (!referenceLabel.trim()) { setReferenceError('레퍼런스 이름을 입력해주세요.'); return }
    setReferences((current) => [{ id: `${Date.now()}-${Math.random()}`, url: referenceUrl.trim(), label: referenceLabel.trim(), purpose: referencePurpose.trim() || '활용 방향 미정' }, ...current])
    setReferenceUrl(''); setReferenceLabel(''); setReferencePurpose(''); setReferenceError('')
  }

  const generate = async () => {
    if (!theme.trim() || !goal.trim()) { setError('상품 주제와 판매 목표를 입력해주세요.'); return }
    setError(''); setCopied(false); setIsGenerating(true)
    const prompt = `당신은 리조트 세일즈 상품기획 담당자입니다. 제공된 사실만으로 실제 검토 가능한 상품 구성안을 만드세요. 가격·기간·재고·제휴 확정 사실은 지어내지 말고, 확정 전 항목은 confirmationItems에 분명히 적으세요. 반드시 JSON만 반환하세요.\n\n[상품 주제]\n${theme}\n\n[판매 목표 또는 업무 지시]\n${goal}\n\n[타깃]\n${target || '미정'}\n\n[현재 활용 가능 소재·제약]\n${resources || '미정'}\n\n[JSON 형식]\n{"title":"상품안 제목","concept":"상품을 한 문단으로 설명","target":"핵심 고객과 구매 상황","composition":[{"item":"구성 항목","value":"고객이 받는 가치","note":"운영 조건 또는 확인점"}],"priceStrategy":"가격·할인 운영 원칙. 확정 가격은 쓰지 말 것","salesMessages":["고객용 핵심 메시지 3개 이상"],"channelPlan":["채널별 실행 방법 3개 이상"],"operationChecklist":["내부 실행 체크리스트 4개 이상"],"confirmationItems":["확정 전에 확인할 항목 3개 이상"]}`
    try {
      const raw = await callGeminiWithFallback([{ text: prompt }], ['gemini-2.5-flash', 'gemini-2.5-pro'], { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 1500 })
      const parsed = JSON.parse(cleanJson(raw)) as Partial<ProductPlan>
      if (!parsed.title || !parsed.concept || !Array.isArray(parsed.composition) || !Array.isArray(parsed.salesMessages) || !Array.isArray(parsed.channelPlan) || !Array.isArray(parsed.operationChecklist) || !Array.isArray(parsed.confirmationItems)) throw new Error('상품안 형식이 완전하지 않습니다. 다시 생성해주세요.')
      setPlan(parsed as ProductPlan)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '상품안을 생성하지 못했습니다.') } finally { setIsGenerating(false) }
  }

  const copyPlan = async () => {
    if (!plan) return
    const text = `${plan.title}\n\n${plan.concept}\n\n타깃\n${plan.target}\n\n상품 구성\n${plan.composition.map((item, index) => `${index + 1}. ${item.item}: ${item.value}${item.note ? ` (${item.note})` : ''}`).join('\n')}\n\n판매 메시지\n${plan.salesMessages.map((item) => `- ${item}`).join('\n')}\n\n채널 계획\n${plan.channelPlan.map((item) => `- ${item}`).join('\n')}\n\n운영 체크\n${plan.operationChecklist.map((item) => `- ${item}`).join('\n')}\n\n확인 필요\n${plan.confirmationItems.map((item) => `- ${item}`).join('\n')}`
    await navigator.clipboard.writeText(text); setCopied(true)
  }

  return <main className="product-plan-tool animate-fade-in">
    <header><p>PRODUCT PLANNING</p><h1>상품 구성안 생성기</h1><span>회의 결과와 현재 확보한 소재를 바탕으로, 검토 가능한 판매 상품안을 만듭니다.</span></header>
    <section className="product-plan-form"><label>상품 주제 또는 캠페인<input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="예: 9월 가족 워터파크 1박 패키지" /></label><label>판매 목표 · 업무 지시<textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="예: 비수기 객실 점유를 높이고 워터파크 이용을 함께 제안" rows={4} /></label><div className="product-plan-two"><label>타깃 고객<input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="예: 초등 자녀가 있는 수도권 가족" /></label><label>보유 소재 · 제약<textarea value={resources} onChange={(event) => setResources(event.target.value)} placeholder="예: 현장 이미지, 사용 가능한 시설, 제외 조건" rows={2} /></label></div>{error ? <p className="product-plan-error">{error}</p> : null}<button type="button" className="product-plan-generate" onClick={() => void generate()} disabled={isGenerating}>{isGenerating ? '상품안을 검토 중…' : 'AI 상품 구성안 만들기'}</button></section>
    <section className="product-reference-board"><header><div><p>REFERENCE BOARD</p><h2>기획 · 디자인 레퍼런스</h2></div><span>이 브라우저에 저장</span></header><div className="product-reference-form"><input value={referenceLabel} onChange={(event) => setReferenceLabel(event.target.value)} placeholder="레퍼런스 이름" /><input value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https:// 레퍼런스 URL" /><input value={referencePurpose} onChange={(event) => setReferencePurpose(event.target.value)} placeholder="활용 목적: 구성·카피·색감 등" /><button type="button" onClick={addReference}>추가</button></div>{referenceError ? <p className="product-reference-error">{referenceError}</p> : null}{references.length ? <div className="product-reference-list">{references.map((item) => <article key={item.id}><a href={item.url} target="_blank" rel="noreferrer"><b>{item.label}</b><span>{item.url.replace(/^https?:\/\//, '')}</span></a><p>{item.purpose}</p><button type="button" onClick={() => setReferences((current) => current.filter((reference) => reference.id !== item.id))}>삭제</button></article>)}</div> : <p className="product-reference-empty">아직 모은 레퍼런스가 없습니다. 상품 구성과 디자인 방향을 정할 때 URL을 저장해두세요.</p>}</section>
    {plan ? <section className="product-plan-result"><div className="product-plan-result-head"><div><p>PROPOSAL DRAFT</p><h2>{plan.title}</h2></div><button type="button" onClick={() => void copyPlan()}>{copied ? '복사 완료' : '전체 복사'}</button></div><p className="product-plan-concept">{plan.concept}</p><dl><div><dt>핵심 타깃</dt><dd>{plan.target}</dd></div><div><dt>가격 운영</dt><dd>{plan.priceStrategy}</dd></div></dl><section><h3>상품 구성</h3><div className="product-plan-composition">{plan.composition.map((item, index) => <article key={`${item.item}-${index}`}><b>{item.item}</b><strong>{item.value}</strong>{item.note ? <span>{item.note}</span> : null}</article>)}</div></section><div className="product-plan-columns"><section><h3>판매 메시지</h3><ul>{plan.salesMessages.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section><h3>채널 실행</h3><ul>{plan.channelPlan.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section><h3>운영 체크</h3><ul>{plan.operationChecklist.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section className="needs-confirmation"><h3>확인 필요</h3><ul>{plan.confirmationItems.map((item, index) => <li key={index}>{item}</li>)}</ul></section></div></section> : null}
  </main>
}
