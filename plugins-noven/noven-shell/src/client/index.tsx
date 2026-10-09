/**
 * noven-shell browser half — the product IA on top of DSH's public seams:
 *
 * - `sidebar.panellist` rows (首页 / 创作 / 消息 / 我的) each selecting a
 *   `main` keyed panel; the conversation stays the default main key.
 * - `main` panels: the community feed (with its landing drawer), the creation
 *   surface, the creator profile with 世界/角色/创作库 tabs, a messages
 *   placeholder, and the three-pane card editor reached from 我的.
 * - `betterSidebar` tabs 本会话 / 创作库 for the session's card context.
 * - `ctx.theme.overrideTokens` maps the shipped palette onto the Noven one.
 *
 * Card storage and the community backend are later phases; pages render the
 * agreed layout over the fixtures in `data.ts`.
 * @module noven-shell/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ModelCatalog, ModelSelection, PromptContentPart } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-client-file-upload/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NovenShellLocaleKey } from './locales.ts'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { Home } from './pages/Home.tsx'
import { Create } from './pages/Create.tsx'
import { Me } from './pages/Me.tsx'
import { Messages } from './pages/Messages.tsx'
import { CardStudio } from './pages/CardStudio.tsx'
import { ProjectPage } from './pages/Library.tsx'
import type { ProjectRef } from './pages/Library.tsx'
import { fetchLibrary, libraryOp, projectOp, projectsCatalog } from './library-api.ts'
import type { LibraryOp, LibraryPayload, ProjectAddr, ProjectRow } from './library-api.ts'
import { cardOp, exportCardPackage, fetchCard, fetchCardList, type CardCommand } from './card-api.ts'
import type { CardAddr, CardOp } from './card-api.ts'
import { bindingOp, fetchBinding } from './bindings-api.ts'
import type { BindingOp, BindingState } from './bindings-api.ts'
import { ContextTab } from './tabs/Context.tsx'
import { LibraryTab } from './tabs/Library.tsx'
import { SidecarTab, type SidecarMessage, type SidecarState } from './tabs/Sidecar.tsx'
import { fetchSidecar, sidecarOp, type SidecarOp } from './sidecar-api.ts'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { HeaderChips } from './tabs/HeaderChips.tsx'
import type { HeaderChipsInjected } from './tabs/HeaderChips.tsx'
import { FootLauncher } from './sidebar.tsx'
import type { FootLauncherInjected, FootLauncherProps } from './sidebar.tsx'
import { CardReceiptTail, CardToolView, CARD_READ_TOOLS, CARD_WRITE_TOOLS, type CardReceiptInjected } from './toolviews.tsx'
import { cardSavedDefinition, savedMeta } from './card-receipt.ts'
import { SlashChips } from './inputdock.tsx'
import { HomeIcon, CreateIcon, BellIcon, MeIcon, glyph } from './icons.tsx'
import { injectNovenStyles } from './style.ts'
import { CanvasHost, createCanvasStore, fileTabKind, type CanvasInjected, type ProjectFocus } from './canvas.tsx'
import { ContentTree, type TreeInjected } from './tree.tsx'
import type { CreateRequest } from './creation.tsx'
import { novenTreeSource, treeOp } from './tree-api.ts'
import { capturePanelGhost, installPanelGhost } from './panel-ghost.ts'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    novenShell: unknown
  }
}

const NS = 'novenShell'

export const HOME_ID = 'noven-home' as MainPanelId
export const CREATE_ID = 'noven-create' as MainPanelId
export const MESSAGES_ID = 'noven-messages' as MainPanelId
export const ME_ID = 'noven-me' as MainPanelId
export const CARD_EDITOR_ID = 'noven-card-editor' as MainPanelId
export const WORKBENCH_ID = 'noven-workbench' as MainPanelId
export const LIBRARY_PROJECT_ID = 'noven-library-project' as MainPanelId
export const CONTEXT_TAB_ID = 'noven:context'
export const LIBRARY_TAB_ID = 'noven:library'
export const SIDECAR_TAB_ID = 'noven:sidecar'
const CONTEXT_DEF_ID = 'noven-shell.context'
const LIBRARY_DEF_ID = 'noven-shell.library'
const SIDECAR_DEF_ID = 'noven-shell.sidecar'
/** The canvas's tab type: `kind` is what `openTab` names, `id` keys its body under `sidebar.right.pane.tab`. */
const CANVAS_KIND = 'noven.canvas'
const CANVAS_DEF_ID = 'noven-shell.canvas'

/** Which card the editor is showing — shared between 我的 and the editor entry. */
interface CardRef { readonly cardId: string; readonly sessionId?: SessionId; readonly root: string }
export type MeTab = 'worlds' | 'characters' | 'library' | 'works'

type ShellState = { card: CardRef | null; project: ProjectRef | null; meTab: MeTab }
type ShellActions = {
  openCard: (draft: ShellState, ref: CardRef | null) => void
  openProject: (draft: ShellState, ref: ProjectRef | null) => void
  setMeTab: (draft: ShellState, tab: MeTab) => void
}

function createShellStore() {
  return defineStore<ShellState, ShellActions>({
    init: () => ({ card: null, project: null, meTab: 'worlds' }),
    actions: {
      openCard: (d, ref) => { d.card = ref },
      openProject: (d, ref) => { d.project = ref },
      setMeTab: (d, tab) => { d.meTab = tab },
    },
  })
}

/** Injected face for the 本会话 tab: outputs, the mounted-card binding, the workspace card picker, and mutations. */
export interface ContextTabInjected {
  readonly hooks: {
    readonly outputs: ObservableSnapshot<readonly SessionOutputRow[]>
    readonly binding: ObservableSnapshot<BindingState | undefined>
    readonly cards: ObservableSnapshot<readonly CardRow[]>
    /** Cards living in other workspaces — mountable as cross-project references. */
    readonly foreign: ObservableSnapshot<readonly CardRow[]>
    /** The session's project (registry title when the cwd is a 创作库 root). */
    readonly project: ObservableSnapshot<{ readonly root: string; readonly title: string } | undefined>
  }
  readonly bind: (op: BindingOp) => Promise<void>
  readonly openWorkbench: () => void
  readonly openCard: (id: string, addr?: CardAddr) => void
}

/** Injected face for the 创作库 tab: the session's saved-card outputs plus card navigation. */
export interface LibraryTabInjected {
  readonly hooks: { readonly outputs: ObservableSnapshot<readonly SessionOutputRow[]> }
  readonly openCard: (id: string) => void
}

/** Injected face for the 设定 sidecar tab: the workspace entity store plus the admin session's live stream and prompt channel. */
export interface SidecarTabInjected {
  readonly hooks: { readonly sidecar: ObservableSnapshot<SidecarState> }
  readonly run: (op: SidecarOp) => Promise<void>
  readonly send: (text: string) => Promise<{ ok: boolean; error?: string }>
}

/** The face main-panel inject factories hand to their pages. */
interface ShellFace {
  readonly openCard: (id: string, addr: CardAddr) => void
  readonly openPanel: (id: MainPanelId) => void
}

/** Injected face for 我的: the real card catalog plus the shared navigation face. */
export interface MePageInjected extends ShellFace {
  readonly hooks: {
    readonly cards: ObservableSnapshot<readonly CardRow[]>
    readonly projects: ObservableSnapshot<readonly ProjectRow[]>
  }
  readonly openProject: (row: { readonly sessionId?: SessionId; readonly root: string; readonly title: string }) => void
  /** 新建文件夹 flow: pick a parent directory, create `title` inside, register + open a workspace. */
  readonly createProject: (title: string) => Promise<void>
  /** 从 Finder 选择 flow: pick an existing directory, register it as a project + workspace. */
  readonly pickProject: () => Promise<void>
  /** 移出创作库: drop the registry pointer; the on-disk directory is untouched. */
  readonly removeProject: (root: string) => Promise<void>
  /** 重命名: project.json.title + the matching Workspace title — one name everywhere. */
  readonly renameProject: (root: string, title: string) => Promise<void>
  /** Create a durable card of the kind, then open it in the editor. */
  readonly newCard: (kind: 'world' | 'character', name: string) => void
  /** Import a card package file into the workspace, then open it in the editor. */
  readonly importCard: (file: File) => void
  /** Selected catalog tab — shared state so other pages can aim a tab. */
  readonly setMeTab: (tab: MeTab) => void
  /** Tile-menu actions on catalog cards. */
  readonly exportCard: (addr: CardAddr, cardId: string, name: string) => Promise<void>
  readonly deleteCard: (addr: CardAddr, cardId: string) => Promise<void>
  /** Relocate a card to another project workspace (the whole card directory moves). */
  readonly moveCard: (addr: CardAddr, cardId: string, target: ProjectAddr) => Promise<void>
}

/** 创作页发送参数：目标工作区、模型选择（含推理档）、待发附件。 */
export interface CreateSend {
  readonly workspaceId?: WorkspaceId
  readonly model?: ModelSelection
  readonly files?: readonly File[]
}

