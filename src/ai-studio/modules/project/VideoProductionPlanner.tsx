import { useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Check,
  ChevronDown,
  Circle,
  Clipboard,
  Clapperboard,
  Copy,
  FileCheck2,
  Film,
  ImagePlus,
  LayoutPanelTop,
  LockKeyhole,
  MessageSquareText,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { callGeminiWithFallback } from '../../../utils/apiProxy'
import { useCharacters } from '../character/hooks/useCharacters'
import './video-production-planner.css'

type ApprovalStage = 'brief' | 'boards' | 'continuity' | 'prompt'
type ApprovalState = Record<ApprovalStage, boolean>

interface ProductionConfig {
  title: string
  creativeBrief: string
  purpose: string
  platform: string
  aspectRatio: string
  duration: string
  genre: string
  tone: string
  audience: string
  location: string
  time: string
  lighting: string
  cameraStyle: string
  movement: string
  pacing: string
  audio: string
  dialogue: string
  cta: string
  higgsfieldModel: string
  resolution: string
}

interface Shot {
  number: string
  duration: string
  role: string
  visual: string
  framing: string
  camera: string
  audio: string
  prompt: string
  imagePrompt?: string
}

interface AiProductionPackage {
  creativeSummary: string
  creativeRationale: string
  shots: Shot[]
  finalPrompt: string
  storyboardImageUrl?: string
}

const makeStoryboardSketchUrl = (shots: Shot[], seed: number) => {
  const panelDirections = shots.map((shot, index) =>
    `Panel ${index + 1}: ${shot.imagePrompt || shot.visual}. Composition: ${shot.framing}. Show the described action, environment, props, blocking and relationship clearly.`,
  ).join(' ')
  const prompt = `BLACK AND WHITE ROUGH PENCIL ADVERTISING STORYBOARD CONTACT SHEET. THIS MUST LOOK HAND DRAWN, NEVER LIKE A PHOTO. Exactly six distinct rectangular frames arranged in 2 columns and 3 rows. Each frame must show a visibly different scene, action, composition and camera distance. Anonymous simplified actors only; prioritize staging, environment, props, gestures and screen direction. Loose graphite lines, storyboard artist thumbnails, white paper, grayscale, no captions, no words, no logos. ${panelDirections}`
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=1200&nologo=true&enhance=false&seed=${seed}`
}

const convertImageToPencilSketch = (image: HTMLImageElement) => {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return image.src
  context.drawImage(image, 0, 0)
  const source = context.getImageData(0, 0, canvas.width, canvas.height)
  const output = context.createImageData(canvas.width, canvas.height)
  const gray = new Float32Array(canvas.width * canvas.height)
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4
    gray[index] = source.data[offset] * .299 + source.data[offset + 1] * .587 + source.data[offset + 2] * .114
  }
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = y * canvas.width + x
      const left = gray[y * canvas.width + Math.max(0, x - 1)]
      const right = gray[y * canvas.width + Math.min(canvas.width - 1, x + 1)]
      const top = gray[Math.max(0, y - 1) * canvas.width + x]
      const bottom = gray[Math.min(canvas.height - 1, y + 1) * canvas.width + x]
      const edge = Math.min(255, Math.hypot(right - left, bottom - top) * 3.4)
      const shade = Math.max(0, (145 - gray[index]) * .18)
      const paperGrain = ((x * 13 + y * 7) % 17) * .42
      const pencil = Math.max(18, Math.min(255, 252 - edge - shade - paperGrain))
      const offset = index * 4
      output.data[offset] = pencil
      output.data[offset + 1] = pencil
      output.data[offset + 2] = Math.max(0, pencil - 3)
      output.data[offset + 3] = 255
    }
  }
  context.putImageData(output, 0, 0)
  return canvas.toDataURL('image/jpeg', .9)
}

interface ReferenceImage {
  dataUrl: string
  mimeType: string
  name: string
}

interface GenerationProgress {
  open: boolean
  phase: 'planning' | 'images' | 'complete' | 'error'
  step: number
  percent: number
  completed: number
  failed: number
  previewUrl: string
}

const DEFAULT_CONFIG: ProductionConfig = {
  title: '웰리힐리 브랜드 필름',
  creativeBrief: '리조트에 도착한 순간 일상에서 벗어나는 설렘과 따뜻한 환대를 보여주세요.',
  purpose: '브랜드 인지도',
  platform: 'Instagram Reels',
  aspectRatio: '9:16',
  duration: '15초',
  genre: 'Cinematic',
  tone: '따뜻하고 감성적인',
  audience: '20–30대 여행 관심층',
  location: '자연광이 드는 리조트 로비',
  time: 'Golden hour',
  lighting: 'Soft cinematic',
  cameraStyle: 'Commercial cinema',
  movement: 'Slow dolly in',
  pacing: '감성적이고 여유롭게',
  audio: '시네마틱 앰비언트 + 공간음',
  dialogue: '대사 없음',
  cta: '지금, 새로운 장면을 만나보세요',
  higgsfieldModel: 'cinematic_studio_3_0',
  resolution: '1080p',
}

const modelOptions = [
  { value: 'cinematic_studio_3_0', label: 'Cinema Studio 3.0', note: '영화적 연출 · 최고 품질' },
  { value: 'seedance_2_0', label: 'Seedance 2.0', note: '캐릭터 일관성 · 레퍼런스 기반' },
  { value: 'cinematic_studio_video_v2', label: 'Cinema Studio V2', note: '카메라 · 색감 · 멀티샷' },
  { value: 'marketing_studio_video', label: 'Marketing Studio', note: 'UGC · 광고 · Reels' },
  { value: 'kling2_6', label: 'Kling 2.6', note: '물리 표현 · 역동적 모션' },
]

const selectOptions: Record<string, string[]> = {
  purpose: ['브랜드 인지도', '상품 홍보', 'SNS 참여 유도', '행사 안내', 'UGC 광고', '브랜드 스토리'],
  platform: ['Instagram Reels', 'TikTok', 'YouTube Shorts', 'YouTube', 'Digital Signage', 'Website Hero'],
  aspectRatio: ['9:16', '16:9', '1:1', '4:3', '21:9'],
  duration: ['5초', '8초', '10초', '12초', '15초'],
  genre: ['Cinematic', 'Drama', 'Comedy', 'Noir', 'Action', 'Epic', 'Lifestyle'],
  tone: ['따뜻하고 감성적인', '밝고 에너지 넘치는', '세련되고 고급스러운', '신뢰감 있고 차분한', '재미있고 발랄한'],
  audience: ['20–30대 여행 관심층', '가족 단위 고객', '커플 여행객', 'MZ세대', '기업·단체 고객', '전 연령 고객'],
  location: ['자연광이 드는 리조트 로비', '설원과 스키 슬로프', '워터파크 실내', '모던한 스튜디오', '도심 루프탑', '숲속 산책로'],
  time: ['Morning', 'Midday', 'Golden hour', 'Blue hour', 'Night'],
  lighting: ['Soft cinematic', 'High-key commercial', 'Natural daylight', 'Dramatic contrast', 'Neon cinematic'],
  cameraStyle: ['Commercial cinema', 'Handheld documentary', 'Luxury editorial', 'UGC smartphone', 'Dynamic action'],
  movement: ['Slow dolly in', 'Tracking shot', 'Orbit 180°', 'Crane down', 'Handheld follow', 'Static locked'],
  pacing: ['감성적이고 여유롭게', '빠르고 리드미컬하게', '강한 훅으로 시작', '점진적으로 몰입', '차분하고 신뢰감 있게'],
  audio: ['시네마틱 앰비언트 + 공간음', '경쾌한 팝 비트', '피아노 중심 감성 음악', '대사 + 자연스러운 공간음', '무음'],
  dialogue: ['대사 없음', '짧은 내레이션', '모델 직접 대사', '두 인물 대화'],
  cta: ['지금, 새로운 장면을 만나보세요', '지금 예약하세요', '자세히 알아보기', '우리의 이야기를 시작하세요', 'CTA 없음'],
  resolution: ['720p', '1080p', '4k'],
}

const approvalOrder: ApprovalStage[] = ['brief', 'boards', 'continuity', 'prompt']

const stageInfo: Array<{ id: ApprovalStage; label: string; description: string }> = [
  { id: 'brief', label: '제작 기획', description: '목표와 형식 확정' },
  { id: 'boards', label: '보드 검토', description: '캐릭터·스토리 승인' },
  { id: 'continuity', label: '콘티 승인', description: '숏과 카메라 확정' },
  { id: 'prompt', label: '최종 결재', description: 'Higgsfield 생성 준비' },
]

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="planner-field">
      <span>{label}</span>
      <div className="planner-select">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <ChevronDown size={14} />
      </div>
    </label>
  )
}

function ApprovalRail({ approvals }: { approvals: ApprovalState }) {
  const completed = approvalOrder.filter((stage) => approvals[stage]).length
  return (
    <aside className="approval-rail">
      <div className="rail-heading">
        <p>APPROVAL FLOW</p>
        <span>{completed}/4 approved</span>
      </div>
      <div className="approval-progress"><i style={{ width: `${completed * 25}%` }} /></div>
      <div className="approval-steps">
        {stageInfo.map((stage, index) => {
          const isApproved = approvals[stage.id]
          const isCurrent = !isApproved && approvalOrder.slice(0, index).every((item) => approvals[item])
          return (
            <div className={`${isApproved ? 'approved' : ''} ${isCurrent ? 'current' : ''}`} key={stage.id}>
              <span>{isApproved ? <Check size={14} /> : isCurrent ? index + 1 : <LockKeyhole size={12} />}</span>
              <p><strong>{stage.label}</strong><small>{stage.description}</small></p>
            </div>
          )
        })}
      </div>
      <div className="rail-note">
        <MessageSquareText size={16} />
        <p><strong>제작 비서 모드</strong><span>각 산출물을 확인하고 승인해야 다음 단계가 열립니다.</span></p>
      </div>
    </aside>
  )
}

function ApprovalBar({
  stage,
  approvals,
  onApprove,
  canApprove = true,
  prerequisiteText,
}: {
  stage: ApprovalStage
  approvals: ApprovalState
  onApprove: (stage: ApprovalStage) => void
  canApprove?: boolean
  prerequisiteText?: string
}) {
  const index = approvalOrder.indexOf(stage)
  const unlocked = approvalOrder.slice(0, index).every((item) => approvals[item])
  const approved = approvals[stage]
  return (
    <div className={`approval-bar ${approved ? 'done' : ''}`}>
      <div>
        {approved ? <BadgeCheck size={19} /> : unlocked && canApprove ? <FileCheck2 size={19} /> : <LockKeyhole size={18} />}
        <p>
          <strong>{approved ? '승인 완료' : unlocked && canApprove ? '검토 후 승인해 주세요' : prerequisiteText ?? '이전 단계 승인이 필요합니다'}</strong>
          <span>{approved ? '다음 제작 단계에 반영되었습니다.' : unlocked && !canApprove ? 'Gemini 생성 결과가 있어야 승인할 수 있습니다.' : '승인 전까지 다음 산출물은 잠금 상태입니다.'}</span>
        </p>
      </div>
      <button disabled={!unlocked || !canApprove || approved} onClick={() => onApprove(stage)}>
        {approved ? <><Check size={15} /> Approved</> : <>이 단계 승인 <ArrowRight size={15} /></>}
      </button>
    </div>
  )
}

export default function VideoProductionPlanner({ onOpenCharacterLibrary }: { onOpenCharacterLibrary?: () => void }) {
  const { characters } = useCharacters()
  const [config, setConfig] = useState<ProductionConfig>(() => {
    const saved = localStorage.getItem('ai-studio.production-config.v1')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) as ProductionConfig } : DEFAULT_CONFIG
  })
  const [selectedCast, setSelectedCast] = useState<string[]>(['CHAR_F02'])
  const [approvals, setApprovals] = useState<ApprovalState>({ brief: false, boards: false, continuity: false, prompt: false })
  const [copied, setCopied] = useState(false)
  const [aiPackage, setAiPackage] = useState<AiProductionPackage | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    open: false,
    phase: 'planning',
    step: 0,
    percent: 0,
    completed: 0,
    failed: 0,
    previewUrl: '',
  })
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)

  const cast = characters.filter((character) => selectedCast.includes(character.characterId))
  const shots = aiPackage?.shots ?? []
  const selectedModel = modelOptions.find((model) => model.value === config.higgsfieldModel) ?? modelOptions[0]

  const updateConfig = (key: keyof ProductionConfig, value: string) => {
    const next = { ...config, [key]: value }
    setConfig(next)
    localStorage.setItem('ai-studio.production-config.v1', JSON.stringify(next))
    setAiPackage(null)
    setGenerationError('')
    const briefKeys: Array<keyof ProductionConfig> = ['title', 'creativeBrief', 'purpose', 'platform', 'aspectRatio', 'duration', 'genre', 'tone', 'audience']
    const boardKeys: Array<keyof ProductionConfig> = ['location', 'time', 'lighting', 'cameraStyle', 'movement', 'pacing']
    const continuityKeys: Array<keyof ProductionConfig> = ['audio', 'dialogue', 'cta']
    setApprovals((current) => {
      if (briefKeys.includes(key)) return { brief: false, boards: false, continuity: false, prompt: false }
      if (boardKeys.includes(key)) return { ...current, boards: false, continuity: false, prompt: false }
      if (continuityKeys.includes(key)) return { ...current, continuity: false, prompt: false }
      return { ...current, continuity: false, prompt: false }
    })
  }

  const toggleCast = (characterId: string) => {
    setSelectedCast((current) => {
      if (current.includes(characterId)) return current.filter((id) => id !== characterId)
      return current.length >= 2 ? current : [...current, characterId]
    })
    setAiPackage(null)
    setGenerationError('')
    setApprovals((current) => ({ ...current, boards: false, continuity: false, prompt: false }))
  }

  const approve = (stage: ApprovalStage) => setApprovals((current) => ({ ...current, [stage]: true }))

  const invalidateVisualPlan = () => {
    setAiPackage(null)
    setGenerationError('')
    setApprovals((current) => ({ ...current, boards: false, continuity: false, prompt: false }))
  }

  const handleReferenceImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setGenerationError('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setGenerationError('기준 이미지는 10MB 이하로 업로드해 주세요.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setReferenceImage({
        dataUrl: String(reader.result),
        mimeType: file.type,
        name: file.name,
      })
      invalidateVisualPlan()
    }
    reader.readAsDataURL(file)
  }

  const clearReferenceImage = () => {
    setReferenceImage(null)
    if (referenceInputRef.current) referenceInputRef.current.value = ''
    invalidateVisualPlan()
  }

  const generateWithGemini = async () => {
    if (!approvals.boards || isGenerating) return

    setIsGenerating(true)
    setGenerationError('')
    setAiPackage(null)
    setGenerationProgress({ open: true, phase: 'planning', step: 0, percent: 8, completed: 0, failed: 0, previewUrl: '' })
    setApprovals((current) => ({ ...current, continuity: false, prompt: false }))

    const characterData = cast.map((character) => ({
      name: character.name,
      id: character.characterId,
      identityPrompt: character.promptSeed,
      appearance: {
        face: character.face,
        hair: character.hair,
        body: character.body,
        outfit: character.defaultOutfit,
      },
      personality: character.personality,
    }))

    const requestPrompt = `
You are a senior AI video creative director and an expert Higgsfield prompt engineer.
Create a production-ready package from the Korean brief below. Do not merely repeat the inputs: improve the hook, visual storytelling, camera language, action, continuity, and commercial impact.

PRODUCTION INPUT
${JSON.stringify({
  project: config,
  selectedHiggsfieldModel: selectedModel,
  characters: characterData,
  hasReferenceImage: Boolean(referenceImage),
}, null, 2)}

REQUIREMENTS
- Return exactly 6 shots whose durations add up to ${config.duration}.
- creativeSummary and creativeRationale must be written in Korean.
- visual and audio must be clear Korean production directions.
- framing, camera, and every shot prompt must be professional English suitable for an AI video model.
- finalPrompt must be a detailed English master prompt optimized for ${selectedModel.label}, not Markdown.
- imagePrompt must be a literal English visualization of the corresponding Korean visual field. It must contain the exact same number of people, location, action, emotion, props, screen direction and composition with no additions or substitutions.
- imagePrompt must describe only visible staging: environment, props, actor blocking, gesture, action and composition. Make every scene visibly distinct. Do not request beauty photography, facial detail, photorealism, rendering style, text or logos.
- Start with a strong first-second hook and end with the requested CTA.
- Preserve each selected character's exact identity, face, hair, outfit, age, body proportions, and ethnicity across all shots.
- If a reference image is attached, analyze it as the visual source and opening-frame reference. Preserve its architecture, spatial layout, materials, season, and recognizable location details while adding only actions requested in the creative brief.
- When a reference image is attached, explicitly describe the transition from that exact first frame in the shot prompts and finalPrompt.
- Include realistic physics, natural anatomy, spatial continuity, lighting continuity, brand-safe composition, and negative constraints against identity drift, morphing, extra limbs, flicker, warped hands, and unwanted text.
- If there is no cast, create an environment-led film without adding people.
- Avoid unsupported claims about the model. Do not include explanations outside JSON.

Return only this JSON shape:
{
  "creativeSummary": "한글 핵심 콘셉트 2~3문장",
  "creativeRationale": "한글 연출 전략 2~3문장",
  "shots": [
    {
      "number": "01",
      "duration": "2s",
      "role": "HOOK",
      "visual": "한글 화면과 인물 동작",
      "framing": "English framing and lens",
      "camera": "English camera movement",
      "audio": "한글 사운드 지시",
      "prompt": "Detailed English video shot prompt",
      "imagePrompt": "Detailed English still-image prompt that visualizes this exact storyboard frame"
    }
  ],
  "finalPrompt": "Complete English Higgsfield master generation prompt"
}`

    try {
      const parts = referenceImage
        ? [
            { text: requestPrompt },
            {
              inlineData: {
                data: referenceImage.dataUrl.split(',')[1],
                mimeType: referenceImage.mimeType,
              },
            },
          ]
        : [{ text: requestPrompt }]
      let responseText = await callGeminiWithFallback(
        parts,
        ['gemini-2.5-flash', 'gemini-2.5-pro'],
        {
          responseMimeType: 'application/json',
          temperature: 0.55,
          maxOutputTokens: 16384,
        },
      )
      setGenerationProgress((current) => ({ ...current, step: 1, percent: 55 }))
      let parsed: Partial<AiProductionPackage>
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(jsonMatch?.[0] ?? responseText) as Partial<AiProductionPackage>
      } catch {
        responseText = await callGeminiWithFallback(
          [{
            text: `Repair the malformed JSON below. Preserve every field and all 6 shots, fix syntax only, and return valid JSON with no Markdown.\n\n${responseText}`,
          }],
          ['gemini-2.5-flash', 'gemini-2.5-pro'],
          { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 16384 },
        )
        const repairedMatch = responseText.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(repairedMatch?.[0] ?? responseText) as Partial<AiProductionPackage>
      }
      setGenerationProgress((current) => ({ ...current, step: 2, percent: 70 }))
      if (
        !parsed.creativeSummary ||
        !parsed.creativeRationale ||
        !parsed.finalPrompt ||
        !Array.isArray(parsed.shots) ||
        parsed.shots.length !== 6 ||
        parsed.shots.some((shot) => !shot.number || !shot.visual || !shot.prompt)
      ) {
        throw new Error('AI 결과에 필요한 콘티 항목이 빠져 있습니다.')
      }
      const textPackage = {
        ...parsed,
        shots: parsed.shots.map((shot) => ({
          ...shot,
          imagePrompt: shot.imagePrompt || shot.prompt,
        })),
      } as AiProductionPackage
      setAiPackage(textPackage)
      setGenerationProgress((current) => ({ ...current, phase: 'images', step: 3, percent: 82 }))

      const imageSeed = Math.floor(Math.random() * 800000) + 100000
      let sketchUrl = ''
      for (let attempt = 0; attempt < 3 && !sketchUrl; attempt += 1) {
        const candidateUrl = makeStoryboardSketchUrl(textPackage.shots, imageSeed + attempt * 101)
        try {
          const loadedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image()
            const timeout = window.setTimeout(() => reject(new Error('스케치 생성 시간 초과')), 45000)
            image.crossOrigin = 'anonymous'
            image.onload = () => { window.clearTimeout(timeout); resolve(image) }
            image.onerror = () => { window.clearTimeout(timeout); reject(new Error('스케치 생성 실패')) }
            image.src = candidateUrl
          })
          sketchUrl = convertImageToPencilSketch(loadedImage)
        } catch {
          // Retry the single six-frame sketch sheet with a new seed.
        }
      }
      if (!sketchUrl) throw new Error('연필 스토리보드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setAiPackage((current) => current ? { ...current, storyboardImageUrl: sketchUrl } : current)
      setGenerationProgress({ open: true, phase: 'complete', step: 4, percent: 100, completed: 1, failed: 0, previewUrl: sketchUrl })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 생성 중 알 수 없는 오류가 발생했습니다.'
      setGenerationError(message)
      setGenerationProgress((current) => ({ ...current, phase: 'error' }))
    } finally {
      setIsGenerating(false)
    }
  }

  const finalPrompt = aiPackage?.finalPrompt ?? 'Gemini AI 콘티를 생성하면 선택한 Higgsfield 모델에 최적화된 마스터 프롬프트가 표시됩니다.'

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(finalPrompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const resetProject = () => {
    setConfig(DEFAULT_CONFIG)
    setSelectedCast(['CHAR_F02'])
    setApprovals({ brief: false, boards: false, continuity: false, prompt: false })
    setAiPackage(null)
    setGenerationError('')
    setReferenceImage(null)
    if (referenceInputRef.current) referenceInputRef.current.value = ''
    localStorage.removeItem('ai-studio.production-config.v1')
  }

  return (
    <div className="production-planner">
      {generationProgress.open && (
        <div className="generation-progress-backdrop">
          <section className={`generation-progress-modal ${generationProgress.phase}`} role="dialog" aria-modal="true" aria-label="AI 콘티 생성 진행 상황">
            <div className="generation-compact-heading">
              <div><p className="eyebrow">AI STORYBOARD DIRECTOR</p>
            <h2>
              {generationProgress.phase === 'planning' && '기획을 분석하고 콘티를 작성하고 있어요'}
              {generationProgress.phase === 'images' && '6분할 연필 스케치 컨셉보드를 그리고 있어요'}
              {generationProgress.phase === 'complete' && 'AI 스토리보드가 완성됐어요'}
              {generationProgress.phase === 'error' && '생성 중 문제가 발생했어요'}
            </h2>
              </div>
            </div>
            <p className="generation-status-copy">
              {generationProgress.phase === 'planning' && '선택한 캐릭터, 장소, 조명, 카메라와 메시지를 하나의 연출 흐름으로 구성합니다.'}
              {generationProgress.phase === 'images' && '전체 영상 흐름을 한 장의 3×2 광고 촬영 컨셉보드로 구성합니다.'}
              {generationProgress.phase === 'complete' && '6개 장면의 흐름을 담은 단일 스케치 컨셉보드가 준비됐습니다.'}
              {generationProgress.phase === 'error' && generationError}
            </p>
            <div className="generation-percent-head"><strong>실제 진행률</strong><span>{generationProgress.percent}%</span></div>
            <div className="generation-percent-track"><i style={{ width: `${generationProgress.percent}%` }} /></div>
            <div className="generation-step-list">
              {[
                ['기획 조건 분석', '목적·플랫폼·캐릭터·공간 확인'],
                ['6개 장면 흐름 구성', '도입부터 CTA까지 장면 연결'],
                ['촬영 연출 메모 정리', '화각·카메라·사운드 확정'],
                ['연필 콘티 문서 조립', '2열×3장면 스토리보드 완성'],
              ].map(([title, description], index) => (
                <div className={generationProgress.step > index ? 'done' : generationProgress.step === index && generationProgress.phase !== 'complete' ? 'active' : ''} key={title}>
                  <span>{generationProgress.step > index || generationProgress.phase === 'complete' ? <Check size={13} /> : index + 1}</span>
                  <p><strong>{title}</strong><small>{description}</small></p>
                  {generationProgress.step === index && generationProgress.phase !== 'complete' && <i />}
                </div>
              ))}
            </div>
            {(generationProgress.phase === 'complete' || generationProgress.phase === 'error') && (
              <button onClick={() => setGenerationProgress((current) => ({ ...current, open: false }))}>
                {generationProgress.phase === 'complete' ? '스토리보드 확인' : '닫기'}
              </button>
            )}
          </section>
        </div>
      )}
      <header className="planner-header">
        <div>
          <p className="eyebrow"><Sparkles size={14} /> AI PRODUCTION ASSISTANT</p>
          <h1>Video Production Planner</h1>
          <p>선택하고, 검토하고, 승인하세요. 제작 비서가 Higgsfield용 프롬프트까지 완성합니다.</p>
        </div>
        <div className="planner-header-actions">
          <button className="planner-library" onClick={onOpenCharacterLibrary}><Users size={15} /> 캐릭터 라이브러리</button>
          <button className="planner-reset" onClick={resetProject}><RotateCcw size={15} /> 새 기획</button>
        </div>
      </header>

      <div className="planner-layout">
        <ApprovalRail approvals={approvals} />
        <div className="planner-workspace">
          <section className="planner-card brief-card">
            <div className="planner-card-heading">
              <span><Clipboard size={17} /></span>
              <div><p>STEP 01</p><h2>제작 기획서</h2><small>원하는 결과를 선택하면 제작 방향을 자동으로 정리합니다.</small></div>
              <em className={approvals.brief ? 'approved' : ''}>{approvals.brief ? 'APPROVED' : 'DRAFT'}</em>
            </div>
            <div className="planner-fields">
              <label className="planner-field project-title">
                <span>프로젝트명</span>
                <input value={config.title} onChange={(event) => updateConfig('title', event.target.value)} />
              </label>
              <label className="planner-field creative-brief">
                <span>AI 연출 요청 · 반드시 담고 싶은 장면과 메시지</span>
                <textarea value={config.creativeBrief} onChange={(event) => updateConfig('creativeBrief', event.target.value)} />
              </label>
              <SelectField label="제작 목적" value={config.purpose} options={selectOptions.purpose} onChange={(value) => updateConfig('purpose', value)} />
              <SelectField label="게시 플랫폼" value={config.platform} options={selectOptions.platform} onChange={(value) => updateConfig('platform', value)} />
              <SelectField label="화면 비율" value={config.aspectRatio} options={selectOptions.aspectRatio} onChange={(value) => updateConfig('aspectRatio', value)} />
              <SelectField label="영상 길이" value={config.duration} options={selectOptions.duration} onChange={(value) => updateConfig('duration', value)} />
              <SelectField label="장르" value={config.genre} options={selectOptions.genre} onChange={(value) => updateConfig('genre', value)} />
              <SelectField label="톤앤매너" value={config.tone} options={selectOptions.tone} onChange={(value) => updateConfig('tone', value)} />
              <SelectField label="핵심 타깃" value={config.audience} options={selectOptions.audience} onChange={(value) => updateConfig('audience', value)} />
            </div>
            <ApprovalBar stage="brief" approvals={approvals} onApprove={approve} />
          </section>

          <section className={`planner-card ${!approvals.brief ? 'locked-card' : ''}`}>
            <div className="planner-card-heading">
              <span><Users size={17} /></span>
              <div><p>STEP 02</p><h2>기준 이미지·캐릭터보드 & 무드 설정</h2><small>현장 사진과 출연 캐릭터를 함께 사용해 첫 프레임을 설계합니다.</small></div>
              <em className={approvals.boards ? 'approved' : ''}>{approvals.boards ? 'APPROVED' : 'REVIEW'}</em>
            </div>
            <div className="reference-image-panel">
              <div className="reference-copy">
                <ImagePlus size={19} />
                <p>
                  <strong>Higgsfield 기준 이미지 · 선택사항</strong>
                  <span>현장 사진을 올리면 Gemini가 공간과 구도를 분석해 첫 프레임 기반 영상 프롬프트로 통합합니다.</span>
                </p>
              </div>
              {referenceImage ? (
                <div className="reference-preview">
                  <img src={referenceImage.dataUrl} alt="Higgsfield 기준 이미지" />
                  <p><strong>{referenceImage.name}</strong><span>첫 프레임 및 공간 일관성 기준</span></p>
                  <button onClick={clearReferenceImage} aria-label="기준 이미지 삭제"><X size={14} /></button>
                </div>
              ) : (
                <button className="reference-upload" onClick={() => referenceInputRef.current?.click()} disabled={!approvals.brief}>
                  <ImagePlus size={15} /> 현장 사진 업로드
                </button>
              )}
              <input ref={referenceInputRef} type="file" accept="image/*" onChange={handleReferenceImage} hidden />
            </div>
            <div className="cast-grid">
              {characters.map((character) => {
                const selected = selectedCast.includes(character.characterId)
                return (
                  <button className={selected ? 'selected' : ''} key={character.characterId} onClick={() => toggleCast(character.characterId)} disabled={!approvals.brief}>
                    <img src={character.imageUrl} alt="" />
                    <span className="cast-check">{selected ? <Check size={13} /> : <Circle size={13} />}</span>
                    <div><strong>{character.name}</strong><small>{character.modelCode}</small></div>
                  </button>
                )
              })}
            </div>
            <div className="creative-settings">
              <SelectField label="장소" value={config.location} options={selectOptions.location} onChange={(value) => updateConfig('location', value)} />
              <SelectField label="시간대" value={config.time} options={selectOptions.time} onChange={(value) => updateConfig('time', value)} />
              <SelectField label="조명" value={config.lighting} options={selectOptions.lighting} onChange={(value) => updateConfig('lighting', value)} />
              <SelectField label="카메라 스타일" value={config.cameraStyle} options={selectOptions.cameraStyle} onChange={(value) => updateConfig('cameraStyle', value)} />
              <SelectField label="대표 카메라 무브" value={config.movement} options={selectOptions.movement} onChange={(value) => updateConfig('movement', value)} />
              <SelectField label="편집 리듬" value={config.pacing} options={selectOptions.pacing} onChange={(value) => updateConfig('pacing', value)} />
            </div>
            <div className="board-summary">
              <div><LayoutPanelTop size={16} /><span>CHARACTER BOARD</span></div>
              <p>{cast.length ? cast.map((character) => character.name).join(' + ') : '환경 중심 영상'} · {config.tone} · {config.location}</p>
              <small>선택된 캐릭터의 얼굴·헤어·의상·Prompt Seed가 모든 숏에 자동 고정됩니다.</small>
            </div>
            <ApprovalBar stage="boards" approvals={approvals} onApprove={approve} />
          </section>

          <section className={`planner-card ${!approvals.boards ? 'locked-card' : ''}`}>
            <div className="planner-card-heading">
              <span><Clapperboard size={17} /></span>
              <div><p>STEP 03</p><h2>스토리보드 & 촬영 콘티</h2><small>6개 장면으로 구성된 실행 가능한 숏리스트입니다.</small></div>
              <em className={approvals.continuity ? 'approved' : ''}>{approvals.continuity ? 'APPROVED' : 'REVIEW'}</em>
            </div>
            {aiPackage ? <><div className="storyboard-document">
              <header><h3>{config.title} 광고 촬영 콘티</h3><p>{config.purpose} · {config.platform} · {config.duration} · {config.aspectRatio}</p></header>
              <div className="storyboard-document-columns">
                {[shots.slice(0, 3), shots.slice(3, 6)].map((columnShots, columnIndex) => (
                  <div className="storyboard-sequence" key={columnIndex}>
                    {columnShots.map((shot, rowIndex) => {
                      const globalIndex = columnIndex * 3 + rowIndex
                      return (
                        <article className="storyboard-document-shot" key={shot.number}>
                          <div className="storyboard-action-note"><strong>{shot.number}. {shot.role}</strong><p>{shot.visual}</p></div>
                          <div
                            className="storyboard-sketch-frame"
                            style={aiPackage.storyboardImageUrl ? {
                              backgroundImage: `url("${aiPackage.storyboardImageUrl}")`,
                              backgroundSize: '200% 300%',
                              backgroundPosition: `${columnIndex * 100}% ${rowIndex * 50}%`,
                            } : undefined}
                            aria-label={`${globalIndex + 1}번 장면 연필 스케치`}
                          />
                          <div className="storyboard-camera-note"><strong>{shot.framing}</strong><span>{shot.camera}</span><small>{shot.duration} · {shot.audio}</small></div>
                          {rowIndex < 2 && <i className="storyboard-flow-arrow">↓</i>}
                        </article>
                      )
                    })}
                  </div>
                ))}
              </div>
              <footer>LOCATION {config.location} · TONE {config.tone} · CAMERA {config.cameraStyle}</footer>
            </div>
            <div className="continuity-table">
              <div className="continuity-head"><span>SHOT</span><span>화면/연기</span><span>카메라</span><span>사운드</span></div>
              {shots.map((shot) => (
                <div className="continuity-row" key={shot.number}>
                  <span><strong>{shot.number}</strong><small>{shot.duration}</small></span>
                  <p>{shot.visual}</p>
                  <p>{shot.framing}<small>{shot.camera}</small></p>
                  <p>{shot.audio}</p>
                </div>
              ))}
            </div></> : (
              <div className="storyboard-empty">
                <Clapperboard size={25} />
                <strong>아직 생성된 콘티가 없습니다</strong>
                <span>아래 설정을 확인하고 AI 콘티 생성을 시작해 주세요.</span>
              </div>
            )}
            <div className="sound-settings">
              <SelectField label="음악·사운드" value={config.audio} options={selectOptions.audio} onChange={(value) => updateConfig('audio', value)} />
              <SelectField label="대사 방식" value={config.dialogue} options={selectOptions.dialogue} onChange={(value) => updateConfig('dialogue', value)} />
              <SelectField label="엔딩 CTA" value={config.cta} options={selectOptions.cta} onChange={(value) => updateConfig('cta', value)} />
            </div>
            <div className={`ai-generation-panel ${aiPackage ? 'complete' : ''} ${generationError ? 'error' : ''}`}>
              <div>
                <BrainCircuit size={22} />
                <p>
                  <strong>{aiPackage ? 'Gemini 연출 패키지 생성 완료' : isGenerating ? 'Gemini가 콘티를 연출하고 있습니다' : 'Gemini AI로 콘티 고도화'}</strong>
                  <span>{aiPackage ? aiPackage.creativeSummary : isGenerating ? '기획 의도, 캐릭터 일관성, 카메라와 모델 문법을 최적화하는 중입니다.' : '승인된 기획을 분석해 6개 장면과 Higgsfield 마스터 프롬프트를 생성합니다.'}</span>
                </p>
              </div>
              <button onClick={() => void generateWithGemini()} disabled={!approvals.boards || isGenerating}>
                <Sparkles size={15} /> {isGenerating ? 'AI 생성 중...' : aiPackage ? '다시 생성' : 'AI 콘티 생성'}
              </button>
              {aiPackage && <small>{aiPackage.creativeRationale}</small>}
              {generationError && <small>{generationError}</small>}
            </div>
            <ApprovalBar
              stage="continuity"
              approvals={approvals}
              onApprove={approve}
              canApprove={Boolean(aiPackage)}
              prerequisiteText="먼저 Gemini AI 콘티를 생성해 주세요"
            />
          </section>

          <section className={`planner-card final-prompt-card ${!approvals.continuity ? 'locked-card' : ''}`}>
            <div className="planner-card-heading">
              <span><Film size={17} /></span>
              <div><p>STEP 04</p><h2>Higgsfield 생성 패키지</h2><small>선택한 내용을 모델별 문법에 맞는 하나의 제작 지시서로 변환합니다.</small></div>
              <em className={approvals.prompt ? 'approved' : ''}>{approvals.prompt ? 'FINAL' : 'PENDING'}</em>
            </div>
            <div className="model-panel">
              <div className="model-copy"><Sparkles size={19} /><p><span>추천 생성 모델</span><strong>{selectedModel.label}</strong><small>{selectedModel.note}</small></p></div>
              <label>
                <select value={config.higgsfieldModel} onChange={(event) => updateConfig('higgsfieldModel', event.target.value)}>
                  {modelOptions.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
              <SelectField label="출력 해상도" value={config.resolution} options={selectOptions.resolution} onChange={(value) => updateConfig('resolution', value)} />
            </div>
            <div className="prompt-output">
              <div><span>MASTER GENERATION PROMPT</span><button onClick={() => void copyPrompt()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy prompt'}</button></div>
              <pre>{finalPrompt}</pre>
            </div>
            <ApprovalBar
              stage="prompt"
              approvals={approvals}
              onApprove={approve}
              canApprove={Boolean(aiPackage)}
              prerequisiteText="Gemini 생성 패키지가 필요합니다"
            />
            <div className={`production-ready ${approvals.prompt ? 'ready' : ''}`}>
              <div>{approvals.prompt ? <BadgeCheck size={22} /> : <LockKeyhole size={20} />}<p><strong>{approvals.prompt ? '제작 결재 완료' : '최종 결재 대기'}</strong><span>{approvals.prompt ? 'Higgsfield 영상 생성을 시작할 수 있습니다.' : '모든 산출물을 확인한 뒤 최종 승인해 주세요.'}</span></p></div>
              <button disabled={!approvals.prompt}><Play size={16} /> Higgsfield 생성 준비 <Send size={14} /></button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
