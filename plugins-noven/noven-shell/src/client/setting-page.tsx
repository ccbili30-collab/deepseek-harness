/**
 * 设定页 — the card's finished display page. It owns the cover, identity, tags,
 * tab bar and per-tab background, and reads the card's modules as page sources.
 * It never copies module content: the home tab reads the overview module, the
 * module tabs read their modules, and the characters tab reads the world's
 * internal characters.
 * @module noven-shell/client/setting-page
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { CardDocView, CardModuleDoc } from './card-api.ts'
import { avatarImageId, coverImageId, identityImageId } from './card-images.ts'
import { coverPalette, type CoverPalette } from './cover-palette.ts'
import { CardMarkdownEditor } from './doc-editor.tsx'
import { InlineRename } from './ui/interact.tsx'
import { coll, collText, rel, tl } from './widgets.tsx'
import { fmt, type ShellT } from './pages/Home.tsx'
import { isOverviewModule, moduleMarkdown } from './module-text.ts'

type CardTarget = Omit<CardDocView, 'characters'> | CardDocView
type SettingTemplate = 'overview' | 'text' | 'collection' | 'profile' | 'gallery' | 'timeline' | 'map' | 'relation' | 'free' | 'characters'
type SettingPageKind = 'home' | 'module' | 'characters'

interface SettingTab {
  readonly id: string
  readonly label: string
  readonly kind: SettingPageKind
  readonly template: SettingTemplate
  readonly module?: CardModuleDoc
}

/** What the card page hands the display page: the resolved target, its read model, and navigation. */
export interface SettingPageProps {
  readonly target: CardTarget
  readonly doc: CardDocView
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly renderModule: (module: CardModuleDoc) => ReactNode
  readonly onEditModule: (moduleId: string) => void
  readonly onAddModule: () => void
  readonly onOpenRole: (id: string) => void
  readonly onBackRole?: () => void
  readonly isRole: boolean
  readonly menu?: ReactNode
  readonly draft: boolean
  readonly aiEditing: boolean
  readonly renaming: boolean
  readonly onRename: (next: string | undefined) => void
  /** Card-level basics edited from the display page (absent on older hosts). */
  readonly onAddRole?: (name: string) => void
  readonly onSetImage?: (purpose: 'avatar' | 'cover' | 'logo', base64: string, mediaType: string) => Promise<boolean>
  readonly onClearImage?: (purpose: 'avatar' | 'cover' | 'logo') => void
  readonly onSaveTags?: (tags: readonly string[]) => Promise<boolean>
}

const noop = (): void => undefined

/** Module blocks → markdown helper's output is already the editor's input. */
function SettingText({ module }: { readonly module: CardModuleDoc }) {
  const markdown = useMemo(() => moduleMarkdown(module.blocks), [module.blocks])
  return <div className="nv-set-text"><CardMarkdownEditor markdown={markdown} onSave={noop} locked /></div>
}

