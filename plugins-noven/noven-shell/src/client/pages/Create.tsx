/**
 * 创作 — the creation surface: a slot shelf of card-creation entries (new
 * world / new character / custom, plus the most recent unfinished draft when
 * one exists), a composer card that seeds a real session on submit, a row of
 * starter templates that create pre-named cards, and the bundled skill tools.
 * The composer carries workspace and model pickers so the session is born with
 * the choices made here; on send the page dissolves and the conversation panel
 * takes over the main seat.
 * @module noven-shell/client/pages/Create
 */
import { useRef, useState } from 'react'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import type { CardRow, CreateSend } from '../index.tsx'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ModelCatalog, ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { glyph } from '../icons.tsx'
import { cardContentUrl } from '../card-api.ts'
import { ExcerptTile } from '../cardtile.tsx'
import { asset } from '../data.ts'
import { CardPick, type CardKind } from './CardPick.tsx'
import { enterConversationScene } from '../creation-transition.ts'

interface Props {
  readonly t: ShellT
  readonly useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  readonly useSessions: SnapshotSelectorHook<SessionListState>
  /** Sends the composer: connects the chosen workspace's session, applies the model pick, uploads files, prompts, then reveals the conversation. */
  readonly onStartPrompt: (prompt: string, send: CreateSend) => Promise<boolean>
  /** Enters the blank IDE after ensuring a real session exists. */
  readonly onStartHandcraft: (workspaceId: WorkspaceId | undefined, source: HTMLElement) => Promise<boolean>
  readonly onNewCard: (kind: 'world' | 'character', name: string, workspaceId?: WorkspaceId) => void
  /** Imports a card package file into the chosen workspace, then opens it in the editor. */
  readonly onImportCard: (file: File, workspaceId?: WorkspaceId) => void
  /** Host-generation model catalog (default route + provider groups). */
  readonly loadModels: () => Promise<ModelCatalog | undefined>
  /** Host directory pick → registered Workspace; undefined when cancelled. */
  readonly pickWorkspace: () => Promise<WorkspaceId | undefined>
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  readonly onOpenCard: (row: CardRow) => void
}

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

/** Bundled skills surfaced as tool rows and composer chips — all real slash commands. */
export const TOOL_COMMANDS = {
  organize: 'card-organizer',
  study: 'noven-study',
  comic: 'noven-draw-comic',
  world: 'wenyou-maker',
  writing: 'human-writing',
} as const

/** Composer chip shortcuts for real bundled skills. */
const CHIPS: readonly { label: NovenShellLocaleKey; command: string }[] = [
  { label: 'create.tool.organize', command: TOOL_COMMANDS.organize },
  { label: 'create.tool.study', command: TOOL_COMMANDS.study },
  { label: 'create.tool.comic', command: TOOL_COMMANDS.comic },
  { label: 'create.tool.writing', command: TOOL_COMMANDS.writing },
]

/** Composer choices persist across visits — the page is a launcher, not a form to refill. */
const WS_KEY = 'noven.create.workspaceId'
const MODEL_KEY = 'noven.create.model'
const PICK_DIR = '::pick-dir'

