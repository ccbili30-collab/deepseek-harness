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
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
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
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightGuideBox } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NovenShellLocaleKey } from './locales.ts'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Home, fmt } from './pages/Home.tsx'
import { notifyUndo } from './ui/interact.tsx'
import { openWorkspaceFolder } from './workspace-folder.ts'
import { cardCache } from './ui/retain.ts'
import { forgetColdWhere } from './ui/cold-store.ts'
import { Me } from './pages/Me.tsx'
import { Messages } from './pages/Messages.tsx'
import { CardStudio } from './pages/CardStudio.tsx'
import { ProjectPage } from './pages/Library.tsx'
import type { ProjectRef } from './pages/Library.tsx'
import { fetchLibrary, isMiscRoot, libraryOp, miscProjectRoot, projectOp, projectsCatalog } from './library-api.ts'
import type { LibraryOp, LibraryPayload, ProjectAddr, ProjectRow } from './library-api.ts'
import { cardOp, exportCardPackage, fetchCard, fetchCardList, type CardCommand } from './card-api.ts'
import type { CardAddr, CardOp } from './card-api.ts'
import { bindingOp, fetchBinding } from './bindings-api.ts'
import type { BindingOp, BindingState } from './bindings-api.ts'
import { ContextTab } from './tabs/Context.tsx'
import { LibraryTab } from './tabs/Library.tsx'
import { SidecarTab, type SidecarMessage, type SidecarState } from './tabs/Sidecar.tsx'
import { SettingsTab } from './tabs/Settings.tsx'
import { fetchSidecar, sidecarOp, type SidecarOp } from './sidecar-api.ts'
import type { SessionEventLikeEntry, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import { HeaderChips } from './tabs/HeaderChips.tsx'
import type { HeaderChipsInjected } from './tabs/HeaderChips.tsx'
import { FootLauncher } from './sidebar.tsx'
import type { FootLauncherInjected, FootLauncherProps } from './sidebar.tsx'
import { CardReceiptTail, CardToolView, CARD_READ_TOOLS, CARD_WRITE_TOOLS, type CardReceiptInjected } from './toolviews.tsx'
import { cardSavedDefinition, savedMeta } from './card-receipt.ts'
import { BlankDock, type BlankDockInjected } from './inputdock.tsx'
import { applyQuote } from './quote.tsx'
import { applyBranches } from './branches.tsx'
import { HomeIcon, CreateIcon, BellIcon, MeIcon, glyph } from './icons.tsx'
import { showComingSoon } from './coming-soon.ts'
import { applyArrangement, type ArrangementDeps } from './arrangement.ts'
import { injectNovenStyles } from './style.ts'
import { CanvasHost, createCanvasStore, activeKey, fileTabKind, docKey, dirKey, statusKey, type CanvasInjected, type CanvasState, type DocEntry, type DirEntry, type ImportPack, type ProjectFocus, type SimRow, type TabFlags } from './canvas.tsx'
import { ContentTree, type TreeInjected } from './tree.tsx'
import type { TranscriptMsg, TranscriptState } from './stage-phone.tsx'
import { foldConvEntries, type ConvChannel, type ConvEntry, type ConvMsg, type ConvsMap } from './conv.tsx'
import type { CreateRequest } from './creation.tsx'
import { bindTreeColdCache, novenTreeSource, treeOp, fileOp, presentNode, importAnalyze, importCommit } from './tree-api.ts'
import { readCachedTree, writeCachedTree, forgetCachedTree } from './tree-cache.ts'
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
export const SETTINGS_TAB_ID = 'noven:session-settings'
const CONTEXT_DEF_ID = 'noven-shell.context'
const LIBRARY_DEF_ID = 'noven-shell.library'
const SIDECAR_DEF_ID = 'noven-shell.sidecar'
const SETTINGS_DEF_ID = 'noven-shell.session-settings'
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

/** 会话设置页签注入：侧车实况只用于自动整理开关；设置走会话文档温层。 */
export interface SettingsTabInjected {
  readonly sessionId: SessionId
  readonly hooks: {
    readonly sidecar: ObservableSnapshot<SidecarState>
    readonly docs: ObservableSnapshot<Readonly<Record<string, DocEntry>>>
  }
  readonly run: (op: SidecarOp) => Promise<void>
  readonly ensureDoc: CanvasInjected['ensureDoc']
  readonly saveDoc: CanvasInjected['saveDoc']
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

/** Host directory opener supplied to the workspace menu. */
interface WorkspaceFolderInjected {
  readonly openFolder: (path: string) => Promise<void>
}

/** Opens the workspace root without selecting its conversation. */
function WorkspaceFolderItem({ path, useMenuOpenState, openFolder, t }: WorkspaceMenuItemProps & InjectFace<WorkspaceFolderInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  if (path === undefined || path.trim() === '') return null
  return (
    <MenuItemButton icon={glyph.folder(16)} onSelect={() => {
      setMenuOpen(false)
      void openFolder(path)
    }}>
      {t('workspace.openFolder')}
    </MenuItemButton>
  )
}

/** Workspace ⋯ menu row: 移入创作库 while the root is unregistered, 移出创作库 once it is. */
function WorkspaceLibraryItem({ path, useMenuOpenState, useProjects, setMembership, t }: WorkspaceMenuItemProps & InjectFace<WorkspaceLibraryInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const row = useProjects(rows => path !== undefined ? rows.find(r => r.root === path) : undefined)
  const registered = row !== undefined
  // 杂项项目：没有「移出创作库」；只在它意外失登（迁移前的状态）时允许补登。
  if (path === undefined || (isMiscRoot(path) && registered)) return null
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

type SessionMenuItemProps = PropsRuntime<'sidebar.workspaces.session.menu.item'> & PropsLocale<'novenShell'>

/** 会话行 ⋯ 菜单末行：复制内部会话 id，供调试与「贴给模型认领」用。 */
function CopySessionIdItem({ sessionId, useMenuOpenState, t }: SessionMenuItemProps) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={glyph.copy(16)}
      onSelect={() => {
        setMenuOpen(false)
        void navigator.clipboard.writeText(sessionId)
      }}
    >
      {t('session.copyId')}
    </MenuItemButton>
  )
}

/**
 * 会话 ⋯ 菜单的追加行座——槽位由 session-log-export 的 ⋯ 条目声明；noven-shell
 * 编译吃的是发布版 rc 类型（早于这个键），这里镜像一份同款合并。
 */
type HeaderMoreMenuOpenState = readonly [open: boolean, setOpen: (open: boolean) => void]
type UseHeaderMoreMenuOpenState = () => HeaderMoreMenuOpenState

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.session.header.more.item': {
      kind: 'list'
      scope: 'session'
      hookContext: HeaderMoreMenuOpenState
      inject: { hooks: {
        menuOpenState: SlotHookFactory<'conversation.session.header.more.item', UseHeaderMoreMenuOpenState>
      } }
    }
  }
}

/** ⋯ 功能行的注入面：右栏 guide 清单 + 开页签动作。 */
interface FeatureMenuInjected {
  readonly hooks: { readonly guide: ObservableSnapshot<readonly SidebarRightGuideBox[]> }
  readonly openTab: (kind: string) => void
}

type FeatureMenuProps =
  PropsRuntime<'conversation.session.header.more.item'> & PropsLocale<'novenShell'> & InjectFace<FeatureMenuInjected>

/** ⋯ 菜单尾段：右栏 guide 登记的全部功能入口（本会话/设定/文件/创作库…）。 */
function FeatureMenuItems({ useGuide, useMenuOpenState, openTab }: FeatureMenuProps) {
  const [, setMenuOpen] = useMenuOpenState()
  const boxes = useGuide(s => s)
  return (
    <>
      {boxes.map((box, index) => {
        const Icon = box.icon
        return (
          <MenuItemButton key={`${box.providerId}:${box.id}`} separatorBefore={index === 0}
            icon={Icon === undefined ? undefined : <Icon size={16} />}
            onSelect={() => { setMenuOpen(false); openTab(box.kind) }}>
            {box.title()}
          </MenuItemButton>
        )
      })}
    </>
  )
}

