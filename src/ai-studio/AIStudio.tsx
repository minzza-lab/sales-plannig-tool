import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Boxes,
  Check,
  ChevronRight,
  CircleUserRound,
  Grid2X2,
  LayoutDashboard,
  List,
  Menu,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useCharacters } from './modules/character/hooks/useCharacters'
import type { Character, CharacterGender, CharacterStatus, CharacterUpdate } from './modules/character/types/character'
import VideoProductionPlanner from './modules/project/VideoProductionPlanner'
import './ai-studio.css'

type ViewMode = 'grid' | 'list'
type NavSection = 'dashboard' | 'characters' | 'project' | 'settings'

const navItems: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'characters', label: 'Character Library', icon: Users },
  { id: 'project', label: 'Production Planner', icon: Boxes },
  { id: 'settings', label: 'Settings', icon: Settings },
]

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
            <button className="studio-button primary" onClick={() => setEditing(true)}>Edit profile</button>
          ) : (
            <div className="detail-actions">
              <button className="studio-button ghost" onClick={() => { setDraft(character); setEditing(false) }}>Cancel</button>
              <button className="studio-button primary" onClick={() => void handleSave()} disabled={saving}>
                <Check size={16} /> {saving ? 'Saving…' : 'Save new version'}
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
                    <textarea
                      value={String(draft[key])}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                      rows={3}
                    />
                  ) : (
                    <input
                      type={key === 'age' || key === 'height' ? 'number' : 'text'}
                      value={String(draft[key])}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: key === 'age' || key === 'height' ? Number(event.target.value) : event.target.value })
                      }
                    />
                  )
                ) : (
                  <p>{String(draft[key])}</p>
                )}
              </label>
            ))}
          </div>
        </div>
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
        <div className="character-title">
          <div>
            <h3>{character.name}</h3>
            <p>{character.modelCode}</p>
          </div>
          <ChevronRight size={18} />
        </div>
        <div className="character-tags">
          <span>{character.nationality}</span>
          <span>{character.age} yrs</span>
          <span>{character.height} cm</span>
        </div>
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
      <span>{character.modelCode}</span>
      <span>{character.nationality}</span>
      <span>{character.gender}</span>
      <span>v{character.version}</span>
      <span className={`row-status ${character.status.toLowerCase()}`}>{character.status}</span>
      <ChevronRight size={18} />
    </button>
  )
}

function CharacterLibrary() {
  const { characters, isLoading, createVersion } = useCharacters()
  const [query, setQuery] = useState('')
  const [gender, setGender] = useState<'All' | CharacterGender>('All')
  const [status, setStatus] = useState<'All' | CharacterStatus>('All')
  const [view, setView] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Character | null>(null)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return characters.filter((character) => {
      const matchesQuery = !normalizedQuery ||
        [character.name, character.characterId, character.modelCode, character.nationality]
          .some((value) => value.toLowerCase().includes(normalizedQuery))
      return matchesQuery &&
        (gender === 'All' || character.gender === gender) &&
        (status === 'All' || character.status === status)
    })
  }, [characters, gender, query, status])

  return (
    <>
      <header className="library-header">
        <div>
          <p className="eyebrow"><Sparkles size={14} /> AI ASSET MANAGEMENT</p>
          <h1>Character Library</h1>
          <p>일관된 AI 콘텐츠 제작을 위한 마스터 캐릭터를 관리하세요.</p>
        </div>
        <button className="studio-button primary"><CircleUserRound size={17} /> New character</button>
      </header>

      <section className="library-stats">
        <div><span>Total characters</span><strong>{characters.length}</strong><small>Master assets</small></div>
        <div><span>Female models</span><strong>{characters.filter((item) => item.gender === 'Female').length}</strong><small>Available now</small></div>
        <div><span>Male models</span><strong>{characters.filter((item) => item.gender === 'Male').length}</strong><small>Available now</small></div>
        <div><span>Recently updated</span><strong>4</strong><small>Last 30 days</small></div>
      </section>

      <div className="library-controls">
        <label className="studio-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, ID, 모델 코드 검색" />
          {query && <button onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={15} /></button>}
        </label>
        <div className="filter-control">
          <SlidersHorizontal size={16} />
          <select value={gender} onChange={(event) => setGender(event.target.value as 'All' | CharacterGender)} aria-label="성별 필터">
            <option value="All">All genders</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div className="filter-control">
          <select value={status} onChange={(event) => setStatus(event.target.value as 'All' | CharacterStatus)} aria-label="상태 필터">
            <option value="All">All status</option>
            <option value="Active">Active</option>
            <option value="Draft">Draft</option>
            <option value="Archived">Archived</option>
          </select>
        </div>
        <div className="view-toggle">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="카드 보기"><Grid2X2 size={17} /></button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="리스트 보기"><List size={18} /></button>
        </div>
      </div>

      <div className="results-meta"><span>{filtered.length} characters</span><span>Updated by latest version</span></div>
      {isLoading ? (
        <div className="studio-empty">캐릭터를 불러오는 중입니다.</div>
      ) : filtered.length === 0 ? (
        <div className="studio-empty"><Search size={24} /><strong>검색 결과가 없습니다.</strong><span>필터나 검색어를 변경해 보세요.</span></div>
      ) : view === 'grid' ? (
        <div className="character-grid">
          {filtered.map((character) => <CharacterCard key={character.characterId} character={character} onClick={() => setSelected(character)} />)}
        </div>
      ) : (
        <div className="character-list">
          <div className="character-list-head"><span>Character</span><span>Model</span><span>Nationality</span><span>Gender</span><span>Version</span><span>Status</span><span /></div>
          {filtered.map((character) => <CharacterListRow key={character.characterId} character={character} onClick={() => setSelected(character)} />)}
        </div>
      )}

      {selected && (
        <CharacterDetail
          character={selected}
          onClose={() => setSelected(null)}
          onSaved={setSelected}
          createVersion={createVersion}
        />
      )}
    </>
  )
}

