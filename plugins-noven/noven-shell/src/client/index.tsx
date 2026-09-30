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
import type { NovenShellLocaleKey } from './locales.ts'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { Home } from './pages/Home.tsx'
import { Create } from './pages/Create.tsx'
import { Me } from './pages/Me.tsx'
import { Messages } from './pages/Messages.tsx'
import { CardEditor } from './pages/CardEditor.tsx'
import { ContextTab } from './tabs/Context.tsx'
import { LibraryTab } from './tabs/Library.tsx'
import { WorkbenchTab } from './tabs/Workbench.tsx'
import { HeaderChips } from './tabs/HeaderChips.tsx'
import { FootLauncher, SessionList } from './sidebar.tsx'
import type { FootLauncherInjected, FootLauncherProps, SessionListInjected, SessionListProps } from './sidebar.tsx'
import { CardReceiptTail, CardToolView, CARD_READ_TOOLS, CARD_WRITE_TOOLS, type CardReceiptInjected } from './toolviews.tsx'
import { cardSavedDefinition } from './card-receipt.ts'
import { SlashChips } from './inputdock.tsx'
import { HomeIcon, CreateIcon, BellIcon, MeIcon, glyph } from './icons.tsx'
import { injectNovenStyles } from './style.ts'
import { en, zh } from './locales.ts'

const NS = 'novenShell'

export const HOME_ID = 'noven-home' as MainPanelId
export const CREATE_ID = 'noven-create' as MainPanelId
export const MESSAGES_ID = 'noven-messages' as MainPanelId
export const ME_ID = 'noven-me' as MainPanelId
export const CARD_EDITOR_ID = 'noven-card-editor' as MainPanelId
export const WORKBENCH_ID = 'noven-workbench' as MainPanelId
export const CONTEXT_TAB_ID = 'noven:context'
export const LIBRARY_TAB_ID = 'noven:library'
export const WORKBENCH_TAB_ID = 'noven:workbench-canvas'
const CONTEXT_DEF_ID = 'noven-shell.context'
const LIBRARY_DEF_ID = 'noven-shell.library'
const WORKBENCH_DEF_ID = 'noven-shell.workbench-canvas'

/** Which card the editor is showing — shared between 我的 and the editor entry. */
type ShellState = { cardId: string | null }
type ShellActions = { openCard: (draft: ShellState, id: string | null) => void }

function createShellStore() {
  return defineStore<ShellState, ShellActions>({
    init: () => ({ cardId: null }),
    actions: {
      openCard: (d, id) => { d.cardId = id },
    },
  })
}

/** The face main-panel inject factories hand to their pages. */
interface ShellFace {
  readonly openCard: (id: string) => void
  readonly openPanel: (id: MainPanelId) => void
}

type PageProps = PropsRuntime<'main'> & PropsLocale<'novenShell'>
type FacePageProps = PageProps & InjectFace<ShellFace>
type EditorPageProps = PageProps & PropsStore<ReturnType<typeof createShellStore>>
type TabBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'novenShell'>

/** Guide-picker glyphs for the two rail tabs. */
function ContextTabIcon({ size }: { size?: number }) { return glyph.chat(size ?? 16) }
function LibraryTabIcon({ size }: { size?: number }) { return glyph.book(size ?? 16) }

/** Required browser services: slots, panel selection, theme, copy, right rail, session navigation. */
export const inject = ['slots', 'locale', 'layout', 'theme', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'uiWorkspace']

