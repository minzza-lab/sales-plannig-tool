import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Clipboard,
  Clapperboard,
  Copy,
  FileCheck2,
  Film,
  LayoutPanelTop,
  LockKeyhole,
  MessageSquareText,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { useCharacters } from '../character/hooks/useCharacters'
import type { Character } from '../character/types/character'
import './video-production-planner.css'

type ApprovalStage = 'brief' | 'boards' | 'continuity' | 'prompt'
type ApprovalState = Record<ApprovalStage, boolean>

interface ProductionConfig {
  title: string
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
}

const DEFAULT_CONFIG: ProductionConfig = {
  title: '웰리힐리 브랜드 필름',
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

function makeShots(config: ProductionConfig, cast: Character[]): Shot[] {
  const lead = cast[0]?.name ?? '메인 모델'
  const partner = cast[1]?.name
  const beats = [
    {
      role: 'HOOK',
      visual: `${config.location}의 인상적인 디테일과 ${lead}의 시선으로 시작`,
      framing: 'Extreme close-up → Close-up',
      camera: config.movement,
      audio: '첫 1초 안에 음악 훅과 공간음',
    },
    {
      role: 'INTRO',
      visual: `${lead}가 공간으로 들어서며 분위기와 세계관을 소개`,
      framing: 'Medium full shot',
      camera: 'Smooth tracking shot',
      audio: config.dialogue === '대사 없음' ? '음악 빌드업' : config.dialogue,
    },
    {
      role: 'DISCOVER',
      visual: partner ? `${lead}와 ${partner}가 핵심 경험을 함께 발견` : `${lead}가 핵심 경험을 발견하고 자연스럽게 반응`,
      framing: 'Medium shot → Insert',
      camera: 'Gentle orbit 90°',
      audio: '현장음 강조 + 음악 전개',
    },
    {
      role: 'HERO',
      visual: `브랜드의 핵심 경험을 가장 매력적인 한 장면으로 표현`,
      framing: 'Wide hero shot',
      camera: config.cameraStyle === 'Dynamic action' ? 'Fast push-in' : 'Slow crane reveal',
      audio: '음악 클라이맥스',
    },
    {
      role: 'EMOTION',
      visual: `${lead}의 표정과 공간 디테일을 교차해 감정적 여운 형성`,
      framing: 'Close-up + Detail cut',
      camera: 'Subtle handheld drift',
      audio: '음악을 낮추고 공간음 강조',
    },
    {
      role: 'CTA',
      visual: `${config.cta} 문구와 브랜드 엔딩 프레임`,
      framing: 'Clean end card',
      camera: 'Static locked',
      audio: '짧은 sonic logo',
    },
  ]

  const totalSeconds = Number.parseInt(config.duration, 10)
  const shotDuration = Math.max(1, Math.round(totalSeconds / beats.length))
  return beats.map((beat, index) => ({
    number: String(index + 1).padStart(2, '0'),
    duration: index === beats.length - 1 ? `${Math.max(1, totalSeconds - shotDuration * (beats.length - 1))}s` : `${shotDuration}s`,
    ...beat,
    prompt: `${beat.framing}, ${beat.camera}. ${beat.visual}. ${config.lighting} lighting, ${config.tone} mood, ${config.genre.toLowerCase()} commercial film, ${config.aspectRatio}.`,
  }))
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
}: {
  stage: ApprovalStage
  approvals: ApprovalState
  onApprove: (stage: ApprovalStage) => void
}) {
  const index = approvalOrder.indexOf(stage)
  const unlocked = approvalOrder.slice(0, index).every((item) => approvals[item])
  const approved = approvals[stage]
  return (
    <div className={`approval-bar ${approved ? 'done' : ''}`}>
      <div>
        {approved ? <BadgeCheck size={19} /> : unlocked ? <FileCheck2 size={19} /> : <LockKeyhole size={18} />}
        <p>
          <strong>{approved ? '승인 완료' : unlocked ? '검토 후 승인해 주세요' : '이전 단계 승인이 필요합니다'}</strong>
          <span>{approved ? '다음 제작 단계에 반영되었습니다.' : '승인 전까지 다음 산출물은 잠금 상태입니다.'}</span>
        </p>
      </div>
      <button disabled={!unlocked || approved} onClick={() => onApprove(stage)}>
        {approved ? <><Check size={15} /> Approved</> : <>이 단계 승인 <ArrowRight size={15} /></>}
      </button>
    </div>
  )
}