function PlaceholderPage({ section }: { section: Exclude<NavSection, 'characters'> }) {
  const content = {
    dashboard: ['Studio Dashboard', 'AI 콘텐츠 제작 에셋과 프로젝트 현황을 한곳에서 확인합니다.'],
    project: ['Project Manager', 'MVP 0.2에서 영상 프로젝트 생성과 에셋 연결 기능이 추가됩니다.'],
    settings: ['Studio Settings', '워크스페이스, 생성 모델, 권한 설정을 위한 확장 영역입니다.'],
  }[section]

  return (
    <div className="placeholder-page">
      <div className="placeholder-orb"><Sparkles /></div>
      <p className="eyebrow">AI VIDEO STUDIO</p>
      <h1>{content[0]}</h1>
      <p>{content[1]}</p>
      <span>MVP 0.1 · Character Library is now active</span>
    </div>
  )
}

export default function AIStudio() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathSection = location.pathname.split('/')[2] as NavSection | undefined
  const section: NavSection = navItems.some((item) => item.id === pathSection) ? pathSection as NavSection : 'characters'

  const changeSection = (next: NavSection) => {
    navigate(`/ai-studio/${next}`)
    setMobileNavOpen(false)
  }

  return (
    <div className="ai-studio-shell">
      <aside className={`studio-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="studio-brand">
          <div className="brand-mark"><Sparkles size={17} /></div>
          <div><strong>AI VIDEO</strong><span>STUDIO</span></div>
          <button className="studio-mobile-close" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>
        <nav>
          <p>WORKSPACE</p>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => changeSection(item.id)}>
                <Icon size={18} /><span>{item.label}</span>{item.id === 'characters' && <em>10</em>}
              </button>
            )
          })}
        </nav>
        <div className="studio-sidebar-footer">
          <button onClick={() => navigate('/')}><ArrowLeft size={17} /><span>Sales Tools로 돌아가기</span></button>
          <div className="workspace-user"><div>MK</div><p><strong>Minzza Workspace</strong><span>Administrator</span></p></div>
        </div>
      </aside>
      {mobileNavOpen && <button className="studio-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="메뉴 닫기" />}

      <main className="studio-main">
        <div className="studio-mobile-header">
          <button onClick={() => setMobileNavOpen(true)} aria-label="메뉴 열기"><Menu size={20} /></button>
          <strong>AI VIDEO STUDIO</strong>
          <span />
        </div>
        <div className="studio-content">
          {section === 'characters' ? <CharacterLibrary /> : section === 'project' ? <VideoProductionPlanner /> : <PlaceholderPage section={section} />}
        </div>
      </main>
    </div>
  )
}