/** Injected face for 创作: real session/prompt start, card creation, and the drafts catalog. */
export interface CreatePageInjected extends ShellFace {
  readonly hooks: { readonly cards: ObservableSnapshot<readonly CardRow[]> }
  /** 建/复用所选工作区的会话 → 应用模型选择 → 上传附件 → 排队 prompt → 揭开对话。失败回 false 让页面解除淡出。 */
  readonly startPrompt: (text: string, send: CreateSend) => Promise<boolean>
  readonly newCard: (kind: 'world' | 'character', name: string, workspaceId?: WorkspaceId) => void
  readonly importCard: (file: File, workspaceId?: WorkspaceId) => void
  /** Host 代际的模型目录（默认路由 + 各提供商清单）。 */
  readonly loadModels: () => Promise<ModelCatalog | undefined>
  /** 弹宿主目录选择并把所选目录注册成 Workspace。 */
  readonly pickWorkspace: () => Promise<WorkspaceId | undefined>
}

/** Injected face for the project page: the manifest observable plus mutation/read callbacks. */
export interface ProjectPageInjected {
  readonly hooks: {
    readonly library: ObservableSnapshot<LibraryPayload | undefined>
    readonly cards: ObservableSnapshot<readonly CardRow[]>
  }
  readonly op: (addr: ProjectAddr, op: LibraryOp, baseRevision?: number) => Promise<void>
  readonly readText: (addr: ProjectAddr, path: string) => Promise<string>
  readonly sessionTitle: (sessionId: SessionId) => string | undefined
  readonly openCard: (id: string, addr: CardAddr) => void
  readonly back: () => void
}

/** Injected face for the card editor: the `/api/noven-cards` state reader plus the shared op channel. */
export interface EditorPageInjected {
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<import('./card-api.ts').CardState | undefined>
  readonly cardOp: (addr: CardAddr, op: CardOp) => Promise<import('./card-api.ts').CardOpResult>
  readonly workspaceRoot: (addr: CardAddr) => string
  /** Breadcrumb navigation: switch to 我的 on the tab matching the card kind. */
  readonly back: (tab: 'worlds' | 'characters') => void
}

type PageProps = PropsRuntime<'main'> & PropsLocale<'novenShell'>
type FacePageProps = PageProps & InjectFace<ShellFace>
type EditorPageProps = PageProps & PropsStore<ReturnType<typeof createShellStore>>
type TabBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'novenShell'>
type WorkspaceMenuItemProps = PropsRuntime<'sidebar.workspaces.workspace.menu.item'> & PropsLocale<'novenShell'>

/** Injected share of the workspace-row ⋯ menu's 创作库 membership entry. */
export interface WorkspaceLibraryInjected {
  readonly hooks: { readonly projects: ObservableSnapshot<readonly ProjectRow[]> }
  /** Register or unregister the workspace root; the row passes the direction it displayed. */
  readonly setMembership: (root: string, registered: boolean) => Promise<void>
}

/** Workspace ⋯ menu row: 移入创作库 while the root is unregistered, 移出创作库 once it is. */
function WorkspaceLibraryItem({ path, useMenuOpenState, useProjects, setMembership, t }: WorkspaceMenuItemProps & InjectFace<WorkspaceLibraryInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const registered = useProjects(rows => path !== undefined && rows.some(row => row.root === path))
  if (path === undefined) return null
  return (
    <MenuItemButton
      icon={glyph.book(16)}
      onSelect={() => {
        setMenuOpen(false)
        setMembership(path, registered).catch((reason: unknown) => { console.warn('noven-shell: library membership failed:', reason) })
      }}
    >
      {t(registered ? 'lib.project.remove' : 'lib.project.add')}
    </MenuItemButton>
  )
}

/** Guide-picker glyphs for the rail tabs. */
function ContextTabIcon({ size }: { size?: number }) { return glyph.chat(size ?? 16) }
function LibraryTabIcon({ size }: { size?: number }) { return glyph.book(size ?? 16) }
function SidecarTabIcon({ size }: { size?: number }) { return glyph.sparkle(size ?? 16) }

/** Required browser services: slots, panel selection, theme, copy, right rail, session navigation, command and skill catalogs. */
export const inject = ['slots', 'locale', 'layout', 'theme', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'uiWorkspace', 'uiSession', 'remote', 'remote.commands', 'remote.session', 'remote.skills', 'remote.workspaceFiles', 'sessions', 'workspaces']

interface ChipEntry { name: string; description: string }

/** One row in the 本会话产出 list — a card this session's settled writes saved. */
export interface SessionOutputRow {
  readonly rootId: string | undefined
  readonly name: string
  readonly kind: string | undefined
}

/** One card row in 我的 — read live from each workspace's `卡/` store. */
export interface CardRow {
  readonly cardId: string
  /** Session whose workspace holds the card, when one exists; card APIs also go by `workspaceRoot`. */
  readonly sessionId: SessionId | undefined
  readonly name: string
  /** The card's visible directory name under `卡/` — media URLs join it. */
  readonly dir: string
  readonly kind: string | undefined
  readonly modules: number
  readonly revision: number
  /** Absolute workspace root; media URLs join it with `卡/<dir>/` paths. */
  readonly workspaceRoot: string
  /** Owning project's display title (registry title, else the directory basename). */
  readonly projectTitle: string
  /** Content ref of the card's cover resource, when `appearance.coverResourceId` names one. */
  readonly coverRef: string | undefined
  /** An uncommitted `draft.json` exists — the row counts as an unfinished card draft. */
  readonly hasDraft: boolean
  /** First text module's name + leading body — the coverless tile's content excerpt. */
  readonly excerpt: { readonly module: string; readonly text: string } | undefined
}

/**
 * Fold every known project root's card store into the catalog: session cwds
 * plus registered 创作库 roots (a session-less project still lists its cards).
 * Rows dedupe by root+id — the same card id in two projects is two
 * independent copies (drafts and revisions diverge). Refetches whenever the
 * session list or the project registry moves.
 */
function cardCatalog(sessions: ClientContext['sessions'], projects: ObservableSnapshot<readonly ProjectRow[]>) {
  let snapshot: readonly CardRow[] = []
  const listeners = new Set<() => void>()
  let started = false
  let generation = 0
  const compute = async () => {
    const gen = ++generation
    const state = sessions.list.getSnapshot()
    const byRoot = new Map<string, SessionId | undefined>()
    for (const id of state.ids) {
      const cwd = state.byId[id]?.cwd
      if (cwd !== undefined && cwd.length > 0 && !byRoot.has(cwd)) byRoot.set(cwd, id)
    }
    for (const project of projects.getSnapshot()) {
      if (!byRoot.has(project.root)) byRoot.set(project.root, undefined)
    }
    const titleByRoot = new Map(projects.getSnapshot().map(p => [p.root, p.title] as const))
    const rows: CardRow[] = []
    for (const [root, sessionId] of byRoot) {
      const projectTitle = titleByRoot.get(root) ?? root.split('/').pop() ?? root
      for (const row of await fetchCardList({ root })) {
        rows.push({ ...row, sessionId, workspaceRoot: root, projectTitle })
      }
    }
    if (gen !== generation) return
    snapshot = rows
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    /** Card ops (create/import/delete) don't move the session list — refresh on demand. */
    refresh: () => { void compute() },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) { started = true; void compute() }
      const a = sessions.list.subscribe(() => { void compute() })
      const b = projects.subscribe(() => { void compute() })
      return () => { listeners.delete(listener); if (listeners.size === 0) { a(); b() } }
    },
  }
}

/** The catalog rows living in one session's workspace — the binding picker's choices. */
function workspaceCards(sessions: ClientContext['sessions'], catalog: ObservableSnapshot<readonly CardRow[]>, sessionId: SessionId) {
  let snapshot: readonly CardRow[] = []
  const listeners = new Set<() => void>()
  const compute = () => {
    const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
    const next = catalog.getSnapshot().filter(r => r.workspaceRoot === cwd && cwd !== undefined && cwd !== '')
    if (next.length === snapshot.length && next.every((row, i) => row === snapshot[i])) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      const a = catalog.subscribe(compute)
      const b = sessions.list.subscribe(compute)
      compute()
      return () => { listeners.delete(listener); a(); b() }
    },
  }
}

/** The session's project: registry title when the cwd is a 创作库 root, else the directory name. */
function currentProject(sessions: ClientContext['sessions'], projects: ObservableSnapshot<readonly ProjectRow[]>, sessionId: SessionId) {
  let snapshot: { readonly root: string; readonly title: string } | undefined
  const listeners = new Set<() => void>()
  const compute = () => {
    const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
    const row = cwd === undefined ? undefined : projects.getSnapshot().find(p => p.root === cwd)
    const next = cwd === undefined || cwd === ''
      ? undefined
      : { root: cwd, title: row?.title ?? cwd.split('/').pop() ?? cwd }
    if (next?.root === snapshot?.root && next?.title === snapshot?.title) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      const a = sessions.list.subscribe(compute)
      const b = projects.subscribe(compute)
      compute()
      return () => { listeners.delete(listener); a(); b() }
    },
  }
}

