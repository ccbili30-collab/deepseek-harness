/**
 * 卡类编辑器 — the card-native editor. The card is the interface: it renders
 * as its finished self (cover/portrait hero, name, intro, modules as document
 * sections, characters as chips) rather than as a panel around an editor.
 * Two layouts share one state: 文档 renders the whole card as one editable
 * page (default); 分栏 keeps the card surface on the left and the selected
 * module's document on the right. All writes go through `/api/noven-cards`.
 * @module noven-shell/client/pages/CardStudio
 */
import { Fragment, useMemo, useRef, useState, useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CardAddr, CardBlockView, CardDocView, CardModuleDoc, CardOp, CardOpResult, CardState } from '../card-api.ts'
import { cardContentUrl } from '../card-api.ts'
import type { CardEditorProps } from './CardEditor.tsx'
import { findModule, flatten } from './CardEditor.tsx'

/** localStorage key remembering which editor layout the user last used. */
const VIEW_KEY = 'noven.editor.view'
const SPREAD_KEY = 'noven.editor.hspread'

type ViewMode = 'doc' | 'split'

/** Module names that hold the card's intro text rather than a real section (mirrors the mobile rule). */
const INTRO_NAMES = new Set(['简介', '世界简介', '人物简介', 'Intro', 'Introduction'])

function loadView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'split' ? 'split' : 'doc' } catch { return 'doc' }
}

/** The sibling list that owns `id`, searched recursively through the module tree. */
function siblingsOf(modules: readonly CardModuleDoc[], id: string): readonly CardModuleDoc[] | undefined {
  if (modules.some(m => m.id === id)) return modules
  for (const m of modules) {
    const found = siblingsOf(m.children, id)
    if (found !== undefined) return found
  }
  return undefined
}

