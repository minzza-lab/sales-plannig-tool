import { useMemo, useRef, useState } from 'react'
import {
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { callGeminiWithFallback } from '../utils/apiProxy'
import './OfficialLetterGenerator.css'

type LetterForm = {
  recipient: string
  sender: string
  reference: string
  title: string
  opening: string
  details: string
  closing: string
  department: string
  approver: string
  documentNumber: string
  documentDate: string
  manager: string
  phone: string
  fax: string
  email: string
}

type AiBrief = {
  purpose: string
  keyRequest: string
  deadline: string
  context: string
  tone: string
}

type AiLetterResponse = {
  recipient?: string
  reference?: string
  title: string
  opening: string[]
  details: string[]
  closing: string[]
}

const today = new Date()
const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

const initialForm: LetterForm = {
  recipient: '',
  sender: '신안종합리조트㈜ 영업기획팀 최민혁 매니저',
  reference: '',
  title: '',
  opening: '1. 귀 사의 무궁한 발전과 일익 번창하심을 기원합니다.\n2. ',
  details: '가. 요청사항 : \n나. 요청기한 : \n\n다. 세부 내용\n1) \n2) \n\n라. 회신 방법\n1) \n2) \n\n마. 기타사항 : ',
  closing: '당사는 본 건이 원활하게 마무리될 수 있도록 최선을 다할 것을 약속드립니다.\n귀 사의 넓은 양해와 업무 협조를 부탁드립니다.',
  department: '영업기획팀',
  approver: '이현수',
  documentNumber: `영업기획팀 ${today.getFullYear()}-`,
  documentDate: defaultDate,
  manager: '최민혁 주임',
  phone: '033-340-3028',
  fax: '033-340-3183',
  email: '20203029@wellihillipark.com',
}

const initialBrief: AiBrief = {
  purpose: '',
  keyRequest: '',
  deadline: '',
  context: '',
  tone: '정중하고 협조적인 문체',
}

const openingCells = ['D12', 'D13', 'D14']
const detailCells = ['E16', 'E17', 'E18', 'E19', 'F20', 'F21', 'E22', 'E23', 'F24', 'F25', 'F26', 'E27', 'E28']
const closingCells = ['D30', 'D31']

function fitLines(value: string, length: number) {
  return [...value.split(/\r?\n/).slice(0, length), ...Array(length).fill('')].slice(0, length)
}

function normalizeDetailMarker(line: string, fallbackIndex: number) {
  const trimmed = line.trim()
  if (!trimmed) return ''
  if (/^[●•○◦▪■◆◇▶▷]\s*/.test(trimmed)) {
    return `${fallbackIndex}) ${trimmed.replace(/^[●•○◦▪■◆◇▶▷]\s*/, '')}`
  }
  return trimmed.replace(/^(\d+)[.]\s*/, '$1) ')
}

function formatDetailLines(value: string, length: number) {
  let childIndex = 1
  const normalized = value.split(/\r?\n/).map((line) => {
    if (/^[가-하]\.\s*/.test(line.trim())) {
      childIndex = 1
      return line.trim()
    }
    const result = normalizeDetailMarker(line, childIndex)
    if (/^\d+\)\s*/.test(result)) childIndex += 1
    return result
  })

  const spaced: string[] = []
  normalized.forEach((line) => {
    const startsSection = /^[다-하]\.\s*/.test(line)
    if (startsSection && spaced.length > 0 && spaced[spaced.length - 1] !== '' && spaced.length < length - 1) {
      spaced.push('')
    }
    spaced.push(line)
  })

  const compacted = spaced.length > length
    ? normalized.filter((line, index) => !(line === '' && normalized[index - 1] === '')).slice(0, length)
    : spaced
  return [...compacted, ...Array(length).fill('')].slice(0, length)
}

function isIndentedDetail(line: string) {
  return /^\d+\)\s*/.test(line)
}

function formatDocumentDate(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `(${year}. ${month}. ${day})` : ''
}