export default function VideoProductionPlanner() {
  const { characters } = useCharacters()
  const [config, setConfig] = useState<ProductionConfig>(() => {
    const saved = localStorage.getItem('ai-studio.production-config.v1')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) as ProductionConfig } : DEFAULT_CONFIG
  })
  const [selectedCast, setSelectedCast] = useState<string[]>(['CHAR_F02'])
  const [approvals, setApprovals] = useState<ApprovalState>({ brief: false, boards: false, continuity: false, prompt: false })
  const [copied, setCopied] = useState(false)

  const cast = characters.filter((character) => selectedCast.includes(character.characterId))
  const shots = useMemo(() => makeShots(config, cast), [cast, config])
  const selectedModel = modelOptions.find((model) => model.value === config.higgsfieldModel) ?? modelOptions[0]

  const updateConfig = (key: keyof ProductionConfig, value: string) => {
    const next = { ...config, [key]: value }
    setConfig(next)
    localStorage.setItem('ai-studio.production-config.v1', JSON.stringify(next))
    const briefKeys: Array<keyof ProductionConfig> = ['title', 'purpose', 'platform', 'aspectRatio', 'duration', 'genre', 'tone', 'audience']
    const boardKeys: Array<keyof ProductionConfig> = ['location', 'time', 'lighting', 'cameraStyle', 'movement', 'pacing']
    const continuityKeys: Array<keyof ProductionConfig> = ['audio', 'dialogue', 'cta']
    setApprovals((current) => {
      if (briefKeys.includes(key)) return { brief: false, boards: false, continuity: false, prompt: false }
      if (boardKeys.includes(key)) return { ...current, boards: false, continuity: false, prompt: false }
      if (continuityKeys.includes(key)) return { ...current, continuity: false, prompt: false }
      return { ...current, prompt: false }
    })
  }

  const toggleCast = (characterId: string) => {
    setSelectedCast((current) => {
      if (current.includes(characterId)) return current.filter((id) => id !== characterId)
      return current.length >= 2 ? current : [...current, characterId]
    })
    setApprovals((current) => ({ ...current, boards: false, continuity: false, prompt: false }))
  }

  const approve = (stage: ApprovalStage) => setApprovals((current) => ({ ...current, [stage]: true }))

  const finalPrompt = useMemo(() => {
    const characterText = cast.length
      ? cast.map((character) => `${character.name} (${character.promptSeed})`).join('; ')
      : 'No visible character, environment-led brand film'
    return [
      `[PROJECT] ${config.title}`,
      `[FORMAT] ${config.duration} ${config.aspectRatio} ${config.resolution} video for ${config.platform}`,
      `[MODEL] ${selectedModel.label}`,
      `[OBJECTIVE] ${config.purpose}, targeting ${config.audience}`,
      `[CHARACTERS] ${characterText}`,
      `[SETTING] ${config.location}, ${config.time}, ${config.lighting} lighting`,
      `[CREATIVE DIRECTION] ${config.tone} ${config.genre.toLowerCase()} film, ${config.cameraStyle}, ${config.pacing}`,
      `[SHOT PLAN] ${shots.map((shot) => `Shot ${shot.number}: ${shot.prompt}`).join(' ')}`,
      `[AUDIO] ${config.audio}. ${config.dialogue}.`,
      `[ENDING] ${config.cta}. Clean brand-safe end frame.`,
      `[CONTINUITY] Preserve exact face, hairstyle, wardrobe, body proportions and color palette across every shot. Natural anatomy, realistic motion, coherent spatial continuity, no identity drift, no text artifacts.`,
    ].join('\n')
  }, [cast, config, selectedModel.label, shots])

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(finalPrompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const resetProject = () => {
    setConfig(DEFAULT_CONFIG)
    setSelectedCast(['CHAR_F02'])
    setApprovals({ brief: false, boards: false, continuity: false, prompt: false })
    localStorage.removeItem('ai-studio.production-config.v1')
  }

  return (
    <div className="production-planner">
      <header className="planner-header">
        <div>
          <p className="eyebrow"><Sparkles size={14} /> AI PRODUCTION ASSISTANT</p>
          <h1>Video Production Planner</h1>
          <p>선택하고, 검토하고, 승인하세요. 제작 비서가 Higgsfield용 프롬프트까지 완성합니다.</p>
        </div>
        <button className="planner-reset" onClick={resetProject}><RotateCcw size={15} /> 새 기획</button>
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
              <div><p>STEP 02</p><h2>캐릭터보드 & 무드 설정</h2><small>출연 캐릭터는 최대 2명까지 선택할 수 있습니다.</small></div>
              <em className={approvals.boards ? 'approved' : ''}>{approvals.boards ? 'APPROVED' : 'REVIEW'}</em>
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
            <div className="storyboard-strip">
              {shots.map((shot) => (
                <article key={shot.number}>
                  <div className="story-frame">
                    <span>{shot.number}</span>
                    <Camera size={22} />
                    <small>{shot.framing}</small>
                  </div>
                  <div className="story-copy">
                    <p><strong>{shot.role}</strong><em>{shot.duration}</em></p>
                    <h3>{shot.visual}</h3>
                    <span>{shot.camera}</span>
                  </div>
                </article>
              ))}
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
            </div>
            <div className="sound-settings">
              <SelectField label="음악·사운드" value={config.audio} options={selectOptions.audio} onChange={(value) => updateConfig('audio', value)} />
              <SelectField label="대사 방식" value={config.dialogue} options={selectOptions.dialogue} onChange={(value) => updateConfig('dialogue', value)} />
              <SelectField label="엔딩 CTA" value={config.cta} options={selectOptions.cta} onChange={(value) => updateConfig('cta', value)} />
            </div>
            <ApprovalBar stage="continuity" approvals={approvals} onApprove={approve} />
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
            <ApprovalBar stage="prompt" approvals={approvals} onApprove={approve} />
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
