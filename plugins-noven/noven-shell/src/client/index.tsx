/**
 * noven-shell browser half — the product IA on top of DSH's public seams:
 *
 * - `sidebar.panellist` rows (首页 / 创作 / 消息 / 我的): 创作 selects the
 *   independent creation panel; the separate New Session command opens a blank
 *   conversation, which remains the default main key.
 * - `main` panels: the community feed (with its landing drawer), the creator
 *   profile with 世界/角色/创作库 tabs, a messages placeholder, and the
 *   three-pane card editor reached from 我的.
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
import { bindSnapshotSelector } from './directory-hooks.ts'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { registerInlineBlocks } from './blocks.tsx'
import { AppearanceEffects, type AppearanceEffectsInjected } from './appearance.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, PropsStore, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightGuideBox } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NovenShellLocaleKey } from './locales.ts'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Home, fmt } from './pages/Home.tsx'
import { Messages } from './pages/Messages.tsx'
import { notifyUndo } from './ui/interact.tsx'
import { openWorkspaceFolder } from './workspace-folder.ts'
import { cardCache } from './ui/retain.ts'
import { keyedCache } from './ui/keyed-cache.ts'
import { forgetColdWhere } from './ui/cold-store.ts'
import { MeHome, type LibraryFocus } from './pages/MeHome.tsx'
import { CardPreview } from './card-page.tsx'
import { isMiscRoot, libraryOp, miscProjectRoot, projectOp, projectsCatalog, setMiscProjectRoot } from './library-api.ts'
import type { ProjectAddr, ProjectRow } from './library-api.ts'
import { cardOp, exportCardPackage, fetchCard, fetchCardList, type CardCommand } from './card-api.ts'
import type { CardAddr } from './card-api.ts'
import { bindingOp, fetchBinding } from './bindings-api.ts'
import type { BindingOp, BindingState } from './bindings-api.ts'
import { ContextTab } from './tabs/Context.tsx'
import { LibraryTab } from './tabs/Library.tsx'
import { SettingsTab } from './tabs/Settings.tsx'
import { UpdatesSection } from './settings/UpdatesSection.tsx'
import { WorkbenchSection } from './settings/WorkbenchSection.tsx'
import { AppearanceSettingsSection } from './settings/AppearanceSettingsSection.tsx'
import { bindNovenEditorTheme } from './doc-editor.tsx'
import { createNovenWorkbenchStore } from './workbench.ts'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { HeaderChips } from './tabs/HeaderChips.tsx'
import type { HeaderChipsInjected } from './tabs/HeaderChips.tsx'
import { FootLauncher } from './sidebar.tsx'
import type { FootLauncherInjected, FootLauncherProps } from './sidebar.tsx'
import { CardReceiptTail, CardToolView, CARD_READ_TOOLS, CARD_WRITE_TOOLS, type CardReceiptInjected } from './toolviews.tsx'
import { cardSavedDefinition, savedMeta } from './card-receipt.ts'
import { CreateHero } from './create-hero.tsx'
import { Create } from './pages/Create.tsx'
import { ConversationAuxiliaryChrome } from './chrome.tsx'
import { SoundtrackEffects, type SoundtrackEffectsInjected } from './soundtrack-effects.tsx'
import { InputQuote } from './input-quote.tsx'
import { applyQuote } from './quote.tsx'
import { applyBranches } from './branches.tsx'
import { HomeIcon, CreateIcon, BellIcon, MeIcon, glyph } from './icons.tsx'
import { showComingSoon } from './coming-soon.ts'
import { createNovenSubjectStore, frameLayoutPolicy, subjectOfMode, type NovenMode, type NovenSubject } from './arrangement.ts'
import { NovenModeSwitch, NovenSideSessionMenu, type NovenModeSwitchProps, type SideSessions } from './mode.tsx'
import { SideParent, type SideParentInjected } from './side-parent.tsx'
import { enterHandcraftScene } from './creation-transition.ts'
import { injectNovenStyles } from './style.ts'
import { CanvasHost, createCanvasStore, activeKey, fileTabKind, docKey, dirKey, statusKey, type CanvasInjected, type CanvasState, type DocEntry, type DirEntry, type ImportPack, type ProjectFocus, type SimRow, type TabFlags } from './canvas.tsx'
import { aiEditsSource } from './ai-edits.ts'
import { DirectorySideEntry, LeftContentTree, type TreeInjected } from './tree.tsx'
import type { TranscriptMsg, TranscriptState } from './stage-phone.tsx'
import { foldConvEntries, type ConvChannel, type ConvEntry, type ConvMsg, type ConvsMap } from './conv.tsx'
import type { CreateRequest } from './creation.tsx'
import { bindTreeColdCache, novenTreeSource, treeOp, fileOp, presentNode, importAnalyze, importCommit, type ImportLanded } from './tree-api.ts'
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
export const CARD_PREVIEW_ID = 'noven-card-preview' as MainPanelId
export const WORKBENCH_ID = 'noven-workbench' as MainPanelId
export const CONTEXT_TAB_ID = 'noven:context'
export const LIBRARY_TAB_ID = 'noven:library'
export const SETTINGS_TAB_ID = 'noven:session-settings'
const CONTEXT_DEF_ID = 'noven-shell.context'
const LIBRARY_DEF_ID = 'noven-shell.library'
const SETTINGS_DEF_ID = 'noven-shell.session-settings'
/** The canvas's tab type: `kind` is what `openTab` names, `id` keys its body under `sidebar.right.pane.tab`. */
const CANVAS_KIND = 'noven.canvas'
const CANVAS_DEF_ID = 'noven-shell.canvas'

/** Which card the reading layer is showing. */
interface CardRef { readonly cardId: string; readonly sessionId?: SessionId; readonly root: string }

/** The three parallel interfaces inside 我的. */
export type MeView = 'exhibit' | 'library' | 'works'

type ShellState = {
  preview: CardRef | null
  libraryFocus: LibraryFocus | null
  meView: MeView
}
type ShellActions = {
  openPreview: (draft: ShellState, ref: CardRef | null) => void
  closePreview: (draft: ShellState) => void
  focusLibrary: (draft: ShellState, root: string) => void
  setMeView: (draft: ShellState, view: MeView) => void
}