function spacedName(value: string) {
  return [...value.replace(/\s+/g, '')].join('     ')
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || '발송공문'
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function clearCellValue(sheetXml: string, reference: string) {
  const expandedPattern = new RegExp(`<c([^>]*\\sr="${reference}"[^>]*)>[\\s\\S]*?</c>`)
  const emptyPattern = new RegExp(`<c([^>]*\\sr="${reference}"[^>]*)\\/>`)
  const clean = (attributes: string) => attributes.replace(/\st="[^"]*"/, '').replace(/\/\s*$/, '')
  if (emptyPattern.test(sheetXml)) {
    return sheetXml.replace(emptyPattern, (_match, attributes: string) => `<c${clean(attributes)}/>`)
  }
  return sheetXml.replace(expandedPattern, (_match, attributes: string) => `<c${clean(attributes)}/>`)
}

function setCellSharedString(sheetXml: string, reference: string, stringIndex: number) {
  const emptyPattern = new RegExp(`<c([^>]*\\sr="${reference}"[^>]*)\\/>`)
  const expandedPattern = new RegExp(`(<c[^>]*\\sr="${reference}"[^>]*>)([\\s\\S]*?)(</c>)`)
  if (emptyPattern.test(sheetXml)) {
    return sheetXml.replace(emptyPattern, (_match, attributes: string) => {
      const cleanAttributes = attributes.replace(/\/\s*$/, '')
      const withType = /\st="/.test(cleanAttributes)
        ? cleanAttributes.replace(/\st="[^"]*"/, ' t="s"')
        : `${cleanAttributes} t="s"`
      return `<c${withType}><v>${stringIndex}</v></c>`
    })
  }
  return sheetXml.replace(expandedPattern, (_match, open: string, inner: string, close: string) => {
    const withType = /\st="/.test(open) ? open.replace(/\st="[^"]*"/, ' t="s"') : open.replace('>', ' t="s">')
    const nextInner = /<v>[\s\S]*?<\/v>/.test(inner)
      ? inner.replace(/<v>[\s\S]*?<\/v>/, `<v>${stringIndex}</v>`)
      : `${inner}<v>${stringIndex}</v>`
    return `${withType}${nextInner}${close}`
  })
}

function parseAiResponse(raw: string): AiLetterResponse {
  const normalized = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const jsonText = normalized.match(/\{[\s\S]*\}/)?.[0] ?? normalized
  const parsed = JSON.parse(jsonText) as Partial<AiLetterResponse>
  if (!parsed.title || !Array.isArray(parsed.opening) || !Array.isArray(parsed.details) || !Array.isArray(parsed.closing)) {
    throw new Error('AI가 공문 형식에 맞는 결과를 만들지 못했습니다. 다시 시도해주세요.')
  }
  return parsed as AiLetterResponse
}

type PaperProps = {
  form: LetterForm
  openingLines: string[]
  detailLines: string[]
  closingLines: string[]
}

function OfficialPaper({ form, openingLines, detailLines, closingLines }: PaperProps) {
  return (
    <div className="official-paper" aria-label="발송 공문 미리보기">
      <img className="paper-logo" src="/brand/wellihilli-ci-official.png" alt="웰리힐리파크 공식 로고" />
      <div className="paper-brand">
        <small>&quot;해발 600m 대자연, 힐링 리조트&quot;</small>
        <strong>신안종합리조트㈜</strong>
      </div>
      <div className="paper-meta">
        <p><b>수 신 자</b><span>: {form.recipient || ' '}</span></p>
        <p><b>발 신 자</b><span>: {form.sender}</span></p>
        <p><b>참&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;조</b><span>: {form.reference}</span></p>
        <p><b>제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목</b><span>: {form.title || ' '}</span></p>
      </div>
      <div className="paper-rule" />
      <div className="paper-body">
        <div className="paper-opening">
          {openingLines.map((line, index) => <p key={`opening-${index}`}>{line || '\u00a0'}</p>)}
        </div>
        <h3>- 아&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;래 -</h3>
        <div className="paper-details">
          {detailLines.map((line, index) => <p key={`detail-${index}`} className={isIndentedDetail(line) ? 'indented' : ''}>{line || '\u00a0'}</p>)}
        </div>
        <div className="paper-closing">
          {closingLines.map((line, index) => <p key={`closing-${index}`}>{line || '\u00a0'}</p>)}
        </div>
      </div>
      <div className="paper-sign">
        <strong>신안종합리조트㈜&nbsp;&nbsp;{form.department}</strong>
        <b>팀&nbsp;&nbsp;&nbsp;장&nbsp;&nbsp;&nbsp;&nbsp;{spacedName(form.approver)}</b>
        <span>직인 생략</span>
      </div>
      <div className="paper-footer">
        <p><span>문서번호 : {form.documentNumber}</span><span>{formatDocumentDate(form.documentDate)}</span><span>접수 :</span></p>
        <p>우) 225-834 강원도 횡성군 둔내면 고원로 451번지 <i>/</i> <u>http://www.wellihillipark.com</u></p>
        <p>담당자 : {form.manager} <i>/</i> 전화 : {form.phone} <i>/</i> FAX {form.fax} <i>/</i> <u>{form.email}</u></p>
      </div>
    </div>
  )
}

