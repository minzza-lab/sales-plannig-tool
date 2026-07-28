import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleUserRound,
  Grid2X2,
  ImagePlus,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useCharacters } from './modules/character/hooks/useCharacters'
import type { Character, CharacterGender, CharacterStatus, CharacterUpdate } from './modules/character/types/character'
import { callGeminiWithFallback } from '../utils/apiProxy'
import VideoProductionPlanner from './modules/project/VideoProductionPlanner'
import './ai-studio.css'

type ViewMode = 'grid' | 'list'

const editableFields: Array<{ key: keyof Character; label: string; wide?: boolean }> = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'height', label: 'Height (cm)' },
  { key: 'body', label: 'Body' },
  { key: 'face', label: 'Face' },
  { key: 'hair', label: 'Hair' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'eyebrows', label: 'Eyebrows' },
  { key: 'nose', label: 'Nose' },
  { key: 'mouth', label: 'Mouth' },
  { key: 'skin', label: 'Skin' },
  { key: 'defaultOutfit', label: 'Default Outfit', wide: true },
  { key: 'personality', label: 'Personality', wide: true },
  { key: 'voice', label: 'Voice', wide: true },
  { key: 'pose', label: 'Pose' },
  { key: 'expression', label: 'Expression' },
  { key: 'promptSeed', label: 'Prompt Seed', wide: true },
]

const newCharacterDefaults: CharacterUpdate = {
  name: '',
  gender: 'Female',
  age: 25,
  nationality: 'Korean',
  height: 165,
  body: 'Slim balanced',
  face: 'Soft oval',
  hair: 'Natural dark hair',
  eyes: 'Deep brown, clear',
  eyebrows: 'Natural straight',
  nose: 'Natural refined',
  mouth: 'Natural balanced',
  skin: 'Natural warm ivory',
  defaultOutfit: 'Clean neutral studio outfit',
  personality: '자연스럽고 친근하며 브랜드 콘텐츠에 어울리는 이미지',
  voice: 'Clear natural Korean',
  pose: 'Natural front portrait',
  expression: 'Calm and approachable',
  promptSeed: '',
  status: 'Draft',
  imageUrl: '/ai-studio/characters/female-01.png',
}

const aiCharacterOptions = {
  ageGroup: ['20대 초반', '20대 후반', '30대 초반', '30대 후반', '40대'],
  concept: ['청순하고 자연스러운', '세련되고 도시적인', '밝고 에너지 넘치는', '고급스럽고 우아한', '친근하고 편안한', '강렬하고 카리스마 있는'],
  face: ['부드러운 타원형', '선명한 계란형', '세련된 각진형', '둥글고 친근한형'],
  hair: ['긴 생머리', '자연스러운 웨이브', '단정한 단발', '포니테일', '짧고 세련된 헤어'],
  body: ['슬림 밸런스', '내추럴 밸런스', '애슬레틱', '큰 키의 모델 체형'],
  outfit: ['화이트 미니멀 캐주얼', '블랙 모던 룩', '베이지 니트 룩', '스포티 애슬레저', '고급스러운 리조트 룩', '비즈니스 캐주얼'],
} as const

const makeGeneratedImageUrl = (prompt: string, seed: number, width = 768, height = 1152) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, professional commercial character reference photography, ultra detailed, realistic skin texture, sharp focus, studio lighting, no text, no watermark`)}?width=${width}&height=${height}&nologo=true&seed=${seed}`

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))