/** First non-empty text line of a module, markdown syntax stripped — the list row's excerpt. */
function excerptOf(module: CardModuleDoc): string {
  for (const block of module.blocks) {
    if (block.kind !== 'text') continue
    const line = (block.text ?? '').split('\n').find(l => l.trim().length > 0)
    if (line !== undefined) return line.replace(/[#>*`\-|[\]()!]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

/** Anchor point for a fixed-position popover, captured from the triggering button. `up` flips the popover above the anchor when it would overflow the viewport bottom. */
interface Anchor { readonly key: string; readonly x: number; readonly y: number; readonly up?: boolean }

/** A blank-line-separated slice of a text block; `from`/`to` are character offsets into the block's raw text so an edit can be spliced back. */
interface Para { readonly from: number; readonly to: number; readonly text: string }

/** Split a text block into paragraph units: runs of blank lines separate paragraphs, blank lines inside ``` fences do not. */
function splitParagraphs(text: string): Para[] {
  const paras: Para[] = []
  let fence = false
  let start = -1
  let pos = 0
  const push = (end: number) => { if (start >= 0) paras.push({ from: start, to: end, text: text.slice(start, end) }) }
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) fence = !fence
    if (!fence && line.trim() === '') { push(pos); start = -1 }
    else if (start < 0) start = pos
    pos += line.length + 1
  }
  push(text.length)
  return paras.filter(p => p.text.trim() !== '')
}

/** Built-in widget payloads mirror the Android `ContentModuleDocument` codec: a module's text block carries `{version, kind, ...}` JSON so both ends parse the same bytes. */
interface TimelineNode { readonly time: string; readonly title: string; readonly description: string }
interface CollectionItem { readonly id: string; readonly name: string; readonly summary: string; readonly description: string }
type WidgetDoc =
  | { readonly kind: 'timeline'; readonly nodes: readonly TimelineNode[] }
  | { readonly kind: 'collection'; readonly items: readonly CollectionItem[] }
  | { readonly kind: 'single_image'; readonly description: string }
  | { readonly kind: 'article'; readonly text: string }
  | { readonly kind: 'unsupported'; readonly originalType: string }

/** Semantic widget types mapped to document kinds for plain-text fallbacks — same mapping as Android `legacyDocument`. */
const TIMELINE_TYPES = new Set(['timeline', 'era_event', 'world_experience'])
const IMAGE_TYPES = new Set(['map', 'single_image'])
const COLLECTION_TYPES = new Set(['collection', 'region', 'faction', 'race', 'quotes', 'attribute_panel', 'equipment', 'talent_skill', 'appearance_personality', 'interest', 'game_attributes', 'game_skills', 'game_equipment', 'game_items', 'game_quests', 'game_checks', 'game_endings', 'game_character_status', 'game_quick_actions'])

const widgetDoc = (type: string, text: string): WidgetDoc => {
  let parsed: Record<string, unknown> | undefined
  try { const v: unknown = JSON.parse(text); if (typeof v === 'object' && v !== null) parsed = v as Record<string, unknown> } catch { /* plain text falls through to the legacy mapping */ }
  if (parsed !== undefined) {
    const str = (v: unknown) => typeof v === 'string' ? v : ''
    const rows = (v: unknown) => (Array.isArray(v) ? v : []).map((n: unknown) => (typeof n === 'object' && n !== null ? n : {}) as Record<string, unknown>)
    switch (parsed.kind) {
      case 'timeline': return { kind: 'timeline', nodes: rows(parsed.nodes).map(n => ({ time: str(n.time), title: str(n.title), description: str(n.description) })) }
      case 'collection': return { kind: 'collection', items: rows(parsed.items).map(n => ({ id: str(n.id), name: str(n.name), summary: str(n.summary), description: str(n.description) })) }
      case 'single_image': return { kind: 'single_image', description: str(parsed.description) }
      case 'article': return { kind: 'article', text: str(parsed.text) }
      case 'unsupported': return { kind: 'unsupported', originalType: str(parsed.originalType) }
      default: return { kind: 'unsupported', originalType: typeof parsed.kind === 'string' ? parsed.kind : type }
    }
  }
  if (TIMELINE_TYPES.has(type)) return { kind: 'timeline', nodes: text.trim() === '' ? [] : [{ time: '', title: '', description: text }] }
  if (IMAGE_TYPES.has(type)) return { kind: 'single_image', description: text }
  if (COLLECTION_TYPES.has(type)) return { kind: 'collection', items: text.trim() === '' ? [] : [{ id: '', name: '', summary: text, description: '' }] }
  return { kind: 'article', text }
}

/** An in-progress inline edit: one paragraph (or the whole widget source, from=0/to=base.length) inside one text block. */
interface Editing {
  readonly moduleId: string
  readonly blockId: string | null
  readonly from: number
  readonly to: number
  readonly base: string
  readonly text: string
}

/** Marker id meaning "the drop lands at the end of the top-level list". */
const END_MARK = '__end__'

/** A resolved drop for a dragged module: a sibling position (`parentId` + `beforeId`, null beforeId = list end) or inside a container (`insideId`). `markerId`/`markerPos` point the insertion line at a row. */
interface DropSpec {
  readonly parentId: string | null
  readonly beforeId: string | null
  readonly insideId?: string
  readonly markerId?: string
  readonly markerPos?: 'before' | 'after'
}

/** Localized chrome MarkdownText needs for code blocks and footnotes. */
interface MdLabels { readonly code: { copyLabel: string; copiedLabel: string; toolbarLabels: { codeLabel: string; wrapLabel: string; unwrapLabel: string } }; readonly footnotes: string }

/** Read-side of a module: text blocks render as Markdown, image blocks as captioned figures. */
export function CardStudio({ t, useStore, loadCard, op, workspaceRoot, back, focusModuleId }: CardEditorProps & { readonly focusModuleId?: string }) {
  const card = useStore(s => s.card)
  const [state, setState] = useState<CardState | 'loading' | undefined>(undefined)
  const [targetId, setTargetId] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [view, setView] = useState<ViewMode>(loadView)
  const [sideOpen, setSideOpen] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [openMenu, setOpenMenu] = useState<Anchor | null>(null)
  const [faceAt, setFaceAt] = useState<Anchor | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<{ readonly id: string; readonly original: string } | null>(null)
  const [renameText, setRenameText] = useState('')
  const [cardRename, setCardRename] = useState<string | null>(null)
  const [tabId, setTabId] = useState<string | undefined>(undefined)
  const [secTab, setSecTab] = useState<Readonly<Record<string, string>>>({})
  const [spread, setSpread] = useState<ReadonlySet<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(SPREAD_KEY) ?? '[]') as string[]) } catch { return new Set() }
  })
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropSpec, setDropSpec] = useState<DropSpec | null>(null)
  /** Module-level clipboard: the module id copied last, so copy_module can deep-clone it on paste. */
  const [clip, setClip] = useState<{ readonly targetId: string | undefined; readonly moduleId: string; readonly name: string } | null>(null)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const pressRef = useRef<{ readonly id: string; readonly x: number; readonly y: number; hold: number | null } | null>(null)
  const dragRef = useRef<string | null>(null)
  const dropRef = useRef<DropSpec | null>(null)
  const suppressClickRef = useRef(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  /** Imperative drag layer: a full-size clone of the grabbed element that tracks the pointer via direct transform writes — React re-render per frame would lag. */
  const liftRef = useRef<HTMLDivElement | null>(null)
  const grabRef = useRef({ dx: 0, dy: 0 })
  const sizeRef = useRef({ w: 0, h: 0 })
  const ctlRef = useRef<{ move: (e: PointerEvent) => void; up: () => void; undo: () => void; redo: () => void; copy: () => void; paste: () => void }>({ move: () => undefined, up: () => undefined, undo: () => undefined, redo: () => undefined, copy: () => undefined, paste: () => undefined })

  const refresh = async (): Promise<CardState | undefined> => {
    if (card === null) return undefined
    const next = await loadCard(card, card.cardId)
    setState(next)
    return next
  }

  useEffect(() => {
    let live = true
    setSelected(undefined); setTargetId(undefined); setCollapsed(new Set()); setTabId(undefined)
    setNotice(undefined); setPending(null); setEditing(null); setOpenMenu(null)
    setFaceAt(null); setCardRename(null)
    if (card === null) { setState(undefined); return }
    setState('loading')
    void loadCard(card, card.cardId).then(d => { if (live) setState(d) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.cardId, card?.sessionId, loadCard])

  const doc: CardDocView | undefined = state !== undefined && state !== 'loading' ? state.document : undefined
  const target: Omit<CardDocView, 'characters'> | undefined = doc === undefined
    ? undefined
    : targetId === undefined || targetId === doc.id
      ? doc
      : doc.characters.find(c => c.id === targetId)
  const rows = useMemo(() => (target !== undefined ? flatten(target.modules, collapsed) : []), [target, collapsed])
  /** A module with children and no body of its own is a folder: it groups,
   *  it does not open. Folders never become the right pane's document.
   *  The openable list ignores collapse state — folding the tree must not
   *  swap the document out from under the reader. */
  const isFolder = (m: CardModuleDoc) => m.children.length > 0 && m.blocks.length === 0
  const openable = useMemo(
    () => (target !== undefined ? flatten(target.modules, new Set()).filter(f => !isFolder(f.row)).map(f => f.row) : []),
    [target],
  )
  const current = openable.find(m => m.id === selected) ?? openable[0]
  // Pin the fallback onto `selected` so collapsing a folder does not swap the
  // displayed document out from under the reader; it only moves when the
  // displayed module itself disappears.
  useEffect(() => {
    if (current !== undefined && current.id !== selected) setSelected(current.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])
  const resources = useMemo(() => new Map((state !== undefined && state !== 'loading' ? state.resources : []).map(r => [r.id, r.ref])), [state])
  const media = (resourceId: string | undefined | null) => {
    const ref = resourceId === null || resourceId === undefined ? undefined : resources.get(resourceId)
    return ref === undefined || card === null || state === undefined || state === 'loading'
      ? '' : cardContentUrl(workspaceRoot(card), state.dir, ref)
  }
  const images = useMemo(() => (state !== undefined && state !== 'loading' ? state.resources : []).filter(r => r.mediaType.startsWith('image/')), [state])
  const mdLabels = useMemo<MdLabels>(() => ({
    code: {
      copyLabel: t('editor.md.copy'),
      copiedLabel: t('editor.md.copied'),
      toolbarLabels: { codeLabel: t('editor.md.code'), wrapLabel: t('editor.md.wrap'), unwrapLabel: t('editor.md.unwrap') },
    },
    footnotes: '',
  }), [t])
  const hasDraft = state !== undefined && state !== 'loading' && state.hasDraft
  const version = state !== undefined && state !== 'loading' ? state.version : ''
  const versionRef = useRef(version)
  versionRef.current = version
  /** Queued writes read live flags through refs — a closure captured before an in-flight apply must not see a stale busy/version. */
  const busyRef = useRef(false)
  busyRef.current = busy
  /** Inline edits commit immediately; the queue keeps sequential writes ordered so a paragraph splice never lands on a stale base. */
  const writeQ = useRef<Promise<unknown>>(Promise.resolve())
  const isChar = target?.kind === 'CHARACTER'
  const faceId = isChar ? target?.avatarResourceId : target?.coverResourceId
  const face = media(faceId)
  const introMod = target?.modules.find(m => INTRO_NAMES.has(m.name))
  const sections = target?.modules.filter(m => !INTRO_NAMES.has(m.name)) ?? []
  /** PAGED cards present their top-level modules as horizontal pages; doc mode renders them as a tab strip. */
  const paged = target?.readingLayout === 'PAGED' && sections.length > 1
  const activeTab = paged ? (sections.find(m => m.id === tabId) ?? sections[0]).id : undefined

  // 抽屉树的模块行是深链：打开卡页后直接落位到那个模块（分页切页、连续滚动）。
  useEffect(() => {
    if (focusModuleId === undefined || state === 'loading' || doc === undefined) return
    if (paged) { setTabId(focusModuleId); return }
    document.getElementById(`nv-ed-sec-${focusModuleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusModuleId, doc, paged, state])

  const switchView = (next: ViewMode) => {
    commitEditing()
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* private mode: preference simply does not persist */ }
  }

  const run = async (action: () => Promise<unknown>): Promise<CardState | undefined> => {
    if (card === null || busyRef.current) return undefined
    setBusy(true); setNotice(undefined)
    try {
      await action()
      return await refresh()
    } catch (error: unknown) {
      setNotice(error instanceof Error && error.name === 'CardConflict' ? t('editor.conflict') : String(error instanceof Error ? error.message : error))
      return await refresh()
    } finally {
      setBusy(false)
    }
  }

  const apply = (command: { readonly kind: string; readonly [key: string]: unknown }) => run(async () => {
    await op((card as NonNullable<typeof card>), { op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version: versionRef.current, command })
  })

  const undoEdit = () => run(async () => {
    await op((card as NonNullable<typeof card>), { op: 'undo', cardId: (card as NonNullable<typeof card>).cardId })
  })
  const redoEdit = () => run(async () => {
    await op((card as NonNullable<typeof card>), { op: 'redo', cardId: (card as NonNullable<typeof card>).cardId })
  })

  const copyModule = (m: CardModuleDoc) => {
    setClip({ targetId, moduleId: m.id, name: m.name })
    setNotice(t('editor.module.copied').replace('{name}', m.name))
  }
  const copyCurrent = () => {
    if (current === undefined) { setNotice(t('editor.module.noselect')); return }
    copyModule(current)
  }
  const pasteClip = (parentId: string | null, beforeId: string | null = null) => {
    if (clip === null) { setNotice(t('editor.module.noclip')); return }
    void apply({ kind: 'copy_module', moduleId: clip.moduleId, parentId, beforeId })
  }
  /** Top-bar paste: lands right after the selected module, or at the top-level end when nothing is selected. */
  const pasteAfterCurrent = () => {
    if (target === undefined || clip === null) { setNotice(t('editor.module.noclip')); return }
    const flat = flatten(target.modules, new Set())
    const entry = current === undefined ? undefined : flat.find(f => f.row.id === current.id)
    const parentId = entry?.parentId ?? null
    const sibs = parentId === null ? target.modules : (findModule(target.modules, parentId)?.children ?? [])
    const beforeId = entry === undefined ? null : (sibs.slice(sibs.findIndex(s => s.id === (current as CardModuleDoc).id) + 1)[0]?.id ?? null)
    pasteClip(parentId, beforeId)
  }

  /** Move a module one level up: it re-enters its grandparent's list right after its former parent. */
  const promoteModule = (m: CardModuleDoc) => {
    if (target === undefined) return
    const flat = flatten(target.modules, new Set())
    const self = flat.find(f => f.row.id === m.id)
    if (self === undefined || self.parentId === null) return
    const parent = flat.find(f => f.row.id === self.parentId)
    const gp = parent?.parentId ?? null
    const sibs = gp === null ? target.modules : (findModule(target.modules, gp)?.children ?? [])
    const beforeId = sibs.slice(sibs.findIndex(s => s.id === self.parentId) + 1)[0]?.id ?? null
    void apply({ kind: 'place_module', moduleId: m.id, parentId: gp, beforeId })
  }

  /** Widget type chip: localized label by document family, the raw type string when unknown. */
  const widgetLabel = (type: string) => {
    if (type === 'html') return t('editor.widget.kind.html')
    if (TIMELINE_TYPES.has(type)) return t('editor.widget.kind.timeline')
    if (IMAGE_TYPES.has(type)) return t('editor.widget.kind.map')
    if (COLLECTION_TYPES.has(type)) return t('editor.widget.kind.collection')
    return type
  }

  const addWidget = async (parentId: string | null, type: string) => {
    const sibs = parentId === null ? (target?.modules ?? []) : (findModule(target?.modules ?? [], parentId)?.children ?? [])
    const base = widgetLabel(type)
    let name = base
    for (let n = 2; sibs.some(s => s.name === name); n += 1) name = `${base} ${n}`
    const next = await run(async () => {
      await op((card as NonNullable<typeof card>), {
        op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version,
        command: { kind: 'add_module', name, widget: type, ...(parentId !== null ? { parentId } : {}) },
      })
    })
    if (parentId !== null && collapsed.has(parentId)) toggleCollapse(parentId)
    const added = next === undefined ? undefined : flatten(next.document.characters.find(c => c.id === targetId)?.modules
      ?? next.document.modules, new Set()).map(f => f.row).filter(m => m.name === name).pop()
    if (added !== undefined) {
      setSelected(added.id)
      setEditing({ moduleId: added.id, blockId: null, from: 0, to: 0, base: '', text: '' })
    }
  }

  /** Commit the active inline edit (when its text changed) by splicing the paragraph back into its block and writing the block immediately. */
  const commitEditing = () => {
    const e = editing
    if (e === null) return
    setEditing(null)
    const whole = e.blockId === null ? e.text : e.base.slice(0, e.from) + e.text + e.base.slice(e.to)
    if (whole.trim() === '' || (e.blockId !== null && whole === e.base)) return
    const m = findModule(target?.modules ?? [], e.moduleId)
    if (m === undefined) return
    const command = { kind: 'write_text', moduleId: e.moduleId, moduleName: m.name, text: whole, ...(e.blockId !== null ? { blockId: e.blockId } : {}) }
    writeQ.current = writeQ.current.then(() => apply(command))
  }

  const openPara = (m: CardModuleDoc, b: CardBlockView, p: Para) => {
    if (busyRef.current) return
    commitEditing()
    setEditing({ moduleId: m.id, blockId: b.id, from: p.from, to: p.to, base: b.text ?? '', text: p.text })
  }
  const openNewPara = (m: CardModuleDoc) => {
    if (busyRef.current) return
    commitEditing()
    setEditing({ moduleId: m.id, blockId: null, from: 0, to: 0, base: '', text: '' })
  }
  /** Widget modules edit their whole source (the text block verbatim) rather than a paragraph slice. */
  const openSource = (m: CardModuleDoc) => {
    if (busyRef.current) return
    commitEditing()
    const b = m.blocks.find(x => x.kind === 'text')
    const base = b?.text ?? ''
    setEditing({ moduleId: m.id, blockId: b?.id ?? null, from: 0, to: base.length, base, text: base })
  }

  /** Committed text lands per-block via write_text; the save button only commits a pending draft (e.g. left by the AI side). */
  const save = () => run(async () => {
    if (hasDraft) await op((card as NonNullable<typeof card>), { op: 'commit', cardId: (card as NonNullable<typeof card>).cardId, version: versionRef.current })
  })

  const addModule = async (parentId: string | null) => {
    const name = `${t('editor.module.defaultName')} ${rows.filter(r => r.parentId === parentId).length + 1}`
    const next = await run(async () => {
      await op((card as NonNullable<typeof card>), {
        op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version,
        command: { kind: 'add_module', name, ...(parentId !== null ? { parentId } : {}) },
      })
    })
    if (parentId !== null && collapsed.has(parentId)) toggleCollapse(parentId)
    const added = next === undefined ? undefined : flatten(next.document.characters.find(c => c.id === targetId)?.modules
      ?? next.document.modules, new Set()).map(f => f.row).filter(m => m.name === name).pop()
    if (added !== undefined) { setPending({ id: added.id, original: added.name }); setRenameText(added.name); setSelected(added.id) }
  }

  /** The intro module is created on demand under a fixed name so every card shares the convention. */
  const ensureIntro = async (then: (id: string) => void) => {
    const next = await run(async () => {
      await op((card as NonNullable<typeof card>), {
        op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version,
        command: { kind: 'add_module', name: t('editor.intro.name') },
      })
    })
    const added = next?.document.characters.find(c => c.id === targetId)?.modules.find(m => INTRO_NAMES.has(m.name))
      ?? next?.document.modules.find(m => INTRO_NAMES.has(m.name))
    if (added !== undefined) then(added.id)
  }

  const addCharacter = async () => {
    const name = `${t('editor.role.defaultName')} ${(doc?.characters.length ?? 0) + 1}`
    const next = await run(async () => {
      await op((card as NonNullable<typeof card>), {
        op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, version,
        command: { kind: 'add_character', name },
      })
    })
    const added = next?.document.characters.find(c => c.name === name)
    if (added !== undefined) setTargetId(added.id)
  }

  const renameModule = (module: CardModuleDoc) => {
    setPending({ id: module.id, original: module.name })
    setRenameText(module.name)
  }

  const commitRename = () => {
    if (pending === null) return
    const name = renameText.trim()
    if (name.length > 0 && name !== pending.original) {
      void apply({ kind: 'rename_module', moduleId: pending.id, name })
    }
    setPending(null)
  }

  const commitCardRename = () => {
    if (cardRename === null || target === undefined) return
    const name = cardRename.trim()
    if (name.length > 0 && name !== target.name) {
      void apply({ kind: 'rename_card', name })
    }
    setCardRename(null)
  }

  const removeModule = (module: CardModuleDoc) => {
    if (!window.confirm(t('editor.module.removeConfirm').replace('{name}', module.name))) return
    void apply({ kind: 'remove_module', moduleId: module.id })
    if (selected === module.id) setSelected(undefined)
    if (editing?.moduleId === module.id) setEditing(null)
  }

  const removeCharacter = (c: Omit<CardDocView, 'characters'>) => {
    if (!window.confirm(t('editor.role.removeConfirm').replace('{name}', c.name))) return
    void apply({ kind: 'remove_character', characterId: c.id })
  }

  /** Move one module up/down within its own sibling list via move_module. */
  const moveModule = (module: CardModuleDoc, dir: -1 | 1) => {
    if (target === undefined) return
    const sibs = siblingsOf(target.modules, module.id)
    if (sibs === undefined) return
    const i = sibs.findIndex(s => s.id === module.id)
    const beforeId = dir === -1
      ? (i > 0 ? sibs[i - 1].id : undefined)
      : (i + 2 < sibs.length ? sibs[i + 2].id : null)
    if (beforeId === undefined) return
    void apply({ kind: 'move_module', moduleId: module.id, beforeId })
  }

  const setFace = (resourceId: string | null) => {
    void apply({ kind: 'appearance', resourceId, cover: !isChar })
  }

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const drill = (id: string | undefined) => {
    commitEditing()
    setTargetId(id); setSelected(undefined); setEditing(null); setPending(null); setCardRename(null); setTabId(undefined)
  }

  /** PAGED split shows only the selected root tab's subtree; CONTINUOUS shows the whole tree. */
  const visibleRows = useMemo(() => {
    if (!paged || target === undefined) return rows
    const root = sections.find(m => m.id === activeTab)
    return root === undefined ? [] : flatten(root.children, collapsed, 0, root.id)
  }, [paged, rows, target, activeTab, sections, collapsed])

  /** Drop resolution needs the full tree regardless of view: hidden rows can't be hit by the pointer anyway, and doc-mode sections are drop targets too. */
  const dropRows = useMemo(() => {
    const m = new Map((target === undefined ? [] : flatten(target.modules, new Set())).map(f => [f.row.id, f]))
    for (const s of sections) if (!m.has(s.id)) m.set(s.id, { row: s, depth: 0, parentId: null })
    return m
  }, [target, sections])

  /** PAGED tab click: switch page and select its first openable module so the right pane follows. */
  const pickTab = (m: CardModuleDoc) => {
    setTabId(m.id)
    const first = flatten([m], new Set()).map(f => f.row).find(r => !isFolder(r))
    if (first !== undefined) setSelected(first.id)
  }

  /** Nested HORIZONTAL containers: which child page is open in flip mode. */
  const secChild = (m: CardModuleDoc) => m.children.find(c => c.id === secTab[m.id]) ?? m.children[0]

  /** Desktop-only view preference: a horizontal container may fan its pages out side by side. */
  const toggleSpread = (id: string) => setSpread(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    try { localStorage.setItem(SPREAD_KEY, JSON.stringify([...next])) } catch { /* private mode: preference does not persist */ }
    return next
  })

  /** The insertion slot that opens where a drop would land; it is itself a data-mid target (data-gap) so hovering it holds the current spec stable instead of oscillating. */
  const withGap = (id: string, node: ReactNode, horiz = false) => {
    const gap = dropSpec?.markerId === id
      ? (horiz
        ? <div className="nv-ed-hgap" data-mid={id} data-gap="1" style={{ width: sizeRef.current.w }} />
        : <div className="nv-ed-gap" data-mid={id} data-gap="1" style={{ height: sizeRef.current.h }} />)
      : null
    return (
      <Fragment key={id}>
        {gap !== null && dropSpec?.markerPos === 'before' && gap}
        {node}
        {gap !== null && dropSpec?.markerPos === 'after' && gap}
      </Fragment>
    )
  }

  const specKey = (s: DropSpec | null) => s === null ? '' : `${s.parentId}|${s.beforeId}|${s.insideId ?? ''}|${s.markerId ?? ''}|${s.markerPos ?? ''}`
  /** Re-render only when the resolved drop actually changes — pointermove fires far more often than drop targets do. */
  const setDrop = (spec: DropSpec | null) => {
    if (specKey(dropRef.current) === specKey(spec)) return
    dropRef.current = spec
    setDropSpec(spec)
  }

  const clearDrag = () => {
    dragRef.current = null
    dropRef.current = null
    liftRef.current?.remove()
    liftRef.current = null
    setDragId(null); setDropSpec(null)
  }

  const cancelPress = () => {
    const p = pressRef.current
    if (p !== null && p.hold !== null) window.clearTimeout(p.hold)
    pressRef.current = null
  }

  /** Mouse drags on move past a small threshold; touch holds ~380ms so list scrolling stays free. */
  const beginPress = (e: ReactPointerEvent, row: CardModuleDoc) => {
    if (e.button !== 0 || busy) return
    const host = (e.target as HTMLElement).closest('button,input,textarea,a')
    if (host !== null && !(host instanceof HTMLElement && host.classList.contains('nv-ed-tab'))) return
    const p = { id: row.id, x: e.clientX, y: e.clientY, hold: null as number | null }
    pressRef.current = p
    if (e.pointerType !== 'mouse') {
      p.hold = window.setTimeout(() => { if (pressRef.current === p) startDrag(row.id, p.x, p.y) }, 380)
    }
  }

  const startDrag = (id: string, x: number, y: number) => {
    cancelPress()
    dragRef.current = id
    const el = document.querySelector(`[data-mid="${CSS.escape(id)}"]`)
    if (el instanceof HTMLElement) {
      const r = el.getBoundingClientRect()
      grabRef.current = { dx: Math.min(Math.max(x - r.left, 0), r.width), dy: Math.min(Math.max(y - r.top, 0), r.height) }
      sizeRef.current = { w: r.width, h: r.height }
      const lift = document.createElement('div')
      lift.className = 'nv-ed-lift'
      lift.style.width = `${r.width}px`
      lift.appendChild(el.cloneNode(true))
      document.body.appendChild(lift)
      lift.style.transform = `translate(${x - grabRef.current.dx}px, ${y - grabRef.current.dy}px)`
      liftRef.current = lift
    }
    setDragId(id)
    setDrop(null)
  }

  /** Resolve the pointer position to a legal drop for the dragged module.
   *  Leaf modules go anywhere; folders reorder within their own level and may
   *  additionally land inside a horizontal context — the root list (null) or a
   *  module whose children render horizontally. Self/descendants never qualify. */
  const computeDrop = (x: number, y: number): DropSpec | null => {
    const id = dragRef.current
    if (id === null || target === undefined) return null
    const moving = findModule(target.modules, id)
    if (moving === undefined) return null
    const movingFolder = moving.children.length > 0
    const forbidden = new Set(flatten([moving], new Set()).map(f => f.row.id))
    const el0 = document.elementFromPoint(x, y)?.closest('[data-mid]')
    if (!(el0 instanceof HTMLElement) || el0.dataset.mid === undefined) {
      const list = listRef.current
      if (list === null) return null
      const r = list.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null
      return { parentId: null, beforeId: null, markerId: END_MARK, markerPos: 'after' }
    }
    if (el0.dataset.gap !== undefined) return dropRef.current
    // A card in a horizontal shelf is one target: hits on its inner section resolve to the card itself.
    let el = el0
    if (!el.classList.contains('nv-ed-tab')) {
      const hcol = el.closest('.nv-ed-hcol')
      if (hcol instanceof HTMLElement) el = hcol
    }
    const hitId = el.dataset.mid ?? ''
    if (forbidden.has(hitId)) return null
    const hit = dropRows.get(hitId)
    if (hit === undefined) return null
    const rect = el.getBoundingClientRect()
    const frac = el.classList.contains('nv-ed-tab') || el.classList.contains('nv-ed-hcol')
      ? (x - rect.left) / rect.width
      : (y - rect.top) / rect.height
    if (frac > 0.32 && frac < 0.68) {
      if (movingFolder && hit.row.layout !== 'HORIZONTAL') return null
      return { parentId: hitId, beforeId: null, insideId: hitId }
    }
    if (movingFolder) {
      const destParent = hit.parentId === null ? undefined : findModule(target.modules, hit.parentId)
      const destOk = hit.parentId === (dropRows.get(id)?.parentId ?? null) || hit.parentId === null || destParent?.layout === 'HORIZONTAL'
      if (!destOk) return null
    }
    if (frac <= 0.32) return { parentId: hit.parentId, beforeId: hitId, markerId: hitId, markerPos: 'before' }
    const sibs = hit.parentId === null ? target.modules : (findModule(target.modules, hit.parentId)?.children ?? [])
    const beforeId = sibs.slice(sibs.findIndex(s => s.id === hitId) + 1).find(s => s.id !== id)?.id ?? null
    return { parentId: hit.parentId, beforeId, markerId: hitId, markerPos: 'after' }
  }

  const dragMove = (e: PointerEvent) => {
    const p = pressRef.current
    if (p !== null) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (dist > (e.pointerType === 'mouse' ? 6 : 14)) {
        if (e.pointerType === 'mouse') startDrag(p.id, e.clientX, e.clientY)
        else cancelPress()
      }
      return
    }
    if (dragRef.current === null) return
    const lift = liftRef.current
    if (lift !== null) lift.style.transform = `translate(${e.clientX - grabRef.current.dx}px, ${e.clientY - grabRef.current.dy}px)`
    setDrop(computeDrop(e.clientX, e.clientY))
    const list = listRef.current
    if (list !== null) {
      const r = list.getBoundingClientRect()
      if (e.clientY < r.top + 44) list.scrollTop -= 9
      else if (e.clientY > r.bottom - 44) list.scrollTop += 9
    }
  }

  const dragUp = () => {
    if (pressRef.current !== null) { cancelPress(); return }
    const id = dragRef.current
    if (id === null) return
    suppressClickRef.current = true
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
    const spec = dropRef.current
    clearDrag()
    if (spec !== null) {
      if (spec.parentId !== null && collapsed.has(spec.parentId)) toggleCollapse(spec.parentId)
      void apply({ kind: 'place_module', moduleId: id, parentId: spec.parentId, beforeId: spec.beforeId })
    }
  }

  useEffect(() => { ctlRef.current = { move: dragMove, up: dragUp, undo: () => { void undoEdit() }, redo: () => { void redoEdit() }, copy: copyCurrent, paste: pasteAfterCurrent } })
  useEffect(() => {
    const move = (e: PointerEvent) => ctlRef.current.move(e)
    const up = () => ctlRef.current.up()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  // Structural shortcuts stay out of text fields so native editing keys keep working.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,[contenteditable="true"]') !== null) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); ctlRef.current.undo() }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); ctlRef.current.redo() }
      else if (key === 'c') {
        if ((window.getSelection()?.toString().length ?? 0) > 0) return
        e.preventDefault(); ctlRef.current.copy()
      } else if (key === 'v') { e.preventDefault(); ctlRef.current.paste() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Widget modules carry their renderer source (HTML) as text blocks, verbatim. */
  const widgetSource = (m: CardModuleDoc) => m.blocks.filter(b => b.kind === 'text').map(b => b.text ?? '').join('\n')

  const widgetBody = (m: CardModuleDoc) => {
    if (m.widget === undefined) return null
    const src = widgetSource(m)
    if (m.widget.type === 'html') {
      if (src.trim() === '') return <p className="nv-ed-emptyph">{t('editor.widget.empty')}</p>
      return <iframe className="nv-ed-iframe" title={m.name} sandbox="allow-scripts" srcDoc={src} style={{ height: m.widget.height ?? 320 }} />
    }
    const body = widgetDoc(m.widget.type, src)
    const figures = m.blocks.filter(b => b.kind === 'image').map(b => (
      <figure key={b.id} className="nv-ed-fig">
        <img src={media(b.resourceId)} alt={b.caption ?? ''} />
        {b.caption !== undefined && b.caption.length > 0 && <figcaption>{b.caption}</figcaption>}
      </figure>
    ))
    switch (body.kind) {
      case 'timeline': return <>{figures}{timelineBody(body.nodes)}</>
      case 'collection': return <>{figures}{collectionBody(body.items)}</>
      case 'single_image': return singleImageBody(m, body.description)
      case 'article':
        return body.text.trim() === ''
          ? <p className="nv-ed-emptyph">{t('editor.modEmpty')}</p>
          : <>{figures}<MarkdownText text={body.text} labels={mdLabels} /></>
      default: return <div className="nv-ed-wph">{t('editor.widget.unsupported').replace('{type}', body.originalType)}</div>
    }
  }

  /** Timeline widget: an Android-style node strip on top, detail cards below — the strip is a glance, the cards carry the prose. */
  const timelineBody = (nodes: readonly TimelineNode[]) => {
    if (nodes.length === 0) return <p className="nv-ed-emptyph">{t('editor.widget.tlEmpty')}</p>
    return (
      <div className="nv-ed-tline">
        <div className="nv-ed-tstrip">
          {nodes.map((n, i) => (
            <div key={i} className="nv-ed-tnode">
              <div className="nv-ed-trail">
                <span className="nv-ed-tseg" data-x={i === 0 || undefined} />
                <span className="nv-ed-tdot" />
                <span className="nv-ed-tseg" data-x={i === nodes.length - 1 || undefined} />
              </div>
              {n.time !== '' && <div className="nv-ed-ttime">{n.time}</div>}
              <div className="nv-ed-ttitle">{n.title || n.description || t('editor.widget.tlNode')}</div>
            </div>
          ))}
        </div>
        <div className="nv-ed-tcards">
          {nodes.filter(n => n.title !== '' || n.description !== '').map((n, i) => (
            <div key={i} className="nv-ed-tcard">
              {(n.time !== '' || n.title !== '') && <div className="nv-ed-tcardhead">{[n.time, n.title].filter(s => s !== '').join(' · ')}</div>}
              {n.description !== '' && <MarkdownText text={n.description} labels={mdLabels} />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  /** Collection widget: named entries (region/faction/race/quote…) as a stacked list. */
  const collectionBody = (items: readonly CollectionItem[]) => {
    if (items.length === 0) return <p className="nv-ed-emptyph">{t('editor.widget.collEmpty')}</p>
    return (
      <div className="nv-ed-coll">
        {items.map((it, i) => (
          <div key={it.id !== '' ? it.id : i} className="nv-ed-citem">
            {(it.name !== '' || it.summary !== '') && <div className="nv-ed-chead">{it.name}{it.name !== '' && it.summary !== '' ? '：' : ''}{it.summary}</div>}
            {it.description !== '' && <MarkdownText text={it.description} labels={mdLabels} />}
          </div>
        ))}
      </div>
    )
  }

  /** Map widget: the module's first image block is the map itself; description sits underneath. */
  const singleImageBody = (m: CardModuleDoc, description: string) => {
    const img = m.blocks.find(b => b.kind === 'image')
    return (
      <div className="nv-ed-map">
        {img !== undefined && img.kind === 'image'
          ? <img className="nv-ed-mapimg" src={media(img.resourceId)} alt={img.caption ?? m.name} />
          : <div className="nv-ed-mapph">{t('editor.widget.mapEmpty')}</div>}
        {img?.kind === 'image' && img.caption !== undefined && img.caption.length > 0 && <div className="nv-ed-mapcap">{img.caption}</div>}
        {description !== '' && <MarkdownText text={description} labels={mdLabels} />}
      </div>
    )
  }

  const grow = (el: HTMLTextAreaElement) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }

  if (card === null || state === undefined) {
    return (
      <div className="nv-editor" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div className="nv-card" style={{ padding: '32px 36px', color: 'var(--nv-secondary-text)', fontSize: 13 }}>{t('editor.empty')}</div>
      </div>
    )
  }
  if (state === 'loading' || doc === undefined || target === undefined) {
    return (
      <div className="nv-editor" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div style={{ color: 'var(--nv-secondary-text)', fontSize: 13 }}>…</div>
      </div>
    )
  }

  const charById = new Map(doc.characters.map(c => [c.id, c]))
  const introText = introMod === undefined ? ''
    : introMod.blocks.filter(b => b.kind === 'text').map(b => b.text ?? '').join('\n\n').trim()

  /** One editing unit — a paragraph-sized autosized textarea that commits on blur; Esc cancels, ⌘/Ctrl+Enter commits. */
  const paraEditor = (m: CardModuleDoc) => (
    <textarea
      ref={el => { areaRef.current = el }}
      className={`nv-ed-paraedit${m.widget !== undefined ? ' nv-ed-code' : ''}`}
      value={editing?.text ?? ''}
      placeholder={m.widget !== undefined ? t('editor.widget.ph') : t('editor.modEmpty')}
      autoFocus
      onFocus={e => grow(e.currentTarget)}
      onInput={e => grow(e.currentTarget)}
      onChange={e => setEditing(prev => prev === null ? prev : { ...prev, text: e.target.value })}
      onBlur={commitEditing}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur() }
      }}
    />
  )

  /** Module body as fine-grained editable units: paragraphs and figures render normally, clicking a paragraph edits just that slice. */
  const moduleBody = (m: CardModuleDoc) => {
    if (m.widget !== undefined) {
      return editing?.moduleId === m.id ? paraEditor(m) : (
        <div className="nv-ed-secbody nv-ed-widget">
          {widgetBody(m)}
          <button className="nv-ed-wedit" title={t('editor.widget.edit')}
            onClick={e => { e.stopPropagation(); openSource(m) }}>✎</button>
        </div>
      )
    }
    return (
      <div className="nv-ed-secbody">
        {m.blocks.map(b => b.kind === 'image' ? (
          <figure key={b.id} className="nv-ed-fig">
            <img src={media(b.resourceId)} alt={b.caption ?? ''} />
            {b.caption !== undefined && b.caption.length > 0 && <figcaption>{b.caption}</figcaption>}
          </figure>
        ) : splitParagraphs(b.text ?? '').map(p => (
          editing?.moduleId === m.id && editing.blockId === b.id && editing.from === p.from
            ? <Fragment key={`${b.id}:${String(p.from)}`}>{paraEditor(m)}</Fragment>
            : (
              <div key={`${b.id}:${String(p.from)}`} className="nv-ed-para" data-editable
                onClick={() => openPara(m, b, p)}>
                <MarkdownText text={p.text} labels={mdLabels} />
              </div>
            )
        )))}
        {editing?.moduleId === m.id && editing.blockId === null
          ? paraEditor(m)
          : (m.blocks.length > 0
            ? <button className="nv-ed-addpara" title={t('editor.module.addPara')} onClick={() => openNewPara(m)}>＋</button>
            : <p className="nv-ed-emptyph" data-editable onClick={() => openNewPara(m)}>{t('editor.modEmpty')}</p>)}
      </div>
    )
  }

  const renameInput = () => (
    <input className="nv-ed-rename" value={renameText} autoFocus
      onFocus={e => e.currentTarget.select()}
      onChange={e => setRenameText(e.target.value)}
      onBlur={commitRename}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename() }
        if (e.key === 'Escape') { e.preventDefault(); setPending(null) }
      }} />
  )

  const nameField = (className: string) => cardRename !== null ? (
    <input className={`nv-ed-rename ${className}`} value={cardRename} autoFocus
      onFocus={e => e.currentTarget.select()}
      onChange={e => setCardRename(e.target.value)}
      onBlur={commitCardRename}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commitCardRename() }
        if (e.key === 'Escape') { e.preventDefault(); setCardRename(null) }
      }} />
  ) : (
    <button className={`nv-ed-namebtn ${className}`} title={t('editor.module.rename')}
      onClick={() => setCardRename(target.name)}>{target.name}</button>
  )

  /** Fixed-position anchor for the cover picker, flipping above when the grid would overflow the viewport bottom (~300px worst case). */
  const faceAnchor = (el: HTMLElement): Anchor => {
    const r = el.getBoundingClientRect()
    const up = r.bottom + 6 + 300 > window.innerHeight - 8
    return { key: 'face', x: r.right, y: up ? r.top - 6 : r.bottom + 6, up }
  }

  /** The ⋯ button that opens a popover; the menu itself renders fixed at the anchor below the root. Menus always open downward — near the viewport bottom they scroll internally rather than flipping. */
  const menuFor = (key: string) => (
    <button className="nv-ed-dots" aria-label={t('editor.cardmenu')} data-open={openMenu?.key === key || undefined}
      onClick={e => {
        e.stopPropagation()
        if (openMenu?.key === key) { setOpenMenu(null); return }
        const rect = e.currentTarget.getBoundingClientRect()
        setOpenMenu({ key, x: rect.right, y: rect.bottom + 6 })
      }}>⋯</button>
  )

  const openMenuItems = (key: string): readonly { readonly label: string; readonly danger?: boolean; readonly keep?: boolean; readonly run: () => void }[] => {
    if (key === 'card') {
      return [
        { label: t('editor.module.rename'), run: () => setCardRename(target.name) },
        { label: target.readingLayout === 'PAGED' ? t('editor.reading.continuous') : t('editor.reading.paged'),
          run: () => { void apply({ kind: 'set_reading_layout', layout: target.readingLayout === 'PAGED' ? 'CONTINUOUS' : 'PAGED' }) } },
        ...(hasDraft ? [{ label: t('editor.discard'), danger: true, run: () => { void run(async () => { await op(card, { op: 'discard', cardId: card.cardId }) }) } }] : []),
      ]
    }
    if (key.startsWith('c:')) {
      const c = doc.characters.find(x => x.id === key.slice(2))
      if (c === undefined) return []
      return [
        { label: t('editor.role.open'), run: () => drill(c.id) },
        { label: t('editor.role.remove'), danger: true, run: () => removeCharacter(c) },
      ]
    }
    if (key.startsWith('w:')) {
      const parentId = key.slice(2) === 'root' ? null : key.slice(2)
      const parentKey = parentId === null ? 'card' : `m:${parentId}`
      return [
        { label: `← ${t('editor.back')}`, keep: true, run: () => setOpenMenu(prev => prev === null ? prev : { ...prev, key: parentKey }) },
        { label: widgetLabel('timeline'), run: () => { void addWidget(parentId, 'timeline') } },
        { label: widgetLabel('map'), run: () => { void addWidget(parentId, 'map') } },
        { label: widgetLabel('collection'), run: () => { void addWidget(parentId, 'collection') } },
        { label: widgetLabel('html'), run: () => { void addWidget(parentId, 'html') } },
      ]
    }
    const m = findModule(target.modules, key.slice(2))
    if (m === undefined) return []
    const sibs = siblingsOf(target.modules, m.id) ?? []
    const i = sibs.findIndex(s => s.id === m.id)
    const hasParent = (flatten(target.modules, new Set()).find(f => f.row.id === m.id)?.parentId ?? null) !== null
    return [
      { label: t('editor.module.rename'), run: () => renameModule(m) },
      { label: t('editor.module.addChild'), run: () => { void addModule(m.id) } },
      { label: t('editor.module.newWidget'), keep: true, run: () => setOpenMenu(prev => prev === null ? prev : { ...prev, key: `w:${m.id}` }) },
      ...(m.children.length > 0 ? [{
        label: m.layout === 'HORIZONTAL' ? t('editor.layout.vertical') : t('editor.layout.horizontal'),
        run: () => { void apply({ kind: 'set_module_layout', moduleId: m.id, layout: m.layout === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL' }) },
      }] : []),
      { label: t('editor.module.copy'), run: () => copyModule(m) },
      ...(clip !== null ? [{ label: t('editor.module.pasteInto'), run: () => pasteClip(m.id) }] : []),
      ...(hasParent === true ? [{ label: t('editor.module.promote'), run: () => promoteModule(m) }] : []),
      ...(m.children.length === 1 && m.children[0].children.length === 0 ? [{ label: t('editor.module.mergeBack'), run: () => { void apply({ kind: 'merge_child', moduleId: m.id }) } }] : []),
      ...(i > 0 ? [{ label: t('editor.module.up'), run: () => moveModule(m, -1) }] : []),
      ...(i < sibs.length - 1 ? [{ label: t('editor.module.down'), run: () => moveModule(m, 1) }] : []),
      { label: t('editor.module.remove'), danger: true, run: () => removeModule(m) },
    ]
  }

  const charChip = (c: Omit<CardDocView, 'characters'>) => (
    <button key={c.id} className="nv-ed-chipchar" onClick={() => drill(c.id)}>
      {c.avatarResourceId !== null
        ? <img src={media(c.avatarResourceId)} alt="" />
        : <span className="nv-ed-chipinit">{c.name.slice(0, 1)}</span>}
      {c.name}
    </button>
  )

  /** One module as a document section, recursively rendering nested children as indented subsections. */
  const section = (m: CardModuleDoc, depth: number) => {
    const chars = m.characterIds.map(id => charById.get(id)).filter((c): c is Omit<CardDocView, 'characters'> => c !== undefined)
    return (
      <section key={m.id} id={`nv-ed-sec-${m.id}`} className="nv-ed-sec" data-depth={depth}
        data-mid={m.id}
        data-dragging={dragId === m.id || undefined}
        data-inside={dropSpec?.insideId === m.id || undefined}>
        <header className="nv-ed-sechead">
          <span className="nv-ed-grip" title={t('editor.module.drag')}
            onPointerDown={e => { e.stopPropagation(); beginPress(e, m) }}>⠿</span>
          {pending?.id === m.id ? renameInput()
            : <h2 className="nv-ed-secname" data-sub={depth > 0 || undefined}>{m.name}</h2>}
          {m.layout === 'HORIZONTAL' && m.children.length > 0 && <span className="nv-ed-htag">{t('editor.layout.tag')}</span>}
          {m.widget !== undefined && <span className="nv-ed-htag nv-ed-wtag">{widgetLabel(m.widget.type)}</span>}
          {menuFor(`m:${m.id}`)}
        </header>
        {isFolder(m) ? null : moduleBody(m)}
        {chars.length > 0 && <div className="nv-ed-chips">{chars.map(charChip)}</div>}
        {m.children.length > 0 && (m.layout !== 'HORIZONTAL'
          ? m.children.map(c => withGap(c.id, section(c, depth + 1)))
          : spread.has(m.id)
            ? (
              <div className="nv-ed-shelf">
                <button className="nv-ed-fan nv-ed-fanback" title={t('editor.fan.in')} onClick={() => toggleSpread(m.id)}>
                  <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><rect x="0.75" y="0.75" width="10.5" height="8.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" /><line x1="3.5" y1="7.6" x2="8.5" y2="7.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
                  {t('editor.fan.in')}
                </button>
                <div className="nv-ed-hrow">
                  {m.children.map(c => withGap(c.id, (
                    <div className="nv-ed-hcol" data-mid={c.id}
                      data-dragging={dragId === c.id || undefined}
                      data-inside={dropSpec?.insideId === c.id || undefined}
                      data-drop={dropSpec?.markerId === c.id ? dropSpec.markerPos : undefined}>
                      {section(c, depth + 1)}
                    </div>
                  ), true))}
                </div>
              </div>
            )
            : (
              <>
                <div className="nv-ed-sectabs">
                  {m.children.map(c => withGap(c.id, (
                    <button role="tab" data-mid={c.id} className="nv-ed-tab"
                      aria-selected={secChild(m).id === c.id}
                      data-active={secChild(m).id === c.id || undefined}
                      data-dragging={dragId === c.id || undefined}
                      data-inside={dropSpec?.insideId === c.id || undefined}
                      data-drop={dropSpec?.markerId === c.id ? dropSpec.markerPos : undefined}
                      onPointerDown={e => beginPress(e, c)}
                      onClick={() => { if (suppressClickRef.current) return; setSecTab(s => ({ ...s, [m.id]: c.id })) }}>{c.name}</button>
                  ), true))}
                  <button className="nv-ed-fan" title={t('editor.fan.out')} onClick={() => toggleSpread(m.id)}>
                    <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><rect x="0.75" y="0.75" width="4.5" height="8.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" /><rect x="6.75" y="0.75" width="4.5" height="8.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
                    {t('editor.fan.out')}
                  </button>
                </div>
                {section(secChild(m), depth + 1)}
              </>
            ))}
      </section>
    )
  }

  return (
    <div className="nv-page nv-editor">
      <div className="nv-editor-top">
        <button className="nv-back" aria-label={t('editor.back')} title={t('editor.back')}
          onClick={() => back(doc.kind === 'CHARACTER' ? 'characters' : 'worlds')}>‹</button>
        {face !== '' && <img className="nv-ed-topface" src={face} alt="" />}
        <span className="crumb"><b>{doc.name}</b>
          {target.id !== doc.id && <> › <b>{target.name}</b></>}
        </span>
        <span className="nv-ed-chip">{t(isChar ? 'card.kind.character' : 'card.kind.world')}</span>
        {hasDraft && <span className="nv-tag">{t('me.draft')}</span>}
        <div className="right">
          {hasDraft && <span className="nv-dirty">{t('editor.dirty')}</span>}
          {notice !== undefined && <span className="nv-tag" data-kind="warn">{notice}</span>}
          <button className="nv-ed-tbtn" title={`${t('editor.undo')} ⌃Z`} disabled={busy || state.canUndo !== true}
            onClick={() => { void undoEdit() }}>{t('editor.undo')}</button>
          <button className="nv-ed-tbtn" title={`${t('editor.redo')} ⌃Y`} disabled={busy || state.canRedo !== true}
            onClick={() => { void redoEdit() }}>{t('editor.redo')}</button>
          <button className="nv-ed-tbtn" title={`${t('editor.copy')} ⌃C`} disabled={busy || current === undefined}
            onClick={copyCurrent}>{t('editor.copy')}</button>
          <button className="nv-ed-tbtn" title={`${t('editor.paste')} ⌃V`} disabled={busy || clip === null}
            onClick={pasteAfterCurrent}>{t('editor.paste')}</button>
          <button className="nv-ed-viewbtn" title={t(view === 'doc' ? 'editor.view.split' : 'editor.view.doc')}
            aria-label={t('editor.view.switch')} onClick={() => switchView(view === 'doc' ? 'split' : 'doc')}>
            <svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true">
              <rect x="0.85" y="0.85" width="13.3" height="10.3" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
              {view === 'doc' && <line x1="6.2" y1="0.85" x2="6.2" y2="11.15" stroke="currentColor" strokeWidth="1.3" />}
            </svg>
          </button>
          <button className="nv-pill" data-active={sideOpen} onClick={() => setSideOpen(v => !v)}>{t('editor.sidechat.title')}</button>
          {menuFor('card')}
          <button className="nv-btn-primary nv-save" disabled={busy || !hasDraft} onClick={() => { void save() }}>{t('editor.save')}</button>
          <span className="nv-tag">{`r${state.revision}`}</span>
        </div>
      </div>

      <div className="nv-ed-bodywrap">
        {view === 'doc' ? (
          <div className="nv-ed-docwrap">
            <div className="nv-ed-doc">
              <div className="nv-ed-page">
                {target.id !== doc.id && (
                  <button className="nv-ed-up" onClick={() => drill(undefined)}>‹ {doc.name}</button>
                )}
                {face !== '' ? (
                  isChar ? (
                    <div className="nv-ed-portrait">
                      <img src={face} alt={target.name} />
                      <button className="nv-ed-facebtn" title={t('editor.cover.pick')}
                        onClick={e => setFaceAt(faceAnchor(e.currentTarget))}>✎</button>
                    </div>
                  ) : (
                    <div className="nv-ed-hero">
                      <img src={face} alt={target.name} />
                      <button className="nv-ed-facebtn" title={t('editor.cover.pick')}
                        onClick={e => setFaceAt(faceAnchor(e.currentTarget))}>✎</button>
                    </div>
                  )
                ) : isChar && (
                  <div className="nv-ed-portrait">
                    <button className="nv-ed-portraitph" title={t('editor.cover.pick')}
                      onClick={e => setFaceAt(faceAnchor(e.currentTarget))}>
                      {target.name.slice(0, 1)}
                    </button>
                  </div>
                )}
                <div className="nv-ed-head">
                  <span className="nv-ed-chip">{t(isChar ? 'card.kind.character' : 'card.kind.world')}</span>
                  {nameField('nv-ed-name')}
                  <div className="nv-ed-mint" />
                  {introMod !== undefined ? (
                    <div className="nv-ed-intro">
                      {introText.length === 0 && editing?.moduleId !== introMod.id
                        ? <p className="nv-ed-emptyph" data-editable onClick={() => openNewPara(introMod)}>{t('editor.intro.ph')}</p>
                        : moduleBody(introMod)}
                    </div>
                  ) : (
                    <button className="nv-ed-introadd" onClick={() => { void ensureIntro(id => setEditing({ moduleId: id, blockId: null, from: 0, to: 0, base: '', text: '' })) }}>
                      ＋ {t('editor.intro.add')}
                    </button>
                  )}
                </div>
                {paged && (
                  <nav className="nv-ed-tabs" role="tablist">
                    {sections.map(m => withGap(m.id, (
                      <button role="tab" data-mid={m.id}
                        aria-selected={activeTab === m.id}
                        data-active={activeTab === m.id || undefined}
                        data-dragging={dragId === m.id || undefined}
                        data-inside={dropSpec?.insideId === m.id || undefined}
                        data-drop={dropSpec?.markerId === m.id ? dropSpec.markerPos : undefined}
                        className="nv-ed-tab"
                        onPointerDown={e => beginPress(e, m)}
                        onClick={() => { if (suppressClickRef.current) return; setTabId(m.id) }}>{m.name}</button>
                    ), true))}
                  </nav>
                )}
                {paged
                  ? section(sections.find(m => m.id === activeTab) ?? sections[0], 0)
                  : sections.map(m => withGap(m.id, section(m, 0)))}
                {sections.length === 0 && introMod === undefined && (
                  <p className="nv-ed-emptyph" style={{ padding: '0 44px' }}>{t('editor.modulesEmpty')}</p>
                )}
                <button className="nv-ed-add" onClick={() => { void addModule(null) }}>＋ {t('editor.module.new')}</button>
                {!isChar && target.id === doc.id && (
                  <section className="nv-ed-sec">
                    <header className="nv-ed-sechead"><h2 className="nv-ed-secname">{t('editor.roles')}</h2></header>
                    <div className="nv-ed-chips">
                      {doc.characters.map(charChip)}
                      <button className="nv-ed-chipchar nv-ed-chipadd" onClick={() => { void addCharacter() }}>＋ {t('editor.role.new')}</button>
                    </div>
                  </section>
                )}
              </div>
            </div>
            {sections.length > 1 && (
              <nav className="nv-ed-rail" aria-label={t('editor.outline')}>
                {sections.map(m => (
                  <button key={m.id} data-active={activeTab === m.id || undefined}
                    onClick={() => { if (paged) setTabId(m.id); else document.getElementById(`nv-ed-sec-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{m.name}</button>
                ))}
              </nav>
            )}
          </div>
        ) : (
          <div className="nv-ed-split">
            <div className="nv-ed-left" ref={listRef}>
              {target.id !== doc.id && (
                <button className="nv-ed-up" onClick={() => drill(undefined)}>‹ {doc.name}</button>
              )}
              <div className="nv-ed-card">
                {face !== ''
                  ? <img className="nv-ed-cardimg" src={face} alt={target.name} />
                  : <div className="nv-ed-cardph">{target.name.slice(0, 1)}</div>}
                <button className="nv-ed-facebtn" title={t('editor.cover.pick')}
                  onClick={e => setFaceAt(faceAnchor(e.currentTarget))}>✎</button>
                <div className="nv-ed-cardmeta">
                  <span className="nv-ed-chip">{t(isChar ? 'card.kind.character' : 'card.kind.world')}</span>
                  {nameField('nv-ed-cardname')}
                </div>
              </div>
              <div className="nv-ed-info">
                <div className="nv-ed-inforow">
                  <span className="nv-ed-infolab">{t('editor.field.name')}</span>
                  <span className="nv-ed-infoval">{target.name}</span>
                </div>
                <div className="nv-ed-inforow">
                  <span className="nv-ed-infolab">{t('editor.field.intro')}</span>
                  <button className="nv-ed-infoval nv-ed-infobtn"
                    onClick={() => { introMod !== undefined ? setSelected(introMod.id) : void ensureIntro(id => setSelected(id)) }}>
                    {introText.length > 0 ? introText : t('editor.intro.add')}
                  </button>
                </div>
              </div>
              <div className="nv-ed-lhead">
                {t('editor.modules')}
                <button className="nv-tree-add" title={t('editor.module.newTop')} onClick={() => { void addModule(null) }}>+</button>
              </div>
              {paged && (
                <nav className="nv-ed-tabs nv-ed-ltabs" role="tablist">
                  {sections.map(m => withGap(m.id, (
                    <button role="tab" data-mid={m.id}
                      aria-selected={activeTab === m.id}
                      data-active={activeTab === m.id || undefined}
                      data-dragging={dragId === m.id || undefined}
                      data-inside={dropSpec?.insideId === m.id || undefined}
                      data-drop={dropSpec?.markerId === m.id ? dropSpec.markerPos : undefined}
                      className="nv-ed-tab"
                      onPointerDown={e => beginPress(e, m)}
                      onClick={() => { if (suppressClickRef.current) return; pickTab(m) }}>
                      {m.name}
                      {m.layout === 'HORIZONTAL' && m.children.length > 0 && <span className="nv-ed-htag">{t('editor.layout.tag')}</span>}
                    </button>
                  ), true))}
                </nav>
              )}
              {visibleRows.map(({ row, depth }) => {
                const folder = isFolder(row)
                return withGap(row.id, (
                  <div className={`nv-ed-mrow${folder ? ' nv-ed-mfold' : ''}`}
                    data-mid={row.id}
                    data-active={!folder && current?.id === row.id || undefined}
                    data-dragging={dragId === row.id || undefined}
                    data-inside={dropSpec?.insideId === row.id || undefined}
                    data-drop={dropSpec?.markerId === row.id ? dropSpec.markerPos : undefined}
                    style={{ marginLeft: depth * 14 }}
                    onPointerDown={e => beginPress(e, row)}
                    onClick={() => {
                      if (suppressClickRef.current) return
                      if (folder) toggleCollapse(row.id); else setSelected(row.id)
                    }}>
                    <button className="nv-tree-chev" disabled={row.children.length === 0}
                      onClick={e => { e.stopPropagation(); toggleCollapse(row.id) }}>
                      {row.children.length > 0 ? (collapsed.has(row.id) ? '▸' : '▾') : ''}
                    </button>
                    <span className="nv-ed-mmain">
                      {pending?.id === row.id ? renameInput() : (
                        <span className="nv-ed-mname">{row.name}
                          {row.layout === 'HORIZONTAL' && row.children.length > 0 && <span className="nv-ed-htag">{t('editor.layout.tag')}</span>}
                          {row.widget !== undefined && <span className="nv-ed-htag nv-ed-wtag">{widgetLabel(row.widget.type)}</span>}
                        </span>
                      )}
                      {!folder && excerptOf(row) !== '' && <span className="nv-ed-mx">{excerptOf(row)}</span>}
                    </span>
                    {menuFor(`m:${row.id}`)}
                  </div>
                ))
              })}
              {dropSpec?.markerId === END_MARK && <div className="nv-ed-gap" data-mid={END_MARK} data-gap="1" style={{ height: sizeRef.current.h }} />}
              {visibleRows.length === 0 && <div className="nv-ed-mrow" style={{ cursor: 'default', color: 'var(--nv-secondary-text)' }}>{t('editor.modulesEmpty')}</div>}
              {!isChar && target.id === doc.id && (
                <>
                  <div className="nv-ed-lhead">
                    {t('editor.roles')}
                    <button className="nv-tree-add" title={t('editor.role.new')} onClick={() => { void addCharacter() }}>+</button>
                  </div>
                  {doc.characters.map(c => (
                    <div key={c.id} className="nv-ed-mrow nv-ed-crow" onClick={() => drill(c.id)}>
                      {c.avatarResourceId !== null
                        ? <img className="nv-ed-cavatar" src={media(c.avatarResourceId)} alt="" />
                        : <span className="nv-ed-cavatar nv-ed-chipinit">{c.name.slice(0, 1)}</span>}
                      <span className="nv-ed-mmain"><span className="nv-ed-mname">{c.name}</span></span>
                      {menuFor(`c:${c.id}`)}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="nv-ed-right">
              {current !== undefined ? (
                <div key={current.id} className="nv-ed-rightbody">
                  {pending?.id === current.id ? renameInput() : (
                    <button className="nv-ed-namebtn nv-ed-doctitle" title={t('editor.module.rename')}
                      onClick={() => renameModule(current)}>{current.name}</button>
                  )}
                  <div className="nv-ed-mint" />
                  {moduleBody(current)}
                </div>
              ) : <p style={{ color: 'var(--nv-secondary-text)' }}>{t('editor.selectModule')}</p>}
            </div>
          </div>
        )}
        {sideOpen && (
          <div className="nv-ed-side">
            <div className="nv-side-head" style={{ padding: '14px 16px 0' }}>
              <strong>{t('editor.sidechat.title')}</strong>
              <span className="nv-tag">{t('editor.sidechat.scope').replace('{card}', doc.name)}</span>
            </div>
            <div style={{ color: 'var(--nv-secondary-text)', fontSize: 12.5, padding: '10px 16px' }}>{t('editor.sidechat.empty')}</div>
          </div>
        )}
      </div>


      {openMenu !== null && (
        <>
          <div className="nv-ed-scrim" onClick={() => setOpenMenu(null)} />
          <div className="nv-ed-menu" role="menu"
            style={{ left: Math.max(8, openMenu.x - 152), top: openMenu.y, maxHeight: Math.max(120, window.innerHeight - openMenu.y - 10) }}>
            {openMenuItems(openMenu.key).map(item => (
              <button key={item.label} className="nv-ed-menuitem" data-danger={item.danger === true || undefined} role="menuitem"
                onClick={() => { item.run(); if (item.keep !== true) setOpenMenu(null) }}>{item.label}</button>
            ))}
          </div>
        </>
      )}
      {faceAt !== null && (
        <>
          <div className="nv-ed-scrim" onClick={() => setFaceAt(null)} />
          <div className="nv-ed-pick" style={{ left: Math.max(8, faceAt.x - 264), top: faceAt.y, transform: faceAt.up === true ? 'translateY(-100%)' : undefined }}>
            <div className="nv-ed-pickgrid">
              {images.map(r => (
                <button key={r.id} className="nv-ed-pickitem" data-active={r.id === faceId || undefined}
                  onClick={() => { setFaceAt(null); setFace(r.id) }}>
                  <img src={media(r.id)} alt="" />
                </button>
              ))}
              {images.length === 0 && <div className="nv-ed-pickempty">{t('editor.cover.empty')}</div>}
            </div>
            {face !== '' && (
              <button className="nv-ed-pickclear" onClick={() => { setFaceAt(null); setFace(null) }}>{t('editor.cover.clear')}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