export default function OfficialLetterGenerator() {
  const [form, setForm] = useState<LetterForm>(initialForm)
  const [brief, setBrief] = useState<AiBrief>(initialBrief)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [message, setMessage] = useState('')
  const paperRef = useRef<HTMLDivElement>(null)

  const openingLines = useMemo(() => fitLines(form.opening, openingCells.length), [form.opening])
  const detailLines = useMemo(() => formatDetailLines(form.details, detailCells.length), [form.details])
  const closingLines = useMemo(() => fitLines(form.closing, closingCells.length), [form.closing])

  const update = (key: keyof LetterForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const updateBrief = (key: keyof AiBrief, value: string) => {
    setBrief((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const applyBriefExample = () => {
    setForm((current) => ({
      ...current,
      recipient: current.recipient || '제휴사 영업담당자님 귀하',
    }))
    setBrief({
      purpose: '여름 공동 프로모션 운영 협조 요청',
      keyRequest: '판매 페이지 게시 일정을 확인하고, 담당자 정보와 운영 가능 여부를 회신받고 싶습니다.',
      deadline: '8월 10일까지 회신',
      context: '양사 공동 프로모션 시작 전 판매 채널과 고객 안내 일정을 최종 확정해야 합니다.',
      tone: '정중하고 협조적인 문체',
    })
    setMessage('작성 예시를 입력했습니다. 실제 상황에 맞게 바꾼 뒤 AI 작성을 눌러주세요.')
  }

  const generateWithAi = async () => {
    if (!brief.purpose.trim() || !brief.keyRequest.trim()) {
      setMessage('AI 작성을 위해 공문 목적과 핵심 요청사항을 입력해주세요.')
      return
    }

    setIsAiGenerating(true)
    setMessage('')
    try {
      const prompt = `당신은 국내 기업의 대외 공문 작성 전문가입니다.
아래 최소 정보를 바탕으로 신안종합리조트㈜가 외부 회사에 보내는 정중하고 명확한 한국어 공문을 작성하세요.

[입력 정보]
- 수신자: ${form.recipient || '입력되지 않음'}
- 공문 목적: ${brief.purpose}
- 상대에게 요청할 핵심: ${brief.keyRequest}
- 기한/일정: ${brief.deadline || '별도 기한 없음'}
- 배경/상황: ${brief.context || '별도 설명 없음'}
- 원하는 문체: ${brief.tone}

[작성 규칙]
- 사실을 임의로 만들지 말고, 없는 숫자·날짜·담당자명은 추가하지 마세요.
- title은 간결한 공문 제목으로 작성하세요.
- opening은 정확히 2줄로, 첫 줄은 인사말, 둘째 줄은 발송 취지를 작성하세요.
- details는 정확히 13개 배열 요소로 작성하고 아래 행 구조를 반드시 지키세요.
  1행 "가. 요청사항 : ..."
  2행 "나. 요청기한 : ..."
  3행 빈 문자열
  4행 "다. 세부 내용"
  5행 "1) ..."
  6행 "2) ..."
  7행 빈 문자열
  8행 "라. 회신 방법"
  9행 "1) ..."
  10행 "2) ..."
  11행은 필요할 때만 "3) ...", 없으면 빈 문자열
  12행 빈 문자열
  13행 "마. 기타사항 : ..."
- ●, •, ○, 이모지, 장식용 특수문자는 절대 사용하지 마세요.
- 하위 내용은 1), 2), 3)만 사용하고 항목 사이의 빈 행을 반드시 유지하세요.
- closing은 정확히 2줄로, 협조 요청과 감사 표현으로 마무리하세요.
- 각 줄은 엑셀 공문 한 행에 들어가도록 60자 안팎으로 간결하게 작성하세요.
- 결과는 설명 없이 아래 JSON 구조만 반환하세요.
{"recipient":"","reference":"","title":"","opening":["",""],"details":["가. 요청사항 : ...","나. 요청기한 : ...","","다. 세부 내용","1) ...","2) ...","","라. 회신 방법","1) ...","2) ...","","","마. 기타사항 : ..."],"closing":["",""]}`

      const response = await callGeminiWithFallback(
        [{ text: prompt }],
        ['gemini-2.5-flash', 'gemini-2.5-pro'],
        { temperature: 0.35, responseMimeType: 'application/json' },
      )
      const generated = parseAiResponse(response)
      setForm((current) => ({
        ...current,
        recipient: current.recipient || generated.recipient || '',
        reference: current.reference || generated.reference || '',
        title: generated.title.trim(),
        opening: generated.opening.slice(0, 3).join('\n'),
        details: formatDetailLines(generated.details.join('\n'), 13).join('\n'),
        closing: generated.closing.slice(0, 2).join('\n'),
      }))
      setMessage('AI가 상황에 맞는 공문 초안을 작성했습니다. 내용을 확인하고 수정해주세요.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 공문 작성 중 오류가 발생했습니다.')
    } finally {
      setIsAiGenerating(false)
    }
  }

  const generateExcel = async () => {
    if (!form.recipient.trim() || !form.title.trim()) {
      setMessage('수신자와 제목을 입력해주세요.')
      return
    }

    setIsGenerating(true)
    setMessage('')
    try {
      const response = await fetch('/templates/outgoing-letter-template.xlsx')
      if (!response.ok) throw new Error('공문 원본 양식을 불러오지 못했습니다.')

      const zip = await JSZip.loadAsync(await response.arrayBuffer())
      const sharedStringsFile = zip.file('xl/sharedStrings.xml')
      const sheetFile = zip.file('xl/worksheets/sheet1.xml')
      if (!sharedStringsFile || !sheetFile) throw new Error('공문 양식의 내부 구조를 확인할 수 없습니다.')

      let sharedXml = await sharedStringsFile.async('string')
      let sheetXml = await sheetFile.async('string')
      let nextStringIndex = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>/g)].length

      const valuesByCell: Record<string, string> = {
        D6: `: ${form.recipient.trim()}`,
        D7: `: ${form.sender.trim()}`,
        D8: `: ${form.reference.trim()}`,
        D9: `: ${form.title.trim()}`,
        A39: `신안종합리조트㈜  ${form.department.trim()}`,
        A40: `                         팀    장       ${spacedName(form.approver)}`,
        A43: `문서번호 : ${form.documentNumber.trim()}`,
        M43: formatDocumentDate(form.documentDate),
        A45: `담당자 : ${form.manager.trim()}`,
        H45: `전화 : ${form.phone.trim()}   /`,
        O45: `FAX ${form.fax.trim()}    /`,
        V45: form.email.trim(),
      }
      openingCells.forEach((cell, index) => { valuesByCell[cell] = openingLines[index] })
      detailCells.forEach((cell, index) => { valuesByCell[cell] = detailLines[index] })
      closingCells.forEach((cell, index) => { valuesByCell[cell] = closingLines[index] })

      for (const [reference, value] of Object.entries(valuesByCell)) {
        if (value === '') {
          sheetXml = clearCellValue(sheetXml, reference)
          continue
        }
        sharedXml = sharedXml.replace('</sst>', `<si><t xml:space="preserve">${escapeXml(value)}</t></si></sst>`)
        sheetXml = setCellSharedString(sheetXml, reference, nextStringIndex)
        nextStringIndex += 1
      }

      sharedXml = sharedXml
        .replace(/count="\d+"/, `count="${nextStringIndex}"`)
        .replace(/uniqueCount="\d+"/, `uniqueCount="${nextStringIndex}"`)
      zip.file('xl/sharedStrings.xml', sharedXml)
      zip.file('xl/worksheets/sheet1.xml', sheetXml)

      const output = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      saveAs(output, `${safeFileName(form.title)}.xlsx`)
      setMessage('이미지와 원본 서식을 그대로 유지한 공문 엑셀을 생성했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '공문 생성 중 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadPdf = async () => {
    if (!form.recipient.trim() || !form.title.trim()) {
      setMessage('PDF 생성을 위해 수신자와 제목을 입력해주세요.')
      return
    }
    const paper = paperRef.current
    if (!paper) {
      setMessage('미리보기 화면을 준비하지 못했습니다.')
      return
    }

    setIsPdfGenerating(true)
    setMessage('')
    try {
      await document.fonts.ready
      const canvas = await html2canvas(paper, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
      pdf.save(`${safeFileName(form.title)}.pdf`)
      setMessage('미리보기와 동일한 A4 PDF를 다운로드했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PDF 생성 중 오류가 발생했습니다.')
    } finally {
      setIsPdfGenerating(false)
    }
  }

  return (
    <div className="official-letter-page">
      <header className="official-letter-header">
        <div>
          <span>OFFICIAL DOCUMENT</span>
          <h1>발송공문제작기</h1>
          <p>회사 공식 엑셀 양식의 이미지, 서식, 셀 간격과 인쇄 설정을 그대로 유지합니다.</p>
        </div>
        <div className="template-badge"><FileSpreadsheet size={22} /><span>공식 양식 적용</span></div>
      </header>

      <div className="official-letter-workspace">
        <section className="letter-form-panel">
          <div className="ai-writer">
            <div className="ai-writer-heading">
              <div><Sparkles size={19} /><span><strong>AI 공문 초안 작성</strong><small>핵심 내용만 적으면 공식 문체로 정리합니다.</small></span></div>
              <span className="ai-badge">GEMINI AI</span>
            </div>
            <div className="ai-input-guide">
              <div className="ai-guide-title">
                <Lightbulb size={16} />
                <span><strong>이렇게 입력하세요</strong><small>누가, 무엇을, 언제까지 해야 하는지만 알려주면 충분합니다.</small></span>
                <button type="button" onClick={applyBriefExample}>예시 입력하기</button>
              </div>
              <div className="ai-guide-examples">
                <div><b>1</b><span><strong>공문 목적</strong><small>예: 여름 공동 프로모션 운영 협조 요청</small></span></div>
                <div><b>2</b><span><strong>핵심 요청</strong><small>예: 판매 페이지 게시 일정과 담당자 정보를 회신해주세요.</small></span></div>
                <div><b>3</b><span><strong>기한·배경</strong><small>예: 8월 10일까지 / 프로모션 시작 전 일정 확정 필요</small></span></div>
              </div>
            </div>
            <div className="ai-brief-grid">
              <label><span>공문 목적 *</span><input value={brief.purpose} onChange={(event) => updateBrief('purpose', event.target.value)} placeholder="예: 여름 공동 프로모션 운영 협조 요청" /><em>공문을 보내는 이유를 한 문장으로 적어주세요.</em></label>
              <label><span>기한 또는 일정</span><input value={brief.deadline} onChange={(event) => updateBrief('deadline', event.target.value)} placeholder="예: 8월 10일까지 회신" /><em>회신일, 시행일 또는 운영 기간을 적어주세요.</em></label>
              <label className="full"><span>핵심 요청사항 *</span><textarea rows={3} value={brief.keyRequest} onChange={(event) => updateBrief('keyRequest', event.target.value)} placeholder="예: 판매 페이지 게시 일정을 확인하고 담당자 정보와 운영 가능 여부를 회신해주세요." /><em>상대방이 실제로 해주어야 할 일을 1~3개 적어주세요.</em></label>
              <label className="full"><span>배경·상황 (선택)</span><textarea rows={2} value={brief.context} onChange={(event) => updateBrief('context', event.target.value)} placeholder="예: 프로모션 시작 전 판매 채널과 고객 안내 일정을 최종 확정해야 합니다." /><em>계약, 일정 변경, 내부 결정 등 반드시 알아야 할 사실만 적어주세요.</em></label>
              <label><span>문체</span><select value={brief.tone} onChange={(event) => updateBrief('tone', event.target.value)}><option>정중하고 협조적인 문체</option><option>간결하고 공식적인 문체</option><option>긴급하지만 예의 있는 문체</option><option>안내 중심의 부드러운 문체</option></select></label>
              <button className="ai-generate" onClick={() => void generateWithAi()} disabled={isAiGenerating}>
                {isAiGenerating ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                {isAiGenerating ? '초안 작성 중...' : 'AI로 공문 작성'}
              </button>
            </div>
          </div>

          <div className="letter-section-title"><strong>기본 정보</strong><span>필수 항목 *</span></div>
          <div className="letter-field-grid">
            <label><span>수신자 *</span><input value={form.recipient} onChange={(event) => update('recipient', event.target.value)} placeholder="회사명, 부서, 담당자님 귀하" /></label>
            <label><span>발신자</span><input value={form.sender} onChange={(event) => update('sender', event.target.value)} /></label>
            <label><span>참조</span><input value={form.reference} onChange={(event) => update('reference', event.target.value)} placeholder="필요한 경우 입력" /></label>
            <label className="full"><span>제목 *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="발송 공문의 제목" /></label>
          </div>

          <div className="letter-section-title"><strong>본문</strong><span>한 줄이 엑셀 한 행에 배치됩니다.</span></div>
          <label className="letter-textarea"><span>도입부 · 최대 3줄</span><textarea rows={4} value={form.opening} onChange={(event) => update('opening', event.target.value)} /></label>
          <label className="letter-textarea"><span>세부 내용 · 최대 13줄</span><small>큰 항목 사이에는 빈 행을 두고, 하위 항목은 1)·2)·3) 형식으로 작성됩니다.</small><textarea rows={14} value={form.details} onChange={(event) => update('details', event.target.value)} /></label>
          <label className="letter-textarea"><span>맺음말 · 최대 2줄</span><textarea rows={3} value={form.closing} onChange={(event) => update('closing', event.target.value)} /></label>

          <div className="letter-section-title"><strong>문서 및 담당자 정보</strong><span>하단 정보 영역</span></div>
          <div className="letter-field-grid">
            <label><span>부서</span><input value={form.department} onChange={(event) => update('department', event.target.value)} /></label>
            <label><span>결재자</span><input value={form.approver} onChange={(event) => update('approver', event.target.value)} /></label>
            <label><span>문서번호</span><input value={form.documentNumber} onChange={(event) => update('documentNumber', event.target.value)} /></label>
            <label><span>시행일자</span><input type="date" value={form.documentDate} onChange={(event) => update('documentDate', event.target.value)} /></label>
            <label><span>담당자</span><input value={form.manager} onChange={(event) => update('manager', event.target.value)} /></label>
            <label><span>전화</span><input value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label>
            <label><span>FAX</span><input value={form.fax} onChange={(event) => update('fax', event.target.value)} /></label>
            <label><span>이메일</span><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
          </div>

          <div className="letter-actions">
            <button className="letter-reset" onClick={() => { setForm(initialForm); setBrief(initialBrief); setMessage('') }}><RotateCcw size={17} />초기화</button>
            <button className="letter-excel" onClick={() => void generateExcel()} disabled={isGenerating}><Download size={18} />{isGenerating ? '엑셀 생성 중...' : '공문 엑셀 다운로드'}</button>
          </div>
          {message && <p className="letter-message" role="status">{message}</p>}
        </section>

        <aside className="letter-preview-panel">
          <div className="preview-toolbar"><span>원본 양식 미리보기</span><em>A4 · 원본 로고 이미지 적용</em></div>
          <div className="paper-stage" ref={paperRef}>
            <OfficialPaper form={form} openingLines={openingLines} detailLines={detailLines} closingLines={closingLines} />
          </div>
          <div className="preview-actions">
            <button className="preview-button" onClick={() => setIsPreviewOpen(true)}><Eye size={18} />미리보기</button>
            <button className="pdf-button" onClick={() => void downloadPdf()} disabled={isPdfGenerating}>
              {isPdfGenerating ? <Loader2 className="spin" size={18} /> : <FileDown size={18} />}
              {isPdfGenerating ? 'PDF 생성 중...' : 'PDF 바로 다운로드'}
            </button>
          </div>
        </aside>
      </div>

      {isPreviewOpen && (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label="공문 전체 미리보기" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsPreviewOpen(false) }}>
          <div className="preview-modal-card">
            <div className="preview-modal-toolbar">
              <div><strong>공문 전체 미리보기</strong><span>다운로드될 A4 문서와 동일합니다.</span></div>
              <div>
                <button onClick={() => void downloadPdf()} disabled={isPdfGenerating}><FileDown size={17} />PDF 다운로드</button>
                <button className="modal-close" onClick={() => setIsPreviewOpen(false)} aria-label="미리보기 닫기"><X size={20} /></button>
              </div>
            </div>
            <div className="preview-modal-paper">
              <OfficialPaper form={form} openingLines={openingLines} detailLines={detailLines} closingLines={closingLines} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