export function apply(ctx: ClientContext): void {
  injectNovenStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-shell: dictionaries')
  const t = ctx.locale.bind(NS)

  // Noven palette over the shipped tokens (light drives the product; dark
  // keeps the same accents on dark surfaces).
  ctx.effect(() => ctx.theme.overrideTokens('noven-shell', {
    '--dsw-alias-brand-primary': { light: '#34D399', dark: '#34D399' },
    '--dsw-alias-bg-base': { light: '#F4F5F4', dark: '#131615' },
    '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1B1F1D' },
    '--dsw-alias-bg-layer-2': { light: '#F7F8F8', dark: '#222725' },
    '--dsw-alias-border-l1': { light: '#ECEEEF', dark: '#2A2F2C' },
    '--dsw-alias-label-primary': { light: '#16181A', dark: '#E8EBEA' },
    '--dsw-alias-label-secondary': { light: '#8A8F94', dark: '#8A8F94' },
    '--dsw-specific-sidebar-fill': { light: '#FFFFFF', dark: '#1B1F1D' },
  }), 'noven-shell: theme tokens')

  const handle = createShellStore()
  const instance = handle.create()
  const store: typeof handle = { ...handle, create: () => instance }
  const face: ShellFace = {
    openCard: (id) => {
      instance.actions.openCard(id)
      try { ctx.layout.selectPanel(CARD_EDITOR_ID) } catch { /* editor panel not live yet */ }
    },
    openPanel: (id) => {
      try { ctx.layout.selectPanel(id) } catch { /* panel not registered */ }
    },
  }

  const NAV: readonly { id: MainPanelId; order: number; label: () => string; Icon: (p: { size: number; active: boolean }) => React.ReactNode }[] = [
    { id: CREATE_ID, order: 5, label: () => t('nav.create'), Icon: CreateIcon },
    { id: HOME_ID, order: 10, label: () => t('nav.home'), Icon: HomeIcon },
    { id: MESSAGES_ID, order: 30, label: () => t('nav.messages'), Icon: BellIcon },
    { id: ME_ID, order: 40, label: () => t('nav.me'), Icon: MeIcon },
  ]

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
    yield ctx.slots.register({ name: 'main', key: CREATE_ID, locale: NS, inject: () => face },
      (p: FacePageProps) => <Create t={p.t} onStartPrompt={() => { /* TODO: seed a session with the prompt */ }} />)
    yield ctx.slots.register({ name: 'main', key: MESSAGES_ID, locale: NS },
      (p: PageProps) => <Messages t={p.t} />)
    yield ctx.slots.register({ name: 'main', key: ME_ID, locale: NS, inject: () => face },
      (p: FacePageProps) => <Me t={p.t} onOpenCard={p.openCard} onOpenPanel={p.openPanel} />)
    yield ctx.slots.register({ name: 'main', key: CARD_EDITOR_ID, locale: NS, store },
      (p: EditorPageProps) => <CardEditor t={p.t} />)
  })

  // Right-rail tab types register in two stages: the type definition into
  // `sidebarRightTabs`, then the body into the `sidebar.right.pane.tab` seat
  // keyed by the definition's id. The workbench canvas carries no guide
  // entries, so it stays off the "+" picker; the context tab opens it.
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
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: WORKBENCH_DEF_ID,
    kind: WORKBENCH_TAB_ID,
    title: () => t('tab.workbench'),
    keepMounted: true,
  }), 'noven-shell: 工作台 type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: CONTEXT_DEF_ID, locale: NS,
  }, (p: TabBodyProps) => <ContextTab t={p.t} useTabInfo={p.useTabInfo} />)), 'noven-shell: 本会话 body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: LIBRARY_DEF_ID, locale: NS,
  }, (p: TabBodyProps) => <LibraryTab t={p.t} />)), 'noven-shell: 创作库 body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: WORKBENCH_DEF_ID, locale: NS,
  }, (p: TabBodyProps) => <WorkbenchTab useTabInfo={p.useTabInfo} t={p.t} />)), 'noven-shell: 工作台 body')

  // The design's flat session list replaces the workspace browser (single-cell
  // shadowing: the lowest-priority live entry renders, the loser stays
  // registered but unmounted). The settings launcher seat below becomes the
  // account row; the gear keeps the shell's own openSettings callback.
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
    name: 'sidebar.workspaces', priority: -1, locale: NS,
    inject: (): SessionListInjected => ({
      openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
      startSession: () => { ctx.uiWorkspace.startSession() },
    }),
  }, (p: SessionListProps) => <SessionList {...p} />))
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher', priority: -1, locale: NS,
    inject: (): FootLauncherInjected => ({ openMy: () => { ctx.layout.selectPanel(ME_ID) } }),
  }, (p: FootLauncherProps) => <FootLauncher {...p} />))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'noven-context-chips', order: -8, locale: NS,
  }, (p: { t: (key: NovenShellLocaleKey) => string }) => <HeaderChips t={p.t} />))

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
    inject: (): CardReceiptInjected => ({ openCard: face.openCard }),
  }, CardReceiptTail))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'noven-slash-chips', order: 10, locale: NS,
  }, SlashChips))

  // 本会话 is the rail's home tab: seed the strip 本会话/创作库/文件 the first
  // time each session's seat mounts — the role noven-workbench's auto-open
  // used to play — with 本会话 left active.
  const seededFor = new Set<string>()
  ctx.effect(() => ctx.sidebarRight.mounted.subscribe(() => {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot()
    if (sessionId === undefined || seededFor.has(sessionId)) return
    seededFor.add(sessionId)
    try {
      ctx.sidebarRight.openTab(CONTEXT_TAB_ID)
      ctx.sidebarRight.openTab(LIBRARY_TAB_ID)
      ctx.sidebarRight.openTab('files')
      ctx.sidebarRight.openTab(CONTEXT_TAB_ID)
    } catch { /* no seat bound yet */ }
  }), 'noven-shell: default rail tabs')
}