function CharacterDetail({
  character,
  onClose,
  onSaved,
  createVersion,
}: {
  character: Character
  onClose: () => void
  onSaved: (character: Character) => void
  createVersion: (characterId: string, update: CharacterUpdate) => Promise<Character>
}) {
  const [draft, setDraft] = useState(character)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await createVersion(character.characterId, draft)
      onSaved(saved)
      setDraft(saved)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="studio-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="studio-detail" role="dialog" aria-modal="true" aria-label={`${character.name} 상세 정보`}>
        <div className="detail-hero">
          <img src={character.imageUrl} alt={`${character.name} 캐릭터`} />
          <button className="icon-button detail-close" onClick={onClose} aria-label="상세 닫기"><X size={18} /></button>
          <div className="detail-hero-gradient" />
          <div className="detail-identity">
            <span>{character.modelCode}</span>
            <h2>{character.name}</h2>
            <p>{character.nationality} · {character.age} years · {character.height} cm</p>
          </div>
        </div>

        <div className="detail-toolbar">
          <div>
            <span className={`status-dot ${character.status.toLowerCase()}`} />
            {character.status}
            <span className="detail-version">v{draft.version}</span>
          </div>
          {!editing ? (
            <button className="studio-button primary" onClick={() => setEditing(true)}>프로필 수정</button>
          ) : (
            <div className="detail-actions">
              <button className="studio-button ghost" onClick={() => { setDraft(character); setEditing(false) }}>취소</button>
              <button className="studio-button primary" onClick={() => void handleSave()} disabled={saving}>
                <Check size={16} /> {saving ? '저장 중…' : '새 버전 저장'}
              </button>
            </div>
          )}
        </div>

        <div className="detail-body">
          <div className="detail-meta">
            <div><span>Character ID</span><strong>{character.characterId}</strong></div>
            <div><span>Model code</span><strong>{character.modelCode}</strong></div>
            <div><span>Gender</span><strong>{character.gender}</strong></div>
            <div><span>Updated</span><strong>{formatDate(draft.updatedAt)}</strong></div>
          </div>

          <div className="detail-form">
            {editableFields.map(({ key, label, wide }) => (
              <label className={wide ? 'wide' : ''} key={key}>
                <span>{label}</span>
                {editing ? (
                  key === 'promptSeed' || key === 'personality' ? (
                    <textarea value={String(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} rows={3} />
                  ) : (
                    <input
                      type={key === 'age' || key === 'height' ? 'number' : 'text'}
                      value={String(draft[key])}
                      onChange={(event) => setDraft({
                        ...draft,
                        [key]: key === 'age' || key === 'height' ? Number(event.target.value) : event.target.value,
                      })}
                    />
                  )
                ) : <p>{String(draft[key])}</p>}
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function NewCharacterDialog({
  onClose,
  onCreated,
  createCharacter,
}: {
  onClose: () => void
  onCreated: (character: Character) => void
  createCharacter: (update: CharacterUpdate) => Promise<Character>
}) {
  const [draft, setDraft] = useState<CharacterUpdate>(newCharacterDefaults)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [choices, setChoices] = useState({
    ageGroup: aiCharacterOptions.ageGroup[1],
    concept: aiCharacterOptions.concept[0],
    face: aiCharacterOptions.face[0],
    hair: aiCharacterOptions.hair[0],
    body: aiCharacterOptions.body[0],
    outfit: aiCharacterOptions.outfit[0],
  })

  const update = <K extends keyof CharacterUpdate>(key: K, value: CharacterUpdate[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const handleImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setError('5MB 이하 이미지 파일을 선택해 주세요.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => update('imageUrl', String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.promptSeed.trim()) {
      setError('모델 이름과 Prompt Seed를 입력해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createCharacter(draft)
      onCreated(created)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '모델 생성에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const generateCharacterBoard = async () => {
    setGenerating(true)
    setError('')
    try {
      const prompt = `당신은 AI 영상 제작용 캐릭터 디렉터입니다. 아래 선택값을 바탕으로 장면마다 동일 인물로 유지될 마스터 모델 프로필을 만드세요.
입력: ${JSON.stringify({ gender: draft.gender, nationality: draft.nationality, ...choices })}
반드시 JSON만 반환:
{"name":"자연스러운 한국 이름","age":28,"height":168,"body":"English","face":"English","hair":"English","eyes":"English","eyebrows":"English","nose":"English","mouth":"English","skin":"English","defaultOutfit":"English","personality":"한글 한 문장","voice":"English","pose":"English","expression":"English","promptSeed":"Detailed English identity lock prompt for consistent AI video character, front-facing waist-up character board"}`
      const response = await callGeminiWithFallback([{ text: prompt }], ['gemini-2.5-flash', 'gemini-2.5-pro'], {
        responseMimeType: 'application/json',
        temperature: 0.65,
        maxOutputTokens: 2048,
      })
      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] ?? response) as Partial<CharacterUpdate>
      if (!parsed.promptSeed || !parsed.name) throw new Error('AI 캐릭터 프로필 형식이 올바르지 않습니다.')
      const seed = Math.floor(Math.random() * 900000) + 100000
      setDraft((current) => ({
        ...current,
        ...parsed,
        gender: current.gender,
        nationality: current.nationality,
        status: 'Active',
        imageUrl: makeGeneratedImageUrl(parsed.promptSeed!, seed),
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 모델 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="new-character-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="new-character-dialog" role="dialog" aria-modal="true" aria-label="새 모델과 캐릭터보드 생성">
        <header>
          <div><span>NEW MASTER ASSET</span><h2>새 모델 프로필 & 캐릭터보드</h2><p>한 번 등록한 외형 정보는 모든 Higgsfield 프롬프트의 일관성 기준으로 사용됩니다.</p></div>
          <button onClick={onClose} aria-label="새 모델 창 닫기"><X size={18} /></button>
        </header>

        <div className="new-character-layout">
          <aside className="character-board-editor">
            <span>CHARACTER BOARD</span>
            <div className="board-portrait">
              <img src={draft.imageUrl} alt="새 모델 캐릭터보드" />
              <label><ImagePlus size={15} /> 기준 이미지 변경<input type="file" accept="image/*" onChange={handleImage} hidden /></label>
            </div>
            <div className="board-profile">
              <strong>{draft.name || '새 모델 이름'}</strong>
              <p>{draft.nationality} · {draft.age}세 · {draft.height}cm</p>
              <span>{draft.personality}</span>
            </div>
          </aside>

          <div className="new-profile-form">
            <div className="form-section-title"><span>01</span><div><strong>AI 모델 디자인</strong><small>원하는 항목만 선택하면 프로필과 캐릭터보드를 자동 생성합니다.</small></div></div>
            <div className="new-form-grid">
              <label><span>성별</span><select value={draft.gender} onChange={(event) => update('gender', event.target.value as CharacterGender)}><option value="Female">Female</option><option value="Male">Male</option></select></label>
              {(Object.keys(aiCharacterOptions) as Array<keyof typeof aiCharacterOptions>).map((key) => (
                <label key={key}>
                  <span>{{ ageGroup: '연령대', concept: '전체 분위기', face: '얼굴형', hair: '헤어', body: '체형', outfit: '기본 의상' }[key]}</span>
                  <select value={choices[key]} onChange={(event) => setChoices((current) => ({ ...current, [key]: event.target.value }))}>
                    {aiCharacterOptions[key].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              ))}
              <label><span>국적</span><select value={draft.nationality} onChange={(event) => update('nationality', event.target.value)}><option>Korean</option><option>Japanese</option><option>Chinese</option><option>American</option><option>European</option></select></label>
              <button className="ai-character-generate" onClick={() => void generateCharacterBoard()} disabled={generating}>
                <Sparkles size={16} /> {generating ? 'AI가 모델을 디자인하는 중…' : '선택값으로 AI 모델 생성'}
              </button>
            </div>

            <div className="form-section-title"><span>02</span><div><strong>AI 생성 결과</strong><small>필요한 경우 이름과 일관성 프롬프트를 수정할 수 있습니다.</small></div></div>
            <div className="new-form-grid">
              <label><span>모델 이름 *</span><input value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="AI가 자동 생성합니다" /></label>
              <label><span>나이</span><input type="number" value={draft.age} onChange={(event) => update('age', Number(event.target.value))} /></label>
              <label><span>키(cm)</span><input type="number" value={draft.height} onChange={(event) => update('height', Number(event.target.value))} /></label>
              <label className="wide"><span>성격과 이미지</span><textarea rows={2} value={draft.personality} onChange={(event) => update('personality', event.target.value)} /></label>
              <label className="wide"><span>Prompt Seed *</span><textarea rows={3} value={draft.promptSeed} onChange={(event) => update('promptSeed', event.target.value)} placeholder="young Korean woman, natural dark hair, clean studio portrait, consistent identity..." /></label>
            </div>
            {error && <p className="new-character-error">{error}</p>}
          </div>
        </div>

        <footer>
          <button className="studio-button ghost" onClick={onClose}>취소</button>
          <button className="studio-button primary" onClick={() => void handleCreate()} disabled={saving}><CircleUserRound size={16} /> {saving ? '생성 중…' : '모델과 캐릭터보드 생성'}</button>
        </footer>
      </section>
    </div>
  )
}

function CharacterCard({ character, onClick }: { character: Character; onClick: () => void }) {
  return (
    <button className="character-card" onClick={onClick}>
      <div className="character-photo">
        <img src={character.imageUrl} alt="" />
        <span className={`character-status ${character.status.toLowerCase()}`}>{character.status}</span>
        <span className="character-version">v{character.version}</span>
      </div>
      <div className="character-card-body">
        <div className="character-title"><div><h3>{character.name}</h3><p>{character.modelCode}</p></div><ChevronRight size={18} /></div>
        <div className="character-tags"><span>{character.nationality}</span><span>{character.age} yrs</span><span>{character.height} cm</span></div>
        <p className="character-trait">{character.personality}</p>
      </div>
    </button>
  )
}

function CharacterListRow({ character, onClick }: { character: Character; onClick: () => void }) {
  return (
    <button className="character-row" onClick={onClick}>
      <img src={character.imageUrl} alt="" />
      <div className="row-primary"><strong>{character.name}</strong><span>{character.characterId}</span></div>
      <span>{character.modelCode}</span><span>{character.nationality}</span><span>{character.gender}</span><span>v{character.version}</span>
      <span className={`row-status ${character.status.toLowerCase()}`}>{character.status}</span><ChevronRight size={18} />
    </button>
  )
}

function CharacterLibrary({ onClose }: { onClose: () => void }) {
  const { characters, isLoading, createVersion, createCharacter } = useCharacters()
  const [query, setQuery] = useState('')
  const [gender, setGender] = useState<'All' | CharacterGender>('All')
  const [status, setStatus] = useState<'All' | CharacterStatus>('All')
  const [view, setView] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Character | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return characters.filter((character) => {
      const matchesQuery = !normalizedQuery ||
        [character.name, character.characterId, character.modelCode, character.nationality].some((value) => value.toLowerCase().includes(normalizedQuery))
      return matchesQuery && (gender === 'All' || character.gender === gender) && (status === 'All' || character.status === status)
    })
  }, [characters, gender, query, status])

  return (
    <div className="library-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="library-modal" role="dialog" aria-modal="true" aria-label="캐릭터 라이브러리">
        <header className="library-header">
          <div><p className="eyebrow"><Sparkles size={14} /> MASTER CHARACTER ASSETS</p><h1>Character Library</h1><p>모델 프로필과 캐릭터보드를 생성하고 일관성 기준을 관리합니다.</p></div>
          <div className="library-header-actions">
            <button className="studio-button primary" onClick={() => setCreating(true)}><CircleUserRound size={17} /> 새 모델 생성</button>
            <button className="icon-button" onClick={onClose} aria-label="캐릭터 라이브러리 닫기"><X size={18} /></button>
          </div>
        </header>

        <section className="library-stats">
          <div><span>Total characters</span><strong>{characters.length}</strong><small>Master assets</small></div>
          <div><span>Female models</span><strong>{characters.filter((item) => item.gender === 'Female').length}</strong><small>Available now</small></div>
          <div><span>Male models</span><strong>{characters.filter((item) => item.gender === 'Male').length}</strong><small>Available now</small></div>
          <div><span>Active models</span><strong>{characters.filter((item) => item.status === 'Active').length}</strong><small>Production ready</small></div>
        </section>

        <div className="library-controls">
          <label className="studio-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, ID, 모델 코드 검색" />{query && <button onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={15} /></button>}</label>
          <div className="filter-control"><SlidersHorizontal size={16} /><select value={gender} onChange={(event) => setGender(event.target.value as 'All' | CharacterGender)} aria-label="성별 필터"><option value="All">All genders</option><option value="Female">Female</option><option value="Male">Male</option></select></div>
          <div className="filter-control"><select value={status} onChange={(event) => setStatus(event.target.value as 'All' | CharacterStatus)} aria-label="상태 필터"><option value="All">All status</option><option value="Active">Active</option><option value="Draft">Draft</option><option value="Archived">Archived</option></select></div>
          <div className="view-toggle"><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="카드 보기"><Grid2X2 size={17} /></button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="리스트 보기"><List size={18} /></button></div>
        </div>

        <div className="results-meta"><span>{filtered.length} characters</span><span>Updated by latest version</span></div>
        {isLoading ? <div className="studio-empty">캐릭터를 불러오는 중입니다.</div> : filtered.length === 0 ? (
          <div className="studio-empty"><Search size={24} /><strong>검색 결과가 없습니다.</strong><span>필터나 검색어를 변경해 보세요.</span></div>
        ) : view === 'grid' ? (
          <div className="character-grid">{filtered.map((character) => <CharacterCard key={character.characterId} character={character} onClick={() => setSelected(character)} />)}</div>
        ) : (
          <div className="character-list"><div className="character-list-head"><span>Character</span><span>Model</span><span>Nationality</span><span>Gender</span><span>Version</span><span>Status</span><span /></div>{filtered.map((character) => <CharacterListRow key={character.characterId} character={character} onClick={() => setSelected(character)} />)}</div>
        )}

        {selected && <CharacterDetail character={selected} onClose={() => setSelected(null)} onSaved={setSelected} createVersion={createVersion} />}
        {creating && <NewCharacterDialog onClose={() => setCreating(false)} onCreated={(character) => { setCreating(false); setSelected(character) }} createCharacter={createCharacter} />}
      </section>
    </div>
  )
}

export default function AIStudio() {
  const navigate = useNavigate()
  const [libraryOpen, setLibraryOpen] = useState(false)

  return (
    <div className="ai-studio-shell">
      <header className="studio-topbar">
        <button className="studio-back-button" onClick={() => navigate('/')}><ArrowLeft size={16} /><span>Sales Tools</span></button>
        <div className="studio-compact-brand"><span><Sparkles size={15} /></span><p><strong>AI VIDEO STUDIO</strong><small>Higgsfield Production</small></p></div>
        <button className="studio-library-button" onClick={() => setLibraryOpen(true)}><Users size={16} /> 캐릭터 라이브러리</button>
      </header>
      <main className="studio-main">
        <div className="studio-content"><VideoProductionPlanner onOpenCharacterLibrary={() => setLibraryOpen(true)} /></div>
      </main>
      {libraryOpen && <CharacterLibrary onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}
