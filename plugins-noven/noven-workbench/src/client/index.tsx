/**
 * noven-workbench browser half: the 工作台 as a native sidebar view plus the
 * 创作空间 main canvas — the two-layer shape of the legacy desktop
 * (ProjectNavigation's launcher rows + WorkspaceShell's CreationStage).
 *
 * - `ctx.betterSidebar.registerTab` puts 📖 工作台 beside 文件: launcher rows
 *   (book glyph, title, 进入创作空间) expanding into live resource trees.
 *   Clicking a row opens the canvas.
 * - the keyed `'main'` slot hosts the canvas — 展览 mode (ported exhibition:
 *   hero, groups, documents, images), image cards staged with annotation and
 *   color picking, document cards opened in the sidebar editor whose
 *   render/edit the scope gives away.
 * - one FileViewerDescriptor claims the image extensions so images opened
 *   from the editor pane get annotate/pick too.
 * - the terminal tab — cut by product decision — is switched off once,
 *   through the same side-card setting a user would flip by hand.
 *
 * @module noven-workbench/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { FileViewerDescriptor, TabComponentProps } from 'dsh-better-sidebar/client/service'
import type {} from 'dsh-better-sidebar'
import { CreationStage } from './CreationStage.tsx'
import { createWorkbenchApi } from './api.ts'
import { bookGlyph } from './book-glyph.tsx'
import { en, zh } from './locales.ts'
import { NovenImageViewer } from './NovenImageViewer.tsx'
import { workbenchSelection } from './selection.ts'
import { injectGalleryStyles } from './style.ts'
import { WorkbenchTab } from './WorkbenchTab.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'novenWorkbench'

/** The sidebar tab type id, the image viewer id, and the canvas's main-panel id. */
export const WORKBENCH_TAB_ID = 'noven:workbench'
export const NOVEN_IMAGE_VIEWER_ID = 'noven:image'
export const PANEL_ID = 'noven-workbench' as MainPanelId

/** The terminal tab is cut from the product; its switch flips once, ever. */
const TERMINAL_OFF_MARKER = 'noven.sidebar.terminal-off.v1'

/** Required browser services: the sidebar registry, the main seat, the Remote carrier, and copy. */
export const inject = ['betterSidebar', 'slots', 'locale', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the dictionaries, the sidebar view, the
 * canvas, the image viewer, and the one-time terminal cut.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  injectGalleryStyles()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-workbench: dictionaries')

  const api = createWorkbenchApi(ctx.remote)

  /** Enter the 创作空间 for a workbench: select it, then select the canvas panel. */
  const enterStudio = (workbenchId: string): void => {
    workbenchSelection.set(workbenchId)
    try {
      ctx.layout.selectPanel(PANEL_ID)
    } catch { /* layout not mounted — the selection still lands */ }
  }

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: WORKBENCH_TAB_ID,
    title: () => t('tab.title'),
    description: () => t('tab.description'),
    icon: size => bookGlyph(size),
    order: 15,
    single: true,
    component: (props: TabComponentProps) => WorkbenchTab({ ...props, api, t, enterStudio }),
  }), 'noven-workbench: sidebar tab')

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      api,
      openDocument: (sessionId: SessionId, cwd: string, rel: string) => {
        try {
          ctx.betterSidebar.openFile({ sessionId, cwd }, `${cwd}/${rel}`, rel.split('/').pop())
        } catch { /* sidebar editor unavailable — the card click stays inert */ }
      },
    }),
  }, CreationStage))

  ctx.effect(() => ctx.betterSidebar.registerFileViewer({
    id: NOVEN_IMAGE_VIEWER_ID,
    title: () => t('viewer.title'),
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'],
    priority: 10,
    fetchStrategy: 'mediaUrl',
    component: props => NovenImageViewer({ ...props, api, t }),
  } satisfies FileViewerDescriptor), 'noven-workbench: image viewer')

  // One workbench tab per session, opened the moment the sidebar has a
  // session to hold it — the workbench is the sidebar's navigation home.
  const openedFor = new Set<string>()
  ctx.effect(() => ctx.betterSidebar.subscribeState(() => {
    const sessionId = ctx.betterSidebar.getSnapshot().sessionId
    if (sessionId === undefined || openedFor.has(sessionId)) return
    openedFor.add(sessionId)
    if (!ctx.betterSidebar.isTabEnabled(WORKBENCH_TAB_ID)) return
    ctx.betterSidebar.openTab({ type: WORKBENCH_TAB_ID })
  }), 'noven-workbench: auto-open')
}

/**
 * Perform the one-time terminal cut through the store a tab component
 * carries — the same write the side-card settings popup makes.
 * @param store - the sidebar store from the tab's props.
 */
export function cutTerminalOnce(store: TabComponentProps['store']): void {
  if (typeof localStorage === 'undefined' || localStorage.getItem(TERMINAL_OFF_MARKER) !== null) return
  localStorage.setItem(TERMINAL_OFF_MARKER, '1')
  const prefs = store.getPrefs()
  if (prefs.tabsEnabled.terminal === false) return
  store.setPrefs({ ...prefs, tabsEnabled: { ...prefs.tabsEnabled, terminal: false } })
}
