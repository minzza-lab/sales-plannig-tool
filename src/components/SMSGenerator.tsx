import { useState } from 'react'
import { callGeminiWithFallback } from '../utils/apiProxy'
import './SMSGenerator.css'

type MessageDraft = { title: string; body: string; usage: string }
const byteLength = (value: string) => Array.from(value).reduce((total, char) => total + (char.charCodeAt(0) > 127 ? 2 : 1), 0)
const parseMessages = (raw: string): MessageDraft[] | null => {
  const tagged = [...raw.matchAll(/\[문안\s*([1-3])\s*\|\s*(SMS|LMS)\]\s*([\s\S]*?)(?=\n?\[문안\s*[1-3]\s*\||$)/g)]
    .map((match) => ({ title: `${match[1]}안`, usage: match[2], body: match[3].trim() }))
    .filter((item) => item.body.length > 4)
  if (tagged.length >= 3) return tagged.slice(0, 3)
  const blocks = raw.trim().replace(/^```[\s\S]*?\n|```$/g, '').split(/\n\s*(?:---+|={3,})\s*\n/).map((item) => item.trim()).filter((item) => item.length > 4)
  return blocks.length >= 3 ? blocks.slice(0, 3).map((body, index) => ({ title: `${index + 1}안`, usage: byteLength(body) <= 90 ? 'SMS' : 'LMS', body })) : null
}

export default function SMSGenerator() {
  const [purpose, setPurpose] = useState('')
  const [audience, setAudience] = useState('')
  const [facts, setFacts] = useState('')
  const [tone, setTone] = useState('친근한 안내')
  const [drafts, setDrafts] = useState<MessageDraft[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const generate = async () => {
    if (!purpose.trim() || !facts.trim()) { setError('발송 목적과 확정된 정보를 입력해주세요.'); return }
    setError(''); setCopiedIndex(null); setIsGenerating(true)
    const prompt = `당신은 리조트 영업기획팀의 문자 발송 담당자입니다. 아래 확정 정보만 사용해 고객용 문자 문안 3개를 작성하세요. 제공되지 않은 가격·기간·혜택·링크는 절대 지어내지 말고, 꼭 필요하면 [확인 필요]로 남기세요. 과장 표현, 스팸성 반복, 이모지 남용은 금지합니다.\n\n[발송 목적]\n${purpose}\n\n[대상 고객]\n${audience || '일반 고객'}\n\n[확정 정보]\n${facts}\n\n[톤]\n${tone}\n\n다른 설명 없이 아래 형식을 정확히 지키세요. 1번은 90바이트 이내 SMS 우선, 2~3번은 필요한 경우 LMS로 작성하세요.\n[문안 1 | SMS]\n고객에게 보낼 문안\n[문안 2 | LMS]\n고객에게 보낼 문안\n[문안 3 | LMS]\n고객에게 보낼 문안`
    try {
      const config = { temperature: 0.5, maxOutputTokens: 900 }
      const raw = await callGeminiWithFallback([{ text: prompt }], ['gemini-2.5-flash', 'gemini-2.5-pro'], config)
      let messages = parseMessages(raw)
      if (!messages) {
        const repaired = await callGeminiWithFallback([{ text: `응답 형식이 맞지 않습니다. JSON을 쓰지 말고, 아래 [문안 N | SMS/LMS] 표기 3개만 사용해 다시 작성하세요.\n\n${prompt}` }], ['gemini-2.5-flash', 'gemini-2.5-pro'], config)
        messages = parseMessages(repaired)
      }
      if (!messages) throw new Error('AI 문안 형식이 올바르지 않습니다. 잠시 후 다시 시도해주세요.')
      setDrafts(messages)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '문안을 생성하지 못했습니다.') } finally { setIsGenerating(false) }
  }

  const copy = async (message: string, index: number) => { await navigator.clipboard.writeText(message); setCopiedIndex(index) }

  return <main className="sms-tool animate-fade-in"><header><p>SMS · LMS COPY</p><h1>문자 메시지 생성기</h1><span>확정된 행사·상품 정보만 넣으면 고객 발송용 문안을 만듭니다. 실제 발송은 연결된 문자 서비스에서 진행하세요.</span></header><section className="sms-form"><label>발송 목적<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="예: 9월 가족 패키지 사전 안내" /></label><div className="sms-two"><label>대상 고객<input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="예: 지난 여름 워터파크 방문 고객" /></label><label>문체<select value={tone} onChange={(event) => setTone(event.target.value)}><option>친근한 안내</option><option>간결한 혜택 안내</option><option>차분한 공지</option><option>긴급 안내</option></select></label></div><label>확정된 정보<textarea value={facts} onChange={(event) => setFacts(event.target.value)} rows={6} placeholder={'예: 행사명, 적용 기간, 예약 방법, 가격 또는 혜택, 문의처, 랜딩 페이지 URL\n확정되지 않은 정보는 쓰지 마세요.'} /></label>{error ? <p className="sms-error">{error}</p> : null}<button type="button" className="sms-generate" onClick={() => void generate()} disabled={isGenerating}>{isGenerating ? '문안 작성 중…' : 'AI 문자 문안 만들기'}</button></section>{drafts.length ? <section className="sms-results"><h2>발송 문안</h2><div>{drafts.map((draft, index) => { const bytes = byteLength(draft.body); return <article key={`${draft.title}-${index}`}><header><div><p>{draft.usage}</p><h3>{draft.title}</h3></div><span className={bytes <= 90 ? 'sms-badge' : 'lms-badge'}>{bytes <= 90 ? `SMS · ${bytes}byte` : `LMS · ${bytes}byte`}</span></header><textarea value={draft.body} onChange={(event) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} rows={5} /><footer><span>{byteLength(draft.body)} byte</span><button type="button" onClick={() => void copy(draft.body, index)}>{copiedIndex === index ? '복사 완료' : '문안 복사'}</button></footer></article> })}</div></section> : null}</main>
}