/** Guide-picker glyphs for the rail tabs. */
function ContextTabIcon({ size }: { size?: number }) { return glyph.chat(size ?? 16) }
function LibraryTabIcon({ size }: { size?: number }) { return glyph.book(size ?? 16) }
function SidecarTabIcon({ size }: { size?: number }) { return glyph.sparkle(size ?? 16) }
function SettingsTabIcon({ size }: { size?: number }) { return glyph.gear(size ?? 16) }

/** Required browser services: slots, panel selection, theme, copy, right rail, session navigation, command and skill catalogs. */
export const inject = ['slots', 'locale', 'layout', 'theme', 'sidebarPanels', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'uiWorkspace', 'uiSession', 'remote', 'remote.commands', 'remote.session', 'remote.skills', 'remote.workspaceFiles', 'sessions', 'workspaces']

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

/** Fold the session's event window into the phone-replica transcript; only human user text and assistant text land. */
function transcriptSource(sessions: ClientContext['sessions'], sessionId: SessionId): ObservableSnapshot<TranscriptState> {
  let snapshot: TranscriptState = { messages: [], busy: false }
  const listeners = new Set<() => void>()
  let started = false
  let ref: SessionReference | undefined
  let disposeFeed: (() => void) | undefined
  let disposeRetry: (() => void) | undefined
  const textOf = (content: readonly { type: string; text?: string }[]): string =>
    content.filter(b => b.type === 'text' && b.text !== undefined).map(b => b.text!).join('\n').trim()
  const compute = () => {
    const binding = sessions.binding(sessionId)
    if (binding === undefined) return
    const messages: TranscriptMsg[] = []
    let busy = false
    for (const entry of binding.eventSource.getSnapshot().entries) {
      if (entry.type !== 'event') continue
      const ev = entry.event
      if (ev.type === 'user/message') {
        const kind: string = ev.data.source.kind
        if (kind !== 'user') continue
        const text = textOf(ev.data.content)
        if (text.length > 0) messages.push({ key: `u${ev.seq}`, role: 'user', text, seq: ev.seq })
      } else if (ev.type === 'assistant/message') {
        const text = textOf(ev.data.message.content)
        if (text.length > 0) messages.push({ key: `a${ev.seq}`, role: 'assistant', text, seq: ev.seq, turnId: String(ev.data.turn) })
      } else if (ev.type === 'turn/start') {
        busy = true
      } else if (ev.type === 'turn/end') {
        busy = false
      }
    }
    if (busy === snapshot.busy && messages.length === snapshot.messages.length
      && messages.every((m, i) => m === snapshot.messages[i])) return
    snapshot = { messages, busy }
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) {
        started = true
        const tryBind = (): void => {
          if (disposeFeed !== undefined) return
          // 订阅方自己持引用——binding() 只借不续命；没人 retain 的会话（如
          // 模拟器会话）绑定会被回收，事件流冻结在上次快照。
          try { ref = sessions.retain(sessionId, { source: 'novenShell' }) }
          catch (retainErr) { void retainErr; return }
          disposeFeed = ref.binding.eventSource.subscribe(compute)
          compute()
        }
        tryBind()
        // 绑定可能晚到（会话还在挂）——会话列表一动就重试一次。
        disposeRetry = sessions.list.subscribe(tryBind)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          disposeFeed?.(); disposeFeed = undefined
          disposeRetry?.(); disposeRetry = undefined
          ref?.release(); ref = undefined
          started = false
        }
      }
    },
  }
}

/**
 * 按键温层：条目快照跨退订保留——页重挂先渲缓存、后台补齐，不闪空。
 * 各源（doc/dir/转录）共用的最薄一层 Map 语义。
 */
function keyedCache<T>(): {
  readonly snapshot: ObservableSnapshot<Readonly<Record<string, T>>>
  readonly get: (key: string) => T | undefined
  readonly put: (key: string, value: T) => void
} {
  let state: Readonly<Record<string, T>> = {}
  const listeners = new Set<() => void>()
  return {
    snapshot: {
      getSnapshot: () => state,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    get: key => state[key],
    put: (key, value) => {
      if (state[key] === value) return
      state = { ...state, [key]: value }
      for (const listener of listeners) listener()
    },
  }
}

const SIM_TITLE_PREFIX = '模-'

/** 模拟器源只需读侧——画布 store 实例的 getSnapshot/subscribe 切片。 */
type CanvasStoreView = Pick<SnapshotStore<CanvasState>, 'getSnapshot' | 'subscribe'>

/**
 * 项目根（owner 会话 cwd）下的会话清单：排除 subagent 派生行与工作区
 * 归档集（与侧边会话列表同口径——归档的会话在模拟器里也不该出现）；
 * sim 态 = 模- 前缀 ∪ 画布 store 的 pick 集——改名丢前缀不掉出模拟列，
 * pick 是兜底。
 */
function simSessionsSource(sessions: ClientContext['sessions'], workspaces: IWorkspaces | undefined, canvas: CanvasStoreView, sessionId: SessionId): ObservableSnapshot<readonly SimRow[]> {
  let snapshot: readonly SimRow[] = []
  const listeners = new Set<() => void>()
  const compute = (): void => {
    const root = sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (root === undefined) { if (snapshot.length !== 0) { snapshot = []; for (const l of listeners) l() } return }
    const wsSnap = workspaces?.list.getSnapshot()
    const archived = new Set<string>(wsSnap?.archivedSessionIds ?? [])
    // 与侧栏同口径：根已登记 workspace 时按成员表，未登记时退回 cwd 匹配。
    const ws = wsSnap?.items.find(item => item.path === root)
    const members = ws === undefined ? undefined : new Set<string>(ws.sessionIds)
    const picked = new Set<string>(canvas.getSnapshot().simPick[root] ?? [])
    const rows: SimRow[] = []
    for (const id of sessions.list.getSnapshot().ids) {
      const row = sessions.list.getSnapshot().byId[id]
      if (row === undefined || row.origin === 'subagent' || archived.has(id)) continue
      if (members === undefined ? row.cwd !== root : !members.has(id)) continue
      const sim = picked.has(id) || (row.title ?? '').startsWith(SIM_TITLE_PREFIX)
      // 侧栏的空白行只保留当前会话；模拟行（含刚建的空白行）不受限。
      if (row.blank && !sim && id !== sessionId) continue
      rows.push({ id, title: row.displayTitle, running: row.running, sim })
    }
    if (rows.length === snapshot.length && rows.every((r, i) => {
      const prev = snapshot[i]
      return prev !== undefined && r.id === prev.id && r.title === prev.title && r.running === prev.running && r.sim === prev.sim
    })) return
    snapshot = rows
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        compute()
        const offA = sessions.list.subscribe(compute)
        const offB = canvas.subscribe(compute)
        const offC = workspaces?.list.subscribe(compute)
        return () => { listeners.delete(listener); if (listeners.size === 0) { offA(); offB(); offC?.() } }
      }
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * 模拟器转录：跟随 simOpen[root] 切换目标会话——内层 transcriptSource 按
 * 会话缓存，切走不断订、切回不重折；未选中或会话消失时回退空快照。
 */
/**
 * conv 页温层：每条侧会话一份折叠态。ensure 绑定事件源（首绑才 retain +
 * 订阅，重复调用只刷新 channel）；send 按通道路由——sidechat 侧线必须走
 * 它自己的 prompt 路由（首条携带边界注入），其余 fork 会话走 session.prompt。
 */
function convsSource(sessions: ClientContext['sessions']) {
  interface Bound {
    channel: ConvChannel
    readonly ref: ReturnType<ClientContext['sessions']['retain']>
    seen: number
    seeded: boolean
    messages: ConvMsg[]
    busy: boolean
    error?: string
    dispose?: () => void
  }
  let snapshot: ConvsMap = {}
  const listeners = new Set<() => void>()
  const bound = new Map<SessionId, Bound>()
  const publish = (): void => {
    const next: Record<string, ConvEntry> = {}
    for (const [id, b] of bound) next[id] = { ready: true, busy: b.busy, error: b.error, messages: b.messages }
    snapshot = next
    for (const listener of listeners) listener()
  }
  const ensure = (id: SessionId, channel: ConvChannel): void => {
    const existing = bound.get(id)
    if (existing !== undefined) { existing.channel = channel; return }
    // 侧线多为 fork 出的子会话——subagentAddress 才是历史路由认的地址（agent-busy 坑，挂窗同款）。
    const ref = sessions.retain(sessions.subagentAddress(id) ?? id, { source: 'novenShell' })
    const b: Bound = { channel, ref, seen: 0, seeded: false, messages: [], busy: false }
    bound.set(id, b)
    const feed = ref.binding.eventSource
    const fold = (): void => {
      const entries = feed.getSnapshot().entries
      // 事件源重建投影换整根数组——游标越界就从头重放，不丢渲染。
      if (entries.length < b.seen) { b.seen = 0; b.messages = []; b.seeded = false }
      const result = foldConvEntries(entries.slice(b.seen), b)
      b.messages = result.messages; b.busy = result.busy; b.seeded = result.seeded
      b.seen = entries.length
      publish()
    }
    fold()
    b.dispose = feed.subscribe(fold)
  }
  const send = (id: SessionId, text: string): void => {
    const b = bound.get(id)
    const fail = (message: string): void => {
      if (b !== undefined) { b.error = message; publish() }
      else console.warn(`noven-shell: conv send failed: ${message}`)
    }
    if (b?.channel === 'sidechat') {
      void fetch('/sidebar/api/sidechat.prompt', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ childId: id, text }),
      })
        .then(async res => {
          const parsed = await res.json().catch(() => null) as { ok?: boolean } | null
          if (!res.ok || parsed?.ok !== true) fail(`send failed (${res.status})`)
        })
        .catch((error: unknown) => fail(error instanceof Error ? error.message : 'send failed'))
      return
    }
    void sessions.using(sessions.subagentAddress(id) ?? id, { source: 'novenShell' }, async reference => {
      const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) fail(result.error.message)
    }).catch((error: unknown) => fail(error instanceof Error ? error.message : 'send failed'))
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    ensure,
    send,
  }
}