/** Catalog rows in every OTHER workspace — candidates for cross-project session references. */
function foreignCards(sessions: ClientContext['sessions'], catalog: ObservableSnapshot<readonly CardRow[]>, sessionId: SessionId) {
  let snapshot: readonly CardRow[] = []
  const listeners = new Set<() => void>()
  const compute = () => {
    const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
    const next = catalog.getSnapshot().filter(r => r.workspaceRoot !== cwd && cwd !== undefined && cwd !== '')
    if (next.length === snapshot.length && next.every((row, i) => row === snapshot[i])) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      const a = catalog.subscribe(compute)
      const b = sessions.list.subscribe(compute)
      compute()
      return () => { listeners.delete(listener); a(); b() }
    },
  }
}

/** One hydrated module for the editor: text resolved, image refs kept as card-relative paths. */
export interface CardModuleView {
  readonly id: string
  readonly name: string
  readonly text: string
  readonly images: readonly string[]
  readonly children: readonly CardModuleView[]
}

/** The editor's read model of a stored card head plus resolved text contents. */
export interface CardDocumentView {
  readonly cardId: string
  readonly name: string
  readonly kind: string | undefined
  readonly revision: number
  /** Absolute workspace root, used to turn content refs into `/api/file` URLs. */
  readonly workspaceRoot: string
  readonly modules: readonly CardModuleView[]
  /** Names of the world's internal characters, in storage order. */
  readonly characters: readonly { readonly id: string; readonly name: string }[]
}

/** Fold the session's event window into its deduped saved-card list; replays and live turns both feed it. */
function sessionOutputs(sessions: ClientContext['sessions'], sessionId: Parameters<ClientContext['remote']['commands']['list']>[0]) {
  let snapshot: readonly SessionOutputRow[] = []
  const listeners = new Set<() => void>()
  let started = false
  const compute = () => {
    const binding = sessions.binding(sessionId)
    if (binding === undefined) return
    const latest = new Map<string, SessionOutputRow>()
    const order: string[] = []
    for (const entry of binding.eventSource.getSnapshot().entries) {
      if (entry.type !== 'event' || entry.event.type !== 'tool/result') continue
      const meta = savedMeta(entry.event.data.meta)
      if (meta === undefined) continue
      const key = meta.root_id ?? `seq:${entry.event.seq}`
      if (!latest.has(key)) order.push(key)
      latest.set(key, { rootId: meta.root_id, name: meta.card_name ?? '未命名卡片', kind: meta.card_kind })
    }
    const next = order.map(key => latest.get(key) as SessionOutputRow)
    if (next.length === snapshot.length && next.every((row, i) => row === snapshot[i])) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      const feed = sessions.binding(sessionId)?.eventSource
      let disposeFeed: (() => void) | undefined
      if (!started && feed !== undefined) {
        started = true
        disposeFeed = feed.subscribe(compute)
        compute()
      }
      return () => { listeners.delete(listener); if (listeners.size === 0) { disposeFeed?.(); started = false } }
    },
  }
}

/** The manifest for the project the store currently names; refetches when the selection or the document moves. */
function currentLibrary(store: { getSnapshot: () => ShellState; subscribe: (fn: () => void) => () => void }): ObservableSnapshot<LibraryPayload | undefined> & { readonly refresh: () => void } {
  let snapshot: LibraryPayload | undefined
  const listeners = new Set<() => void>()
  let started = false
  let generation = 0
  const pull = async () => {
    const gen = ++generation
    const project = store.getSnapshot().project
    const payload = project === null ? undefined : await fetchLibrary(project)
    if (gen !== generation) return
    snapshot = payload
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    refresh: () => { void pull() },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) {
        started = true
        store.subscribe(() => { void pull() })
        void pull()
      }
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * Per-session card-context bindings, cached so the list sub-line, the header
 * chips, and the 本会话 tab share one fetch per session. `refresh` repulls;
 * a card-save result on the session feed repulls too — write tools bind the
 * saved card server-side, and the chips follow without a manual op.
 */
function bindingCache(sessions: ClientContext['sessions']) {
  const sources = new Map<string, ObservableSnapshot<BindingState | undefined> & { refresh: () => void }>()
  const get = (sessionId: SessionId) => {
    const cached = sources.get(sessionId)
    if (cached !== undefined) return cached
    let snapshot: BindingState | undefined
    const listeners = new Set<() => void>()
    let started = false
    let disposeFeed: (() => void) | undefined
    let seen = 0
    const pull = async () => {
      const next = await fetchBinding(sessionId)
      ensureFeed()
      if (next === snapshot) return
      snapshot = next
      for (const listener of listeners) listener()
    }
    /** Tool-side saves write the binding file server-side; a saved result is the nudge to repull. */
    const ensureFeed = () => {
      if (disposeFeed !== undefined) return
      const feed = sessions.binding(sessionId)?.eventSource
      if (feed === undefined) return
      seen = feed.getSnapshot().entries.length
      disposeFeed = feed.subscribe(() => {
        const entries = feed.getSnapshot().entries
        const fresh = entries.slice(seen)
        seen = entries.length
        if (fresh.some(entry => entry.type === 'event' && entry.event.type === 'tool/result'
          && savedMeta(entry.event.data.meta) !== undefined)) void pull()
      })
    }
    const source = {
      getSnapshot: () => snapshot,
      refresh: () => { void pull() },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        if (!started) { started = true; void pull() }
        ensureFeed()
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) { disposeFeed?.(); disposeFeed = undefined; seen = 0; started = false }
        }
      },
    }
    sources.set(sessionId, source)
    return source
  }
  return { get, refreshAll: () => { for (const source of sources.values()) source.refresh() } }
}

/**
 * Per-session sidecar state: the workspace entity store plus the admin
 * session's live stream. The store is polled (entities are materialized
 * state shared across sessions); the admin session is retained while the
 * pane is subscribed and its event feed folds into the bottom stream —
 * digest-task messages carry the `noven-sidecar` source kind, context
 * injections stay out of the visible stream, and each settled admin turn
 * re-pulls the store it may have written.
 */
function sidecarSource(sessions: ClientContext['sessions'], sessionId: SessionId): ObservableSnapshot<SidecarState> & { readonly refresh: () => void; readonly send: (text: string) => Promise<{ ok: boolean; error?: string }> } {
  let snapshot: SidecarState = { payload: undefined, admin: { messages: [], busy: false } }
  const listeners = new Set<() => void>()
  let started = false
  let boundId: SessionId | undefined
  let adminRef: { release(): void } | undefined
  let disposeFeed: (() => void) | undefined
  let seen = 0
  let messages: SidecarMessage[] = []
  let busy = false
  const textOf = (content: readonly { type: string; text?: string }[]): string =>
    content.filter(b => b.type === 'text' && b.text !== undefined).map(b => b.text!).join('\n').trim()
  const set = (next: SidecarState) => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const fold = (entries: readonly SessionEventLikeEntry[]) => {
    for (const entry of entries) {
      if (entry.type !== 'event') continue
      const ev = entry.event
      if (ev.type === 'user/message') {
        const source = ev.data.source
        // 整理任务按来源标记；上下文注入（noven-cards 等）不进可见流。
        // source.kind 是合并扩展联合——宽成 string 再比，插件来源客户端不认识。
        const kind: string = source.kind
        const task = kind === 'noven-sidecar'
        const human = kind === 'user'
        if (!task && !human) continue
        const text = textOf(ev.data.content)
        if (text.length === 0) continue
        messages = [...messages, { key: `u${ev.seq}`, role: 'user', ...(task ? { task: true } : {}), text }]
      } else if (ev.type === 'assistant/message') {
        const text = textOf(ev.data.message.content)
        if (text.length > 0) messages = [...messages, { key: `a${ev.seq}`, role: 'assistant', text }]
      } else if (ev.type === 'turn/start') {
        busy = true
      } else if (ev.type === 'turn/end') {
        busy = false
        // 管理员一轮落地可能动过实体库——结账时重拉。
        void pull()
      }
    }
  }
  const bindAdmin = (adminId: SessionId | undefined) => {
    if (adminId === boundId) return
    boundId = adminId
    disposeFeed?.()
    disposeFeed = undefined
    adminRef?.release()
    adminRef = undefined
    messages = []
    busy = false
    seen = 0
    if (adminId === undefined) { set({ ...snapshot, admin: { messages, busy } }); return }
    const reference = sessions.retain(adminId, { source: 'novenShell' })
    adminRef = reference
    const feed = reference.binding.eventSource
    fold(feed.getSnapshot().entries)
    seen = feed.getSnapshot().entries.length
    disposeFeed = feed.subscribe(() => {
      const entries = feed.getSnapshot().entries
      fold(entries.slice(seen))
      seen = entries.length
      set({ ...snapshot, admin: { messages, busy } })
    })
    set({ ...snapshot, admin: { messages, busy } })
  }
  const pull = async () => {
    const payload = await fetchSidecar(sessionId)
    set({ ...snapshot, payload })
    bindAdmin(payload?.adminSessionId)
  }
  let sweep: ReturnType<typeof setInterval> | undefined
  return {
    getSnapshot: () => snapshot,
    refresh: () => { void pull() },
    send: async (text: string) => {
      // 首拉还没带回管理员编号时先等它——pane 打开就说第一句话不该掉。
      if (boundId === undefined) await pull()
      if (boundId === undefined) return { ok: false, error: 'no admin session' }
      try {
        return await sessions.using(boundId, { source: 'novenShell' }, async reference => {
          const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
          return result.ok ? { ok: true } : { ok: false, error: result.error.message }
        })
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'send failed' }
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) {
        started = true; void pull()
        // 同项目别的会话也在喂同一个实体库——慢速兜底刷新补跨会话盲区。
        sweep = setInterval(() => { void pull() }, 30_000)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          bindAdmin(undefined)
          clearInterval(sweep); sweep = undefined
          started = false
        }
      }
    },
  }
}
function bindingsCatalog(bindings: ReturnType<typeof bindingCache>, sessions: ClientContext['sessions']) {
  let snapshot: Readonly<Record<string, BindingState | undefined>> = {}
  const listeners = new Set<() => void>()
  let started = false
  const compute = () => {
    const state = sessions.list.getSnapshot()
    const next: Record<string, BindingState | undefined> = {}
    for (const id of state.ids) next[id] = bindings.get(id).getSnapshot()
    if (Object.keys(next).length === Object.keys(snapshot).length
      && Object.entries(next).every(([id, b]) => snapshot[id] === b)) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const subscribed = new Set<string>()
  const source = {
    getSnapshot: () => snapshot,
    refresh: () => { bindings.refreshAll(); compute() },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) {
        started = true
        sessions.list.subscribe(compute)
        compute()
      }
      return () => { listeners.delete(listener) }
    },
  }
  const track = () => {
    compute()
    for (const id of sessions.list.getSnapshot().ids) {
      if (subscribed.has(id)) continue
      subscribed.add(id)
      bindings.get(id).subscribe(compute)
    }
  }
  // Re-check membership whenever the session list moves; per-session sources
  // are cached so subscribing is a one-time cost each.
  return {
    getSnapshot: source.getSnapshot,
    refresh: source.refresh,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) {
        started = true
        sessions.list.subscribe(track)
        track()
      }
      return () => { listeners.delete(listener) }
    },
  }
}