function createShellStore() {
  return defineStore<ShellState, ShellActions>({
    init: () => ({ preview: null, libraryFocus: null, meView: 'exhibit' }),
    actions: {
      openPreview: (d, ref) => { d.preview = ref },
      closePreview: (d) => { d.preview = null },
      focusLibrary: (d, root) => {
        d.libraryFocus = { root, token: Date.now() }
        d.meView = 'library'
      },
      setMeView: (d, view) => { d.meView = view },
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

/** 会话设置页签注入：设置与外观走会话文档温层。 */
export interface SettingsTabInjected {
  readonly sessionId: SessionId
  readonly hooks: {
    readonly docs: ObservableSnapshot<Readonly<Record<string, DocEntry>>>
  }
  readonly ensureDoc: CanvasInjected['ensureDoc']
  readonly saveDoc: CanvasInjected['saveDoc']
}

/** The face main-panel inject factories hand to their pages. */
interface ShellFace {
  readonly openCard: (id: string, addr: CardAddr) => void
  readonly openPreview: (id: string, addr: CardAddr) => void
  readonly openPanel: (id: MainPanelId) => void
}

/** Injected face for 我的: the real card catalog plus the shared navigation face. */
export interface MePageInjected {
  readonly hooks: {
    readonly cards: ObservableSnapshot<readonly CardRow[]>
    readonly projects: ObservableSnapshot<readonly ProjectRow[]>
    /** False until the first catalog pass settles; the page keeps a quiet skeleton until then. */
    readonly catalogReady: ObservableSnapshot<boolean>
  }
  readonly onOpenPreview: (cardId: string, addr: CardAddr) => void
  readonly onEditCard: (cardId: string, addr: CardAddr) => void
  /** Switch between the three parallel interfaces. */
  readonly setMeView: (view: MeView) => void
  /** 新建文件夹 flow: pick a parent directory, create `title` inside, register + open a workspace. */
  readonly createProject: (title: string) => Promise<string | undefined>
  /** 从 Finder 选择 flow: pick an existing directory, register it as a project + workspace. */
  readonly pickProject: () => Promise<string | undefined>
  /** Remove the library from the sidebar, keeping the folder and archiving its conversations. */
  readonly removeProject: (root: string) => Promise<void>
  /** Move the whole folder to the system Trash, then remove its workspace and archive its conversations. */
  readonly deleteProject: (root: string) => Promise<void>
  /** 重命名: project.json.title + the matching Workspace title — one name everywhere. */
  readonly renameProject: (root: string, title: string) => Promise<void>
  /** Create a durable card of the kind in the library, then open it in the editor. */
  readonly newCard: (kind: 'world' | 'character', name: string, workspaceId?: WorkspaceId) => void
  /** Import a card package file into the library, then open it in the editor. */
  readonly importCard: (file: File, workspaceId?: WorkspaceId) => void
  /** Tile-menu actions on catalog cards. */
  readonly exportCard: (addr: CardAddr, cardId: string, name: string) => Promise<void>
  readonly deleteCard: (addr: CardAddr, cardId: string, name: string) => Promise<void>
  /** Relocate a card to another project workspace (the whole card directory moves). */
  readonly moveCard: (addr: CardAddr, cardId: string, target: ProjectAddr) => Promise<void>
}

/** Injected face for the read-only card preview: load, navigate, edit, export and delete. */
interface PreviewPageInjected {
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<import('./card-api.ts').CardState | undefined>
  readonly back: () => void
  readonly edit: (cardId: string, addr: CardAddr) => void
  readonly exportCard: (cardId: string, addr: CardAddr, name: string) => void
  readonly deleteCard: (cardId: string, addr: CardAddr, name: string) => void
}

/** Injected face for the independent creation panel and its blank-Session composer. */
interface CreatePageInjected {
  readonly revealAuxiliary: () => void
  readonly ensureBlankHost: (workspaceId: WorkspaceId | undefined) => Promise<void>
  readonly revealSession: (sessionId: SessionId) => void
  readonly onStartHandcraft: (workspaceId: WorkspaceId | undefined, source: HTMLElement) => Promise<boolean>
  readonly onImportCard: (file: File, workspaceId?: WorkspaceId) => void
}


type PageProps = PropsRuntime<'main'> & PropsLocale<'novenShell'> & PropsRenderFactories
type TabBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'novenShell'>
type WorkspaceMenuItemProps = PropsRuntime<'sidebar.workspaces.workspace.menu.item'> & PropsLocale<'novenShell'>

/** Injected share of the workspace-row ⋯ menu's 创作库 entry. */
export interface WorkspaceLibraryInjected {
  /** Reveal this folder's library section on 我的. */
  readonly openLibrary: (root: string) => void
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

/** Workspace ⋯ menu row: reveal this folder's library section on 我的. */
function WorkspaceLibraryItem({ path, useMenuOpenState, openLibrary, t }: WorkspaceMenuItemProps & InjectFace<WorkspaceLibraryInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  if (path === undefined || path.trim() === '') return null
  return (
    <MenuItemButton
      icon={glyph.book(16)}
      onSelect={() => {
        setMenuOpen(false)
        openLibrary(path)
      }}
    >
      {t('me.home.openLibrary')}
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
function SettingsTabIcon({ size }: { size?: number }) { return glyph.gear(size ?? 16) }

/** Required browser services: slots, panel selection, theme, copy, right rail, session navigation, command and skill catalogs. */
export const inject = ['slots', 'locale', 'layout', 'theme', 'sidebarPanels', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'uiWorkspace', 'uiSession', 'remote', 'remote.commands', 'remote.session', 'remote.skills', 'remote.workspaceFiles', 'sessions', 'workspaces', 'canvasPages']

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
function cardCatalog(sessions: ClientContext['sessions'], projects: ObservableSnapshot<readonly ProjectRow[]>, workspaces?: IWorkspaces) {
  let snapshot: readonly CardRow[] = []
  let ready = false
  const listeners = new Set<() => void>()
  const readyListeners = new Set<() => void>()
  let started = false
  let generation = 0
  const compute = async () => {
    const gen = ++generation
    const state = sessions.list.getSnapshot()
    const archived = new Set(workspaces?.list.getSnapshot().archivedSessionIds ?? [])
    const byRoot = new Map<string, SessionId | undefined>()
    for (const id of state.ids) {
      // Archived conversations keep their cwd on disk but are no longer a
      // library surface; a deleted library must not keep its cards alive here.
      if (archived.has(id)) continue
      const cwd = state.byId[id]?.cwd
      if (cwd !== undefined && cwd.length > 0 && !byRoot.has(cwd)) byRoot.set(cwd, id)
    }
    for (const project of projects.getSnapshot()) {
      if (!byRoot.has(project.root)) byRoot.set(project.root, undefined)
    }
    const titleByRoot = new Map(projects.getSnapshot().map(p => [p.root, p.title] as const))
    // Roots are independent stores; fetching them in parallel keeps 我的 from
    // flashing an empty gallery while several libraries load in sequence.
    const groups = await Promise.all([...byRoot].map(async ([root, sessionId]): Promise<CardRow[]> => {
      const projectTitle = titleByRoot.get(root) ?? root.split('/').pop() ?? root
      return (await fetchCardList({ root })).map(row => ({ ...row, sessionId, workspaceRoot: root, projectTitle }))
    }))
    if (gen !== generation) return
    snapshot = groups.flat()
    ready = true
    for (const listener of listeners) listener()
    for (const listener of readyListeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    ready: {
      getSnapshot: () => ready,
      subscribe: (listener: () => void) => {
        readyListeners.add(listener)
        if (!started) { started = true; void compute() }
        return () => { readyListeners.delete(listener) }
      },
    },
    /** Card ops (create/import/delete) don't move the session list — refresh on demand. */
    refresh: () => { void compute() },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) { started = true; void compute() }
      const a = sessions.list.subscribe(() => { void compute() })
      const b = projects.subscribe(() => { void compute() })
      const c = workspaces?.list.subscribe(() => { void compute() })
      return () => { listeners.delete(listener); if (listeners.size === 0) { a(); b(); c?.() } }
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
 * 订阅，重复调用只刷新 channel）；发送统一走 fork 会话的 session.prompt，
 * 外部 sidechat 路由随 better-sidebar 移除，不再有第二条发送通道。
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

export function apply(ctx: ClientContext): void {
  injectNovenStyles()
  // 设定管理员是 sidecar 的内部预设，不进用户的模式选择列表。预设仍注册、
  // 设定助手会话照常工作；这里只在渲染层隐藏那一项菜单。
  const hiddenPresetLabels = ['设定管理员', '标准模式']
  const hideInternalPreset = (): void => {
    const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]')
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      const label = item?.textContent ?? ''
      if (item !== undefined && hiddenPresetLabels.some(hidden => label.includes(hidden))) item.style.display = 'none'
    }
  }
  const presetObserver = new MutationObserver(() => { hideInternalPreset() })
  presetObserver.observe(document.body, { childList: true, subtree: true })
  hideInternalPreset()
  ctx.effect(() => () => { presetObserver.disconnect() }, 'noven-shell: hide internal preset')
  ctx.effect(() => installPanelGhost(), 'noven-shell: panel ghost')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-shell: dictionaries')
  const t = ctx.locale.bind(NS)
  /** Host-registered canvas page kinds (terminal today; tasks/browser can join later). */
  const canvasPages = ctx.canvasPages
  // Product-internal settings sections stay out of the nav until the persisted
  // developer unlock (ten clicks on the settings title). Side cards are gone
  // with better-sidebar; these two are the remaining host-internal pages.
  const developerOnlySections: ReadonlySet<string> = new Set(['plugins', 'agent-presets'])
  const noHiddenSections: ReadonlySet<string> = new Set()
  const developerMode = ctx.get('settingsDeveloperMode')
  ctx.reflect.provide('settingsSectionPolicy', {
    getHidden: () => developerMode?.getSnapshot() === true ? noHiddenSections : developerOnlySections,
    subscribe: (listener: () => void) => developerMode?.subscribe(listener) ?? (() => {}),
  } satisfies NonNullable<ClientContext['settingsSectionPolicy']>)

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
  const themeColorSchemeSource: ObservableSnapshot<'light' | 'dark'> = {
    getSnapshot: () => ctx.theme.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', () => { listener() }),
  }
  ctx.effect(() => bindNovenEditorTheme(
    themeColorSchemeSource.getSnapshot,
    listener => themeColorSchemeSource.subscribe(() => { listener(themeColorSchemeSource.getSnapshot()) }),
  ), 'noven-shell: editor theme')

  const handle = createShellStore()
  const instance = handle.create()
  const store: typeof handle = { ...handle, create: () => instance }
  const subjectHandle = createNovenSubjectStore()
  const subjectInstance = subjectHandle.create()
  const subjectStore: typeof subjectHandle = { ...subjectHandle, create: () => subjectInstance }
  const workbenchHandle = createNovenWorkbenchStore()
  const workbenchInstance = workbenchHandle.create()
  const workbenchStore: typeof workbenchHandle = { ...workbenchHandle, create: () => workbenchInstance }
  const subjectSource: ObservableSnapshot<NovenSubject> = {
    getSnapshot: () => subjectInstance.getSnapshot().subject,
    subscribe: listener => subjectInstance.subscribe(listener),
  }
  const currentSessionSource: ObservableSnapshot<SessionId | undefined> = {
    getSnapshot: () => ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined,
    subscribe: listener => ctx.uiSession.adapter.current.subscribe(listener),
  }
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'noven-appearance', locale: NS,
    inject: (): AppearanceEffectsInjected => ({ current: currentSessionSource, scheme: themeColorSchemeSource, theme: ctx.theme }),
  }, AppearanceEffects)), 'noven-shell: appearance surface')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'noven-soundtrack', locale: NS,
    inject: (): SoundtrackEffectsInjected => ({ current: currentSessionSource, subject: subjectSource }),
  }, SoundtrackEffects)), 'noven-shell: soundtrack owner')
  let directoryQueryValue = ''
  const directoryQueryListeners = new Set<() => void>()
  const directoryQuery: ObservableSnapshot<string> = {
    getSnapshot: () => directoryQueryValue,
    subscribe: listener => { directoryQueryListeners.add(listener); return () => { directoryQueryListeners.delete(listener) } },
  }
  const setDirectoryQuery = (value: string): void => {
    if (value === directoryQueryValue) return
    directoryQueryValue = value
    for (const listener of directoryQueryListeners) listener()
  }
  const featureTabsSource: ObservableSnapshot<readonly SidebarRightGuideBox[]> = {
    getSnapshot: () => ctx.sidebarRightTabs.guide(),
    subscribe: listener => ctx.sidebarRightTabs.subscribe(listener),
  }
  let modePolicy = frameLayoutPolicy(subjectInstance.getSnapshot().subject)
  const modePolicySource: ObservableSnapshot<ReturnType<typeof frameLayoutPolicy>> = {
    getSnapshot: () => modePolicy,
    subscribe: listener => subjectInstance.subscribe(() => {
      modePolicy = frameLayoutPolicy(subjectInstance.getSnapshot().subject)
      listener()
    }),
  }
  const changeMode = (mode: NovenMode): void => {
    const subject = subjectOfMode(mode)
    ctx.layout.transitionFrame(() => {
      subjectInstance.actions.setSubject(subject)
      ctx.layout.selectPanel(null)
      if (subject === 'canvas') ensureCanvas()
    })
  }
  ctx.effect(() => ctx.layout.provideFrameLayoutPolicy(modePolicySource), 'noven-shell: frame layout policy')
  const BrandModeSwitch = (props: Omit<NovenModeSwitchProps, 'onMode'>) => <NovenModeSwitch {...props} onMode={changeMode} />
  ctx.slots.inject('sidebar.brand.trailing', () => ctx.slots.register({
    name: 'sidebar.brand.trailing', locale: NS, store: subjectStore,
  }, BrandModeSwitch))
  const projects = projectsCatalog(ctx.sessions)
  // 杂项项目是永久兜底（设计理念 §15）：注册表自举后只补登记一次上游工作区，
  // 复用同一份项目快照，不再另发一次请求。浏览器没有 HOME，不能本地拼路径。
  ctx.effect(() => {
    let created = false
    const ensure = (): void => {
      if (created) return
      const root = miscProjectRoot()
      if (root === undefined) return
      created = true
      void (ctx.get('workspaces') as IWorkspaces | undefined)?.create({ path: root }).catch(() => undefined)
    }
    ensure()
    return projects.subscribe(ensure)
  }, 'noven-shell: misc workspace')
  const cards = cardCatalog(ctx.sessions, projects, ctx.workspaces)
  const bindings = bindingCache(ctx.sessions)
  const allBindings = bindingsCatalog(bindings, ctx.sessions)
  /** The most recently active session, optionally restricted to one workspace root. */
  const recentSession = (root?: string): { id: SessionId; cwd: string } | undefined => {
    const state = ctx.sessions.list.getSnapshot()
    const workspaces = ctx.workspaces.list.getSnapshot().items
    let best: { id: SessionId; cwd: string; at: number } | undefined
    for (const id of state.ids) {
      const row = state.byId[id]
      if (row === undefined) continue
      const cwd = workspaces.find(workspace => workspace.sessionIds.includes(id))?.path ?? row.cwd
      if (cwd === undefined || (root !== undefined && cwd !== root)) continue
      if (best === undefined || row.updatedAt >= best.at) best = { id, cwd, at: row.updatedAt }
    }
    return best === undefined ? undefined : { id: best.id, cwd: best.cwd }
  }

  /** Absolute root for an address: the explicit root wins, else the session's cwd. */
  const rootOf = (addr: CardAddr): string =>
    addr.root ?? (addr.sessionId !== undefined ? ctx.sessions.list.getSnapshot().byId[addr.sessionId]?.cwd ?? '' : '')

  const openPanelImpl = (id: MainPanelId): void => {
    capturePanelGhost()
    try { ctx.layout.selectPanel(id) } catch { /* panel not registered */ }
  }
  const face: ShellFace = {
    openCard: (id, addr) => {
      openCanvasCard(id, { sessionId: addr.sessionId, root: rootOf(addr) }, undefined, addr.sessionId)
    },
    openPreview: (id, addr) => {
      const root = rootOf(addr)
      instance.actions.openPreview({ cardId: id, sessionId: addr.sessionId, root })
      openPanelImpl(CARD_PREVIEW_ID)
    },
    openPanel: openPanelImpl,
  }

  /** 选定工作区的根路径；未选或未登记时回退 undefined（走最近会话路径）。 */
  const workspaceRootFor = (workspaceId: WorkspaceId | undefined): string | undefined =>
    workspaceId === undefined ? undefined
      : ctx.workspaces.list.getSnapshot().items.find(w => w.workspaceId === workspaceId)?.path

  /** 建卡后要打开画布编辑器：拿到落在该工作区的会话（无则 connect 出/复用一个 blank）。 */
  const cardSessionFor = async (workspaceId: WorkspaceId | undefined): Promise<{ sessionId?: SessionId; root?: string }> => {
    if (workspaceId === undefined) {
      // Object commands stay in the current workspace; only a focus-less entry
      // uses the global recent Session and finally the miscellaneous project.
      const focus = focusSnapshot
      const target = recentSession(focus?.root)
      if (target !== undefined) return { sessionId: target.id, root: target.cwd }
      const root = focus?.root ?? miscProjectRoot()
      if (root === '') return {}
      const id = await createSessionIn(root)
      if (focus !== undefined) ctx.uiWorkspace.openSession(id)
      return { sessionId: id, root }
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
        if (res !== undefined) openLandedImport(res.landed, target)
        return
      }
      pendingImportFile = file
      pendingImportAddr = addr
      changeMode('ide')
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
    openLandedImport(res.landed, pendingImportAddr)
    return true
  }

  /** 导入对话框取消：丢掉暂态，文件不落位。 */
  const cancelImport = (): void => {
    pendingImportFile = undefined
    setImportPack(undefined)
  }

  /** 创作页手作入口：必要时接上工作区会话，再由唯一模式按钮切到 IDE。 */
  const startHandcraft = async (workspaceId: WorkspaceId | undefined, source: HTMLElement): Promise<boolean> => {
    const root = workspaceRootFor(workspaceId)
    let reusable: { id: SessionId; cwd: string } | undefined
    if (root === undefined) {
      reusable = recentSession()
    } else {
      const sessions = ctx.sessions.list.getSnapshot()
      let found: { id: SessionId; cwd: string; at: number } | undefined
      for (const id of sessions.ids) {
        const row = sessions.byId[id]
        if (row?.cwd !== root) continue
        // 空白会话没有内容可铺开，也没有项目坐标——复用它会落进一个空抽屉空画布的
        // 无项目现场。手作要的是"最近的真实会话"，空白只算待命位。
        if (row.blank === true) continue
        if (found === undefined || row.updatedAt > found.at) found = { id, cwd: row.cwd, at: row.updatedAt }
      }
      reusable = found === undefined ? undefined : { id: found.id, cwd: found.cwd }
    }
    const target = reusable !== undefined
      ? { sessionId: reusable.id }
      : await cardSessionFor(workspaceId).catch((reason: unknown) => {
        console.warn('noven-shell: handcraft session failed:', reason)
        return undefined
      })
    const sessionId = target?.sessionId
    if (sessionId === undefined) return false
    return enterHandcraftScene(source, async () => {
      // 场景内的提交：转场归外层手作场景所有。
      ;(ctx.uiWorkspace.openSession as (target: SessionId, options?: { transition?: 'none' }) => void)(sessionId, { transition: 'none' })
      changeMode('ide')
      return true
    })
  }

  /** 创作页宿主：当前主视图不是探索模式空白时，为所选工作区接/建一个并选定（页面不离开）。 */
  const ensureBlankHost = async (workspaceId: WorkspaceId | undefined): Promise<void> => {
    const list = ctx.sessions.list.getSnapshot()
    const current = Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
    const root = workspaceRootFor(workspaceId)
    // A blank outside the requested workspace cannot host this page: the composer
    // reads an unregistered cwd as "choose a workspace" and goes read-only.
    // A blank from another preset cannot host it either — the workspace layer
    // filters reuse by preset, so a standard blank is left for other flows and
    // A create-preset blank is reused or created here.
    const sameRoot = root === undefined || current?.cwd === root
    if (current?.blank === true && sameRoot && current.projectionValues?.agentPreset === 'create') return
    const sessionId = workspaceId !== undefined
      ? await ctx.uiWorkspace.connectWorkspace(workspaceId, { agentPreset: 'create' })
      : await createSessionIn(recentSession()?.cwd, 'create')
    // preserve 保住面板：普通 reveal 会在 replaceMain 里 selectPanel(null)，
    // 之后的任何面板重激活都输给晚到的提交。发布版 openSession 类型未带
    // options 参数（ui-workspace 源码与产物已带 preserve），走局部窄化。
    ;(ctx.uiWorkspace.openSession as (target: SessionId, options?: { panel?: 'preserve' }) => void)(sessionId, { panel: 'preserve' })
  }

  /** 首页投稿进入 Agent；工作区、会话内容和辅助区现场仍由各自所有者保持。 */
  const revealSession = (sessionId: SessionId): void => {
    ctx.layout.transitionFrame(() => {
      subjectInstance.actions.setSubject('conversation')
      // transition:'none' 表示本次提交归外层场景转场所有，不再起导航转场。
      ;(ctx.uiWorkspace.openSession as (target: SessionId, options?: { panel?: 'preserve', transition?: 'none' }) => void)(
        sessionId, { transition: 'none' },
      )
    })
  }

  /** Last non-blank main-view Session retained while a creation host occupies the panel. */
  let auxiliaryReturnSession: SessionId | undefined
  ctx.effect(() => {
    const remember = (): void => {
      const current = Object.values(ctx.sessions.list.getSnapshot().byId)
        .find(row => (row.retainedBy.mainView ?? 0) > 0)
      if (current !== undefined && current.blank !== true) auxiliaryReturnSession = current.id
    }
    remember()
    const stop = ctx.sessions.list.subscribe(remember)
    return () => { stop() }
  }, 'noven-shell: auxiliary return session')

  /** Reveal the retained Session and its auxiliary content without creating a Session or switching subjects. */
  const revealAuxiliary = (): void => {
    const state = ctx.sessions.list.getSnapshot()
    const current = Object.values(state.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
    const remembered = auxiliaryReturnSession === undefined ? undefined : state.byId[auxiliaryReturnSession]
    const target = current?.blank === true && remembered?.blank === false
      ? remembered.id
      : current?.id ?? remembered?.id
    ctx.layout.transitionFrame(() => {
      if (target !== undefined && target !== current?.id) {
        ;(ctx.uiWorkspace.openSession as (sessionId: SessionId, options?: { transition?: 'none' }) => void)(target, { transition: 'none' })
      } else {
        ctx.layout.selectPanel(null)
      }
      ctx.layout.setAuxiliaryCollapsed(false)
    })
  }

  // ——— 四栏外壳：导航栏（图标 + 会话列表）原样不动；抽屉上区装内容树；
  // 画布是 rightbar 单元里的一个 selfChrome 页签；会话走 main 的
  // conversation 上游原样实现。零遮蔽，全部经原生座。

  const canvasHandle = createCanvasStore(() => workbenchInstance.getSnapshot().restoreCanvas)
  const canvasInstance = canvasHandle.create()
  const canvasStore: typeof canvasHandle = { ...canvasHandle, create: () => canvasInstance }

  /** cwd → 已注册 workspace 的 id：上游会话分组靠 workspace 的 sessionIds 名单认领。 */
  const workspaceIdFor = (root: string) =>
    (ctx.get('workspaces') as IWorkspaces | undefined)?.list.getSnapshot().items
      .find(w => w.path === root)?.workspaceId

  /**
   * 建会话：根下有注册 workspace 走 workspaceId（进分组名单），否则裸
   * cwd。注意 workspaceId 与 cwd 在 create 载荷里互斥——传了 workspaceId
   * 会丢 cwd，服务端从 workspace 解析。预设随创建请求一并落地，宿主不再
   * 事后切换。
   */
  const createSessionIn = (root: string | undefined, agentPreset?: string): Promise<SessionId> => {
    if (root === undefined) return ctx.sessions.create({ ...(agentPreset === undefined ? {} : { agentPreset }) })
    const workspaceId = workspaceIdFor(root)
    const preset = agentPreset === undefined ? {} : { agentPreset }
    return ctx.sessions.create(workspaceId === undefined ? { cwd: root, ...preset } : { workspaceId, ...preset })
  }

  /** 当前项目坐标：跟随绑定会话的 cwd，标题取创作库登记名。 */
  const FOCUS_KEY = 'noven.focus.v1'
  /** Last project/session shown by this browser; restores the tree before network data. */
  const readCachedFocus = (): ProjectFocus | undefined => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? 'null') as Partial<ProjectFocus> | null
      if (parsed === null || typeof parsed.root !== 'string' || parsed.root === '') return undefined
      return {
        root: parsed.root,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId as SessionId : undefined,
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
      }
    } catch {
      return undefined
    }
  }
  const writeCachedFocus = (focus: ProjectFocus | undefined): void => {
    try {
      if (focus === undefined) localStorage.removeItem(FOCUS_KEY)
      else localStorage.setItem(FOCUS_KEY, JSON.stringify(focus))
    } catch { /* private mode: the tree simply waits for the first response */ }
  }
  let focusSnapshot: ProjectFocus | undefined = readCachedFocus()
  let currentKeySeen = false
  const focusListeners = new Set<() => void>()
  const computeFocus = (): void => {
    const sessionState = ctx.sessions.list.getSnapshot()
    const key = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    if (key !== undefined) currentKeySeen = true
    const row = key === undefined ? undefined : sessionState.byId[key]
    const cwd = row?.cwd
    const projectRows = projects.getSnapshot()
    const workspace = key === undefined ? undefined : ctx.workspaces.list.getSnapshot().items.find(candidate =>
      candidate.sessionIds.includes(key) || (cwd !== undefined && candidate.path === cwd))
    // Keep the restored focus until the app has produced a current session at
    // least once, and until that session's row/project row can actually judge
    // it. Clearing on the first empty snapshot would flash an empty drawer and
    // discard the cached tree the snapshot exists for.
    if (focusSnapshot !== undefined && !currentKeySeen) return
    if (focusSnapshot !== undefined && key !== undefined && row === undefined) return
    if (focusSnapshot !== undefined && key !== undefined && cwd !== undefined && workspace === undefined && projectRows.length === 0) return
    // The selected Workspace owns the directory even before it carries Noven
    // project metadata. The library catalog remains the fallback for legacy
    // Sessions whose cwd names a registered project but not a Workspace.
    const project = cwd === undefined ? undefined : projectRows.find(candidate => candidate.root === cwd)
    const root = workspace?.path ?? project?.root
    const next: ProjectFocus | undefined = root === undefined || key === undefined ? undefined : {
      root,
      sessionId: key,
      title: project?.title ?? workspace?.title,
    }
    // 滞回：绑定会话还在、只是 cwd/登记行瞬时空白时不清焦点——否则内容树被
    // publish(undefined) 清成「新建」空态，下一拍又回来，肉眼就是导航抽搐。
    // 会话行消失或 cwd 真换到别的根时照常落空（C6）。
    if (next === undefined && focusSnapshot !== undefined && key !== undefined && key === focusSnapshot.sessionId) {
      if (row !== undefined && (row.cwd === undefined || row.cwd === focusSnapshot.root)) return
    }
    const same = next === undefined ? focusSnapshot === undefined
      : focusSnapshot !== undefined && next.root === focusSnapshot.root && next.sessionId === focusSnapshot.sessionId && next.title === focusSnapshot.title
    if (same) return
    focusSnapshot = next
    writeCachedFocus(next)
    for (const listener of focusListeners) listener()
  }
  const projectFocus: ObservableSnapshot<ProjectFocus | undefined> = {
    getSnapshot: () => focusSnapshot,
    subscribe: listener => { focusListeners.add(listener); return () => { focusListeners.delete(listener) } },
  }
  /** Current-Workspace Sessions for the side Conversation's header menu. */
  const computeSideSessions = (): SideSessions => {
    const root = focusSnapshot?.root
    const list = ctx.sessions.list.getSnapshot()
    const workspace = ctx.workspaces.list.getSnapshot().items.find(item => item.path === root)
    const rows = list.ids
      .map(id => list.byId[id])
      .filter((row): row is NonNullable<typeof row> => row !== undefined
        && (workspace?.sessionIds.includes(row.id) === true || (root !== undefined && row.cwd === root)))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(row => ({ id: row.id, title: row.displayTitle, blank: row.blank === true }))
    return { rows, currentId: rows.find(row => (list.byId[row.id]?.retainedBy.mainView ?? 0) > 0)?.id }
  }
  let sideSessionsCache: SideSessions | undefined
  const sideSessionsSource: ObservableSnapshot<SideSessions> = {
    getSnapshot: () => (sideSessionsCache ??= computeSideSessions()),
    subscribe: listener => {
      const refresh = (): void => {
        sideSessionsCache = computeSideSessions()
        listener()
      }
      const stopSessions = ctx.sessions.list.subscribe(refresh)
      const stopWorkspaces = ctx.workspaces.list.subscribe(refresh)
      const stopFocus = projectFocus.subscribe(refresh)
      return () => { stopSessions(); stopWorkspaces(); stopFocus() }
    },
  }
  ctx.effect(() => {
    const offCurrent = ctx.uiSession.adapter.current.subscribe(computeFocus)
    const offList = ctx.sessions.list.subscribe(computeFocus)
    const offProjects = projects.subscribe(computeFocus)
    const offWorkspaces = ctx.workspaces.list.subscribe(computeFocus)
    computeFocus()
    return () => { offCurrent(); offList(); offProjects(); offWorkspaces() }
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
    /** Product-owned feature routing; the host controller implements it in this workspace. */
    provideTabRouter?: (router: { route(sessionId: SessionId, kind: string): boolean }) => () => void
    canvasSide?: { get(): 'left' | 'right'; toggle(): void }
    canvas?: {
      getSnapshot(): { readonly kind: string } | undefined
      subscribe?(listener: () => void): () => void
    }
    /** 画布 claim：有活动页且未停靠时给 side，停靠/空画布为 null。 */
    canvasClaims?: {
      claim(sessionId: SessionId | null): 'left' | 'right' | null
      subscribe(listener: () => void): () => void
    }
  }

  /** 确保画布宿主存在；内容和当前折叠状态由各自所有者决定。 */
  const ensureCanvas = (): void => {
    try { ctx.sidebarRight.openTab(CANVAS_KIND, { expandColumn: false, preserveCanvasParked: true }) }
    catch { /* 座未挂（无绑定会话）——对象标签照开，画布等座出现再挂 */ }
  }

  /** 打开或激活一个 host 注册页；默认入口在同一画布内去重，关闭页签仍由页面自己清理资源。 */
  const openCanvasPage = (sessionId: SessionId, kind: string): void => {
    const definition = canvasPages.get(kind)
    if (definition === undefined) return
    const pageKey = kind
    canvasInstance.actions.open({
      key: `page:${pageKey}`, kind: 'page', title: definition.title(),
      owner: sessionId, pageKind: kind, pageKey,
    })
    ensureCanvas()
  }

  /** Open a host page in the current session without making the footer depend on canvas ownership. */
  const openCurrentCanvasPage = (kind: string): void => {
    const sessionId = (ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined) ?? recentSession()?.id
    if (sessionId !== undefined) openCanvasPage(sessionId, kind)
  }

  /**
   * 功能入口的唯一路由：对象页进画布页签，只有伴随视图（本会话/设定/会话设置）
   * 留在右栏。工具菜单与会话 ⋯ 菜单都走这里，避免两处语义分叉。
   */
  const openFeatureTabFor = (sessionId: SessionId, kind: string): boolean => {
    const title = ctx.sidebarRightTabs.guide().find(box => box.kind === kind)?.title() ?? kind
    if (kind === 'files') {
      canvasInstance.actions.open({ key: 'files', kind: 'files', title, owner: sessionId })
      ensureCanvas()
      return true
    }
    if (kind === 'noven:library') {
      canvasInstance.actions.open({ key: 'library', kind: 'library', title, owner: sessionId })
      ensureCanvas()
      return true
    }
    if (canvasPages.get(kind) !== undefined) { openCanvasPage(sessionId, kind); return true }
    return false
  }
  ctx.effect(() => rightExtras.provideTabRouter?.({
    route: (sessionId, kind) => openFeatureTabFor(sessionId, kind),
  }) ?? (() => {}), 'noven-shell: feature tab routing')
  let featureTabsValue: readonly SidebarRightGuideBox[] | undefined
  let canvasFeatureTabsValue: readonly SidebarRightGuideBox[] = []
  const canvasFeatureTabsSource: ObservableSnapshot<readonly SidebarRightGuideBox[]> = {
    getSnapshot: () => {
      const current = featureTabsSource.getSnapshot()
      if (current !== featureTabsValue) {
        featureTabsValue = current
        canvasFeatureTabsValue = current.filter(box =>
          box.kind === 'files' || box.kind === 'noven:library' || canvasPages.get(box.kind) !== undefined)
      }
      return canvasFeatureTabsValue
    },
    subscribe: listener => featureTabsSource.subscribe(listener),
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
      cardAddr: { root: rootOf(addr) }, moduleId,
      presentation: moduleId === undefined ? 'inline' : 'page',
      ...(addModule ? { addModule: true } : {}) })
    ensureCanvas()
  }

  /** Open the first committed import object, then reveal it in the IDE canvas. */
  const openLandedImport = (items: readonly ImportLanded[], addr: CardAddr): boolean => {
    const item = items[0]
    const session = addr.sessionId ?? (ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined) ?? recentSession()?.id
    if (item === undefined || session === undefined) return false
    if (item.cardId !== undefined) {
      openCanvasCard(item.cardId, addr, undefined, session, false, item.name)
    } else {
      const kind = fileTabKind(item.path)
      canvasInstance.actions.open({ key: `${kind}:${item.path}`, kind, title: item.name, owner: session, path: item.path })
      ensureCanvas()
    }
    changeMode('ide')
    return true
  }

  /** 模块级命令的公共通道：先 loadCard 拿 version 再 apply（树行 ⋯ 菜单走这里）。 */
  const moduleCommand = async (addr: CardAddr, cardId: string, build: (state: import('./card-api.ts').CardState) => CardCommand | undefined): Promise<boolean> => {
    try {
      const state = await fetchCard(addr, cardId)
      if (state === undefined) throw new Error(t('cardpage.missing'))
      const command = build(state)
      if (command === undefined) return false
      await cardOp(addr, { op: 'apply', cardId, version: state.version, command })
      treeSource.refresh()
      return true
    } catch (reason: unknown) {
      notifyUndo({ text: fmt(t, 'ui.receipt.failedReason', { name: cardId, reason: reason instanceof Error ? reason.message : String(reason) }) })
      return false
    }
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
        const detail = reason instanceof Error ? reason.message : String(reason)
        notifyUndo({ text: detail === ''
          ? fmt(t, 'ui.receipt.failed', { name })
          : fmt(t, 'ui.receipt.failedReason', { name, reason: detail }) })
      })
  }

  /** Delete one catalog card with an undo receipt; used by 我的 cards and the preview. */
  const deleteCatalogCard = async (addr: CardAddr, cardId: string, name: string): Promise<void> => {
    await cardOp(addr, { op: 'delete', cardId })
    cardCache.put(addr, cardId, undefined)
    cards.refresh()
    notifyUndo({
      text: fmt(t, 'ui.receipt.cardDeleted', { name }),
      undoLabel: t('ui.undo'),
      undo: () => {
        void cardOp(addr, { op: 'restore', cardId })
          .then(() => { cards.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: card restore failed:', reason) })
      },
    })
  }

  /** Archive every conversation accounted to a workspace and drop its sidebar registration. */
  const archiveWorkspace = async (root: string): Promise<void> => {
    const workspacesSvc = ctx.get('workspaces') as IWorkspaces | undefined
    const workspace = workspacesSvc?.list.getSnapshot().items.find(candidate => candidate.path === root)
    if (workspacesSvc === undefined || workspace === undefined) return
    for (const sessionId of workspace.sessionIds) {
      await workspacesSvc.archiveSession(sessionId, { stopActivity: true }).catch((reason: unknown) => {
        console.warn('noven-shell: archive library session failed:', reason)
      })
    }
    await workspacesSvc.delete(workspace.workspaceId).catch((reason: unknown) => {
      console.warn('noven-shell: delete library workspace failed:', reason)
    })
  }

  /** 从侧栏移出: drop the workspace and archive its conversations; the folder stays. */
  const removeLibraryFromSidebar = async (root: string): Promise<void> => {
    if (isMiscRoot(root)) return
    await archiveWorkspace(root)
    await projectOp({ op: 'unregister', root }).catch(() => undefined)
    forgetCachedTree(root)
    forgetColdWhere('card', key => key.startsWith(`${root}::`))
    cards.refresh()
    projects.refresh()
  }

  /** 删除创作库: move the folder to the system Trash, then drop the workspace and archive its conversations. */
  const trashLibrary = async (root: string): Promise<void> => {
    if (isMiscRoot(root)) return
    await projectOp({ op: 'trash', root })
    await archiveWorkspace(root)
    forgetCachedTree(root)
    forgetColdWhere('card', key => key.startsWith(`${root}::`))
    cards.refresh()
    projects.refresh()
  }

  /**
   * 编辑一张卡：管理/身份会话优先，其次这个库最近的真实会话，最后才新建一个。
   * openSession 用 transition:'none' 直切，排布按 IDE 种子落地。
   */
  const editCardInSession = async (cardId: string, addr: CardAddr): Promise<void> => {
    const root = rootOf(addr)
    const sessions = ctx.sessions.list.getSnapshot()
    const workspacesSvc = ctx.get('workspaces') as IWorkspaces | undefined
    const archived = new Set(workspacesSvc?.list.getSnapshot().archivedSessionIds ?? [])
    const current = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    const active = (id: SessionId): boolean => sessions.byId[id] !== undefined && !archived.has(id)
    interface Manager { readonly sessionId: SessionId; readonly kind: 'managed' | 'identity' }
    let managers: readonly Manager[] = []
    try {
      const response = await fetch(`/api/noven-card-managers?card=${encodeURIComponent(cardId)}&root=${encodeURIComponent(root)}`)
      if (response.ok) {
        const body = await response.json() as { managers?: readonly Manager[] }
        managers = body.managers ?? []
      }
    } catch { /* the reverse lookup is optional; the workspace fallback still works */ }
    const rank = (manager: Manager): number => sessions.byId[manager.sessionId]?.updatedAt ?? 0
    const ordered = [...managers]
      .filter(manager => active(manager.sessionId))
      .sort((left, right) => left.kind === right.kind ? rank(right) - rank(left) : left.kind === 'managed' ? -1 : 1)
    let target = current !== undefined && ordered.some(manager => manager.sessionId === current)
      ? current
      : ordered[0]?.sessionId
    if (target === undefined) {
      let best: { readonly id: SessionId; readonly at: number } | undefined
      for (const id of sessions.ids) {
        const row = sessions.byId[id]
        if (row?.cwd !== root || row.blank === true || !active(id)) continue
        if (best === undefined || row.updatedAt > best.at) best = { id, at: row.updatedAt }
      }
      if (best !== undefined) target = best.id
    }
    let created = false
    if (target === undefined) {
      target = await createSessionIn(root)
      created = true
    }
    if (current !== target) {
      ;(ctx.uiWorkspace.openSession as (id: SessionId, options?: { transition?: 'none' }) => void)(target, { transition: 'none' })
      await new Promise<void>(resolve => { window.setTimeout(resolve, 250) })
    }
    openCanvasCard(cardId, { sessionId: target, root }, undefined, target)
    if (created) {
      await bindingOp(target, { op: 'set-managed', cardId, permission: 'free' }).catch((reason: unknown) => {
        console.warn('noven-shell: set managed card failed:', reason)
      })
      notifyUndo({ text: t('me.preview.createdSession') })
    }
  }

  /** Resolve object I/O to a Session in the focused workspace, creating one only in that root. */
  const ensureSession = async (): Promise<SessionId | undefined> => {
    const bound = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    const root = focusSnapshot?.root
    const boundRoot = bound === undefined ? undefined
      : ctx.workspaces.list.getSnapshot().items.find(workspace => workspace.sessionIds.includes(bound))?.path
        ?? ctx.sessions.list.getSnapshot().byId[bound]?.cwd
    if (bound !== undefined && (root === undefined || boundRoot === root)) return bound
    const recent = recentSession(root)
    if (recent !== undefined) { ctx.uiWorkspace.openSession(recent.id); return recent.id }
    const targetRoot = root ?? miscProjectRoot()
    if (targetRoot === '') return undefined
    const id = await createSessionIn(targetRoot).catch(() => undefined)
    if (id !== undefined) ctx.uiWorkspace.openSession(id)
    return id
  }

  const readDoc = async (sessionId: SessionId, path: string): Promise<string | undefined> => {
    const page = await ctx.remote.workspaceFiles.read(sessionId, path, {}, new AbortController().signal)
    if (page.ok) return page.value.text
    if (page.error.code === 'workspace-file/not-found') return undefined
    throw page.error
  }

  const readProjectAsset = async (sessionId: SessionId, assetPath: string, base?: string): Promise<Blob | null> => {
    const params = new URLSearchParams({ session: sessionId, path: assetPath })
    if (base !== undefined && base !== '') params.set('base', base)
    const response = await fetch(new URL(`api/noven-frame?${params.toString()}`, document.baseURI).href).catch(() => undefined)
    return response?.ok === true ? response.blob() : null
  }

  const saveDoc = async (sessionId: SessionId, path: string, content: string, base: string | null): Promise<'ok' | 'conflict' | 'error'> => {
    const response = await fetch(new URL(`api/noven-doc?session=${encodeURIComponent(sessionId)}`, document.baseURI).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionId, path, content, base }),
    }).catch(() => undefined)
    if (response === undefined) return 'error'
    if (response.status === 409) return 'conflict'
    if (!response.ok) return 'error'
    // 保存成功后推进温层的 base：否则下一次防抖保存仍拿旧 base，必然再次 409。
    docCache.put(docKey(sessionId, path), { state: 'ready', content })
    return 'ok'
  }

  const listDir = async (sessionId: SessionId, path: string): Promise<readonly { name: string; type: string }[]> => {
    // 服务端拒收空路径——根目录用 "." 表达。
    const listing = await ctx.remote.workspaceFiles.list(sessionId, path === '' ? '.' : path, new AbortController().signal)
    if (!listing.ok) throw listing.error
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
    void docCache.refresh(key, async () => {
      const content = await readDoc(sessionId, path)
      return content === undefined ? { state: 'missing' } : { state: 'ready', content }
    }).catch((reason: unknown) => { console.warn('noven-shell: document read failed:', reason) })
  }

  /** 强制重拉：保留旧快照到响应到达——重挂中的岛/预览不闪空。 */
  const refreshDoc = (sessionId: SessionId, path: string): void => {
    const key = docKey(sessionId, path)
    void docCache.refresh(key, async () => {
      const content = await readDoc(sessionId, path)
      return content === undefined ? { state: 'missing' } : { state: 'ready', content }
    }).catch((reason: unknown) => { console.warn('noven-shell: document refresh failed:', reason) })
  }

  const ensureDir = (sessionId: SessionId, path: string): void => {
    const key = dirKey(sessionId, path)
    if (dirCache.get(key) !== undefined) return
    dirCache.put(key, { state: 'loading', entries: [] })
    void dirCache.refresh(key, async () => {
      const entries = await listDir(sessionId, path)
      return { state: 'ready', entries }
    }).catch((reason: unknown) => { console.warn('noven-shell: directory read failed:', reason) })
  }

  /** 目录版强制重拉：旧清单留到响应到达（文件列表挂回时用——目录成员可能已变）。 */
  const refreshDir = (sessionId: SessionId, path: string): void => {
    const key = dirKey(sessionId, path)
    void dirCache.refresh(key, async () => {
      const entries = await listDir(sessionId, path)
      return { state: 'ready', entries }
    }).catch((reason: unknown) => { console.warn('noven-shell: directory refresh failed:', reason) })
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
        if (misc === '') return
        const sessionId = await ensureSession()
        if (sessionId === undefined) return
        if (ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd !== misc) {
          const id = await createSessionIn(misc).catch(() => undefined)
          if (id === undefined) return
          // The create panel owns the nav transition. Opening the newly seeded
          // misc session must only rebind the canvas, or it remounts the create
          // surface and discards the card tab opened right after this call.
          const seam = ctx.uiWorkspace as {
            openSession?: (target: SessionId, options?: { panel?: 'preserve'; transition?: 'none' }) => void
          }
          seam.openSession?.(id, { panel: 'preserve', transition: 'none' })
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
        ensureCanvas()
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
        ensureCanvas()
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
      if (created.cardId !== undefined) {
        // The create path can seat a different misc Session first. Let that
        // selection commit before opening the card, or the canvas still holds
        // the previous owner and drops the new tab.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { resolve() })))
        openCanvasCard(created.cardId, addr, created.focusModuleId, addr.sessionId)
      }
      if (created.interview === true) queueInterview(request)
    })().catch((reason: unknown) => { console.warn('noven-shell: create failed:', reason) })
  }

  /** 创作是独立主面板；新建会话仍是另一条空白对话命令。 */
  const sidebarPanels = ctx.get('sidebarPanels') as {
    registerActivation(id: MainPanelId, activate: (target: HTMLElement) => void): () => void
  }
  /**
   * New Session is a command, not a third main panel: it selects a reusable
   * blank Session and clears any panel selection. The blank conversation's own
   * hero is the creation surface; the main subject stays conversation.
   */
  let openingCreateSurface = false
  const onCreateSurface = (): void => {
    if (openingCreateSurface) return
    openingCreateSurface = true
    try {
      const seam = ctx.uiWorkspace as {
        reusableBlank?: (workspaceId?: WorkspaceId, options?: { agentPreset?: string }) => SessionId | undefined
        openSession?: (target: SessionId, options?: { panel?: 'preserve', transition?: 'none' }) => void
      }
      const current = Object.values(ctx.sessions.list.getSnapshot().byId)
        .find(row => (row.retainedBy.mainView ?? 0) > 0)
      const host = current?.blank === true && current.projectionValues?.agentPreset === 'create'
        ? current.id
        : seam.reusableBlank?.(undefined, { agentPreset: 'create' })
      if (host !== undefined) seam.openSession?.(host, { panel: 'preserve', transition: 'none' })
      ctx.layout.selectPanel(null)
    } finally {
      openingCreateSurface = false
    }
  }
  ctx.effect(() => {
    const surface = ctx.uiWorkspace as { registerNewSessionSurface?: (open: () => void) => () => void }
    const dispose = surface.registerNewSessionSurface?.(() => { onCreateSurface() })
    return () => { dispose?.() }
  }, 'noven-shell: new session surface')
  // Archiving the Session on stage with no live row left clears the selection;
  // the viewer lands on the creation page instead of an empty main view.
  // A running creation scene owns navigation: the transient empty selection
  // inside its commit must not be mistaken for that landing.
  const inCreateScene = (): boolean => document.documentElement.hasAttribute('data-create-scene')
  ctx.effect(() => {
    let previous: SessionId | undefined
    const reconcile = (): void => {
      const list = ctx.sessions.list.getSnapshot()
      const current = Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
      const archived = new Set<string>(
        (ctx.get('workspaces') as IWorkspaces | undefined)?.list.getSnapshot().archivedSessionIds ?? [],
      )
      if (!inCreateScene() && current === undefined && previous !== undefined && archived.has(previous)
        && ctx.layout.panelInfo.getSnapshot().activePanelId === null) {
        onCreateSurface()
      }
      previous = current
    }
    const stopSessions = ctx.sessions.list.subscribe(reconcile)
    const workspaces = ctx.get('workspaces') as IWorkspaces | undefined
    const stopWorkspaces = workspaces?.list.subscribe(reconcile)
    reconcile()
    return () => { stopSessions(); stopWorkspaces?.() }
  }, 'noven-shell: archive fallback surface')
  const NAV: readonly { id: MainPanelId; order: number; label: () => string; Icon: (p: { size: number; active: boolean }) => React.ReactNode }[] = [
    { id: CREATE_ID, order: 5, label: () => t('nav.create'), Icon: CreateIcon },
    { id: HOME_ID, order: 10, label: () => t('nav.home'), Icon: HomeIcon },
    { id: MESSAGES_ID, order: 30, label: () => t('nav.messages'), Icon: BellIcon },
    { id: ME_ID, order: 40, label: () => t('nav.me'), Icon: MeIcon },
  ]

  /** 社区与消息尚未接入：行灰置可见，点击不切面板，只抖一下 + 居中「敬请期待」。 */
  const SOON_IDS: ReadonlySet<MainPanelId> = new Set([HOME_ID, MESSAGES_ID])
  for (const id of SOON_IDS) {
    ctx.effect(() => sidebarPanels.registerActivation(id, target => {
      showComingSoon(target, t('nav.comingSoon'))
    }), `noven-shell: unavailable panel ${id}`)
  }

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

  // 同一份数据与操作面供右侧画布树和左侧内容导航复用；挂载位置不持有页面模式。
  const treeInjected = (sessionId: SessionId): TreeInjected => {
      /** Studio 新建入口：建一条 模- 会话并把本会话画布切到手机屏。 */
      const createSim = (): void => {
        const root = focusSnapshot?.root
        void createSimSession(root)
          .then(id => { if (id !== undefined) { canvasInstance.actions.select(sessionId, 'chat'); ensureCanvas() } })
          .catch((reason: unknown) => { console.warn('noven-shell: sim create failed:', reason) })
      }
      /** 「新建 → Studio」：翻转 Studio 组存续态；开启时把画布切回会话页签（手机屏在其中）。 */
      const toggleStudio = (): void => {
        const root = focusSnapshot?.root
        if (root === undefined) return
        const on = canvasInstance.getSnapshot().studioOn?.[root] === true
        canvasInstance.actions.studioSet(root, !on)
        if (!on) { canvasInstance.actions.select(sessionId, 'chat'); ensureCanvas() }
      }
      /** 本会话画布焦点叶的当前页签 key——树行点亮"当前页"用。 */
      const activeTabSnap: ObservableSnapshot<string | undefined> = {
        getSnapshot: () => activeKey(canvasInstance.getSnapshot(), sessionId),
        subscribe: listener => canvasInstance.subscribe(listener),
      }
      /** 挂窗勾选态：本会话有 conv 浮窗漂着即算挂着。 */
      const dockFloatSnap: ObservableSnapshot<boolean> = {
        getSnapshot: () => canvasInstance.getSnapshot().floats?.[sessionId]?.some(f => f.key.startsWith('conv:')) === true,
        subscribe: listener => canvasInstance.subscribe(listener),
      }
      const ensureDockFn = dockApi?.ensureDock
      return {
      directoryQuery,
      setDirectoryQuery,
      sessionId,
      hooks: {
        tree: treeSource, project: projectFocus, projects,
        sims: simSessionsSource(ctx.sessions, ctx.workspaces, canvasInstance, sessionId),
        dock: dockFloatSnap, bottomPanel: bottomOpenSnap, studio: studioOnSnap, activeTab: activeTabSnap,
        featureTabs: canvasFeatureTabsSource,
      },
      openSim: id => {
        const root = focusSnapshot?.root
        if (root === undefined) return
        canvasInstance.actions.simOpenSet(root, id)
        canvasInstance.actions.select(sessionId, 'chat')
        ensureCanvas()
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
      /** 工具菜单功能行 → 画布页签；只有伴随视图留在右栏。 */
      openFeatureTab: kind => { ctx.sidebarRight.openTabIn(sessionId, kind) },
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
            ensureCanvas()
          })
          .catch((reason: unknown) => { console.warn('noven-shell: dock open failed:', reason) })
      },
      /** 底部面板：转发给页头那个真实控件——状态唯一归属它，天然同步。 */
      toggleBottomPanel: betterSidebar === undefined ? undefined : () => {
        document.querySelector<HTMLButtonElement>('button[data-dsh-bottom-toggle]')?.click()
      },
      renameFile: (path, name) => {
        void fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rename', path, name })
          .then(result => { if (result.ok) treeSource.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: file rename failed:', reason) })
      },
      deleteFile: (path, workId) => {        const name = path.split('/').pop() ?? path
        const addr = { sessionId, root: focusSnapshot?.root }
        void (async () => {
          const result = await fileOp(addr, { op: 'rm', path })
          // 404 = 文件已不在磁盘，删除目标已经达成；照样摘作品登记并刷新，
          // 否则清单里会留下永远删不掉的死行。
          if (!result.ok && result.status !== 404) {
            notifyUndo({ text: result.error === undefined
              ? fmt(t, 'ui.receipt.failed', { name })
              : fmt(t, 'ui.receipt.failedReason', { name, reason: result.error }) })
            return
          }
          if (workId !== undefined) await libraryOp(addr, { op: 'unregister', workId }).catch(() => undefined)
          canvasInstance.actions.close(sessionId, `doc:${path}`)
          canvasInstance.actions.close(sessionId, `work:${path}`)
          treeSource.refresh()
          notifyUndo({ text: fmt(t, result.ok ? 'ui.receipt.fileDeleted' : 'ui.receipt.fileGone', { name }) })
        })()
      },
      present: (path, view) => {
        void presentNode({ sessionId, root: focusSnapshot?.root }, path, view)
          .then(ok => { if (ok) treeSource.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: present failed:', reason) })
      },
      openCard: (cardId, moduleId, title) => openCanvasCard(cardId, { sessionId, root: focusSnapshot?.root }, moduleId, sessionId, false, title),
      addModule: cardId => {
        // 「＋ 新模块」是当前卡上的动作：若这张卡/它的模块页已经在画布上，就在
        // 那个页签原地弹库，不另开总览把用户从正在看的模块上赶走。
        const state = canvasInstance.getSnapshot()
        const active = state.tabs.find(tab => tab.owner === sessionId && tab.key === activeKey(state, sessionId))
        const cardTabs = state.tabs.filter(tab => tab.owner === sessionId && tab.kind === 'card' && tab.cardId === cardId)
        const open = active?.kind === 'card' && active.cardId === cardId
          ? active
          : cardTabs.find(tab => tab.moduleId !== undefined) ?? cardTabs[0]
        if (open !== undefined) {
          canvasInstance.actions.open({ ...open, addModule: true })
          ensureCanvas()
          return
        }
        openCanvasCard(cardId, { sessionId, root: focusSnapshot?.root }, undefined, sessionId, true)
      },
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
          .then(accepted => {
            if (!accepted) return
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
      },
      openDoc: (path, title) => {
        const kind = fileTabKind(path)
        canvasInstance.actions.open({ key: `${kind}:${path}`, kind, title, owner: sessionId, path })
        ensureCanvas()
      },
      openWork: (path, title) => {
        canvasInstance.actions.open({ key: `work:${path}`, kind: 'work', title, owner: sessionId, path })
        ensureCanvas()
      },
      openFiles: () => {
        canvasInstance.actions.open({ key: 'files', kind: 'files', title: t('tree.files'), owner: sessionId })
        ensureCanvas()
      },
      openCreate: (kind, dir) => {
        // studio 不进面板：它是 Studio 组的开关；其余 kinds 走画布新建面板。
        if (kind === 'studio') { toggleStudio(); return }
        canvasInstance.actions.openDialog(sessionId, kind, dir)
        ensureCanvas()
      },
      openModule: () => {
        // 「新建 → 新增模块」永远落一个新的无分组卡：模块库直接弹出，选中的模块
        // 落在卡根。要给已有卡加模块，用卡行尾的「＋」。
        const addr: CardAddr = { sessionId, ...(focusSnapshot === undefined ? {} : { root: focusSnapshot.root }) }
        void cardOp(addr, { op: 'create', kind: 'CHARACTER', name: t('create.module.defaultName'), starter: 'blank' })
          .then(created => {
            if (created.cardId === undefined) return
            treeSource.refresh()
            openCanvasCard(created.cardId, addr, undefined, sessionId, true)
          })
          .catch((reason: unknown) => { console.warn('noven-shell: module create failed:', reason) })
      },
      openProject: () => {
        const root = focusSnapshot?.root
        if (root === undefined) return
        instance.actions.focusLibrary(root)
        face.openPanel(ME_ID)
      },
      renameWork: (workId, title) => {
        void libraryOp({ sessionId, root: focusSnapshot?.root }, { op: 'rename-work', workId, title })
          .then(() => { treeSource.refresh() })
          .catch((reason: unknown) => { console.warn('noven-shell: work rename failed:', reason) })
      },
      dropWork: (workId, title) => {
        void libraryOp({ sessionId, root: focusSnapshot?.root }, { op: 'unregister', workId })
          .then(() => { treeSource.refresh(); notifyUndo({ text: fmt(t, 'ui.receipt.workDropped', { name: title }) }) })
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
          const failed = new Set<string>()
          for (const it of items) {
            try {
              if (it.cardId !== undefined) {
                await cardOp(addr, { op: 'delete', cardId: it.cardId })
                cardCache.put(addr, it.cardId, undefined)
              } else {
                const result = await fileOp(addr, { op: 'rm', path: it.path })
                // 404 = 文件已不在磁盘，按删除成功处理；其他拒绝不收尾，避免清单项先丢。
                if (!result.ok && result.status !== 404) { failed.add(it.path); continue }
              }
              if (it.workId !== undefined) await libraryOp(addr, { op: 'unregister', workId: it.workId })
            } catch (reason) {
              failed.add(it.path)
              console.warn('noven-shell: batch delete failed:', it.path, reason)
            }
          }
          const done = items.filter(it => !failed.has(it.path))
          for (const row of canvasInstance.getSnapshot().tabs) {
            if (done.some(i => i.cardId !== undefined && i.cardId === row.cardId) && row.owner === sessionId) {
              canvasInstance.actions.close(sessionId, row.key)
            }
            if (done.some(i => i.cardId === undefined && (`doc:${i.path}` === row.key || `work:${i.path}` === row.key)) && row.owner === sessionId) {
              canvasInstance.actions.close(sessionId, row.key)
            }
          }
          treeSource.refresh()
          notifyUndo({
            text: failed.size === 0
              ? fmt(t, 'ui.receipt.selDeleted', { n: items.length })
              : fmt(t, 'ui.receipt.selDeletePartial', { ok: items.length - failed.size, failed: failed.size }),
          })
        })()
      },
      expandDrawer: () => ctx.sidebarRight.toggleExpanded(),
      }
  }

  ctx.effect(() => {
    let dispose: (() => void) | undefined
    const sync = (): void => {
      const ide = subjectInstance.getSnapshot().subject === 'canvas'
      if (ide && dispose === undefined) {
        dispose = ctx.slots.inject('sidebar.workspaces.content', () => ctx.slots.register({
          name: 'sidebar.workspaces.content', locale: NS,
          inject: (sessionId: SessionId) => treeInjected(sessionId),
        }, LeftContentTree))
      }
      if (!ide) { dispose?.(); dispose = undefined }
    }
    sync()
    const unsubscribe = subjectInstance.subscribe(sync)
    return () => { unsubscribe(); dispose?.() }
  }, 'noven-shell: mode content navigation')

  // 皮肤由主体决定：空白会话 hero 的薄荷底只在 Agent 主视图成立，手作的
  // 侧边会话保持普通会话底色。
  ctx.effect(() => {
    const root = document.documentElement
    const sync = (): void => { root.dataset.novenSubject = subjectInstance.getSnapshot().subject }
    sync()
    const unsubscribe = subjectInstance.subscribe(sync)
    return () => { unsubscribe(); delete root.dataset.novenSubject }
  }, 'noven-shell: subject attribute')

  // 侧边主体的上级入口只注册一次：哪个主体在侧边，就换哪个 provider；
  // 位置由框架的侧边 trailing 座固定，内容不再各自注册自己的上级。
  const retainSideSession = (id: SessionId) => ctx.sessions.retain(id, { source: 'novenShell' })
  ctx.effect(() => ctx.slots.inject('side.header.trailing', () => ctx.slots.register({
    name: 'side.header.trailing', locale: NS,
    children: {
      'side.parent.directory': { kind: 'single', scope: 'session' },
    },
    inject: (): SideParentInjected => ({
      subject: subjectSource,
      currentSession: currentSessionSource,
      sessions: sideSessionsSource,
      openSession: (id: SessionId) => {
        ctx.uiWorkspace.openSession(id)
        ctx.layout.setAuxiliaryCollapsed(false)
      },
      showBrowser: () => {
        ctx.uiWorkspace.showSessionBrowser()
        ctx.layout.setSidebarCollapsed(false)
      },
      retainSession: retainSideSession,
    }),
  }, SideParent)), 'noven-shell: side parent')
  // 目录 provider 是侧边父级的 session 子座：框架绑定树的 hook 面，
  // 不在父组件里手工重建。
  ctx.effect(() => ctx.slots.inject('side.parent.directory', () => ctx.slots.register({
    name: 'side.parent.directory', locale: NS,
    inject: (sessionId: SessionId) => ({
      ...treeInjected(sessionId),
      revealSide: () => { ctx.layout.setAuxiliaryCollapsed(false) },
    }),
  }, DirectorySideEntry)), 'noven-shell: side parent directory')

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
      openCard: cardId => { openCanvasCard(cardId, currentCardAddr(), undefined, sessionId) },
      pages: canvasPages,
      openPage: kind => { openCanvasPage(sessionId, kind) },
      openFeatureTab: kind => { ctx.sidebarRight.openTabIn(sessionId, kind) },
      hooks: {
        featureTabs: canvasFeatureTabsSource,
        workbench: {
          getSnapshot: () => workbenchInstance.getSnapshot(),
          subscribe: listener => workbenchInstance.subscribe(listener),
        },
        project: projectFocus,
        tree: treeSource,
        outputs: sessionOutputs(ctx.sessions, sessionId),
        edits: aiEditsSource(ctx.sessions, sessionId),
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
        if (!(await fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rename', path, name })).ok) return undefined
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
        const result = await fileOp({ sessionId, root: focusSnapshot?.root }, { op: 'rm', path })
        if (!result.ok && result.status !== 404) return false
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
      submitCreate,
      importCard,
      commitImport,
      cancelImport,
      listCards: async sid => (await fetchCardList({ sessionId: sid })).map(row => ({ cardId: row.cardId, name: row.name })),
      embedFile: (cardId, moduleId, path) => {
        void moduleCommand({ sessionId, root: focusSnapshot?.root }, cardId, () => ({ kind: 'embed_file', path, moduleId }))
      },
      auxiliaryCanvas: {
        getSnapshot: () => subjectInstance.getSnapshot().subject === 'conversation',
        subscribe: listener => subjectInstance.subscribe(listener),
      },
      setAuxiliaryCollapsed: collapsed => { ctx.layout.setAuxiliaryCollapsed(collapsed) },
      revealAuxiliary,
      directory: (() => {
        const injected = treeInjected(sessionId)
        return <DirectorySideEntry {...injected} t={t}
          useTree={bindSnapshotSelector(injected.hooks.tree)}
          useProject={bindSnapshotSelector(injected.hooks.project)}
          useProjects={bindSnapshotSelector(injected.hooks.projects)}
          useSims={bindSnapshotSelector(injected.hooks.sims)}
          useDock={bindSnapshotSelector(injected.hooks.dock)}
          useBottomPanel={bindSnapshotSelector(injected.hooks.bottomPanel)}
          useStudio={bindSnapshotSelector(injected.hooks.studio)}
          useActiveTab={bindSnapshotSelector(injected.hooks.activeTab)}
          useFeatureTabs={bindSnapshotSelector(injected.hooks.featureTabs)}
          revealSide={() => { ctx.layout.setAuxiliaryCollapsed(false) }} />
      })(),
      // The client compiles against the published ui-layout types; the local
      // frame adds this method. Narrow locally, and fall back to the frame
      // attributes so a release bundle without the API still collapses.
      setCanvasFullscreen: on => {
        const layout = ctx.layout as typeof ctx.layout & { setCanvasFullscreen?: (on: boolean) => void }
        if (typeof layout.setCanvasFullscreen === 'function') {
          layout.setCanvasFullscreen(on)
          return
        }
        const work = document.querySelector<HTMLElement>('[data-work]')
        const frame = work?.parentElement
        if (frame === null || frame === undefined || work === null) return
        const targets = [frame, work]
        for (const target of targets) {
          if (on) target.setAttribute('data-canvas-fullscreen', '')
          else target.removeAttribute('data-canvas-fullscreen')
        }
      },
    }),
  }, CanvasHost))

  // Agent and IDE share the Workspace canvas. Ensure its host whenever a
  // conversation seat becomes active, without inferring mode or changing the
  // fold or active object; global panels do not publish a mounted seat.
  ctx.effect(() => {
    const ensureForMode = (): void => {
      if (ctx.sidebarRight.mounted.getSnapshot() !== undefined) ensureCanvas()
    }
    const stopMode = subjectInstance.subscribe(ensureForMode)
    const stopMounted = ctx.sidebarRight.mounted.subscribe(ensureForMode)
    ensureForMode()
    return () => { stopMode(); stopMounted() }
  }, 'noven-shell: ensure mode canvas')

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
    yield ctx.slots.register({
      name: 'main', key: CREATE_ID, locale: NS,
      inject: (): CreatePageInjected => ({
        revealAuxiliary,
        ensureBlankHost,
        revealSession,
        onStartHandcraft: startHandcraft,
        onImportCard: importCard,
      }),
    }, (p: PageProps & InjectFace<CreatePageInjected>) => (
      <Create
        t={p.t}
        revealAuxiliary={p.revealAuxiliary}
        useWorkspaces={p.useWorkspaces}
        useSessions={p.useSessions}
        renderFactorySlot={p.renderFactorySlot}
        ensureBlankHost={p.ensureBlankHost}
        revealSession={p.revealSession}
        onStartHandcraft={p.onStartHandcraft}
        onImportCard={p.onImportCard}
      />
    ))
    yield ctx.slots.register({ name: 'main', key: HOME_ID, locale: NS },
      (p: PageProps) => <Home t={p.t} />)
    yield ctx.slots.register({ name: 'main', key: MESSAGES_ID, locale: NS },
      (p: PageProps) => <Messages t={p.t} />)
    yield ctx.slots.register({ name: 'main', key: ME_ID, locale: NS, store, inject: (): MePageInjected => ({
      hooks: { cards, projects, catalogReady: cards.ready },
      onOpenPreview: face.openPreview,
      onEditCard: editCardInSession,
      setMeView: view => { instance.actions.setMeView(view) },
      // 新增项目 = 注册表 + 工作区同时出现：侧栏文件夹就是创作库的成员，注册表只留元数据。
      createProject: async (title) => {
        const parent = await ctx.uiWorkspace.pickDirectory()
        if (parent === null) return undefined
        const root = await ctx.uiWorkspace.createDirectory(parent, title)
        await projectOp({ op: 'create', root, title })
        await (ctx.get('workspaces') as IWorkspaces | undefined)?.create({ path: root }).catch(() => undefined)
        projects.refresh()
        return root
      },
      pickProject: async () => {
        const root = await ctx.uiWorkspace.pickDirectory()
        if (root === null) return undefined
        await projectOp({ op: 'create', root })
        await (ctx.get('workspaces') as IWorkspaces | undefined)?.create({ path: root }).catch(() => undefined)
        projects.refresh()
        return root
      },
      removeProject: removeLibraryFromSidebar,
      deleteProject: trashLibrary,
      // 项目名的权威是注册表 title：rename 写注册表（顺带刷纹身备份），再单向
      // 推到 Workspace 行；反向（侧栏改名 → 注册表）由下面的 workspaces.list 桥负责。
      renameProject: async (root, title) => {
        if (isMiscRoot(root)) return
        const workspacesSvc = ctx.get('workspaces') as IWorkspaces | undefined
        const ws = workspacesSvc?.list.getSnapshot().items.find(w => w.path === root)
        if (workspacesSvc !== undefined && ws !== undefined && ws.title !== title) {
          await workspacesSvc.rename(ws.workspaceId, title).catch((reason: unknown) => {
            console.warn('noven-shell: rename library workspace failed:', reason)
          })
        }
        await projectOp({ op: 'rename', root, title }).catch((reason: unknown) => {
          console.warn('noven-shell: rename project metadata failed:', reason)
        })
        projects.refresh()
      },
      newCard,
      importCard,
      exportCard: (addr, cardId, name) => exportCardPackage(addr, cardId, name),
      deleteCard: deleteCatalogCard,
      moveCard: (addr, cardId, target) => cardOp(addr, { op: 'move', cardId, targetSession: target.sessionId, targetRoot: target.root })
        .then(() => { cards.refresh() }),
    }) }, (p: PageProps & PropsStore<ReturnType<typeof createShellStore>> & InjectFace<MePageInjected>) => (
      <MeHome t={p.t} useCards={p.useCards} useProjects={p.useProjects} useCatalogReady={p.useCatalogReady} useWorkspaces={p.useWorkspaces} useStore={p.useStore}
        onOpenPreview={p.onOpenPreview} onEditCard={p.onEditCard} onSetView={p.setMeView}
        onCreateProject={p.createProject} onPickProject={p.pickProject}
        onRemoveProject={p.removeProject} onDeleteProject={p.deleteProject} onRenameProject={p.renameProject}
        onNewCard={p.newCard} onImportCard={p.importCard}
        onExportCard={p.exportCard} onDeleteCard={p.deleteCard} onMoveCard={p.moveCard} />
    ))
    yield ctx.slots.register({ name: 'main', key: CARD_PREVIEW_ID, locale: NS, store,
      inject: (): PreviewPageInjected => ({
        loadCard: (addr, cardId) => fetchCard(addr, cardId),
        back: () => { instance.actions.closePreview(); face.openPanel(ME_ID) },
        edit: (cardId, addr) => { void editCardInSession(cardId, addr) },
        exportCard: (cardId, addr, name) => {
          void exportCardPackage(addr, cardId, name).catch((reason: unknown) => {
            console.warn('noven-shell: export card failed:', reason)
          })
        },
        deleteCard: (cardId, addr, name) => {
          void deleteCatalogCard(addr, cardId, name)
            .then(() => {
              instance.actions.closePreview()
              face.openPanel(ME_ID)
            })
            .catch((reason: unknown) => {
              notifyUndo({ text: fmt(t, 'ui.receipt.failedReason', { name, reason: reason instanceof Error ? reason.message : String(reason) }) })
            })
        },
      }),
    }, (p: PageProps & PropsStore<ReturnType<typeof createShellStore>> & InjectFace<PreviewPageInjected>) => {
      const preview = p.useStore(state => state.preview)
      if (preview === null) return <div className="nv-canvas-missing">{p.t('cardpage.missing')}</div>
      return (
        <CardPreview key={`${preview.root}:${preview.sessionId ?? ''}:${preview.cardId}`}
          addr={{ root: preview.root, sessionId: preview.sessionId }} cardId={preview.cardId} t={p.t}
          loadCard={p.loadCard} onBack={p.back} onEdit={p.edit}
          onExport={p.exportCard} onDelete={p.deleteCard} />
      )
    })
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
    id: SETTINGS_DEF_ID,
    kind: SETTINGS_TAB_ID,
    title: () => t('tab.settings'),
    guide: [{ id: 'session-settings', order: 6, title: () => t('tab.settings'), description: () => t('tab.settings.hint'), icon: SettingsTabIcon }],
  }), 'noven-shell: 会话设置 type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: SETTINGS_DEF_ID, locale: NS,
    inject: (sessionId: Parameters<typeof ctx.remote.commands.list>[0]): SettingsTabInjected => ({
      sessionId,
      hooks: { docs: docCache.snapshot },
      ensureDoc,
      saveDoc: async (sid, path, content, base) => {
        const res = await saveDoc(sid, path, content, base)
        if (res === 'ok') docCache.put(docKey(sid, path), { state: 'ready', content })
        return res
      },
    }),
  }, (p: TabBodyProps & InjectFace<SettingsTabInjected>) => (
    <SettingsTab t={p.t} useTabInfo={p.useTabInfo} sessionId={p.sessionId}
      useDocs={p.useDocs} ensureDoc={p.ensureDoc} saveDoc={p.saveDoc} />
  ))), 'noven-shell: 会话设置 body')
  // The dedicated appearance page is the only visible view switch. The
  // upstream row would otherwise be a second action competing for the same view.
  ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'appearance', priority: -1,
  }, () => null)), 'noven-shell: unified appearance entry')
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'noven-workbench', order: 90, locale: NS, store: workbenchStore,
    metadata: { icon: 'settings', group: 'noven' },
    label: () => t('workbench.settings.group'),
  }, WorkbenchSection)), 'noven-shell: workbench settings')
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'noven-appearance', order: 80, locale: NS,
    metadata: { icon: 'settings', group: 'noven' },
    label: () => t('appearance.title'),
    inject: () => ({ current: currentSessionSource }),
  }, AppearanceSettingsSection)), 'noven-shell: global appearance settings')
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'noven-updates', order: 100, locale: NS,
    metadata: { icon: 'settings', group: 'noven' },
    label: () => t('updates.nav'),
  }, UpdatesSection)), 'noven-shell: about & updates')
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.workspace.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.workspace.menu.item', id: 'open-folder', order: 50, locale: NS,
    inject: (): WorkspaceFolderInjected => ({
      openFolder: path => openWorkspaceFolder(path, {
        open: request => ctx.remote.session.openWorkspacePath(request),
        failed: () => { notifyUndo({ text: t('workspace.openFolder.failed') }) },
      }),
    }),
  }, WorkspaceFolderItem)), 'noven-shell: workspace folder row')
  // Workspace ⋯ menu: reveal this folder's library section on 我的. Membership
  // is the Workspace itself, so there is no separate register/unregister row.
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.workspace.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.workspace.menu.item', id: 'open-library', order: 100, locale: NS,
    inject: (): WorkspaceLibraryInjected => ({
      openLibrary: (root) => {
        instance.actions.focusLibrary(root)
        face.openPanel(ME_ID)
      },
    }),
  }, WorkspaceLibraryItem)), 'noven-shell: workspace 创作库 row')
  // 会话行 ⋯ 菜单：把模型识别的内部会话 id 放进剪贴板（调试/贴给模型用）。
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item', id: 'copy-session-id', order: 500, locale: NS,
  }, CopySessionIdItem)), 'noven-shell: 复制会话 ID row')
  applyQuote(ctx)
  applyBranches(ctx, t)
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

  // One shared auxiliary command lives in the Conversation's real trailing slot.
  ctx.slots.inject('conversation.session.header.corner', () => ctx.slots.register({
    name: 'conversation.session.header.corner', locale: NS,
  }, (p: PropsRuntime<'conversation.session.header.corner'> & PropsLocale<'novenShell'>) => (
    <ConversationAuxiliaryChrome
      t={p.t}
      subject={subjectSource}
      useFrameFoldState={p.useFrameFoldState}
      revealAuxiliary={revealAuxiliary}
      setAuxiliaryCollapsed={collapsed => { ctx.layout.setAuxiliaryCollapsed(collapsed) }}
      sessionId={p.sessionId}
      claims={ctx.layout.canvasClaims}
      chromeHidden={p.hidden}
      navigation={<NovenSideSessionMenu
        t={p.t}
        sessions={sideSessionsSource}
        open={id => {
          ctx.uiWorkspace.openSession(id)
          ctx.layout.setAuxiliaryCollapsed(false)
        }}
        showBrowser={() => {
          ctx.uiWorkspace.showSessionBrowser()
          ctx.layout.setSidebarCollapsed(false)
        }}
      />}
    />
  )))

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
  // 这里就出对应行，藏掉的功能区从这里仍可达。开页与工具菜单共用同一路由，
  // 否则同一行会因入口不同而一边进画布、一边进右栏。
  ctx.slots.inject('conversation.session.header.more.item', () => ctx.slots.register({
    name: 'conversation.session.header.more.item', id: 'noven-features', order: 100, locale: NS,
    inject: (sessionId: SessionId): FeatureMenuInjected => ({
      hooks: { guide: featureTabsSource },
      openTab: kind => { ctx.sidebarRight.openTabIn(sessionId, kind) },
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

  // 输入框占位：33 句世界观前提在这里打字、清空、换句。挂在 dock 上是为了
  // 拿到活的 draft 状态；组件自己把文字送进输入卡片的占位层，不占 dock 高度。
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'noven-input-quote', order: 20, locale: NS,
  }, InputQuote))

  // 对话内联块：code 引用工作区 HTML，module 引用现有卡片模块。
  // 只注入读取与资源服务；没有 Chat 时 registerInlineBlocks 保持关闭态。
  registerInlineBlocks(ctx, { t, readFile: readDoc, resolveProjectAsset: readProjectAsset })

  // 空白会话的 hero 槽位：用创作页同一套 hero 覆盖 noven-brand 的旧标牌。
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -1, locale: NS,
  }, (props: HeroBrandMarkOwnerProps & PropsLocale<'novenShell'>) => <CreateHero t={props.t} />))
}
