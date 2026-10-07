import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { categories, type Tool } from '../lib/dashboardCatalog'
import { loadNavigationSettings, settlementProviders, sidebarEntries, sidebarSections, type NavigationOverride, type NavigationSettings, type SidebarEntry } from '../lib/navigationSettings'
import './NavigationEditor.css'

type Surface = 'dashboard' | 'sidebar'
type Editable = { id: string; title: string; description?: string }

export default function NavigationEditor() {
  const [surface, setSurface] = useState<Surface>('sidebar')
  const [draft, setDraft] = useState<NavigationSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    void loadNavigationSettings().then(value => setDraft(value)).catch(() => { setError('메뉴 설정을 불러오지 못했습니다. 데이터베이스 설정을 확인해주세요.'); setLoadFailed(true) }).finally(() => setLoading(false))
  }, [])

  const update = (id: string, patch: NavigationOverride) => setDraft(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }))
  const orderKey = surface === 'sidebar' ? 'sidebarOrder' : 'dashboardOrder'
  const visibleKey = surface === 'sidebar' ? 'sidebarVisible' : 'dashboardVisible'
  const sorted = <T extends Editable,>(items: T[]) => [...items].sort((a, b) => (draft[a.id]?.[orderKey] ?? items.findIndex(item => item.id === a.id)) - (draft[b.id]?.[orderKey] ?? items.findIndex(item => item.id === b.id)))
  const move = (items: Editable[], index: number, offset: number) => {
    const current = sorted(items)
    const other = index + offset
    if (other < 0 || other >= current.length) return
    ;[current[index], current[other]] = [current[other], current[index]]
    setDraft(previous => {
      const next = { ...previous }
      current.forEach((item, position) => { next[item.id] = { ...next[item.id], [orderKey]: position } })
      return next
    })
  }
  const row = (item: Editable, siblings: Editable[], index: number) => {
    const override = draft[item.id] || {}
    return <div className="navigation-editor__row" key={item.id}>
      <div className="navigation-editor__order">
        <button type="button" onClick={() => move(siblings, index, -1)} disabled={index === 0} aria-label={`${item.title} 위로 이동`}>↑</button>
        <button type="button" onClick={() => move(siblings, index, 1)} disabled={index === siblings.length - 1} aria-label={`${item.title} 아래로 이동`}>↓</button>
      </div>
      <div className="navigation-editor__fields">
        <label>이름<input value={override.title ?? item.title} maxLength={80} onChange={event => update(item.id, { title: event.target.value })} /></label>
        {surface === 'dashboard' && item.description !== undefined && <label>설명<input value={override.description ?? item.description} maxLength={200} onChange={event => update(item.id, { description: event.target.value })} /></label>}
      </div>
      <label className="navigation-editor__visible"><input type="checkbox" checked={override[visibleKey] !== false} onChange={event => update(item.id, { [visibleKey]: event.target.checked })} /> 표시</label>
    </div>
  }
  const rows = (items: Editable[]) => {
    const ordered = sorted(items)
    return ordered.map((item, index) => row(item, ordered, index))
  }
  const sidebarGroup = (section: string, provider?: string) => rows(sidebarEntries.filter(item => item.section === section && (provider ? item.provider === provider : !item.provider)) as SidebarEntry[])
  const dashboardGroup = (tools: Tool[]) => rows(tools)

  const save = async () => {
    setSaving(true); setError(''); setMessage('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('로그인 정보를 확인하지 못했습니다.')
      const { error: saveError } = await supabase.from('app_navigation_settings').upsert({ id: 'main', settings: draft, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'id' })
      if (saveError) throw saveError
      window.dispatchEvent(new Event('navigation-settings-updated'))
      setMessage('저장했습니다. 다른 팀원 화면에도 적용됩니다.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.') }
    finally { setSaving(false) }
  }

  return <section className="admin-console__card navigation-editor">
    <div className="admin-console__card-title"><h2>대시보드 · 왼쪽 메뉴 편집</h2><button type="button" className="navigation-editor__save" onClick={() => void save()} disabled={saving || loading || loadFailed}>{saving ? '저장 중...' : '변경사항 저장'}</button></div>
    <p className="admin-console__hint">이름과 설명, 순서, 표시 여부를 수정할 수 있습니다. 화면별 표시와 순서는 따로 적용되며, 이름은 두 화면에 함께 반영됩니다.</p>
    <div className="navigation-editor__tabs"><button type="button" className={surface === 'sidebar' ? 'active' : ''} onClick={() => setSurface('sidebar')}>왼쪽 메뉴</button><button type="button" className={surface === 'dashboard' ? 'active' : ''} onClick={() => setSurface('dashboard')}>대시보드 카드</button></div>
    {error && <p className="admin-console__error" role="alert">{error}</p>}{message && <p className="admin-console__success" role="status">{message}</p>}
    {loading ? <p className="admin-console__empty">설정을 불러오는 중...</p> : surface === 'sidebar' ? <div className="navigation-editor__groups">
      <div className="navigation-editor__group"><h3>상단 메뉴</h3>{sidebarGroup('top')}</div>
      {sorted(sidebarSections.map(section => ({ id: `section:${section.id}`, title: section.title }))).map(section => {
        const key = section.id.slice(8)
        return <div className="navigation-editor__group" key={section.id}>
          <h3>아코디언: {section.title}</h3>{row(section, sorted(sidebarSections.map(value => ({ id: `section:${value.id}`, title: value.title }))), sorted(sidebarSections.map(value => ({ id: `section:${value.id}`, title: value.title }))).findIndex(value => value.id === section.id))}
          {key === 'settlement' ? sorted(settlementProviders.map(provider => ({ id: `provider:${provider.id}`, title: provider.title }))).map(provider => {
            const providers = sorted(settlementProviders.map(value => ({ id: `provider:${value.id}`, title: value.title })))
            return <div className="navigation-editor__subgroup" key={provider.id}><h4>{provider.title}</h4>{row(provider, providers, providers.findIndex(value => value.id === provider.id))}{sidebarGroup('settlement', provider.id.slice(9))}</div>
          }) : sidebarGroup(key)}
        </div>
      })}
    </div> : <div className="navigation-editor__groups">
      {sorted(categories.map(category => ({ id: `section:${category.id}`, title: category.title, description: category.description }))).map(section => {
        const category = categories.find(value => `section:${value.id}` === section.id)!
        const sections = sorted(categories.map(value => ({ id: `section:${value.id}`, title: value.title, description: value.description })))
        return <div className="navigation-editor__group" key={section.id}>
          <h3>{section.title}</h3>{row(section, sections, sections.findIndex(value => value.id === section.id))}
          {dashboardGroup(category.tools)}
          {category.groups && sorted(category.groups.map(group => ({ id: `provider:${group.id}`, title: group.title }))).map(provider => {
            const group = category.groups!.find(value => `provider:${value.id}` === provider.id)!
            const providers = sorted(category.groups!.map(value => ({ id: `provider:${value.id}`, title: value.title })))
            return <div className="navigation-editor__subgroup" key={provider.id}><h4>{provider.title}</h4>{row(provider, providers, providers.findIndex(value => value.id === provider.id))}{dashboardGroup(group.tools)}</div>
          })}
        </div>
      })}
    </div>}
    <div className="navigation-editor__footer"><button type="button" onClick={() => { setDraft({}); setMessage('기본값으로 변경했습니다. 저장을 눌러 적용하세요.'); setError('') }} disabled={loading || saving || loadFailed}>기본값으로 되돌리기</button><button type="button" className="navigation-editor__save" onClick={() => void save()} disabled={saving || loading || loadFailed}>{saving ? '저장 중...' : '변경사항 저장'}</button></div>
  </section>
}