/** One session's slash catalog — user-invocable skills first, then commands — as a lazily-pulled observable for the chip row. */
function commandCatalog(remote: ClientContext['remote'], sessionId: Parameters<ClientContext['remote']['commands']['list']>[0]) {
  let skills: readonly ChipEntry[] = []
  let commands: readonly ChipEntry[] = []
  let snapshot: readonly ChipEntry[] = []
  const listeners = new Set<() => void>()
  let started = false
  const publish = () => {
    const seen = new Set<string>()
    snapshot = [...skills, ...commands].filter(({ name }) => !seen.has(name) && seen.add(name))
    for (const listener of listeners) listener()
  }
  const pull = () => {
    void remote.skills.list({ sessionId }).then((result) => {
      if (!result.ok) return
      skills = result.value.skills.map(({ name, description }) => ({ name, description }))
      publish()
    }).catch(() => { /* catalog unavailable — the row stays hidden */ })
    void remote.commands.list(sessionId).then((result) => {
      if (!result.ok) return
      commands = result.value.map(({ name, description }) => ({ name, description }))
      publish()
    }).catch(() => { /* catalog unavailable — the row stays hidden */ })
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) { started = true; pull() }
      return () => { listeners.delete(listener) }
    },
  }
}

export function apply(ctx: ClientContext): void {
  injectNovenStyles()
  ctx.effect(() => installPanelGhost(), 'noven-shell: panel ghost')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-shell: dictionaries')
  const t = ctx.locale.bind(NS)

  // Noven palette over the shipped tokens (light drives the product; dark
  // keeps the same accents on dark surfaces).
  ctx.effect(() => ctx.theme.overrideTokens('noven-shell', {
    '--dsw-alias-brand-primary': { light: '#34D399', dark: '#34D399' },
    '--dsw-alias-bg-base': { light: '#FFFFFF', dark: '#131615' },
    '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1B1F1D' },
    '--dsw-alias-bg-layer-2': { light: '#F7F8F8', dark: '#222725' },
    '--dsw-alias-border-l1': { light: '#ECEEEF', dark: '#2A2F2C' },
    '--dsw-alias-label-primary': { light: '#16181A', dark: '#E8EBEA' },
    '--dsw-alias-label-secondary': { light: '#8A8F94', dark: '#8A8F94' },
    '--dsw-specific-sidebar-fill': { light: '#FFFFFF', dark: '#131615' },
    // The DeepSeek-blue accent family remapped to Noven mint: send button,
    // links, selection accents, and the user bubble.
    '--dsw-alias-state-business-primary': { light: '#0E9F6E', dark: '#34D399' },
    '--dsw-alias-state-business-tertiary': { light: 'rgba(52, 211, 153, 0.12)', dark: 'rgba(52, 211, 153, 0.18)' },
    '--dsw-alias-button-info-fill': { light: '#0E9F6E', dark: '#34D399' },
    '--dsw-alias-button-info-hover': { light: '#34D399', dark: '#0E9F6E' },
    '--dsw-alias-link': { light: '#0E9F6E', dark: '#34D399' },
    '--dsw-specific-sidebar-nav-item-active-accent': { light: 'rgba(52, 211, 153, 0.12)', dark: 'rgba(52, 211, 153, 0.18)' },
    '--dsw-specific-bubble': { light: 'rgba(52, 211, 153, 0.12)', dark: 'rgba(52, 211, 153, 0.18)' },
    '--dsw-specific-bubble-highlight': { light: 'rgba(52, 211, 153, 0.22)', dark: 'rgba(52, 211, 153, 0.28)' },
  }), 'noven-shell: theme tokens')

  const handle = createShellStore()
  const instance = handle.create()
  const store: typeof handle = { ...handle, create: () => instance }
  const projects = projectsCatalog(ctx.sessions)
  const cards = cardCatalog(ctx.sessions, projects)
  const library = currentLibrary(instance)
  const bindings = bindingCache(ctx.sessions)
  const allBindings = bindingsCatalog(bindings, ctx.sessions)
  const sidecars = new Map<SessionId, ReturnType<typeof sidecarSource>>()
  /** The most recently active session with a workspace — the default target for new sessions and card ops. */
  const recentSession = (): { id: SessionId; cwd: string } | undefined => {
    const state = ctx.sessions.list.getSnapshot()
    let best: { id: SessionId; cwd: string; at: number } | undefined
    for (const id of state.ids) {
      const row = state.byId[id]
      if (row?.cwd === undefined) continue
      if (best === undefined || row.updatedAt >= best.at) best = { id, cwd: row.cwd, at: row.updatedAt }
    }
    return best === undefined ? undefined : { id: best.id, cwd: best.cwd }
  }

  /** Absolute root for an address: the explicit root wins, else the session's cwd. */
  const rootOf = (addr: CardAddr): string =>
    addr.root ?? (addr.sessionId !== undefined ? ctx.sessions.list.getSnapshot().byId[addr.sessionId]?.cwd ?? '' : '')

  const face: ShellFace = {
    openCard: (id, addr) => {
      instance.actions.openCard({ cardId: id, sessionId: addr.sessionId, root: rootOf(addr) })
      openCanvasCard(id, { sessionId: addr.sessionId, root: rootOf(addr) }, undefined, addr.sessionId)
    },
    openPanel: (id) => {
      capturePanelGhost()
      try { ctx.layout.selectPanel(id) } catch { /* panel not registered */ }
    },
  }
  const openProject = (row: { readonly sessionId?: SessionId; readonly root: string; readonly title: string }) => {
    instance.actions.openProject({ sessionId: row.sessionId, root: row.root, title: row.title })
    face.openPanel(LIBRARY_PROJECT_ID)
  }

  /** 选定工作区的根路径；未选或未登记时回退 undefined（走最近会话路径）。 */
  const workspaceRootFor = (workspaceId: WorkspaceId | undefined): string | undefined =>
    workspaceId === undefined ? undefined
      : ctx.workspaces.list.getSnapshot().items.find(w => w.workspaceId === workspaceId)?.path

  /** 建卡后要打开画布编辑器：拿到落在该工作区的会话（无则 connect 出/复用一个 blank）。 */
  const cardSessionFor = async (workspaceId: WorkspaceId | undefined): Promise<{ sessionId?: SessionId; root?: string }> => {
    if (workspaceId === undefined) {
      const target = recentSession()
      return { sessionId: target?.id ?? await createSessionIn(undefined) }
    }
    const root = workspaceRootFor(workspaceId)
    if (root === undefined) return { sessionId: recentSession()?.id ?? await createSessionIn(undefined) }
    const sessionId = await ctx.uiWorkspace.connectWorkspace(workspaceId).catch(() => undefined)
    if (sessionId !== undefined) ctx.uiWorkspace.openSession(sessionId)
    return sessionId === undefined ? { root } : { sessionId, root }
  }

  /** Create a durable card in the chosen (or recent) workspace, then open the editor. */
  const newCard = (kind: 'world' | 'character', name: string, workspaceId?: WorkspaceId): void => {
    void (async () => {
      const target = await cardSessionFor(workspaceId)
      const created = await cardOp(target.sessionId !== undefined ? { sessionId: target.sessionId } : { root: target.root },
        { op: 'create', kind: kind === 'world' ? 'WORLD' : 'CHARACTER', name })
      cards.refresh()
      if (created.cardId !== undefined) face.openCard(created.cardId, target)
    })().catch((reason: unknown) => { console.warn('noven-shell: card create failed:', reason) })
  }

  /** Import a card package (.novex.zip / PNG / text) into the chosen (or recent) workspace, then open the editor. */
  const importCard = (file: File, workspaceId?: WorkspaceId): void => {
    void (async () => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (const chunk of bytes) binary += String.fromCharCode(chunk)
      const target = await cardSessionFor(workspaceId)
      const imported = await cardOp(target.sessionId !== undefined ? { sessionId: target.sessionId } : { root: target.root },
        { op: 'import', file: btoa(binary), name: file.name })
      cards.refresh()
      if (imported.cardId !== undefined) face.openCard(imported.cardId, target)
    })().catch((reason: unknown) => { console.warn('noven-shell: card import failed:', reason) })
  }

  /** 图片附件走内联 image part；其余文件经 fileUpload 暂存拿 receipt（服务缺席时丢弃并告警）。 */
  const fileToPart = async (sessionId: SessionId, file: File): Promise<PromptContentPart | undefined> => {
    const imageTypes = new Set<string>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    if (imageTypes.has(file.type)) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (const b of bytes) binary += String.fromCharCode(b)
      return { type: 'image', mediaType: file.type as ImageMediaType, data: btoa(binary), name: file.name }
    }
    const uploader = ctx.get('fileUpload')
    if (uploader === undefined) return undefined
    const res = await uploader.upload(sessionId, file, file.name)
    return res.ok ? { type: 'file', receiptId: res.value.receiptId } : undefined
  }

  /** 发送管线：连接所选工作区的会话 → 应用模型 → 传附件 → prompt → 揭开对话面板。 */
  const startPromptSession = (text: string, send: CreateSend): Promise<boolean> =>
    (async () => {
      const sessionId = send.workspaceId !== undefined
        ? await ctx.uiWorkspace.connectWorkspace(send.workspaceId)
        : await createSessionIn(recentSession()?.cwd)
      if (send.model !== undefined) {
        const applied = await ctx.remote.session.selectModel({ sessionId, ...send.model })
        if (!applied.ok) console.warn('noven-shell: model selection failed:', applied.error.message)
      }
      const parts: PromptContentPart[] = []
      for (const file of send.files ?? []) {
        const part = await fileToPart(sessionId, file).catch((reason: unknown) => {
          console.warn('noven-shell: attachment upload failed:', reason)
          return undefined
        })
        if (part !== undefined) parts.push(part)
      }
      if (text !== '') parts.push({ type: 'text', text })
      ctx.uiWorkspace.openSession(sessionId)
      await ctx.sessions.using(sessionId, { source: 'novenShell' }, async reference => {
        const result = await reference.binding.session.prompt(parts, 'queue')
        if (!result.ok) throw new Error(result.error.message)
      })
      return true
    })().catch((reason: unknown) => {
      console.warn('noven-shell: prompt session failed:', reason)
      return false
    })

  /** Host 代际模型目录（默认路由 + 提供商清单）。 */
  const loadModels = async (): Promise<ModelCatalog | undefined> => {
    const res = await ctx.remote.session.modelCatalog()
    return res.ok ? res.value : undefined
  }

  /** 目录选择 + 注册成 Workspace（追随上游添加路径的唯一入口：挑宿主目录）。 */
  const pickWorkspace = async (): Promise<WorkspaceId | undefined> => {
    const path = await ctx.uiWorkspace.pickDirectory()
    if (path === null) return undefined
    const workspace = await ctx.workspaces.create({ path })
    return workspace.workspaceId
  }

  // ——— 四栏外壳：导航栏（图标 + 会话列表）原样不动；抽屉上区装内容树；
  // 画布是 rightbar 单元里的一个 selfChrome 页签；会话走 main 的
  // conversation 上游原样实现。零遮蔽，全部经原生座。

  const canvasHandle = createCanvasStore()
  const canvasInstance = canvasHandle.create()
  const canvasStore: typeof canvasHandle = { ...canvasHandle, create: () => canvasInstance }

  /** cwd → 已注册 workspace 的 id：上游会话分组靠 workspace 的 sessionIds 名单认领。 */
  const workspaceIdFor = (root: string) =>
    (ctx.get('workspaces') as IWorkspaces | undefined)?.list.getSnapshot().items
      .find(w => w.path === root)?.workspaceId

  /**
   * 建会话：根下有注册 workspace 走 workspaceId（进分组名单），否则裸
   * cwd。注意 workspaceId 与 cwd 在 create 载荷里互斥——传了 workspaceId
   * 会丢 cwd，服务端从 workspace 解析。
   */
  const createSessionIn = (root: string | undefined): Promise<SessionId> => {
    if (root === undefined) return ctx.sessions.create({})
    const workspaceId = workspaceIdFor(root)
    return ctx.sessions.create(workspaceId === undefined ? { cwd: root } : { workspaceId })
  }

  /** 当前项目坐标：跟随绑定会话的 cwd，标题取创作库登记名。 */
  let focusSnapshot: ProjectFocus | undefined
  const focusListeners = new Set<() => void>()
  const computeFocus = (): void => {
    const key = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    const cwd = key === undefined ? undefined : ctx.sessions.list.getSnapshot().byId[key]?.cwd
    // 项目 = 注册表里的根，不是随便一个 cwd：会话落在没登记的目录上就没有
    // 工作台——树清空、画布只留起点、写入口关闭（C6）。
    const project = cwd === undefined ? undefined : projects.getSnapshot().find(row => row.root === cwd)
    const next: ProjectFocus | undefined = project === undefined || key === undefined ? undefined : {
      root: project.root,
      sessionId: key,
      title: project.title,
    }
    const same = next === undefined ? focusSnapshot === undefined
      : focusSnapshot !== undefined && next.root === focusSnapshot.root && next.sessionId === focusSnapshot.sessionId && next.title === focusSnapshot.title
    if (same) return
    focusSnapshot = next
    for (const listener of focusListeners) listener()
  }
  const projectFocus: ObservableSnapshot<ProjectFocus | undefined> = {
    getSnapshot: () => focusSnapshot,
    subscribe: listener => { focusListeners.add(listener); return () => { focusListeners.delete(listener) } },
  }
  ctx.effect(() => {
    const offCurrent = ctx.uiSession.adapter.current.subscribe(computeFocus)
    const offList = ctx.sessions.list.subscribe(computeFocus)
    const offProjects = projects.subscribe(computeFocus)
    computeFocus()
    return () => { offCurrent(); offList(); offProjects() }
  }, 'noven-shell: project focus')

  /** 内容树轮询源：跟着当前项目走；未绑会话时按裸 root 聚合。 */
  const treeSource = novenTreeSource(() => {
    const focus = focusSnapshot
    if (focus === undefined) return undefined
    return focus.sessionId !== undefined ? { sessionId: focus.sessionId } : { root: focus.root }
  })

  // 启动时无绑定会话：回最近有工作区的会话；会话目录后到齐也补一次。只做一次。
  ctx.effect(() => {
    let tried = false
    const maybeOpen = (): void => {
      if (tried || ctx.uiSession.adapter.current.getSnapshot().key !== undefined) return
      const recent = recentSession()
      if (recent !== undefined) { tried = true; ctx.uiWorkspace.openSession(recent.id) }
    }
    const unsubscribe = ctx.sessions.list.subscribe(maybeOpen)
    maybeOpen()
    return unsubscribe
  }, 'noven-shell: reopen recent session')

  /** 当前项目的卡地址：绑了会话走 session，裸项目走 root。 */
  const currentCardAddr = (): CardAddr => {
    const focus = focusSnapshot
    const addr: { sessionId?: SessionId; root?: string } = {}
    if (focus?.sessionId !== undefined) addr.sessionId = focus.sessionId
    if (focus !== undefined) addr.root = focus.root
    return addr
  }

  /** canvasSide/canvas 在工作区的服务上有、发布版类型上还没有——全可选口径，旧版上自然缺席。 */
  const rightExtras = ctx.sidebarRight as {
    canvasSide?: { get(): 'left' | 'right'; toggle(): void }
    canvas?: { getSnapshot(): { readonly kind: string } | undefined }
  }

  /** 抬起画布页签：页签在 rightbar 单元的画布面，openTab 顺带展开抽屉列。 */
  const raiseCanvas = (): void => {
    try { ctx.sidebarRight.openTab(CANVAS_KIND) }
    catch { /* 座未挂（无绑定会话）——对象标签照开，画布等座出现再抬 */ }
  }

  /**
   * 卡页打开统一走画布标签；标签标题等内容树轮询回写。`moduleId` 带模块行深链。
   * 归属：`owner` 是这条标签所在的会话现场；卡片地址只存项目根——会话会
   * 换绑、项目不会，打开时向当前会话解析访问路径（C9）。
   */
  const openCanvasCard = (cardId: string, addr: CardAddr, moduleId: string | undefined, owner: SessionId | undefined, addModule = false): void => {
    const session = owner ?? (ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined) ?? addr.sessionId ?? recentSession()?.id
    if (session === undefined) return
    canvasInstance.actions.open({ key: `card:${cardId}`, kind: 'card', title: '', owner: session, cardId,
      cardAddr: { root: rootOf(addr) }, ...(moduleId === undefined ? {} : { moduleId }), ...(addModule ? { addModule: true } : {}) })
    raiseCanvas()
  }

  /** 模块级命令的公共通道：先 loadCard 拿 version 再 apply（树行 ⋯ 菜单走这里）。 */
  const moduleCommand = async (addr: CardAddr, cardId: string, build: (state: import('./card-api.ts').CardState) => CardCommand | undefined): Promise<void> => {
    const state = await fetchCard(addr, cardId)
    if (state === undefined) return
    const command = build(state)
    if (command === undefined) return
    await cardOp(addr, { op: 'apply', cardId, version: state.version, command })
      .catch((reason: unknown) => { console.warn('noven-shell: module command failed:', reason) })
  }

  /** 切换左列项目：复用同 cwd 的会话，没有就为这个工作区建一个并绑定。 */
  const switchProject = (root: string): void => {
    const state = ctx.sessions.list.getSnapshot()
    const hit = state.ids.find(id => state.byId[id]?.cwd === root)
    if (hit !== undefined) { ctx.uiWorkspace.openSession(hit); return }
    void createSessionIn(root)
      .then(id => ctx.uiWorkspace.openSession(id))
      .catch((reason: unknown) => { console.warn('noven-shell: project switch failed:', reason) })
  }

  /** 拿一个能读写文件的会话：绑定会话优先，其次最近工作区会话，最后按当前项目现建并绑定。 */
  const ensureSession = async (): Promise<SessionId | undefined> => {
    const bound = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    if (bound !== undefined) return bound
    const recent = recentSession()
    if (recent !== undefined) { ctx.uiWorkspace.openSession(recent.id); return recent.id }
    if (focusSnapshot?.root !== undefined) {
      const id = await createSessionIn(focusSnapshot.root).catch(() => undefined)
      if (id !== undefined) ctx.uiWorkspace.openSession(id)
      return id
    }
    return undefined
  }

  const readDoc = async (sessionId: SessionId, path: string): Promise<string | undefined> => {
    const page = await ctx.remote.workspaceFiles.read(sessionId, path, {}, new AbortController().signal).catch(() => undefined)
    return page !== undefined && page.ok ? page.value.text : undefined
  }

  const saveDoc = async (sessionId: SessionId, path: string, content: string, base: string | null): Promise<'ok' | 'conflict' | 'error'> => {
    const response = await fetch(new URL(`api/noven-doc?session=${encodeURIComponent(sessionId)}`, document.baseURI).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionId, path, content, base }),
    }).catch(() => undefined)
    if (response === undefined) return 'error'
    if (response.status === 409) return 'conflict'
    return response.ok ? 'ok' : 'error'
  }

  const listDir = async (sessionId: SessionId, path: string): Promise<readonly { name: string; type: string }[]> => {
    const listing = await ctx.remote.workspaceFiles.list(sessionId, path, new AbortController().signal).catch(() => undefined)
    if (listing === undefined || !listing.ok) return []
    return listing.value.entries.map(entry => ({ name: entry.name, type: entry.type }))
  }

  /** interview 起手：建完卡把预设提示词排进对话，让 AI 开问。 */
  const queueInterview = (request: CreateRequest): void => {
    const thing = request.kind === 'world' ? '世界' : '角色'
    const text = `我刚建了一个${thing}「${request.name}」。先问我几个最关键的问题，帮我把想法铺开；差不多了就把答案落成这张卡的模块。`
    void (async () => {
      const sessionId = await ensureSession()
      if (sessionId === undefined) return
      await ctx.sessions.using(sessionId, { source: 'novenShell' }, async reference => {
        await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
      })
    })().catch((reason: unknown) => { console.warn('noven-shell: interview prompt failed:', reason) })
  }

  /** 新建面板提交：文稿落 文稿/ 目录；角色选了世界就长进世界卡里；世界/独立角色走 create。
      无项目态（抽屉中部新建球）下点新建本身就是立项动作：把当前会话目录注册成
      项目、以所建对象命名，再走各 kind 的落点——此后抽屉进入有项目态。 */
  const submitCreate = (request: CreateRequest): void => {
    void (async () => {
      let ensured: CardAddr = {}
      if (focusSnapshot === undefined && request.kind !== 'import') {
        const sessionId = await ensureSession()
        const cwd = sessionId === undefined ? undefined : ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
        if (cwd === undefined) return
        if ((await projectOp({ op: 'register', root: cwd, title: request.name })) === undefined) return
        projects.refresh()
        ensured = { sessionId, root: cwd }
      }
      if (request.kind === 'group') {
        // 顶层目录即分组：mkdir 后下一轮树轮询把它渲染成和「卡」平级的分组头。
        const addr: CardAddr = { ...currentCardAddr(), ...ensured }
        if (!(await treeOp(addr, { op: 'mkdir', name: request.name }))) return
        treeSource.refresh()
        return
      }
      if (request.kind === 'doc') {
        const sessionId = ensured.sessionId ?? await ensureSession()
        if (sessionId === undefined) return
        const dir = request.dir ?? '文稿'
        const path = `${dir}/${request.name}.md`
        if (await saveDoc(sessionId, path, '', null) !== 'ok') return
        canvasInstance.actions.open({ key: `doc:${path}`, kind: 'doc', title: request.name, owner: sessionId, path })
        raiseCanvas()
        treeSource.refresh()
        return
      }
      if (request.kind === 'import') return
      const addr: CardAddr = { ...currentCardAddr(), ...ensured }
      if (request.kind === 'character' && request.worldCardId !== undefined) {
        await cardOp(addr, { op: 'apply', cardId: request.worldCardId, command: { kind: 'add_character', name: request.name } })
        openCanvasCard(request.worldCardId, addr, undefined, addr.sessionId)
        treeSource.refresh()
        return
      }
      const created = await cardOp(addr, {
        op: 'create', kind: request.kind === 'world' ? 'WORLD' : 'CHARACTER', name: request.name, starter: request.starter,
      })
      treeSource.refresh()
      if (created.cardId !== undefined) openCanvasCard(created.cardId, addr, undefined, addr.sessionId)
      if (created.interview === true) queueInterview(request)
    })().catch((reason: unknown) => { console.warn('noven-shell: create failed:', reason) })
  }

  const NAV: readonly { id: MainPanelId; order: number; label: () => string; Icon: (p: { size: number; active: boolean }) => React.ReactNode }[] = [
    { id: CREATE_ID, order: 5, label: () => t('nav.create'), Icon: CreateIcon },
    { id: HOME_ID, order: 10, label: () => t('nav.home'), Icon: HomeIcon },
    { id: MESSAGES_ID, order: 30, label: () => t('nav.messages'), Icon: BellIcon },
    { id: ME_ID, order: 40, label: () => t('nav.me'), Icon: MeIcon },
  ]

  // 抽屉上区：内容树进 sidebar.right.pane.top（工作台导航的原座）。座是
  // single，原来被无头 PresentWatcher 占着——它挪去了 shell.overlay。
  ctx.slots.inject('sidebar.right.pane.top', () => ctx.slots.register({
    name: 'sidebar.right.pane.top', locale: NS,
    inject: (sessionId): TreeInjected => ({
      hooks: { tree: treeSource, project: projectFocus, projects },
      openCard: (cardId, moduleId) => openCanvasCard(cardId, { sessionId, root: focusSnapshot?.root }, moduleId, sessionId),
      addModule: cardId => openCanvasCard(cardId, { sessionId, root: focusSnapshot?.root }, undefined, sessionId, true),
      renameModule: (cardId, moduleId, name) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'rename_module', moduleId, name }))
      },
      copyModule: (cardId, moduleId) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'copy_module', moduleId }))
      },
      deleteModule: (cardId, moduleId) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'remove_module', moduleId }))
      },
      openDoc: (path, title) => {
        const kind = fileTabKind(path)
        canvasInstance.actions.open({ key: `${kind}:${path}`, kind, title, owner: sessionId, path })
        raiseCanvas()
      },
      openWork: (path, title) => {
        canvasInstance.actions.open({ key: `work:${path}`, kind: 'work', title, owner: sessionId, path })
        raiseCanvas()
      },
      openFiles: () => {
        canvasInstance.actions.open({ key: 'files', kind: 'files', title: t('tree.files'), owner: sessionId })
        raiseCanvas()
      },
      openCreate: (kind, dir) => {
        canvasInstance.actions.openDialog(sessionId, kind, dir)
        raiseCanvas()
      },
      switchProject,
      expandDrawer: () => ctx.sidebarRight.toggleExpanded(),
    }),
  }, ContentTree))

  // 画布：一个 selfChrome 页签类型，body 挂在 pane.tab 键控座下——openTab
  // 落进单元的画布浮层、顺带展开抽屉，selfChrome 跳过宿主镀铬、标签条自绘。
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: CANVAS_DEF_ID,
    kind: CANVAS_KIND,
    title: () => t('canvas.page'),
    selfChrome: true,
  }), 'noven-shell: canvas tab type')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: CANVAS_DEF_ID,
    locale: NS,
    store: canvasStore,
    inject: (sessionId): CanvasInjected => ({
      session: sessionId,
      hooks: { project: projectFocus, tree: treeSource },
      loadCard: fetchCard,
      cardOp,
      workspaceRoot: rootOf,
      readDoc,
      saveDoc,
      listDir,
      ask: async (text) => {
        await ctx.sessions.using(sessionId, { source: 'novenShell' }, async reference => {
          await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
        })
      },
      submitCreate,
      importCard,
    }),
  }, CanvasHost))

  // 产品默认布局：单元（抽屉 | 画布）贴会话左边，画布在单元的右半边。
  // 只在用户从未摆过时播种——拖过的偏好不再碰。setUnitSide 是工作区
  // 新加的 API，旧发布版上没有，可选调用。
  ctx.effect(() => {
    // 两个偏好键都是宿主在模块加载时读一次、改写时持久化：先写键保证下次
    // 启动就位，再调 API 让本次会话立即生效（旧构建缺 API 时仅下次生效）。
    if (localStorage.getItem('dsh.layout.unit-side.v1') === null) {
      localStorage.setItem('dsh.layout.unit-side.v1', 'left')
      ctx.layout.setUnitSide?.('left')
    }
    if (localStorage.getItem('dsh.rightbar.canvas-side.v1') === null) {
      localStorage.setItem('dsh.rightbar.canvas-side.v1', 'right')
      if (rightExtras.canvasSide?.get() !== 'right') rightExtras.canvasSide?.toggle()
    }
    return () => { /* 播种无清理 */ }
  }, 'noven-shell: layout defaults')

  // 会话座挂上且画布空着时开起点页——画布是工作区本体，不该等第一次点击。
  // mounted 在每次 surface 提交都解绑重绑（绑定对象携带新 surfaces 快照），
  // 且 mounted 的发射先于 canvas 的重新发布——中途读 canvas 恒为 undefined，
  // 不设每会话一次的门会把 openTab 打进无限重试。
  ctx.effect(() => {
    const seeded = new Set<SessionId>()
    return ctx.sidebarRight.mounted.subscribe(() => {
      const sessionId = ctx.sidebarRight.mounted.getSnapshot()
      if (sessionId === undefined || seeded.has(sessionId)) return
      seeded.add(sessionId)
      if (rightExtras.canvas?.getSnapshot() === undefined) raiseCanvas()
    })
  }, 'noven-shell: seed canvas')

  ctx.slots.inject('sidebar.panellist', function* () {
    for (const nav of NAV) {
      yield ctx.slots.register({
        name: 'sidebar.panellist', id: nav.id, order: nav.order, label: nav.label, locale: NS,
      }, nav.Icon)
    }
  })

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({ name: 'main', key: HOME_ID, locale: NS },
      (p: PageProps) => <Home t={p.t} />)
    yield ctx.slots.register({ name: 'main', key: CREATE_ID, locale: NS,
      inject: (): CreatePageInjected => ({
        ...face,
        hooks: { cards },
        startPrompt: startPromptSession,
        newCard,
        importCard,
        loadModels,
        pickWorkspace,
      }),
    }, (p: FacePageProps & InjectFace<CreatePageInjected>) => (
      <Create t={p.t} useWorkspaces={p.useWorkspaces} useSessions={p.useSessions}
        onStartPrompt={p.startPrompt} onNewCard={p.newCard}
        onImportCard={p.importCard} loadModels={p.loadModels} pickWorkspace={p.pickWorkspace}
        useCards={p.useCards} onOpenCard={row => { face.openCard(row.cardId, { sessionId: row.sessionId, root: row.workspaceRoot }) }} />
    ))
    yield ctx.slots.register({ name: 'main', key: MESSAGES_ID, locale: NS },
      (p: PageProps) => <Messages t={p.t} />)
    yield ctx.slots.register({ name: 'main', key: ME_ID, locale: NS, store, inject: (): MePageInjected => ({
      ...face,
      hooks: { cards, projects },
      openProject,
      // 新增项目 = 注册表 + 工作区同时出现：注册表是创作库的根，Workspace
      // 实体让侧栏立刻认出同一目录。两边任一已存在都是幂等的。
      createProject: async (title) => {
        const parent = await ctx.uiWorkspace.pickDirectory()
        if (parent === null) return
        const root = await ctx.uiWorkspace.createDirectory(parent, title)
        await projectOp({ op: 'create', root, title })
        await (ctx.get('workspaces') as IWorkspaces | undefined)?.create({ path: root }).catch(() => undefined)
        projects.refresh()
      },
      pickProject: async () => {
        const root = await ctx.uiWorkspace.pickDirectory()
        if (root === null) return
        await projectOp({ op: 'create', root })
        await (ctx.get('workspaces') as IWorkspaces | undefined)?.create({ path: root }).catch(() => undefined)
        projects.refresh()
      },
      removeProject: async (root) => {
        await projectOp({ op: 'unregister', root })
        projects.refresh()
      },
      // 项目名的权威是注册表 title：rename 写注册表（顺带刷纹身备份），再单向
      // 推到 Workspace 行；反向（侧栏改名 → 注册表）由下面的 workspaces.list 桥负责。
      renameProject: async (root, title) => {
        await projectOp({ op: 'rename', root, title })
        const ws = (ctx.get('workspaces') as IWorkspaces | undefined)?.list.getSnapshot().items.find(w => w.path === root)
        if (ws !== undefined && ws.title !== title) {
          await (ctx.get('workspaces') as IWorkspaces).rename(ws.workspaceId, title).catch(() => undefined)
        }
        projects.refresh()
      },
      newCard,
      importCard,
      setMeTab: tab => { instance.actions.setMeTab(tab) },
      exportCard: (addr, cardId, name) => exportCardPackage(addr, cardId, name),
      deleteCard: (addr, cardId) => cardOp(addr, { op: 'delete', cardId })
        .then(() => { cards.refresh() }),
      moveCard: (addr, cardId, target) => cardOp(addr, { op: 'move', cardId, targetSession: target.sessionId, targetRoot: target.root })
        .then(() => { cards.refresh() }),
    }) }, (p: PageProps & PropsStore<ReturnType<typeof createShellStore>> & InjectFace<MePageInjected>) => (
      <Me t={p.t} useCards={p.useCards} useProjects={p.useProjects} useStore={p.useStore}
        onTab={p.setMeTab} onOpenCard={p.openCard}
        onOpenPanel={p.openPanel} onOpenProject={p.openProject}
        onCreateProject={p.createProject} onPickProject={p.pickProject} onRemoveProject={p.removeProject} onRenameProject={p.renameProject}
        onNewCard={p.newCard} onImportCard={p.importCard}
        onExportCard={p.exportCard} onDeleteCard={p.deleteCard} onMoveCard={p.moveCard} />
    ))
    yield ctx.slots.register({ name: 'main', key: CARD_EDITOR_ID, locale: NS, store,
      inject: (): EditorPageInjected => ({
        loadCard: (addr, cardId) => fetchCard(addr, cardId),
        cardOp: async (addr, op) => cardOp(addr, op),
        workspaceRoot: (addr) => rootOf(addr),
        back: tab => { instance.actions.setMeTab(tab); face.openPanel(ME_ID) },
      }),
    }, (p: EditorPageProps & InjectFace<EditorPageInjected>) => (
      <CardStudio t={p.t} useStore={p.useStore} loadCard={p.loadCard} op={p.cardOp}
        workspaceRoot={p.workspaceRoot} back={p.back} />
    ))
    yield ctx.slots.register({ name: 'main', key: LIBRARY_PROJECT_ID, locale: NS, store,
      inject: (): ProjectPageInjected => ({
        hooks: { library, cards },
        op: async (addr, op, baseRevision) => {
          await libraryOp(addr, { ...op, baseRevision })
          library.refresh()
          projects.refresh()
        },
        readText: async (addr, path) => {
          if (addr.sessionId !== undefined) {
            const page = await ctx.remote.workspaceFiles.read(addr.sessionId, path, {}, new AbortController().signal).catch(() => undefined)
            return page !== undefined && page.ok ? page.value.text : ''
          }
          const response = await fetch(`/api/file?path=${encodeURIComponent(`${addr.root ?? ''}/${path}`)}`).catch(() => undefined)
          return response !== undefined && response.ok ? response.text() : ''
        },
        sessionTitle: (sessionId) => ctx.sessions.list.getSnapshot().byId[sessionId]?.displayTitle,
        openCard: face.openCard,
        back: () => { face.openPanel(ME_ID) },
      }),
    }, (p: PageProps & PropsStore<typeof handle> & InjectFace<ProjectPageInjected>) => (
      <ProjectPage t={p.t} project={p.useStore(s => s.project) ?? undefined}
        useLibrary={p.useLibrary} useCards={p.useCards} op={p.op} readText={p.readText}
        sessionTitle={p.sessionTitle} onOpenCard={p.openCard} onBack={p.back} />
    ))
  })

  // Right-rail tab types register in two stages: the type definition into
  // `sidebarRightTabs`, then the body into the `sidebar.right.pane.tab` seat
  // keyed by the definition's id. The workbench is not a tab — its
  // navigation lives in the drawer's upper zone and its canvas beside the
  // drawer, both owned by noven-workbench; 本会话's 工作台 action opens it.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: CONTEXT_DEF_ID,
    kind: CONTEXT_TAB_ID,
    title: () => t('tab.context'),
    guide: [{ id: 'context', order: 5, title: () => t('tab.context'), description: () => t('tab.context.hint'), icon: ContextTabIcon }],
  }), 'noven-shell: 本会话 type')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: LIBRARY_DEF_ID,
    kind: LIBRARY_TAB_ID,
    title: () => t('tab.library'),
    guide: [{ id: 'library', order: 12, title: () => t('tab.library'), description: () => t('tab.library.hint'), icon: LibraryTabIcon }],
  }), 'noven-shell: 创作库 type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: CONTEXT_DEF_ID, locale: NS,
    // 本会话产出 derives from the session's own durable tool results; a card
    // row opens the editor, the workbench action opens the real canvas panel.
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]) => ({
      hooks: {
        outputs: sessionOutputs(ctx.sessions, sessionId),
        binding: bindings.get(sessionId),
        cards: workspaceCards(ctx.sessions, cards, sessionId),
        foreign: foreignCards(ctx.sessions, cards, sessionId),
        project: currentProject(ctx.sessions, projects, sessionId),
      },
      bind: async (op: BindingOp) => {
        await bindingOp(sessionId, op)
        bindings.get(sessionId).refresh()
        allBindings.refresh()
      },
      openWorkbench: () => { window.dispatchEvent(new CustomEvent('noven:workbench-stage', { detail: { sessionId } })) },
      openCard: (id: string, addr?: CardAddr) => { face.openCard(id, { sessionId: addr?.sessionId ?? sessionId, root: addr?.root }) },
    }),
  }, (p: TabBodyProps & InjectFace<ContextTabInjected>) => (
    <ContextTab t={p.t} useTabInfo={p.useTabInfo} useOutputs={p.useOutputs}
      useBinding={p.useBinding} useCards={p.useCards} useForeign={p.useForeign} useProject={p.useProject} bind={p.bind}
      openWorkbench={p.openWorkbench} openCard={p.openCard} />
  ))), 'noven-shell: 本会话 body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: LIBRARY_DEF_ID, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): LibraryTabInjected => ({
      hooks: { outputs: sessionOutputs(ctx.sessions, sessionId) },
      openCard: (id: string) => { face.openCard(id, { sessionId }) },
    }),
  }, (p: TabBodyProps & InjectFace<LibraryTabInjected>) => (
    <LibraryTab t={p.t} useOutputs={p.useOutputs} openCard={p.openCard} />
  ))), 'noven-shell: 创作库 body')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: SIDECAR_DEF_ID,
    kind: SIDECAR_TAB_ID,
    title: () => t('tab.sidecar'),
    guide: [{ id: 'sidecar', order: 8, title: () => t('tab.sidecar'), description: () => t('tab.sidecar.hint'), icon: SidecarTabIcon }],
  }), 'noven-shell: 设定 type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: SIDECAR_DEF_ID, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): SidecarTabInjected => {
      let source = sidecars.get(sessionId)
      if (source === undefined) sidecars.set(sessionId, source = sidecarSource(ctx.sessions, sessionId))
      return {
        hooks: { sidecar: source },
        run: async (op: SidecarOp) => {
          await sidecarOp(sessionId, op)
          source.refresh()
        },
        send: (text: string) => source.send(text),
      }
    },
  }, (p: TabBodyProps & InjectFace<SidecarTabInjected>) => (
    <SidecarTab t={p.t} useTabInfo={p.useTabInfo} useSidecar={p.useSidecar} run={p.run} send={p.send} />
  ))), 'noven-shell: 设定 body')
  // Workspace ⋯ menu membership row: 移入 writes project.json when absent and
  // registers the root; 移出 lifts only the registry pointer — files and the
  // Workspace itself stay untouched.
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.workspace.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.workspace.menu.item', id: 'library-membership', order: 100, locale: NS,
    inject: (): WorkspaceLibraryInjected => ({
      hooks: { projects },
      setMembership: async (root, registered) => {
        await projectOp({ op: registered ? 'unregister' : 'create', root })
        projects.refresh()
      },
    }),
  }, WorkspaceLibraryItem)), 'noven-shell: workspace 创作库 row')
  // The stage's card chip raises the card editor through the shell's face —
  // the workbench plugin dispatches, the shell owns navigation.
  ctx.effect(() => {
    const onCardOpen = (event: Event): void => {
      const cardId = (event as CustomEvent<{ cardId?: string }>).detail?.cardId
      const sessionId = ctx.sidebarRight.mounted.getSnapshot() ?? ctx.sessions.list.getSnapshot().ids[0]
      if (cardId === undefined || sessionId === undefined) return
      face.openCard(cardId, { sessionId })
    }
    window.addEventListener('noven:card-open', onCardOpen)
    return () => { window.removeEventListener('noven:card-open', onCardOpen) }
  }, 'noven-shell: card-open listener')

  // 侧栏 Workspace 改名 → 注册表 title（rename 顺带写纹身备份与 project.json）。
  // 只对已注册的创作库项目生效；创作库侧的 renameProject 自己写 Workspace 行，不经这条桥。
  const workspacesSvc = ctx.get('workspaces') as IWorkspaces | undefined
  if (workspacesSvc !== undefined) ctx.effect(() => {
    const seen = new Map<string, string>()
    const sync = (): void => {
      const registered = new Set(projects.getSnapshot().map(p => p.root))
      for (const ws of workspacesSvc.list.getSnapshot().items) {
        if (!registered.has(ws.path)) continue
        const prev = seen.get(ws.path)
        seen.set(ws.path, ws.title)
        if (prev !== undefined && prev !== ws.title) {
          void projectOp({ op: 'rename', root: ws.path, title: ws.title })
            .then(() => { projects.refresh() })
            .catch((reason: unknown) => { console.warn('noven-shell: project title sync failed:', reason) })
        }
      }
    }
    const unsubscribe = workspacesSvc.list.subscribe(sync)
    sync()
    return unsubscribe
  }, 'noven-shell: workspace→project title sync')

  // The design's flat session list replaces the workspace browser (single-cell
  // shadowing: the lowest-priority live entry renders, the loser stays
  // The session/project list stays upstream WorkspaceBrowser——不盖 `sidebar.workspaces`。
  // settings.launcher 承载账户行；齿轮保留 shell 自己的 openSettings。
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher', priority: -1, locale: NS,
    inject: (): FootLauncherInjected => ({ openMy: () => { ctx.layout.selectPanel(ME_ID) } }),
  }, (p: FootLauncherProps) => <FootLauncher {...p} />))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'noven-context-chips', order: -8, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): HeaderChipsInjected => ({
      hooks: { binding: bindings.get(sessionId) },
      openContext: () => { ctx.sidebarRight.openTab(CONTEXT_TAB_ID) },
    }),
  }, (p: PropsRuntime<'conversation.session.header.actions'> & InjectFace<HeaderChipsInjected> & PropsLocale<'novenShell'>) => <HeaderChips {...p} />))

  // Card tools render compact labelled rows inside the folded process group;
  // the saved-card receipt is a Turn-level element on the turnTail list seat,
  // derived from the persisted result meta so replay reproduces it.
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const name of [...CARD_WRITE_TOOLS, ...CARD_READ_TOOLS]) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: name, locale: NS }, CardToolView)
    }
  })
  ctx.effect(() => ctx.uiConversation.events.register(cardSavedDefinition), 'noven-shell: card receipts')
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: 'noven-card-saved', order: 30, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): CardReceiptInjected => ({ openCard: (id: string) => { face.openCard(id, { sessionId }) } }),
  }, CardReceiptTail))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'noven-slash-chips', order: 10, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]) => ({ hooks: { commands: commandCatalog(ctx.remote, sessionId) } }),
  }, SlashChips))
}
