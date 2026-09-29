/**
 * noven-workbench browser half: the 工作台 as a native sidebar view, ported
 * from the legacy desktop's ProjectNavigation workbench mode.
 *
 * The better-sidebar extension API is the whole mount: one TabDescriptor puts
 * 📖 工作台 beside 文件 in the sidebar (a navigation view of launcher rows
 * and resource trees, driven live by the registry the AI tools write), and one
 * FileViewerDescriptor claims the image extensions so a workbench image opens
 * in the editor with annotation and color picking. The terminal tab — cut by
 * product decision — is switched off once, through the same side-card setting
 * a user would flip by hand.
 *
 * @module noven-workbench/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { FileViewerDescriptor, TabComponentProps } from 'dsh-better-sidebar/client/service'
import type {} from 'dsh-better-sidebar'
import { createWorkbenchApi } from './api.ts'
import { bookGlyph } from './book-glyph.tsx'
import { en, zh } from './locales.ts'
import { NovenImageViewer } from './NovenImageViewer.tsx'
import { injectGalleryStyles } from './style.ts'
import { WorkbenchTab } from './WorkbenchTab.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'novenWorkbench'

/** The sidebar tab type id, and the image viewer id. */
export const WORKBENCH_TAB_ID = 'noven:workbench'
export const NOVEN_IMAGE_VIEWER_ID = 'noven:image'

/** The terminal tab is cut from the product; its switch flips once, ever. */
const TERMINAL_OFF_MARKER = 'noven.sidebar.terminal-off.v1'

/** Required browser services: the sidebar registry, the Remote carrier, and copy. */
export const inject = ['betterSidebar', 'locale', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the dictionaries, the workbench tab, its image
 * viewer, and the one-time terminal cut; then make sure a session gets its
 * workbench tab without hunting the + menu.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  injectGalleryStyles()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-workbench: dictionaries')

  const api = createWorkbenchApi(ctx.remote)

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: WORKBENCH_TAB_ID,
    title: () => t('tab.title'),
    description: () => t('tab.description'),
    icon: size => bookGlyph(size),
    order: 15,
    single: true,
    component: (props: TabComponentProps) => WorkbenchTab({ ...props, api, t }),
  }), 'noven-workbench: sidebar tab')

  ctx.effect(() => ctx.betterSidebar.registerFileViewer({
    id: NOVEN_IMAGE_VIEWER_ID,
    title: () => t('viewer.title'),
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'],
    priority: 10,
    fetchStrategy: 'mediaUrl',
    component: props => NovenImageViewer({ ...props, api, t }),
  } satisfies FileViewerDescriptor), 'noven-workbench: image viewer')

  // One workbench tab per session, opened the moment the sidebar has a
  // session to hold it — the workbench is the sidebar's default occupant, as
  // it was in the original desktop.
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
