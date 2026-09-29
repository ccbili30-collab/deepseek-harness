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
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import type {} from 'dsh-better-sidebar'
import { Home } from './pages/Home.tsx'
import { Create } from './pages/Create.tsx'
import { Me } from './pages/Me.tsx'
import { Messages } from './pages/Messages.tsx'
import { CardEditor } from './pages/CardEditor.tsx'
import { ContextTab } from './tabs/Context.tsx'
import { LibraryTab } from './tabs/Library.tsx'
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

/** Required browser services: slots, panel selection, theme, copy, right rail. */
export const inject = ['slots', 'locale', 'layout', 'theme', 'betterSidebar']

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
    { id: HOME_ID, order: 10, label: () => t('nav.home'), Icon: HomeIcon },
    { id: CREATE_ID, order: 20, label: () => t('nav.create'), Icon: CreateIcon },
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

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: CONTEXT_TAB_ID,
    title: () => t('tab.context'),
    icon: size => glyph.chat(size),
    order: 5,
    single: true,
    component: () => <ContextTab t={t} />,
  }), 'noven-shell: 本会话 tab')

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: LIBRARY_TAB_ID,
    title: () => t('tab.library'),
    icon: size => glyph.book(size),
    order: 12,
    single: true,
    component: () => <LibraryTab t={t} />,
  }), 'noven-shell: 创作库 tab')
}
