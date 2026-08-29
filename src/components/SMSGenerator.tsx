import { useState } from 'react'
import { callGeminiWithFallback } from '../utils/apiProxy'
import './SMSGenerator.css'

type MessageDraft = { title: string; body: string; usage: string }
type PageReference = { url: string; title: string; description: string; text: string }
const byteLength = (value: string) => Array.from(value).reduce((total, char) => total + (char.charCodeAt(0) > 127 ? 2 : 1), 0)
const parseMessages = (raw: string): MessageDraft[] | null => {
  const tagged = [...raw.matchAll(/\[문안\s*([1-3])\s*\|\s*(SMS|LMS)\]\s*([\s\S]*?)(?=\n?\[문안\s*[1-3]\s*\||$)/g)].map((match) => ({ title: `${match[1]}안`, usage: match[2], body: match[3].trim() })).filter((item) => item.body.length > 4)
  if (tagged.length >= 3) return tagged.slice(0, 3)
  const blocks = raw.trim().replace(/^```[\s\S]*?\n|```$/g, '').split(/\n\s*(?:---+|={3,})\s*\n/).map((item) => item.trim()).filter((item) => item.length > 4)
  return blocks.length >= 3 ? blocks.slice(0, 3).map((body, index) => ({ title: `${index + 1}안`, usage: byteLength(body) <= 90 ? 'SMS' : 'LMS', body })) : null
}

export default function SMSGenerator() {
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventContent, setEventContent] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('친근한 안내')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [pageReference, setPageReference] = useState<PageReference | null>(null)
  const [isReadingPage, setIsReadingPage] = useState(false)
  const [drafts, setDrafts] = useState<MessageDraft[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const loadPageReference = async (): Promise<PageReference | null> => {
    if (!websiteUrl.trim()) return null
    setIsReadingPage(true)
    try {
      const response = await fetch('/api/page-reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: websiteUrl.trim() }) })
      const result = await response.json() as PageReference & { error?: string }
      if (!response.ok) throw new Error(result.error || '웹사이트 내용을 읽지 못했습니다.')
      setPageReference(result)
      return result
    } catch (cause) { setError(cause instanceof Error ? cause.message : '웹사이트 내용을 읽지 못했습니다.'); return null } finally { setIsReadingPage(false) }
  }

  const generate = async () => {
    if (!eventName.trim() || !eventDate.trim() || !eventContent.trim()) { setError('상품(행사)명, 일시, 내용은 모두 입력해주세요.'); return }
    setError(''); setCopiedIndex(null); setIsGenerating(true)
    const reference = websiteUrl.trim() ? await loadPageReference() : pageReference
    if (websiteUrl.trim() && !reference) { setIsGenerating(false); return }
    const prompt = `당신은 리조트 영업기획팀의 문자 발송 담당자입니다. 아래 확정 정보와 참고 페이지 내용만 사용해 고객용 문자 문안 3개를 작성하세요. 제공되지 않은 가격·기간·혜택·링크는 절대 지어내지 말고, 꼭 필요하면 [확인 필요]로 남기세요. 과장 표현, 스팸성 반복, 이모지 남용은 금지합니다.\n\n[상품 또는 행사명]\n${eventName}\n\n[일시]\n${eventDate}\n\n[내용]\n${eventContent}\n\n[대상 고객]\n${audience || '일반 고객'}\n\n[톤]\n${tone}\n\n[웹사이트 참고 자료]\n${reference ? `주소: ${reference.url}\n제목: ${reference.title}\n설명: ${reference.description}\n본문: ${reference.text}` : '없음'}\n\n다른 설명 없이 아래 형식을 정확히 지키세요. 1번은 90바이트 이내 SMS 우선, 2~3번은 필요한 경우 LMS로 작성하세요.\n[문안 1 | SMS]\n고객에게 보낼 문안\n[문안 2 | LMS]\n고객에게 보낼 문안\n[문안 3 | LMS]\n고객에게 보낼 문안`
    try {
      const config = { temperature: 0.5, maxOutputTokens: 900 }
      let messages = parseMessages(await callGeminiWithFallback([{ text: prompt }], ['gemini-2.5-flash', 'gemini-2.5-pro'], config))
      if (!messages) messages = parseMessages(await callGeminiWithFallback([{ text: `응답 형식이 맞지 않습니다. JSON을 쓰지 말고, 아래 [문안 N | SMS/LMS] 표기 3개만 사용해 다시 작성하세요.\n\n${prompt}` }], ['gemini-2.5-flash', 'gemini-2.5-pro'], config))
      if (!messages) throw new Error('AI 문안 형식이 올바르지 않습니다. 잠시 후 다시 시도해주세요.')
      setDrafts(messages)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '문안을 생성하지 못했습니다.') } finally { setIsGenerating(false) }
  }

  return <main className="sms-tool animate-fade-in"><header><p>SMS · LMS COPY</p><h1>문자 메시지 생성기</h1><span>필수 행사 정보를 기준으로 고객 발송용 문안을 만듭니다. 실제 발송은 연결된 문자 서비스에서 진행하세요.</span></header><section className="sms-form"><div className="sms-required"><strong>필수 입력</strong><span>세 항목을 모두 채워야 문안을 만들 수 있습니다.</span></div><label>상품(행사)명 <i>필수</i><input value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="예: 비어가든 썸머 페스티벌" /></label><label>일시 <i>필수</i><input value={eventDate} onChange={(event) => setEventDate(event.target.value)} placeholder="예: 8월 29일~9월 3일, 매일 18시~20시" /></label><label>내용 <i>필수</i><textarea value={eventContent} onChange={(event) => setEventContent(event.target.value)} rows={5} placeholder="예: 메뉴, 혜택, 장소, 예약 방법, 문의처 등 확정된 내용" /></label><div className="sms-two"><label>대상 고객<input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="예: 투숙객" /></label><label>문체<select value={tone} onChange={(event) => setTone(event.target.value)}><option>친근한 안내</option><option>간결한 혜택 안내</option><option>차분한 공지</option><option>긴급 안내</option></select></label></div><label>웹사이트 링크 <small>선택 · 페이지 내용을 읽어 문안에 참고합니다.</small><div className="sms-link-row"><input value={websiteUrl} onChange={(event) => { setWebsiteUrl(event.target.value); setPageReference(null) }} placeholder="https://example.com/event" /><button type="button" onClick={() => void loadPageReference()} disabled={!websiteUrl.trim() || isReadingPage}>{isReadingPage ? '읽는 중…' : '링크 불러오기'}</button></div></label>{pageReference ? <p className="sms-page-ready">참고 완료: {pageReference.title || pageReference.url}</p> : null}{error ? <p className="sms-error">{error}</p> : null}<button type="button" className="sms-generate" onClick={() => void generate()} disabled={isGenerating || isReadingPage}>{isGenerating ? '문안 작성 중…' : 'AI 문자 문안 만들기'}</button></section>{drafts.length ? <section className="sms-results"><h2>발송 문안</h2><div>{drafts.map((draft, index) => { const bytes = byteLength(draft.body); return <article key={`${draft.title}-${index}`}><header><div><p>{draft.usage}</p><h3>{draft.title}</h3></div><span className={bytes <= 90 ? 'sms-badge' : 'lms-badge'}>{bytes <= 90 ? `SMS · ${bytes}byte` : `LMS · ${bytes}byte`}</span></header><textarea value={draft.body} onChange={(event) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} rows={5} /><footer><span>{byteLength(draft.body)} byte</span><button type="button" onClick={() => void navigator.clipboard.writeText(draft.body).then(() => setCopiedIndex(index))}>{copiedIndex === index ? '복사 완료' : '문안 복사'}</button></footer></article> })}</div></section> : null}</main>
}