const readModelPick = (): ModelSelection | undefined => {
  try {
    const raw = localStorage.getItem(MODEL_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as { provider?: unknown; model?: unknown; reasoningEffort?: unknown }
    return typeof parsed.provider === 'string' && typeof parsed.model === 'string'
      ? { provider: parsed.provider, model: parsed.model, ...(typeof parsed.reasoningEffort === 'string' ? { reasoningEffort: parsed.reasoningEffort } : {}) }
      : undefined
  } catch { return undefined }
}

const TEMPLATES: readonly {
  readonly name: NovenShellLocaleKey
  readonly sub: NovenShellLocaleKey
  readonly cover: string
  /** Card pairs created on click — character first so the editor lands on the world. */
  readonly creates: readonly { kind: 'world' | 'character'; name: NovenShellLocaleKey }[]
}[] = [
  { name: 'create.tpl.islands', sub: 'create.tpl.islands.sub', cover: 'tpl-islands.webp',
    creates: [{ kind: 'world', name: 'create.tpl.islands' }] },
  { name: 'create.tpl.town', sub: 'create.tpl.town.sub', cover: 'tpl-town.webp',
    creates: [{ kind: 'world', name: 'create.tpl.town' }] },
  { name: 'create.tpl.drift', sub: 'create.tpl.drift.sub', cover: 'tpl-drift.webp',
    creates: [{ kind: 'character', name: 'create.tpl.drift.character' }, { kind: 'world', name: 'create.tpl.drift' }] },
]

/** Model menu rows: provider labels, model rows, reasoning efforts as nested submenu picks. */
function modelMenuEntries(catalog: ModelCatalog | undefined, active: ModelSelection | undefined, t: ShellT): MenuEntry[] {
  if (catalog === undefined) return [{ type: 'label', id: 'loading', text: t('create.model.loading') }]
  const picked = active ?? catalog.default
  const entries: MenuEntry[] = []
  for (const group of catalog.groups) {
    entries.push({ type: 'label', id: `g:${group.id}`, text: group.name })
    for (const model of group.models) {
      const efforts = model.reasoning?.efforts ?? []
      const on = picked.provider === group.id && picked.model === model.id
      entries.push({
        id: `sel|${group.id}|${model.id}`,
        label: (
          <span className="nv-modelrow">
            <span>{model.name}</span>
            {on && <span className="nv-modelrow-on">{glyph.check(11)}</span>}
          </span>
        ),
        ...(efforts.length > 0 ? {
          submenu: [
            { id: `eff|${group.id}|${model.id}|`, label: t('create.model.autoEffort') },
            ...efforts.map(e => ({ id: `eff|${group.id}|${model.id}|${e.id}`, label: e.name })),
          ],
        } : {}),
      })
    }
  }
  for (const failure of catalog.failures) {
    entries.push({ id: `fail:${failure.id}`, label: `${failure.name} — ${failure.message}`, disabled: true })
  }
  return entries
}

export function Create({ t, useWorkspaces, useSessions, onStartPrompt, onStartHandcraft, onNewCard, onImportCard, loadModels, pickWorkspace, useCards, onOpenCard }: Props) {
  const [draft, setDraft] = useState('')
  const [pick, setPick] = useState<CardKind | null>(null)
  const [files, setFiles] = useState<readonly File[]>([])
  const [leaving, setLeaving] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const [handcraftFailed, setHandcraftFailed] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [catalog, setCatalog] = useState<ModelCatalog | undefined>()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)
  const [pickedWs, setPickedWs] = useState<WorkspaceId | undefined>(
    () => (localStorage.getItem(WS_KEY) ?? undefined) as WorkspaceId | undefined)
  const [modelSel, setModelSel] = useState<ModelSelection | undefined>(readModelPick)
  const drafts = useCards(rows => rows.filter(r => r.hasDraft))
  const worldCount = useCards(rows => rows.filter(r => r.kind === 'WORLD').length)
  const charCount = useCards(rows => rows.filter(r => r.kind === 'CHARACTER').length)
  const lastDraft = drafts[0]

  const workspaces = useWorkspaces(s => s.items)
  const wsPhase = useWorkspaces(s => s.phase)
  /** 默认 = 最近活跃会话所在的工作区（没有则清单第一项）。 */
  const recentCwd = useSessions(s => {
    let cwd: string | undefined
    let at = Number.NEGATIVE_INFINITY
    for (const id of s.ids) {
      const row = s.byId[id]
      if (row?.cwd !== undefined && row.updatedAt > at) { at = row.updatedAt; cwd = row.cwd }
    }
    return cwd
  })
  const workspace: WorkspaceView | undefined =
    workspaces.find(w => w.workspaceId === pickedWs)
    ?? workspaces.find(w => w.path === recentCwd)
    ?? workspaces[0]

  const chooseWorkspace = (id: WorkspaceId | undefined): void => {
    setPickedWs(id)
    if (id === undefined) localStorage.removeItem(WS_KEY)
    else localStorage.setItem(WS_KEY, id)
  }
  const chooseModel = (sel: ModelSelection | undefined): void => {
    setModelSel(sel)
    if (sel === undefined) localStorage.removeItem(MODEL_KEY)
    else localStorage.setItem(MODEL_KEY, JSON.stringify(sel))
  }

  const wsTitle = (w: WorkspaceView): string =>
    workspaceDisplayTitle(w.title, t('create.workspace.default'))

  const wsEntries: MenuEntry[] = [
    ...workspaces.map(w => ({ id: w.workspaceId, label: wsTitle(w), icon: glyph.folder(14) })),
    { type: 'separator', id: 'sep' },
    { id: PICK_DIR, label: t('create.workspace.pickDir'), icon: glyph.plus(14) },
  ]

  const modelLabel = (): string => {
    if (modelSel === undefined) return t('create.model.auto')
    const found = catalog?.groups.flatMap(g => g.models).find(m => m.id === modelSel.model)
    const effort = modelSel.reasoningEffort !== undefined && found?.reasoning !== undefined
      ? found.reasoning.efforts.find(e => e.id === modelSel.reasoningEffort)?.name
      : undefined
    return effort !== undefined ? `${found?.name ?? modelSel.model} · ${effort}` : found?.name ?? modelSel.model
  }

  const onModelSelect = (id: string): void => {
    const [kind, provider, model, effort] = id.split('|')
    if (kind === 'sel') chooseModel({ provider, model })
    else if (kind === 'eff') {
      const defaults = catalog?.groups.find(g => g.id === provider)?.models.find(m => m.id === model)?.reasoning?.defaultEffort
      chooseModel({ provider, model, ...(effort !== undefined && effort !== '' && effort !== defaults ? { reasoningEffort: effort } : {}) })
    }
  }

  const openModelMenu = (): void => {
    setModelOpen(v => !v)
    if (catalog === undefined) void loadModels().then(setCatalog)
  }

  const runSend = (text: string): void => {
    if (leaving) return
    setSendFailed(false)
    setLeaving(true)
    void enterConversationScene(() => onStartPrompt(text, { workspaceId: workspace?.workspaceId, model: modelSel, files })).then(ok => {
      if (ok) return
      setLeaving(false)
      setSendFailed(true)
    })
  }

  const send = (): void => {
    const text = draft.trim()
    if (text === '' && files.length === 0) return
    runSend(text)
  }

  const addFiles = (list: FileList | null): void => {
    if (list === null) return
    setFiles(prev => [...prev, ...Array.from(list)])
    if (fileRef.current !== null) fileRef.current.value = ''
  }

  const noWorkspace = wsPhase === 'ready' && workspaces.length === 0

  return (
    <div className={`nv-page nv-create-page${leaving ? ' nv-leaving' : ''}`}>
      <div className="nv-create-ritual">
        <header className="nv-create-intro">
          <span className="nv-create-eyebrow">{t('create.ritual.eyebrow')}</span>
          <h1>{t('create.ritual.title')}</h1>
          <p>{t('create.ritual.sub')}</p>
        </header>

        {noWorkspace ? (
          <div className="nv-composer nv-composer-nowork">
            <button type="button" className="nv-composer-wsbtn"
              onClick={() => { void pickWorkspace() }}>
              {glyph.folder(15)} {t('create.workspace.empty')}
            </button>
          </div>
        ) : (
          <div className="nv-composer nv-create-composer" style={{ viewTransitionName: 'noven-create-composer' }}>
            {files.length > 0 && (
              <div className="nv-composer-files">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="nv-composer-file">
                    {f.name}
                    <button type="button" className="nv-composer-filex" aria-label={t('create.attach.remove')}
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <textarea className="nv-composer-input" placeholder={t('create.composer.placeholder')}
              value={draft} rows={3} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <div className="nv-composer-meta">
              <button type="button" className="nv-meta-icobtn" title={t('create.attach')}
                onClick={() => fileRef.current?.click()}>{glyph.clip(15)}</button>
              <input ref={fileRef} type="file" multiple hidden onChange={e => addFiles(e.target.files)} />
              <Menu open={wsOpen} side="top" align="start" selection="fill" items={wsEntries}
                selectedId={workspace?.workspaceId} onClose={() => setWsOpen(false)}
                onSelect={id => {
                  setWsOpen(false)
                  if (id === PICK_DIR) {
                    void pickWorkspace().then(id2 => { if (id2 !== undefined) chooseWorkspace(id2) })
                    return
                  }
                  chooseWorkspace(id as WorkspaceId)
                }}
                anchor={<button type="button" className="nv-meta-chip" onClick={() => setWsOpen(v => !v)}>
                  {glyph.folder(13)} {workspace !== undefined ? wsTitle(workspace) : t('create.workspace.auto')} <span className="nv-meta-caret">⌄</span>
                </button>} />
              <Menu open={modelOpen} side="top" align="start" selection="fill"
                items={modelMenuEntries(catalog, modelSel, t)} onClose={() => setModelOpen(false)}
                onSelect={onModelSelect}
                anchor={<button type="button" className="nv-meta-chip" onClick={openModelMenu}>
                  {glyph.bolt(13)} {modelLabel()} <span className="nv-meta-caret">⌄</span>
                </button>} />
            </div>
            <div className="nv-composer-bar">
              <div className="nv-composer-chips">
                {CHIPS.map(chip => (
                  <button key={chip.command} type="button" className="nv-composer-chip"
                    onClick={() => setDraft(`/${chip.command} `)}>{glyph.slash(11)} {t(chip.label)}</button>
                ))}
              </div>
              <button className="nv-send" onClick={send} disabled={draft.trim().length === 0 && files.length === 0}
                aria-label={t('create.composer.send')}>{glyph.send(15)}</button>
            </div>
            {sendFailed && <div className="nv-composer-error">{t('create.send.failed')}</div>}
          </div>
        )}

        <div className="nv-create-paths">
          <button type="button" className="nv-create-path" onClick={event => {
            setHandcraftFailed(false)
            void onStartHandcraft(workspace?.workspaceId, event.currentTarget).then(ok => { if (!ok) setHandcraftFailed(true) })
          }}>
            <span className="nv-create-path-icon">{glyph.file(18)}</span>
            <span><strong>{t('create.handcraft')}</strong><small>{t('create.handcraft.sub')}</small></span>
            <span className="nv-create-path-arrow">↗</span>
          </button>
          <button type="button" className="nv-create-path" onClick={() => importRef.current?.click()}>
            <span className="nv-create-path-icon">{glyph.download(18)}</span>
            <span><strong>{t('create.import')}</strong><small>{t('create.import.sub')}</small></span>
            <span className="nv-create-path-arrow">↗</span>
          </button>
          <input ref={importRef} type="file" hidden onChange={event => {
            const file = event.target.files?.[0]
            if (file !== undefined) onImportCard(file, workspace?.workspaceId)
            event.currentTarget.value = ''
          }} />
        </div>
        {handcraftFailed && <div className="nv-create-inline-error">{t('create.handcraft.failed')}</div>}

        <section className="nv-create-startershelf">
          <div className="nv-sec-label">{t('create.start.label')}</div>
          <div className="nv-create-startrow">
            <button type="button" className="nv-create-mini" onClick={() => setPick('world')}>
              <span className="nv-create-mini-art nv-create-mini-world">{glyph.globe(22)}</span>
              <span><strong>{t('create.slot.world')}</strong><small>{t('create.slot.world.sub')}</small></span>
            </button>
            <button type="button" className="nv-create-mini" onClick={() => setPick('character')}>
              <span className="nv-create-mini-art nv-create-mini-character">{glyph.user(22)}</span>
              <span><strong>{t('create.slot.character')}</strong><small>{t('create.slot.character.sub')}</small></span>
            </button>
            {TEMPLATES.map(tpl => (
              <button key={tpl.name} className="nv-create-mini"
                onClick={() => tpl.creates.forEach(c => onNewCard(c.kind, t(c.name), workspace?.workspaceId))}>
                <img className="nv-create-mini-art" src={asset(tpl.cover)} alt="" />
                <span><strong>{t(tpl.name)}</strong><small>{t(tpl.sub)}</small></span>
              </button>
            ))}
            {lastDraft !== undefined && (
              <button type="button" className="nv-create-mini" onClick={() => onOpenCard(lastDraft)}>
                {lastDraft.coverRef !== undefined
                  ? <img className="nv-create-mini-art" src={cardContentUrl(lastDraft.workspaceRoot, lastDraft.dir, lastDraft.coverRef)} alt="" />
                  : <span className="nv-create-mini-art nv-create-mini-draft">{lastDraft.excerpt !== undefined
                    ? <ExcerptTile module={lastDraft.excerpt.module} text={lastDraft.excerpt.text} /> : glyph.file(22)}</span>}
                <span><strong>{lastDraft.name}</strong><small>{fmt(t, 'create.draft.unsaved', { count: lastDraft.modules })}</small></span>
              </button>
            )}
          </div>
        </section>
      </div>

      {pick !== null && (
        <CardPick t={t} kind={pick}
          defaultName={pick === 'world'
            ? `${t('create.pick.name.default.world')} ${worldCount + 1}`
            : `${t('create.pick.name.default.character')} ${charCount + 1}`}
          onClose={() => setPick(null)}
          onCreate={name => { setPick(null); onNewCard(pick, name, workspace?.workspaceId) }}
          onImport={file => { setPick(null); onImportCard(file, workspace?.workspaceId) }} />
      )}
    </div>
  )
}