/** Read-only timeline: era chips + events, never the timeline's event form. */
function SettingTimeline({ module, t }: { readonly module: CardModuleDoc; readonly t: ShellT }) {
  const data = tl(module.widget?.data)
  const events = [...data.events].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  const unit = data.calendar.unit === '' ? '年' : data.calendar.unit
  const timeOf = (at: number | null): string => at === null
    ? '—'
    : at < 0 ? `前 ${String(Math.abs(at))}${unit}` : `${String(at)}${unit}`
  return (
    <div className="nv-set-timeline">
      {data.eras.length > 0 && (
        <div className="nv-set-eras">
          {data.eras.map(era => (
            <span key={era.id} className="nv-set-era" style={era.color === '' ? undefined : { borderColor: era.color }}>
              {era.name}
            </span>
          ))}
        </div>
      )}
      {events.length === 0
        ? <div className="nv-set-empty">{t('setting.empty')}</div>
        : (
          <ol className="nv-set-events">
            {events.map(event => {
              const meta = [...(event.characters ?? []), ...(event.relations ?? []), ...(event.place?.label === undefined ? [] : [event.place.label])]
              return (
                <li key={event.id} className="nv-set-event">
                  <span className="nv-set-eventdot" style={event.color === undefined || event.color === '' ? undefined : { background: event.color }} />
                  <div className="nv-set-eventbody">
                    <div className="nv-set-eventtop">
                      <b>{event.title === '' ? '—' : event.title}</b>
                      <time>{timeOf(event.at)}{event.until === null ? '' : ` – ${timeOf(event.until)}`}</time>
                    </div>
                    {event.description !== '' && <p>{event.description}</p>}
                    {meta.length > 0 && <div className="nv-set-eventmeta">{meta.map(name => <span key={name}>{name}</span>)}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
    </div>
  )
}

/** Read-only collection display: profile facts, gallery, or item cards. */
function SettingCollection({ module, t, imageUrl, variant }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly variant: 'profile' | 'collection' | 'gallery'
}) {
  const data = coll(module.widget?.data)
  const fields = data.fields
  const items = data.items
  const values = data.values
  const valueOf = (itemId: string, fieldId: string): string => collText(values[itemId]?.[fieldId])
  const imageOf = (item: (typeof items)[number]): string => {
    const imageField = fields.find(field => field.type === 'image' && values[item.id]?.[field.id] !== undefined)
    const raw = imageField === undefined ? undefined : values[item.id]?.[imageField.id]
    const resourceId = typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string'
      ? raw.resourceId
      : item.visualKey ?? ''
    return resourceId === '' ? '' : imageUrl(resourceId)
  }
  if (items.length === 0) return <div className="nv-set-empty">{t('setting.empty')}</div>
  if (variant === 'profile') {
    const item = items[0]
    const image = imageOf(item)
    const facts = fields
      .map(field => ({ name: field.name, value: valueOf(item.id, field.id) }))
      .filter(fact => fact.value !== '')
    return (
      <div className="nv-set-profile">
        {image !== '' && <img className="nv-set-profileart" src={image} alt="" />}
        <div className="nv-set-profilebody">
          {item.name !== '' && <h3>{item.name}</h3>}
          {item.description !== '' && <p>{item.description}</p>}
          {facts.length > 0 && (
            <dl className="nv-set-facts">
              {facts.map(fact => <div key={fact.name}><dt>{fact.name}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          )}
        </div>
      </div>
    )
  }
  if (variant === 'gallery') {
    return (
      <div className="nv-set-gallery">
        {items.map(item => {
          const image = imageOf(item)
          return (
            <figure key={item.id} className="nv-set-galleryitem">
              {image === '' ? <span className="nv-set-galleryph">{item.name.slice(0, 1)}</span> : <img src={image} alt="" />}
              <figcaption>{item.name}</figcaption>
            </figure>
          )
        })}
      </div>
    )
  }
  return (
    <div className="nv-set-items">
      {items.map(item => {
        const image = imageOf(item)
        const summary = item.summary !== '' ? item.summary : item.description
        const facts = fields.slice(0, 3)
          .map(field => ({ name: field.name, value: valueOf(item.id, field.id) }))
          .filter(fact => fact.value !== '')
        return (
          <div key={item.id} className="nv-set-item">
            {image !== '' && <img src={image} alt="" />}
            <div className="nv-set-itembody">
              <b>{item.name}</b>
              {summary !== '' && <p>{summary}</p>}
              {facts.length > 0 && (
                <div className="nv-set-itemfacts">
                  {facts.map(fact => <span key={fact.name}><em>{fact.name}</em>{fact.value}</span>)}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function moduleIsText(module: CardModuleDoc): boolean {
  return module.widget === undefined || module.widget.type === 'document' || module.widget.type === 'overview'
}

function hasText(module: CardModuleDoc): boolean {
  return module.blocks.some(block => block.kind === 'text' ? (block.text ?? '').trim() !== '' : true)
}

function hasReadableContent(module: CardModuleDoc): boolean {
  const widget = module.widget?.type
  // Timeline/map/free surfaces are core pages even before their first item:
  // the page itself is where the user starts filling them.
  if (widget === 'timeline' || widget === 'map' || widget === 'html' || widget === 'scene') return true
  if (widget === 'collection') return coll(module.widget?.data).items.length > 0
  if (widget === 'relation') {
    const data = rel(module.widget?.data)
    return data.nodes.length > 0 || data.edges.length > 0
  }
  return module.widget !== undefined || hasText(module) || module.children.some(hasReadableContent)
}

function countModules(modules: readonly CardModuleDoc[]): number {
  return modules.reduce((count, module) => count + 1 + countModules(module.children), 0)
}

function templateOf(module: CardModuleDoc): SettingTemplate {
  const widget = module.widget?.type
  if (widget === 'timeline') return 'timeline'
  if (widget === 'map') return 'map'
  if (widget === 'relation') return 'relation'
  if (widget === 'html' || widget === 'scene') return 'free'
  if (widget === 'collection') {
    const data = coll(module.widget?.data)
    const contract = data.presentation?.contract
    if (data.view === 'graph' || contract === 'relations') return 'relation'
    if (contract === 'gallery' || module.name === '图集') return 'gallery'
    if (contract === 'profile' || contract === 'worldProfile' || data.view === 'profile'
      || module.name === '基本信息' || module.name === '角色档案' || module.name === '世界档案') return 'profile'
    return 'collection'
  }
  return 'text'
}

function firstTextOf(modules: readonly CardModuleDoc[]): string {
  for (const module of modules) {
    for (const block of module.blocks) {
      if (block.kind === 'text' && (block.text ?? '').trim() !== '') return block.text ?? ''
    }
    const nested = firstTextOf(module.children)
    if (nested !== '') return nested
  }
  return ''
}

function scrub(text: string): string {
  return text.replace(/[#>*`\-|[\]()!]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** A world-internal character tile: avatar, name, and the first readable line. */
function CharacterCard({ character, t, imageUrl, onOpen }: {
  readonly character: Omit<CardDocView, 'characters'>
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly onOpen: () => void
}) {
  const avatarId = avatarImageId(character)
  const image = avatarId === null ? '' : imageUrl(avatarId)
  const excerpt = scrub(firstTextOf(character.modules)).slice(0, 72)
  return (
    <button type="button" className="nv-set-char" onClick={onOpen}>
      <span className="nv-set-charart">
        {image === ''
          ? <span className="nv-set-charinitial">{character.name.slice(0, 1)}</span>
          : <img src={image} alt="" />}
      </span>
      <span className="nv-set-charinfo">
        <b>{character.name}</b>
        {excerpt !== '' && <small>{excerpt}</small>}
        <span className="nv-set-charmeta">{fmt(t, 'setting.moduleCount', { count: countModules(character.modules) })}</span>
      </span>
    </button>
  )
}

/**
 * Render the card's display page. Tabs are generated from the card: home,
 * one tab per readable top-level module, and the world's internal characters.
 */
export function SettingPage({ target, doc, t, imageUrl, renderModule, onEditModule, onAddModule, onOpenRole, onAddRole, onBackRole, isRole, menu, draft, aiEditing, renaming, onRename, onSetImage, onClearImage, onSaveTags }: SettingPageProps) {
  const [activeId, setActiveId] = useState('home')
  const [tagDraft, setTagDraft] = useState<string | undefined>(undefined)
  const tagSaving = useRef(false)
  const [roleDraft, setRoleDraft] = useState<string | undefined>(undefined)
  const [imageSlot, setImageSlot] = useState<'avatar' | 'cover' | 'logo' | undefined>(undefined)
  const [tabScroll, setTabScroll] = useState({ left: false, right: false })
  const [palette, setPalette] = useState<CoverPalette | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const swipe = useRef<{ readonly x: number, readonly y: number } | null>(null)

  const overviewModule = target.modules.find(isOverviewModule)
  const firstTextModule = target.modules.find(module => moduleIsText(module) && hasText(module))
  const homeModule = overviewModule ?? firstTextModule
  const homeLabel = target.kind === 'WORLD' ? t('setting.worldIntro') : t('setting.characterHome')
  const kindLabel = t(target.kind === 'WORLD' ? 'card.kind.world' : 'card.kind.character')

  const tabs = useMemo<readonly SettingTab[]>(() => {
    const home: SettingTab = { id: 'home', label: homeLabel, kind: 'home', template: 'overview' }
    const modules = target.modules
      .filter(module => module.id !== homeModule?.id && hasReadableContent(module))
      .map(module => ({
        id: module.id,
        label: module.name,
        kind: 'module' as const,
        template: templateOf(module),
        module,
      }))
    const characters: SettingTab[] = !isRole && doc.characters.length > 0
      ? [{ id: 'characters', label: t('setting.characters'), kind: 'characters', template: 'characters' }]
      : []
    return [home, ...modules, ...characters]
  }, [doc.characters.length, homeLabel, homeModule?.id, isRole, t, target.modules])

  const active = tabs.find(tab => tab.id === activeId) ?? tabs[0]
  const activeIndex = tabs.findIndex(tab => tab.id === active.id)

  const updateTabScroll = useCallback(() => {
    const strip = tabsRef.current
    if (strip === null) return
    const left = strip.scrollLeft > 1
    const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1
    setTabScroll(current => current.left === left && current.right === right ? current : { left, right })
  }, [])

  const nudgeTabs = (direction: -1 | 1): void => {
    const strip = tabsRef.current
    if (strip === null) return
    strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * 0.65), behavior: 'smooth' })
  }

  useEffect(() => {
    const strip = tabsRef.current
    const tab = tabRefs.current.get(active.id)
    if (strip === null || tab === undefined) return
    const start = strip.scrollLeft
    const end = start + strip.clientWidth
    const tabStart = tab.offsetLeft
    const tabEnd = tabStart + tab.offsetWidth
    if (tabStart < start) {
      strip.scrollTo({ left: Math.max(0, tabStart - 16), behavior: 'smooth' })
    } else if (tabEnd > end) {
      strip.scrollTo({ left: Math.min(strip.scrollWidth - strip.clientWidth, tabEnd - strip.clientWidth + 16), behavior: 'smooth' })
    }
  }, [active.id, tabs])

  useEffect(() => {
    const strip = tabsRef.current
    if (strip === null) return
    const onScroll = (): void => { updateTabScroll() }
    const onWheel = (event: WheelEvent): void => {
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const atStart = strip.scrollLeft <= 0
      const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return
      strip.scrollLeft += event.deltaY
      event.preventDefault()
    }
    strip.addEventListener('scroll', onScroll, { passive: true })
    strip.addEventListener('wheel', onWheel, { passive: false })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onScroll)
    observer?.observe(strip)
    updateTabScroll()
    return () => {
      strip.removeEventListener('scroll', onScroll)
      strip.removeEventListener('wheel', onWheel)
      observer?.disconnect()
    }
  }, [tabs, updateTabScroll])

  const coverId = coverImageId(target)
  const cover = coverId === null ? '' : imageUrl(coverId)
  const background = cover
  const face = identityImageId(target)
  const logo = face === null ? '' : imageUrl(face)
  const tags = useMemo(() => {
    const found = new Set<string>()
    for (const tag of target.tags ?? []) {
      const value = tag.trim()
      if (value !== '') found.add(value)
    }
    const walk = (modules: readonly CardModuleDoc[]): void => {
      for (const module of modules) {
        for (const tag of module.tags) {
          const value = tag.trim()
          if (value !== '') found.add(value)
        }
        walk(module.children)
      }
    }
    walk(target.modules)
    return [...found].slice(0, 10)
  }, [target.modules, target.tags])
  const ownedTags = useMemo(() => [...new Set((target.tags ?? []).map(tag => tag.trim()).filter(tag => tag !== ''))], [target.tags])

  useEffect(() => {
    if (cover === '') {
      setPalette(undefined)
      return
    }
    let alive = true
    void coverPalette(cover).then(next => { if (alive) setPalette(next) })
    return () => { alive = false }
  }, [cover])

  const pageStyle = palette === undefined
    ? undefined
    : { '--nv-set-field': palette.field, '--nv-set-accent': palette.accent } as CSSProperties

  const go = useCallback((delta: number) => {
    const next = tabs[activeIndex + delta]
    if (next !== undefined) setActiveId(next.id)
  }, [activeIndex, tabs])

  const pickImage = (slot: 'avatar' | 'cover' | 'logo'): void => {
    setImageSlot(slot)
    fileRef.current?.click()
  }
  const commitTag = async (): Promise<void> => {
    if (tagSaving.current) return
    const value = (tagDraft ?? '').trim()
    if (value === '' || ownedTags.includes(value)) { setTagDraft(undefined); return }
    tagSaving.current = true
    try {
      if (await onSaveTags?.([...ownedTags, value])) {
        setTagDraft(current => current?.trim() === value ? undefined : current)
      }
    } catch (_error) {
      // The card owner reports the failure; retain the tag draft for retry.
    } finally {
      tagSaving.current = false
    }
  }
  const commitRole = (): void => {
    const name = (roleDraft ?? '').trim()
    setRoleDraft(undefined)
    if (name === '') return
    onAddRole?.(name)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    swipe.current = { x: event.clientX, y: event.clientY }
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = swipe.current
    swipe.current = null
    if (start === null) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    go(dx < 0 ? 1 : -1)
  }

  const editHome = (): void => {
    if (homeModule !== undefined) onEditModule(homeModule.id)
    else onAddModule()
  }

  return (
    <div className="nv-setting" style={pageStyle}>
      <div className="nv-set-backdrop" aria-hidden="true">
        <div className={`nv-set-bg${background === '' ? ' nv-set-bg-fallback' : ''}`}
          data-kind={target.kind}
          style={background === '' ? undefined : { backgroundImage: `url("${background}")` }} />
        <div className="nv-set-soft" />
        <div className="nv-set-paper" />
      </div>

      <header className="nv-set-hero">
        {cover !== ''
          ? <img className="nv-set-cover" src={cover} alt="" />
          : <span className="nv-set-coverfallback" data-kind={target.kind} />}
        <span className="nv-set-heroshade" />
        <div className="nv-set-top">
          {isRole && (
            <button type="button" className="nv-set-back" aria-label={t('setting.back')} onClick={onBackRole}>
              ‹ {doc.name}
            </button>
          )}
          <div className="nv-set-topright">
            {onSetImage !== undefined && (
              <button type="button" className="nv-set-imgact" onClick={() => pickImage('cover')}>
                {target.kind === 'WORLD' ? t('card.home.cover') : t('card.home.background')}
              </button>
            )}
            {aiEditing && <span className="nv-set-pill">{t('ai.editing')}</span>}
            {draft && <span className="nv-set-pill">{t('me.draft')}</span>}
            {menu}
          </div>
        </div>
      </header>

      <div className="nv-set-lower">
        <div className="nv-set-lowercontent">
          <div className="nv-set-identity">
            <button type="button" className="nv-set-logo"
              aria-label={target.kind === 'WORLD' ? t('card.home.logo') : t('card.home.avatar')}
              onClick={() => pickImage(target.kind === 'WORLD' ? 'logo' : 'avatar')}>
              {logo === '' ? <span>{target.name.slice(0, 1)}</span> : <img src={logo} alt="" />}
            </button>
            <div className="nv-set-id">
              <span className="nv-set-kind">{kindLabel}</span>
              {renaming
                ? <InlineRename className="nv-set-rename" value={target.name} onDone={onRename} />
                : <h1 className="nv-set-name">{target.name}</h1>}
              <div className="nv-set-meta">{fmt(t, 'setting.meta', { kind: kindLabel, count: countModules(target.modules) })}</div>
            </div>

            {(tags.length > 0 || onSaveTags !== undefined) && (
              <div className="nv-set-tags">
                {tags.map(tag => (
                  <span key={tag} className="nv-set-tag">
                    {tag.startsWith('#') ? tag : `#${tag}`}
                    {onSaveTags !== undefined && ownedTags.includes(tag) && (
                      <button type="button" aria-label={t('card.home.tagRemove')}
                        onClick={() => { void onSaveTags(ownedTags.filter(candidate => candidate !== tag)) }}>×</button>
                    )}
                  </span>
                ))}
                {tagDraft === undefined
                  ? onSaveTags !== undefined && (
                    <button type="button" className="nv-set-tagadd" aria-label={t('card.home.tagAdd')}
                      title={t('card.home.tagAdd')} onClick={() => setTagDraft('')}>＋</button>
                  )
                  : <input className="nv-set-taginput" autoFocus value={tagDraft} aria-label={t('card.home.tagAdd')}
                      onChange={event => setTagDraft(event.target.value)}
                      onBlur={() => { void commitTag() }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') { event.preventDefault(); void commitTag() }
                        if (event.key === 'Escape') setTagDraft(undefined)
                      }} />}
              </div>
            )}
          </div>

          <div className="nv-set-tabshell"
            data-overflow-left={tabScroll.left || undefined}
            data-overflow-right={tabScroll.right || undefined}>
            <div className="nv-set-tabs" role="tablist" aria-label={t('setting.tabs')} ref={tabsRef}>
              {tabs.map(tab => (
                <button key={tab.id} type="button" role="tab" id={`nv-set-tab-${tab.id}`}
                  ref={element => {
                    if (element === null) tabRefs.current.delete(tab.id)
                    else tabRefs.current.set(tab.id, element)
                  }}
                  className="nv-set-tab" data-active={tab.id === active.id || undefined}
                  aria-selected={tab.id === active.id} aria-controls="nv-set-panel"
                  onClick={() => setActiveId(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
            {tabScroll.left && (
              <button type="button" className="nv-set-tabscroll nv-set-tabscroll-prev"
                aria-label={t('setting.tabsPrev')} onClick={() => { nudgeTabs(-1) }}>‹</button>
            )}
            {tabScroll.right && (
              <button type="button" className="nv-set-tabscroll nv-set-tabscroll-next"
                aria-label={t('setting.tabsNext')} onClick={() => { nudgeTabs(1) }}>›</button>
            )}
          </div>

          <div id="nv-set-panel" className="nv-set-content" role="tabpanel"
            aria-labelledby={`nv-set-tab-${active.id}`}
            onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            <div className="nv-set-body" key={active.id}>
              {active.kind === 'home' && (
                <>
                  <div className="nv-set-tabhead">
                    <h2>{homeLabel}</h2>
                    <button type="button" className="nv-set-edit" onClick={editHome}>
                      {homeModule === undefined ? t('setting.add') : t('setting.edit')}
                    </button>
                  </div>
                  <div className="nv-set-fields">
                    <div className="nv-set-field">
                      <span className="nv-set-label">{t('setting.name')}</span>
                      <div className="nv-set-value">{target.name}</div>
                    </div>
                    {homeModule === undefined
                      ? <div className="nv-set-empty">{t('setting.empty')}</div>
                      : (
                        <div className="nv-set-field nv-set-field-body">
                          <span className="nv-set-label">{homeModule.name}</span>
                          <SettingText module={homeModule} />
                        </div>
                      )}
                  </div>
                </>
              )}

              {active.kind === 'module' && active.module !== undefined && (
                <>
                  <div className="nv-set-tabhead">
                    <h2>{active.module.name}</h2>
                    <button type="button" className="nv-set-edit" onClick={() => onEditModule(active.module?.id ?? '')}>
                      {t('setting.edit')}
                    </button>
                  </div>
                  {moduleIsText(active.module)
                    ? (
                      <div className="nv-set-field nv-set-field-body">
                        <SettingText module={active.module} />
                      </div>
                    )
                    : active.template === 'timeline'
                      ? <SettingTimeline module={active.module} t={t} />
                      : active.template === 'profile' || active.template === 'collection' || active.template === 'gallery'
                        ? (
                          <SettingCollection module={active.module} t={t} imageUrl={imageUrl}
                            variant={active.template === 'profile' ? 'profile' : active.template === 'gallery' ? 'gallery' : 'collection'} />
                        )
                        : <div className="nv-set-module">{renderModule(active.module)}</div>}
                </>
              )}

              {active.kind === 'characters' && (
                <>
                  <div className="nv-set-tabhead">
                    <h2>{t('setting.characters')}</h2>
                    <span className="nv-set-count">{doc.characters.length}</span>
                    {onAddRole !== undefined && (
                      <button type="button" className="nv-set-edit" onClick={() => setRoleDraft('')}>
                        ＋ {t('card.home.roleAdd')}
                      </button>
                    )}
                  </div>
                  {roleDraft !== undefined && (
                    <input className="nv-set-roleinput" autoFocus value={roleDraft} placeholder={t('card.home.roleName')}
                      aria-label={t('card.home.roleName')}
                      onChange={event => setRoleDraft(event.target.value)}
                      onBlur={commitRole}
                      onKeyDown={event => {
                        if (event.key === 'Enter') { event.preventDefault(); commitRole() }
                        if (event.key === 'Escape') setRoleDraft(undefined)
                      }} />
                  )}
                  <div className="nv-set-chars">
                    {doc.characters.map(character => (
                      <CharacterCard key={character.id} character={character} t={t} imageUrl={imageUrl}
                        onOpen={() => onOpenRole(character.id)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden aria-hidden="true"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file === undefined || imageSlot === undefined || onSetImage === undefined) return
          const purpose = imageSlot
          const reader = new FileReader()
          reader.onload = () => {
            const data = typeof reader.result === 'string' ? reader.result : ''
            const comma = data.indexOf(',')
            if (comma < 0) return
            void onSetImage(purpose, data.slice(comma + 1), file.type === '' ? 'image/png' : file.type)
          }
          reader.readAsDataURL(file)
        }} />
    </div>
  )
}