function simTranscriptSource(sessions: ClientContext['sessions'], canvas: CanvasStoreView, sessionId: SessionId): ObservableSnapshot<TranscriptState> {
  const EMPTY: TranscriptState = { messages: [], busy: false }
  const cache = new Map<SessionId, ObservableSnapshot<TranscriptState>>()
  let snapshot: TranscriptState = EMPTY
  const listeners = new Set<() => void>()
  let innerDispose: (() => void) | undefined
  let innerId: SessionId | undefined
  const target = (): SessionId | undefined => {
    const root = sessions.list.getSnapshot().byId[sessionId]?.cwd
    return root === undefined ? undefined : canvas.getSnapshot().simOpen[root]
  }
  const publish = (): void => {
    const next = innerId === undefined ? EMPTY : cache.get(innerId)?.getSnapshot() ?? EMPTY
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const rebind = (): void => {
    const id = target()
    if (id === innerId) return
    innerId = id
    innerDispose?.()
    innerDispose = undefined
    if (id !== undefined) {
      let source = cache.get(id)
      if (source === undefined) { source = transcriptSource(sessions, id); cache.set(id, source) }
      innerDispose = source.subscribe(publish)
    }
    publish()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        rebind()
        const offA = sessions.list.subscribe(rebind)
        const offB = canvas.subscribe(rebind)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) { offA(); offB(); innerDispose?.(); innerDispose = undefined; innerId = undefined }
        }
      }
      return () => { listeners.delete(listener) }
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
      if (feed.getSnapshot().change.kind === 'replace') { messages = []; busy = false; seen = 0 }
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
  // 杂项项目是永久兜底（设计理念 §15）：启动幂等确保目录 + 注册表 + 上游工作区都有它。
  void (async () => {
    const misc = miscProjectRoot()
    const row = await projectOp({ op: 'register', root: misc, title: '杂项' }).catch(() => undefined)
    if (row === undefined) return
    await (ctx.get('workspaces') as IWorkspaces | undefined)?.create({ path: misc }).catch(() => undefined)
  })()

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
      const current = ctx.layout.panelInfo.getSnapshot().activePanelId
      try {
        ctx.layout.selectPanel(id)
        panelTrail.push(current)
        if (panelTrail.length > 8) panelTrail.shift()
      } catch { /* panel not registered */ }
    },
  }
  /** 面板轨迹：openPanel 入栈来路，页面「返回」弹栈还原（树→创作库即回画布）。 */
  const panelTrail: (MainPanelId | null)[] = []
  const backPanel = (): void => {
    const target = panelTrail.pop() ?? ME_ID
    capturePanelGhost()
    try { ctx.layout.selectPanel(target) } catch { /* panel not registered */ }
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
      // 未指定项目：复用最近会话；连会话都没有时落杂项，绝不留无 cwd 的卡（设计理念 §15）。
      const target = recentSession()
      if (target !== undefined) return { sessionId: target.id, root: target.cwd || miscProjectRoot() }
      const misc = miscProjectRoot()
      const id = await createSessionIn(misc)
      return { sessionId: id, root: misc }
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

  /** 导入暂态：analyze 出的包等用户选落点（单卡直通道不经过这里）。 */
  let importPackValue: ImportPack | undefined
  let pendingImportFile: File | undefined
  const importPackListeners = new Set<() => void>()
  const importPackSnap: ObservableSnapshot<ImportPack | undefined> = {
    getSnapshot: () => importPackValue,
    subscribe: listener => { importPackListeners.add(listener); return () => { importPackListeners.delete(listener) } },
  }
  const setImportPack = (pack: ImportPack | undefined): void => {
    if (pack === importPackValue) return
    importPackValue = pack
    for (const listener of importPackListeners) listener()
  }

  const fileBase64 = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const chunk of bytes) binary += String.fromCharCode(chunk)
    return btoa(binary)
  }

  /** 导入（设计 §5）：先 analyze 只拆报不消化——单卡走活卡直通道；
      包/散件进暂态，对话框选落点后 commit 如实落位。 */
  const importCard = (file: File, workspaceId?: WorkspaceId): void => {
    void (async () => {
      const encoded = await fileBase64(file)
      const target = await cardSessionFor(workspaceId)
      const addr = target.sessionId !== undefined ? { sessionId: target.sessionId } : { root: target.root }
      const report = await importAnalyze(addr, file.name, encoded)
      if (report === undefined) { console.warn('noven-shell: import analyze failed:', file.name); return }
      if (report.kind === 'single') {
        const res = await importCommit(addr, file.name, encoded, '卡')
        cards.refresh()
        treeSource.refresh()
        const cardId = res?.landed.find(l => l.type === 'card')?.cardId
        if (cardId !== undefined) face.openCard(cardId, target)
        return
      }
      pendingImportFile = file
      pendingImportAddr = addr
      setImportPack({ name: file.name, report })
    })().catch((reason: unknown) => { console.warn('noven-shell: card import failed:', reason) })
  }

  let pendingImportAddr: CardAddr = {}

  /** 导入对话框提交：按落点落位，成功即清暂态并刷新树/卡库。 */
  const commitImport = async (target: string): Promise<boolean> => {
    const file = pendingImportFile
    if (file === undefined || importPackValue === undefined) return false
    const res = await importCommit(pendingImportAddr, file.name, await fileBase64(file), target)
    if (res === undefined) return false
    pendingImportFile = undefined
    setImportPack(undefined)
    cards.refresh()
    treeSource.refresh()
    return true
  }

  /** 导入对话框取消：丢掉暂态，文件不落位。 */
  const cancelImport = (): void => {
    pendingImportFile = undefined
    setImportPack(undefined)
  }

  /** 组装排布种子的写入口；发布版布局未带的新方法按可选口径跳过（旧构建只缺新种子能力，不报错）。 */
  const arrangementDeps = (): ArrangementDeps => ({
    seedSessionGeometry: (sessionId, seed) => { ctx.layout.seedSessionGeometry?.(sessionId, seed) },
    seedUnitShare: share => { ctx.layout.seedUnitShare?.(share) },
  })

  /**
   * 创作 = 打开一条空白会话：所选会话在工作区里有可复用的空白会话就复用，
   * 没有才新建（connectWorkspace 的语义）。只落 agent 种子，不发任何消息——
   * 用户看到的就是新会话页本身，输入框、模式、模型都是会话自己的。
   */
  const openCreation = (): void => {
    const workspaces = ctx.workspaces.list.getSnapshot()
    const current = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    const recent = recentSession()
    const target = (current === undefined ? undefined : workspaces.items.find(w => w.sessionIds.includes(current)))
      ?? (recent === undefined ? undefined : workspaces.items.find(w => w.path === recent.cwd))
      ?? workspaces.items[0]
    if (target === undefined) {
      // 还没有任何工作区：交给上游新会话流（它会落到选目录的空态）。
      ctx.uiWorkspace.startSession()
      return
    }
    void ctx.uiWorkspace.openWorkspace(target.workspaceId, sessionId => {
      applyArrangement(arrangementDeps(), sessionId, 'agent')
      // agent 排布：画布停靠让出宽度。beforeOpen 在会话提交前跑，停靠在挂载后补一次也幂等。
      window.setTimeout(() => { setCanvasParked(sessionId, true) }, 0)
    }).catch((reason: unknown) => { console.warn('noven-shell: open creation failed:', reason) })
  }

  /**
   * 停靠/抬起一个会话的画布区域。停靠只保留画布轨，对话占回完整宽度；
   * 抬起走 openTab（openContent 恒 lift park）。停靠走控制器的正口
   * parkCanvasIn，按会话的采纳 store 路由，不经过当前绑定；工作区运行时
   * 已有、发布版类型未带，按可选视图调用（slots.d.ts 桥记录同一成员）。
   */
  const parkCanvasIn = (sessionId: SessionId): void => {
    ;(ctx.sidebarRight as { parkCanvasIn?: (id: SessionId) => void }).parkCanvasIn?.(sessionId)
  }
  const setCanvasParked = (sessionId: SessionId, parked: boolean): void => {
    if (parked) {
      parkCanvasIn(sessionId)
      return
    }
    raiseCanvas()
  }

  /**
   * 手作 = 同一条会话换成 IDE 排布：导航收轨、抽屉+画布展开、对话退到副窗。
   * 会话、草稿、输入框都不换；动效就是栏位的真实移动（AppFrame 的列缓动）。
   * @param sessionId - 当前可见的会话。
   */
  const enterHandcraft = (sessionId: SessionId): void => {
    applyArrangement(arrangementDeps(), sessionId, 'ide')
    setCanvasParked(sessionId, false)
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
    // 滞回：绑定会话还在、只是 cwd/登记行瞬时空白时不清焦点——否则内容树被
    // publish(undefined) 清成「新建」空态，下一拍又回来，肉眼就是导航抽搐。
    // 会话行消失或 cwd 真换到别的根时照常落空（C6）。
    if (next === undefined && focusSnapshot !== undefined && key !== undefined && key === focusSnapshot.sessionId) {
      const row = ctx.sessions.list.getSnapshot().byId[key]
      if (row !== undefined && (row.cwd === undefined || row.cwd === focusSnapshot.root)) return
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
  bindTreeColdCache({
    read: root => readCachedTree(root),
    write: (root, tree) => { writeCachedTree(root, tree) },
  })
  const treeSource = novenTreeSource(() => {
    const focus = focusSnapshot
    if (focus === undefined) return undefined
    return focus.sessionId !== undefined ? { sessionId: focus.sessionId, scope: focus.root } : { root: focus.root, scope: focus.root }
  })

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
  const openCanvasCard = (cardId: string, addr: CardAddr, moduleId: string | undefined, owner: SessionId | undefined, addModule = false, title = ''): void => {
    const session = owner ?? (ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined) ?? addr.sessionId ?? recentSession()?.id
    if (session === undefined) return
    canvasInstance.actions.open({
      key: moduleId === undefined ? `card:${cardId}` : `mod:${cardId}:${moduleId}`,
      kind: 'card', title, owner: session, cardId,
      cardAddr: { root: rootOf(addr) }, moduleId, ...(addModule ? { addModule: true } : {}) })
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

  /** 模块子树里按 id 找名字（删除回执文案用）。 */
  const findTreeName = (modules: readonly { readonly id: string; readonly name: string; readonly children: readonly unknown[] }[], id: string): string | undefined => {
    for (const module of modules) {
      if (module.id === id) return module.name
      const hit = findTreeName(module.children as typeof modules, id)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  /**
   * 卡片软删除 + 撤销回执：删除后关掉本会话里该卡的全部页签、刷新树与卡目录；
   * 回执的「撤销」走 restore op 把墓碑移走。
   */
  const deleteCardWithUndo = (addr: CardAddr, cardId: string, name: string, owner: SessionId): void => {
    void cardOp(addr, { op: 'delete', cardId })
      .then(() => {
        cardCache.put(addr, cardId, undefined)
        for (const row of canvasInstance.getSnapshot().tabs) {
          if (row.cardId === cardId && row.owner === owner) canvasInstance.actions.close(owner, row.key)
        }
        treeSource.refresh()
        notifyUndo({
          text: fmt(t, 'ui.receipt.cardDeleted', { name }),
          undoLabel: t('ui.undo'),
          undo: () => {
            void cardOp(addr, { op: 'restore', cardId }).then(() => { treeSource.refresh() })
              .catch((reason: unknown) => { console.warn('noven-shell: card restore failed:', reason) })
          },
        })
      })
      .catch((reason: unknown) => {
        console.warn('noven-shell: delete card failed:', reason)
        notifyUndo({ text: fmt(t, 'ui.receipt.failed', { name }) })
      })
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
    // 没有任何项目时，新会话落进杂项（设计理念 §15），不再留下无 cwd 的会话。
    const id = await createSessionIn(miscProjectRoot()).catch(() => undefined)
    if (id !== undefined) ctx.uiWorkspace.openSession(id)
    return id
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
    // 服务端拒收空路径——根目录用 "." 表达。
    const listing = await ctx.remote.workspaceFiles.list(sessionId, path === '' ? '.' : path, new AbortController().signal).catch(() => undefined)
    if (listing === undefined || !listing.ok) return []
    return listing.value.entries.map(entry => ({ name: entry.name, type: entry.type }))
  }

  // 温层：文档与目录清单按 `会话|路径` 键缓存，快照跨页签挂载保留。
  // 写穿透在注入的 saveDoc 上；AI/外部工具直写盘的更新暂未失效（留待文件监听）。
  const docCache = keyedCache<DocEntry>()
  const dirCache = keyedCache<DirEntry>()
  // 页签状态点表：页体上报的实体态镜像（瞬态，不随画布持久）。
  const statusCache = keyedCache<TabFlags>()
  // conv 页温层：侧会话折叠态按会话 id 索引，页签/浮窗渲染才 ensure。
  const convs = convsSource(ctx.sessions)
  const statusSet = (owner: SessionId, tabKey: string, flag: keyof TabFlags, on: boolean): void => {
    const key = statusKey(owner, tabKey)
    statusCache.put(key, { ...(statusCache.get(key) ?? {}), [flag]: on })
  }

  const ensureDoc = (sessionId: SessionId, path: string): void => {
    const key = docKey(sessionId, path)
    if (docCache.get(key) !== undefined) return
    docCache.put(key, { state: 'loading' })
    void readDoc(sessionId, path).then(content => {
      docCache.put(key, content === undefined ? { state: 'missing' } : { state: 'ready', content })
    })
  }

  /** 强制重拉：保留旧快照到响应到达——重挂中的岛/预览不闪空。 */
  const refreshDoc = (sessionId: SessionId, path: string): void => {
    const key = docKey(sessionId, path)
    void readDoc(sessionId, path).then(content => {
      docCache.put(key, content === undefined ? { state: 'missing' } : { state: 'ready', content })
    })
  }

  const ensureDir = (sessionId: SessionId, path: string): void => {
    const key = dirKey(sessionId, path)
    if (dirCache.get(key) !== undefined) return
    dirCache.put(key, { state: 'loading', entries: [] })
    void listDir(sessionId, path).then(entries => {
      dirCache.put(key, { state: 'ready', entries })
    })
  }

  /** 目录版强制重拉：旧清单留到响应到达（文件列表挂回时用——目录成员可能已变）。 */
  const refreshDir = (sessionId: SessionId, path: string): void => {
    const key = dirKey(sessionId, path)
    void listDir(sessionId, path).then(entries => {
      dirCache.put(key, { state: 'ready', entries })
    })
  }

  /** 建一条「模-」模拟会话：真实 session + rename + pick + open（树 Studio 组与模拟器列表共用）。 */
  const createSimSession = async (root: string | undefined): Promise<SessionId | undefined> => {
    const created = await createSessionIn(root)
    const summary = ctx.sessions.list.getSnapshot().byId[created]
    const base = summary?.displayTitle ?? `会话 ${Date.now() % 10000}`
    const res = await ctx.remote.session.rename({ sessionId: created, title: `${SIM_TITLE_PREFIX}${base}` })
    if (!res.ok) return created
    if (root !== undefined) {
      canvasInstance.actions.simOpenSet(root, created)
      canvasInstance.actions.simPickToggle(root, created)
    }
    return created
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
        // 无项目态不再立项：新东西一律落杂项项目（设计理念 §15）；真正的立项走「新建项目」。
        const misc = miscProjectRoot()
        const sessionId = await ensureSession()
        if (sessionId === undefined) return
        if (ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd !== misc) {
          const id = await createSessionIn(misc).catch(() => undefined)
          if (id === undefined) return
          ctx.uiWorkspace.openSession(id)
          ensured = { sessionId: id, root: misc }
        } else {
          ensured = { sessionId, root: misc }
        }
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
      if (request.kind === 'comic') {
        const sessionId = ensured.sessionId ?? await ensureSession()
        if (sessionId === undefined) return
        const path = `漫画/${request.name}.html`
        const scaffold = `<!doctype html>\n<html lang="zh">\n<head><meta charset="utf-8"><title>${request.name}</title></head>\n<body>\n</body>\n</html>\n`
        if (await saveDoc(sessionId, path, scaffold, null) !== 'ok') return
        docCache.put(docKey(sessionId, path), { state: 'ready', content: scaffold })
        canvasInstance.actions.open({ key: `work:${path}`, kind: 'work', title: request.name, owner: sessionId, path })
        raiseCanvas()
        treeSource.refresh()
        return
      }
      // card/studio 在对话框/入口侧已分流；import 走文件选择器——面板提交不该携带。
      if (request.kind === 'import' || request.kind === 'card' || request.kind === 'studio') return
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

  /**
   * 社区与消息尚未接入：行灰置可见，点击不切面板，只抖一下 + 居中「敬请期待」
   * （showComingSoon）。它们仍是合法 main key（未来直接接回），此处仅拦截导航。
   */
  const sidebarPanels = ctx.get('sidebarPanels') as {
    registerActivation(id: MainPanelId, activate: (target: HTMLElement) => void): () => void
  }
  const SOON_IDS: ReadonlySet<MainPanelId> = new Set([HOME_ID, MESSAGES_ID])
  for (const id of SOON_IDS) {
    ctx.effect(() => sidebarPanels.registerActivation(id, target => {
      showComingSoon(target, t('nav.comingSoon'))
    }), `noven-shell: unavailable panel ${id}`)
  }
  // 「创作」行不再是一个面板：它就是「新会话」——打开工作区的空白会话。
  // 行没有选中态（从不 selectPanel），因此停在任何会话上都可以再点。
  ctx.effect(() => sidebarPanels.registerActivation(CREATE_ID, () => { openCreation() }),
    'noven-shell: creation opens a blank session')
  const NAV: readonly { id: MainPanelId; order: number; label: () => string; Icon: (p: { size: number; active: boolean }) => React.ReactNode }[] = [
    { id: CREATE_ID, order: 5, label: () => t('nav.create'), Icon: CreateIcon },
    { id: HOME_ID, order: 10, label: () => t('nav.home'), Icon: HomeIcon },
    { id: MESSAGES_ID, order: 30, label: () => t('nav.messages'), Icon: BellIcon },
    { id: ME_ID, order: 40, label: () => t('nav.me'), Icon: MeIcon },
  ]

  // 挂窗/底部面板的宿主服务都是可选的：插件缺席时工具菜单对应行不出。
  // 挂窗服务只剩配对查询/开配对——窗本体是画布的 conv 浮窗（同一页实体）。
  const dockApi = ctx.get('novenDock') as {
    readonly ensureDock?: (main: SessionId) => Promise<SessionId | undefined>
    readonly dockIdOf?: (main: SessionId) => Promise<SessionId | undefined>
  } | undefined
  const betterSidebar = ctx.get('betterSidebar') as {
    openTab?: (seed: { type: string }) => void
    getSnapshot?: () => { readonly state?: { readonly bottomOpen?: boolean } }
    subscribeState?: (listener: () => void) => () => void
  } | undefined
  /** 缺席服务的常量 false 快照：工具菜单行读它的勾选态。 */
  const offSnapshot: ObservableSnapshot<boolean> = { getSnapshot: () => false, subscribe: () => () => {} }
  const bottomOpenSnap: ObservableSnapshot<boolean> =
    betterSidebar?.getSnapshot === undefined || betterSidebar.subscribeState === undefined ? offSnapshot : {
      getSnapshot: () => betterSidebar.getSnapshot?.().state?.bottomOpen === true,
      subscribe: (listener: () => void) => betterSidebar.subscribeState?.(listener) ?? (() => {}),
    }
  /** Studio 组存续态：按项目根读画布 store（persist 整棵替换，老快照可能还没有 studioOn——`?.` 守卫）。 */
  const studioOnSnap: ObservableSnapshot<boolean> = {
    getSnapshot: () => focusSnapshot !== undefined && canvasInstance.getSnapshot().studioOn?.[focusSnapshot.root] === true,
    subscribe: listener => {
      const a = canvasInstance.subscribe(listener)
      const b = projectFocus.subscribe(listener)
      return () => { a(); b() }
    },
  }

  // 抽屉上区：内容树进 sidebar.right.pane.top（工作台导航的原座）。座是
  // single，原来被无头 PresentWatcher 占着——它挪去了 shell.overlay。
  ctx.slots.inject('sidebar.right.pane.top', () => ctx.slots.register({
    name: 'sidebar.right.pane.top', locale: NS,
    inject: (sessionId): TreeInjected => {
      /** Studio 新建入口：建一条 模- 会话并把本会话画布切到手机屏。 */
      const createSim = (): void => {
        const root = focusSnapshot?.root
        void createSimSession(root)
          .then(id => { if (id !== undefined) { canvasInstance.actions.select(sessionId, 'chat'); raiseCanvas() } })
          .catch((reason: unknown) => { console.warn('noven-shell: sim create failed:', reason) })
      }
      /** 「新建 → Studio」：翻转 Studio 组存续态；开启时把画布切回会话页签（手机屏在其中）。 */
      const toggleStudio = (): void => {
        const root = focusSnapshot?.root
        if (root === undefined) return
        const on = canvasInstance.getSnapshot().studioOn?.[root] === true
        canvasInstance.actions.studioSet(root, !on)
        if (!on) { canvasInstance.actions.select(sessionId, 'chat'); raiseCanvas() }
      }
      /** 本会话画布焦点叶的当前页签 key——树行点亮"当前页"用。 */
      const activeTabSnap: ObservableSnapshot<string | undefined> = {
        getSnapshot: () => activeKey(canvasInstance.getSnapshot(), sessionId),
        subscribe: listener => canvasInstance.subscribe(listener),
      }
      /** 工具菜单功能行 = 右栏 guide 清单——与 ⋯ 菜单同一枚举源。 */
      const featureTabsSnap: ObservableSnapshot<readonly SidebarRightGuideBox[]> = {
        getSnapshot: () => ctx.sidebarRightTabs.guide(),
        subscribe: (listener: () => void) => ctx.sidebarRightTabs.subscribe(listener),
      }
      /** 挂窗勾选态：本会话有 conv 浮窗漂着即算挂着。 */
      const dockFloatSnap: ObservableSnapshot<boolean> = {
        getSnapshot: () => canvasInstance.getSnapshot().floats?.[sessionId]?.some(f => f.key.startsWith('conv:')) === true,
        subscribe: listener => canvasInstance.subscribe(listener),
      }
      /** 侧边对话：fork 侧线开 conv 页签——侧会话是画布公民，不进抽屉页。 */
      const openSideConv = (): void => {
        void fetch('/sidebar/api/sidechat.start', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, question: '' }),
        })
          .then(async res => {
            const parsed = await res.json().catch(() => null) as { ok?: boolean; value?: { childId: string } } | null
            const childId = parsed?.value?.childId
            if (!res.ok || parsed?.ok !== true || childId === undefined) throw new Error(`sidechat.start failed (${res.status})`)
            canvasInstance.actions.open({
              key: `conv:${childId}`, kind: 'conv', title: t('conv.side'),
              owner: sessionId, convId: SessionId(childId), convChannel: 'sidechat',
            })
            raiseCanvas()
          })
          .catch((reason: unknown) => { console.warn('noven-shell: sidechat start failed:', reason) })
      }
      const ensureDockFn = dockApi?.ensureDock
      return {
      sessionId,
      hooks: {
        tree: treeSource, project: projectFocus, projects,
        sims: simSessionsSource(ctx.sessions, ctx.workspaces, canvasInstance, sessionId),
        dock: dockFloatSnap, bottomPanel: bottomOpenSnap, studio: studioOnSnap, activeTab: activeTabSnap,
        featureTabs: featureTabsSnap,
      },
      openSim: id => {
        const root = focusSnapshot?.root
        if (root === undefined) return
        canvasInstance.actions.simOpenSet(root, id)
        canvasInstance.actions.select(sessionId, 'chat')
        raiseCanvas()
      },
      createSim,
      toggleStudio,
      deleteGroup: name => {
        void treeOp({ sessionId, root: focusSnapshot?.root }, { op: 'rmdir', name })
          .then(ok => {
            if (ok) treeSource.refresh()
            notifyUndo({ text: fmt(t, ok ? 'ui.receipt.groupDeleted' : 'ui.receipt.failed', { name }) })
          })
          .catch((reason: unknown) => { console.warn('noven-shell: rmdir failed:', reason); notifyUndo({ text: fmt(t, 'ui.receipt.failed', { name }) }) })
      },
      /** 工具菜单功能行 → 右栏页签；侧边对话收编成画布 conv 页签（不进抽屉）。 */
      openFeatureTab: kind => {
        if (kind === 'sidechat') { openSideConv(); return }
        ctx.sidebarRight.openTab(kind)
      },
      /** 挂窗 = conv 页的浮窗形态：开着（浮着或钉成页签）再点收起。 */
      toggleDock: ensureDockFn === undefined ? undefined : () => {
          void ensureDockFn(sessionId)
          .then(dockId => {
            if (dockId === undefined) return
            const key = `conv:${dockId}`
            if (canvasInstance.getSnapshot().tabs.some(row => row.owner === sessionId && row.key === key)) {
              canvasInstance.actions.close(sessionId, key)
              return
            }
            canvasInstance.actions.open({ key, kind: 'conv', title: t('tree.tool.dock'), owner: sessionId, convId: dockId, convChannel: 'direct' })
            canvasInstance.actions.floatTab(sessionId, key, 96, 96)
            raiseCanvas()
          })
          .catch((reason: unknown) => { console.warn('noven-shell: dock open failed:', reason) })
      },
      /** 底部面板：转发给页头那个真实控件——状态唯一归属它，天然同步。 */
      toggleBottomPanel: betterSidebar === undefined ? undefined : () => {
        document.querySelector<HTMLButtonElement>('button[data-dsh-bottom-toggle]')?.click()
      },
      renameFile: (path, name) => {
        void fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rename', path, name })
          .then(ok => { if (ok) treeSource.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: file rename failed:', reason) })
      },
      deleteFile: path => {
        const name = path.split('/').pop() ?? path
        void fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rm', path })
          .then(ok => {
            if (ok) treeSource.refresh()
            notifyUndo({ text: fmt(t, ok ? 'ui.receipt.fileDeleted' : 'ui.receipt.failed', { name }) })
          })
          .catch((reason: unknown) => { console.warn('noven-shell: file rm failed:', reason); notifyUndo({ text: fmt(t, 'ui.receipt.failed', { name }) }) })
      },
      present: (path, view) => {
        void presentNode({ sessionId, root: focusSnapshot?.root }, path, view)
          .then(ok => { if (ok) treeSource.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: present failed:', reason) })
      },
      openCard: (cardId, moduleId, title) => openCanvasCard(cardId, { sessionId, root: focusSnapshot?.root }, moduleId, sessionId, false, title),
      addModule: cardId => openCanvasCard(cardId, { sessionId, root: focusSnapshot?.root }, undefined, sessionId, true),
      renameModule: (cardId, moduleId, name) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'rename_module', moduleId, name }))
      },
      copyModule: (cardId, moduleId) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'copy_module', moduleId }))
      },
      deleteModule: (cardId, moduleId) => {
        const addr = { sessionId, root: focusSnapshot?.root }
        let name = ''
        void moduleCommand(addr, cardId, state => {
          name = findTreeName(state.document.modules, moduleId) ?? ''
          return { kind: 'remove_module', moduleId }
        })
          .then(() => {
            canvasInstance.actions.close(sessionId, `mod:${cardId}:${moduleId}`)
            treeSource.refresh()
            notifyUndo({
              text: fmt(t, 'ui.receipt.moduleDeleted', { name }),
              undoLabel: t('ui.undo'),
              undo: () => {
                void cardOp(addr, { op: 'undo', cardId }).then(() => { treeSource.refresh() })
                  .catch((reason: unknown) => { console.warn('noven-shell: module undo failed:', reason) })
              },
            })
          })
      },
      renameCard: (cardId, name) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'rename_card', name }))
      },
      deleteCard: (cardId, name) => { deleteCardWithUndo({ sessionId, root: focusSnapshot?.root }, cardId, name, sessionId) },
      embedFile: (cardId, moduleId, path) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'embed_file', path, moduleId }))
          .then(() => treeSource.refresh())
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
        // studio 不进面板：它是 Studio 组的开关；其余 kinds 走画布新建面板。
        if (kind === 'studio') { toggleStudio(); return }
        canvasInstance.actions.openDialog(sessionId, kind, dir)
        raiseCanvas()
      },
      openProject: () => {
        const focus = focusSnapshot
        if (focus === undefined) return
        openProject({ sessionId: focus.sessionId, root: focus.root, title: focus.title ?? focus.root.split('/').filter(Boolean).pop() ?? focus.root })
      },
      renameWork: (workId, title) => {
        void libraryOp({ sessionId, root: focusSnapshot?.root }, { op: 'rename-work', workId, title })
          .then(() => { treeSource.refresh(); library.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: work rename failed:', reason) })
      },
      dropWork: (workId, title) => {
        void libraryOp({ sessionId, root: focusSnapshot?.root }, { op: 'unregister', workId })
          .then(() => { treeSource.refresh(); library.refresh(); notifyUndo({ text: fmt(t, 'ui.receipt.workDropped', { name: title }) }) })
          .catch((reason: unknown) => { console.warn('noven-shell: work unregister failed:', reason); notifyUndo({ text: fmt(t, 'ui.receipt.failed', { name: title }) }) })
      },
      /* 批量写必须串行：同父目录的 .noven.json 与 library.json 都是
         read-modify-write，并发写会互相覆盖丢条目。 */
      presentAll: (paths, view) => {
        void (async () => {
          for (const path of paths) {
            try { await presentNode({ sessionId, root: focusSnapshot?.root }, path, view) }
            catch (reason) { console.warn('noven-shell: batch present failed:', path, reason) }
          }
          treeSource.refresh()
        })()
      },
      deleteSel: (items) => {
        void (async () => {
          const addr = { sessionId, root: focusSnapshot?.root }
          for (const it of items) {
            try {
              if (it.cardId !== undefined) { await cardOp(addr, { op: 'delete', cardId: it.cardId }); cardCache.put(addr, it.cardId, undefined) }
              else await fileOp(addr, { op: 'rm', path: it.path })
              if (it.workId !== undefined) await libraryOp(addr, { op: 'unregister', workId: it.workId })
            } catch (reason) { console.warn('noven-shell: batch delete failed:', it.path, reason) }
          }
          for (const row of canvasInstance.getSnapshot().tabs) {
            if (items.some(i => i.cardId !== undefined && i.cardId === row.cardId) && row.owner === sessionId) {
              canvasInstance.actions.close(sessionId, row.key)
            }
            if (items.some(i => i.cardId === undefined && (`doc:${i.path}` === row.key || `work:${i.path}` === row.key)) && row.owner === sessionId) {
              canvasInstance.actions.close(sessionId, row.key)
            }
          }
          treeSource.refresh()
          library.refresh()
          notifyUndo({ text: fmt(t, 'ui.receipt.selDeleted', { n: items.length }) })
        })()
      },
      expandDrawer: () => ctx.sidebarRight.toggleExpanded(),
      }
    },
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
      hooks: {
        project: projectFocus,
        tree: treeSource,
        transcript: transcriptSource(ctx.sessions, sessionId),
        sims: simSessionsSource(ctx.sessions, ctx.workspaces, canvasInstance, sessionId),
        simTranscript: simTranscriptSource(ctx.sessions, canvasInstance, sessionId),
        docs: docCache.snapshot,
        dirs: dirCache.snapshot,
        status: statusCache.snapshot,
        importPack: importPackSnap,
        convs,
      },
      ensureConv: convs.ensure,
      sendConv: convs.send,
      ensureDoc,
      refreshDoc,
      ensureDir,
      refreshDir,
      setStatus: (tabKey, flag, on) => statusSet(sessionId, tabKey, flag, on),
      // 散文件写面走 /api/noven-tree：改名等于换实体键——旧页签收掉、
      // 新路径按扩展名重判 kind 重开；删除同时收掉 doc/work 两种页签。
      renameFile: async (path, name) => {
        if (!(await fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rename', path, name }))) return undefined
        const dir = path.split('/').slice(0, -1).join('/')
        const next = dir === '' ? name : `${dir}/${name}`
        const kind = fileTabKind(next)
        canvasInstance.actions.close(sessionId, `doc:${path}`)
        canvasInstance.actions.close(sessionId, `work:${path}`)
        canvasInstance.actions.open({ key: `${kind}:${next}`, kind, title: name, owner: sessionId, path: next })
        treeSource.refresh()
        return next
      },
      deleteFile: async path => {
        if (!(await fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rm', path }))) return false
        canvasInstance.actions.close(sessionId, `doc:${path}`)
        canvasInstance.actions.close(sessionId, `work:${path}`)
        treeSource.refresh()
        return true
      },
      sim: {
        create: async () => createSimSession(ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd),
        rename: async (sid, title) => {
          const kept = title.startsWith(SIM_TITLE_PREFIX) ? title : `${SIM_TITLE_PREFIX}${title}`
          await ctx.remote.session.rename({ sessionId: sid, title: kept })
        },
        archive: async sid => { await ctx.uiWorkspace.archiveSession(sid) },
        ask: async (sid, parts) => {
          await ctx.sessions.using(sid, { source: 'novenShell' }, async reference => {
            await reference.binding.session.prompt([...parts], 'queue')
          })
        },
        models: async () => {
          const res = await ctx.remote.session.modelCatalog()
          return res.ok ? res.value : undefined
        },
        selectModel: async (sid, sel) => {
          const res = await ctx.remote.session.selectModel({ sessionId: sid, ...sel })
          return res.ok
        },
      },
      loadCard: fetchCard,
      cardOp,
      workspaceRoot: rootOf,
      readDoc,
      saveDoc: async (sid, path, content, base) => {
        const res = await saveDoc(sid, path, content, base)
        if (res === 'ok') docCache.put(docKey(sid, path), { state: 'ready', content })
        return res
      },
      listDir,
      ask: async (text) => {
        await ctx.sessions.using(sessionId, { source: 'novenShell' }, async reference => {
          await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
        })
      },
      applyLayoutSeed: () => {
        applyArrangement(arrangementDeps(), sessionId, 'ide')
      },
      submitCreate,
      importCard,
      commitImport,
      cancelImport,
      listCards: async sid => (await fetchCardList({ sessionId: sid })).map(row => ({ cardId: row.cardId, name: row.name })),
      embedFile: (cardId, moduleId, path) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'embed_file', path, moduleId }))
      },
    }),
  }, CanvasHost))

  // 排布不再全局播种：结构归会话（ui-layout 几何记录），agent/ide 两种种子由
  // 各入口在 openSession 时按会话 id 落（arrangement.ts）。老的全局
  // unit-side/canvas-side 键留在盘上不再读——agent 的抽屉轨从此在最右缘。

  // 会话座挂上：画布处女挂载（还没有任何页签）时开起点页，并按该会话的
  // 排布记录决定默认停靠——agent 停靠让出对话宽度，IDE 保持展开。已有页签
  // 的会话（翻页回来、刷新恢复、用户自己开过）一律不动它的画布状态：
  // 判定只看「该会话自己的记录」+「是否处女挂载」，不读 live 几何（翻页
  // 瞬态会误判），也不做粘滞重放（排布中途变化会把离开会话误收起，
  // 2026-10-16 修：翻页回来画布被收起）。另一半在控制器：bind 先发布
  // canvas 再宣布 mounted，本回调读到的才是新会话的画布，恢复展开的
  // 画布不会被误判成处女挂载而停靠。mounted 每次 surface 提交都
  // 解绑重绑，开页签每会话只做一次。
  ctx.effect(() => {
    const seeded = new Set<SessionId>()
    return ctx.sidebarRight.mounted.subscribe(() => {
      const sessionId = ctx.sidebarRight.mounted.getSnapshot()
      if (sessionId === undefined || seeded.has(sessionId)) return
      seeded.add(sessionId)
      if (rightExtras.canvas?.getSnapshot() !== undefined) return
      raiseCanvas()
      const record = ctx.layout.sessionGeometry?.getSnapshot().byId?.[sessionId]
      const ide = record?.sidebarCollapsed === true && record?.unitSide === 'left'
      if (ide) return
      // 停靠走控制器的正口（按会话的采纳 store 路由，不经过当前绑定）。
      parkCanvasIn(sessionId)
    })
  }, 'noven-shell: seed canvas')

  // 社区/消息保留标准 panellist 行；sidebarPanels 的 scoped activation
  // 覆盖在选择动作之前解释占位状态，插件释放后恢复正常面板导航。
  const SoonNavGlyph = ({ Icon }: { readonly Icon: (p: { size: number; active: boolean }) => React.ReactNode }): React.ReactNode => (
    <span className="nv-nav-soon-glyph"><Icon size={18} active={false} /></span>
  )
  ctx.slots.inject('sidebar.panellist', function* () {
    for (const nav of NAV) {
      if (SOON_IDS.has(nav.id)) {
        const Icon = nav.Icon
        yield ctx.slots.register({
          name: 'sidebar.panellist', id: nav.id, order: nav.order, label: nav.label, locale: NS,
        }, () => <SoonNavGlyph Icon={Icon} />)
        continue
      }
      yield ctx.slots.register({
        name: 'sidebar.panellist', id: nav.id, order: nav.order, label: nav.label, locale: NS,
      }, nav.Icon)
    }
  })

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({ name: 'main', key: HOME_ID, locale: NS },
      (p: PageProps) => <Home t={p.t} />)
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
        if (isMiscRoot(root)) return
        await projectOp({ op: 'unregister', root })
        // The project is gone: drop its persisted tree snapshot so a re-created
        // folder with the same path never flashes the old world on reload.
        forgetCachedTree(root)
        // Cold card/transcript snapshots are keyed with the project root in
        // their address — drop every entry belonging to the removed project.
        forgetColdWhere('card', key => key.startsWith(`${root}::`))
        projects.refresh()
      },
      // 项目名的权威是注册表 title：rename 写注册表（顺带刷纹身备份），再单向
      // 推到 Workspace 行；反向（侧栏改名 → 注册表）由下面的 workspaces.list 桥负责。
      renameProject: async (root, title) => {
        if (isMiscRoot(root)) return
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
        .then(() => { cardCache.put(addr, cardId, undefined); cards.refresh() }),
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
        back: backPanel,
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
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: SETTINGS_DEF_ID,
    kind: SETTINGS_TAB_ID,
    title: () => t('tab.settings'),
    guide: [{ id: 'session-settings', order: 6, title: () => t('tab.settings'), description: () => t('tab.settings.hint'), icon: SettingsTabIcon }],
  }), 'noven-shell: 会话设置 type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: SETTINGS_DEF_ID, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): SettingsTabInjected => {
      let source = sidecars.get(sessionId)
      if (source === undefined) sidecars.set(sessionId, source = sidecarSource(ctx.sessions, sessionId))
      return {
        sessionId,
        hooks: { sidecar: source, docs: docCache.snapshot },
        run: async (op: SidecarOp) => {
          await sidecarOp(sessionId, op)
          source.refresh()
        },
        ensureDoc,
        saveDoc: async (sid, path, content, base) => {
          const res = await saveDoc(sid, path, content, base)
          if (res === 'ok') docCache.put(docKey(sid, path), { state: 'ready', content })
          return res
        },
      }
    },
  }, (p: TabBodyProps & InjectFace<SettingsTabInjected>) => (
    <SettingsTab t={p.t} useTabInfo={p.useTabInfo} sessionId={p.sessionId}
      useSidecar={p.useSidecar} run={p.run}
      useDocs={p.useDocs} ensureDoc={p.ensureDoc} saveDoc={p.saveDoc} />
  ))), 'noven-shell: 会话设置 body')
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.workspace.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.workspace.menu.item', id: 'open-folder', order: 50, locale: NS,
    inject: (): WorkspaceFolderInjected => ({
      openFolder: path => openWorkspaceFolder(path, {
        open: request => ctx.remote.session.openWorkspacePath(request),
        failed: () => { notifyUndo({ text: t('workspace.openFolder.failed') }) },
      }),
    }),
  }, WorkspaceFolderItem)), 'noven-shell: workspace folder row')
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
  // 会话行 ⋯ 菜单：把模型识别的内部会话 id 放进剪贴板（调试/贴给模型用）。
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item', id: 'copy-session-id', order: 500, locale: NS,
  }, CopySessionIdItem)), 'noven-shell: 复制会话 ID row')
  applyQuote(ctx)
  applyBranches(ctx, (from, to) => canvasInstance.actions.inheritOwner(from, to))
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
  // 首见即纠偏：注册表滞留旧名（历史改名残留）时按工作区行修复一次；in-flight
  // 或失败的 rename 期间 title 仍分歧时不重复发写，等下次变化或重载再纠。
  const workspacesSvc = ctx.get('workspaces') as IWorkspaces | undefined
  if (workspacesSvc !== undefined) ctx.effect(() => {
    const seen = new Map<string, string>()
    const sync = (): void => {
      const titleByRoot = new Map(projects.getSnapshot().map(p => [p.root, p.title] as const))
      for (const ws of workspacesSvc.list.getSnapshot().items) {
        const projectTitle = titleByRoot.get(ws.path)
        if (projectTitle === undefined) continue
        const prev = seen.get(ws.path)
        seen.set(ws.path, ws.title)
        if (ws.title === projectTitle || prev === ws.title) continue
        void projectOp({ op: 'rename', root: ws.path, title: ws.title })
          .then(() => { projects.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: project title sync failed:', reason) })
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

  // noven 页头不要「标准模式」preset 标签：同 id 注册一条更低 priority 的
  // 空条目把它遮蔽（preset 功能本身照旧，只是标签不渲）。
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'agent-preset', priority: -1,
  }, () => null))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'noven-context-chips', order: -8, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): HeaderChipsInjected => ({
      hooks: { binding: bindings.get(sessionId) },
      openContext: () => { ctx.sidebarRight.openTab(CONTEXT_TAB_ID) },
    }),
  }, (p: PropsRuntime<'conversation.session.header.actions'> & InjectFace<HeaderChipsInjected> & PropsLocale<'novenShell'>) => <HeaderChips {...p} />))

  // 会话 ⋯ 菜单尾段：功能入口随右栏 guide 注册表走——哪个插件登记了功能页签，
  // 这里就出对应行，藏掉的功能区从这里仍可达。
  ctx.slots.inject('conversation.session.header.more.item', () => ctx.slots.register({
    name: 'conversation.session.header.more.item', id: 'noven-features', order: 100, locale: NS,
    inject: (): FeatureMenuInjected => ({
      hooks: {
        guide: {
          getSnapshot: () => ctx.sidebarRightTabs.guide(),
          subscribe: (listener: () => void) => ctx.sidebarRightTabs.subscribe(listener),
        },
      },
      openTab: kind => { ctx.sidebarRight.openTab(kind) },
    }),
  }, (p: FeatureMenuProps) => <FeatureMenuItems {...p} />))

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
    inject: (sessionId: SessionId): BlankDockInjected => ({
      hooks: {
        commands: commandCatalog(ctx.remote, sessionId),
        // 只在本会话就是可见会话且导航已收轨时视作 IDE：排布结构归会话。
        ide: {
          getSnapshot: () => {
            const geometry = ctx.layout.sessionGeometry?.getSnapshot()
            return geometry !== undefined && geometry.active === sessionId
              && geometry.sidebarCollapsed && geometry.unitSide === 'left'
          },
          subscribe: listener => ctx.layout.sessionGeometry?.subscribe(listener) ?? (() => {}),
        },
        // 继续区：只列本项目的未保存草稿。getSnapshot 必须返回稳定引用
        //（useSyncExternalStore）：按 sessions/cards 两份源快照记忆化。
        drafts: (() => {
          let memo: readonly { cardId: string; name: string; workspaceRoot: string; sessionId: string | undefined; modules: number }[] = []
          let memoCards: readonly unknown[] | undefined
          let memoRoot: string | undefined
          return {
            getSnapshot: () => {
              const allCards = cards.getSnapshot()
              const root = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
              if (allCards === memoCards && root === memoRoot) return memo
              memoCards = allCards
              memoRoot = root
              memo = root === undefined ? [] : allCards
                .filter(row => row.hasDraft && row.workspaceRoot === root)
                .map(row => ({
                  cardId: row.cardId, name: row.name, workspaceRoot: row.workspaceRoot,
                  sessionId: row.sessionId, modules: row.modules,
                }))
              return memo
            },
            subscribe(listener: () => void) {
              const a = cards.subscribe(listener)
              const b = ctx.sessions.list.subscribe(listener)
              return () => { a(); b() }
            },
          }
        })(),
      },
      openDraft: draft => {
        // 在画布卡页打开草稿（排布会抬起画布标签）。
        face.openCard(draft.cardId, { ...(draft.sessionId !== undefined ? { sessionId: draft.sessionId as SessionId } : {}), root: draft.workspaceRoot })
      },
      handcraft: () => { enterHandcraft(sessionId) },
    }),
  }, BlankDock))
}
