/**
 * noven-workbench browser half: the 工作台 split across the drawer's upper
 * zone and the canvas — the two-layer shape of the legacy desktop
 * (ProjectNavigation's section tree + WorkspaceShell's CreationStage).
 *
 * - the `sidebar.right.pane.top` seat hosts the permanent workbench
 *   navigation: a switcher over the workspace's registered workbenches and
 *   the current one's grouped, counted section tree. Picking a row raises
 *   the canvas with that item staged.
 * - the workbench's own tab type (`noven.workbench`, `selfChrome`) carries the
 *   stage onto the sidebar's canvas — the floating stack beside the drawer —
 *   and the stage's side toggle parks the canvas at the window edge with the
 *   drawer standing off it instead.
 * - the keyed `'main'` slot hosts the 创作空间 canvas — 展览 mode (ported
 *   exhibition: hero, groups, documents, images), image cards staged with
 *   annotation and color picking, document cards opened in the sidebar
 *   editor whose render/edit the scope gives away.
 * - one FileViewerDescriptor claims the image extensions so images opened
 *   from the editor pane get annotate/pick too.
 * - the terminal tab — cut by product decision — is switched off once,
 *   through the same side-card setting a user would flip by hand.
 *
 * @module noven-workbench/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { useEffect } from 'react'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor, parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { FileViewerDescriptor, TabComponentProps } from 'dsh-better-sidebar/client/service'
import type {} from 'dsh-better-sidebar'
import { bookGlyph } from './book-glyph.tsx'
import { CreationStage } from './CreationStage.tsx'
import { BUILTIN_FILES, createWorkbenchApi, isHtmlEntry, isImageName, isTextCandidate } from './api.ts'
import { DrawerNav, type DrawerNavProps } from './DrawerNav.tsx'
import { en, zh } from './locales.ts'
import { NovenImageViewer } from './NovenImageViewer.tsx'
import { presentSavedDefinition } from './present-receipt.ts'
import { PresentTail, type PresentTailInjected } from './PresentTail.tsx'
import { workbenchSelection } from './selection.ts'
import { STAGE_OPEN_EVENT, WORKBENCH_KIND, workbenchStage } from './stage.ts'
import { injectGalleryStyles } from './style.ts'
import { WorkbenchStage, type WorkbenchStageProps } from './WorkbenchStage.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'novenWorkbench'

/** The canvas fallback tab id, the image viewer id, and the canvas's main-panel id. */
export const STUDIO_TAB_ID = 'noven:studio'
export const NOVEN_IMAGE_VIEWER_ID = 'noven:image'
export const PANEL_ID = 'noven-workbench' as MainPanelId
/** The stage's tab-type registration id — the seat key its canvas body files under. */
export const STAGE_DEF_ID = 'noven-workbench.stage'
/** The file type's registration id and kind — it claims `file:` addresses the stage renders. */
export const FILE_STAGE_DEF_ID = 'noven-workbench.file'
export const NOVEN_FILE_KIND = 'noven.file'

/** The terminal tab is cut from the product; its switch flips once, ever. */
const TERMINAL_OFF_MARKER = 'noven.sidebar.terminal-off.v1'

/** Required browser services: the sidebar registry, the main seat, the Remote carrier, layout chrome, and copy. */
export const inject = ['betterSidebar', 'slots', 'locale', 'layout', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'remote', 'remote.workspaceFiles']

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

  // The published package predates the canvas surface: the runtime object
  // carries `canvas`, the shipped types do not. Read it through the declared
  // face rather than casting the controller.
  const canvasCtl = Reflect.get(ctx.sidebarRight, 'canvas') as ISidebarRight['canvas']

  /** Open a workspace-relative document on the canvas stage; the `file:` claim below routes it there. */
  const openDocument = (sessionId: SessionId, cwd: string, rel: string): void => {
    try {
      ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, rel))
    } catch { /* no claimer bound yet — the card click stays inert */ }
  }

  // Cross-plugin entry: noven-shell's 工作台 actions dispatch the event so the
  // shell needs no import into this plugin's internals; the canvas surface is
  // a sidebar floating pane, so opening is `openTab` on the workbench kind.
  ctx.effect(() => {
    const onOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ workbenchId?: string; sessionId?: string }>).detail
      if (detail?.workbenchId !== undefined && detail.sessionId !== undefined)
        workbenchSelection.set(detail.sessionId as SessionId, detail.workbenchId)
      try { ctx.sidebarRight.openTab(WORKBENCH_KIND) }
      catch (error) { console.error('Workbench open failed:', error) }
    }
    window.addEventListener(STAGE_OPEN_EVENT, onOpen)
    return () => { window.removeEventListener(STAGE_OPEN_EVENT, onOpen) }
  }, 'noven-workbench: stage-open listener')

  // The workbench's canvas surface: one type in the registry, its body under
  // the keyed body seat. `selfChrome` — the stage draws its own top bar.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: STAGE_DEF_ID,
    kind: WORKBENCH_KIND,
    title: () => t('stage.emptyTitle'),
    priority: 'builtin',
    selfChrome: true,
  }), 'noven-workbench: stage type')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: STAGE_DEF_ID,
    locale: NS,
    inject: () => ({ api }),
  }, StageCanvas))

  // One open semantics: a `file:` address naming content the stage renders —
  // documents, images, framed pages — lands on the workbench stage under the
  // 文件 workbench, whatever surface asked (drawer tree, chat card, gallery).
  // The `session` pattern outspecifies the generic `file/**` claimants, so a
  // workspace file comes to the stage while absolute paths and types we do not
  // render keep their own viewers.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: FILE_STAGE_DEF_ID,
    kind: NOVEN_FILE_KIND,
    patterns: ['dsh-resource://file/session/**'],
    priority: 'extension',
    selfChrome: true,
    canOpen: (address: string) => {
      const parsed = parseFileAddress(address)
      if (parsed?.scope !== 'session' || parsed.path.startsWith('/') || /^[A-Za-z]:/.test(parsed.path)) return false
      const name = parsed.path.split('/').pop() ?? parsed.path
      return isImageName(name) || isHtmlEntry(name) || isTextCandidate(name)
    },
    title: (address: string) => {
      const parsed = parseFileAddress(address)
      const name = parsed?.path.split('/').pop()
      return name === undefined || name === '' ? address : name
    },
  }), 'noven-workbench: file stage type')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: FILE_STAGE_DEF_ID,
    locale: NS,
    inject: () => ({ api }),
  }, FileStageCanvas))

  // The drawer's upper zone: the workbench's permanent navigation — switcher,
  // section tree, counted rows. The built-in files floor means the zone always
  // has content once a session is bound.
  ctx.slots.inject('sidebar.right.pane.top', () => ctx.slots.register({
    name: 'sidebar.right.pane.top',
    locale: NS,
    inject: () => ({ api, sidebarRight: ctx.sidebarRight, canvas: canvasCtl }),
  }, DrawerNavSeat))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({ api, openDocument }),
  }, MainCreationStage))

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: STUDIO_TAB_ID,
    title: () => t('studio.title'),
    icon: size => bookGlyph(size),
    hidden: true,
    single: true,
    component: tabProps => CreationStage({
      t,
      api,
      openDocument,
      sessionId: tabProps.scope.sessionId as SessionId | undefined,
      cwd: tabProps.scope.cwd,
    }),
  }), 'noven-workbench: studio fallback tab')

  // Presented artifacts land as framed blocks on the turn tail — the
  // conversation's own rendering host, fed from the persisted result meta.
  ctx.effect(() => ctx.uiConversation.events.register(presentSavedDefinition), 'noven-workbench: presented frames')
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: 'noven-frame-presented', order: 32, locale: NS,
    inject: (sessionId: SessionId | undefined): PresentTailInjected => ({
      sessionId,
      openCanvas: () => { ctx.sidebarRight.openTab(WORKBENCH_KIND) },
    }),
  }, PresentTail))

  ctx.effect(() => ctx.betterSidebar.registerFileViewer({
    id: NOVEN_IMAGE_VIEWER_ID,
    title: () => t('viewer.title'),
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'],
    priority: 10,
    fetchStrategy: 'mediaUrl',
    component: props => NovenImageViewer({ ...props, api, t }),
  } satisfies FileViewerDescriptor), 'noven-workbench: image viewer')

  // The workbench stays reachable through the rail's tab picker; noven-shell
  // owns which tab a fresh session surface opens with.
}

/**
 * The seat wrapper feeding the drawer's workbench navigation: resolves the
 * seat's session and its workspace cwd through the standing hooks.
 * @param props - the seat's runtime shares plus the injected workspace face.
 * @returns the navigation zone, or nothing without a session.
 */
function DrawerNavSeat(props: PropsRuntime<'sidebar.right.pane.top'> & PropsLocale<typeof NS> & InjectFace<{
  api: ReturnType<typeof createWorkbenchApi>
  sidebarRight: DrawerNavProps['sidebarRight']
  canvas: DrawerNavProps['canvas']
}>) {
  const sessionId = props.sessionId as SessionId | undefined
  const cwd = props.useSessions(state => sessionId === undefined ? undefined : state.byId[sessionId]?.cwd)
  return <DrawerNav t={props.t} api={props.api} sessionId={sessionId} cwd={cwd} rail={props.rail}
    sidebarRight={props.sidebarRight} canvas={props.canvas} />
}

/**
 * The workbench's canvas body under the keyed body seat: the stage inside the
 * canvas's own chrome. The session arrives as a standard prop; close and the
 * side toggle come from the surface's own actions and the sidebar face.
 * @param props - the seat's runtime shares plus the injected faces.
 * @returns the stage body.
 */
function StageCanvas(props: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<{
  api: ReturnType<typeof createWorkbenchApi>
}>) {
  const sessionId = props.sessionId as SessionId | undefined
  const cwd = props.useSessions(state => sessionId === undefined ? undefined : state.byId[sessionId]?.cwd)
  const info = props.useTabInfo()
  return <WorkbenchStage t={props.t} api={props.api} sessionId={sessionId} cwd={cwd}
    close={info.tab.actions.close} park={info.tab.actions.park} />
}

/**
 * The file tab's canvas body: the `file:` address's workspace path staged
 * under the built-in 文件 workbench, then the ordinary stage. Whatever surface
 * opened the address, the user lands on the same canvas with the same chrome.
 * @param props - the seat's runtime shares plus the injected API face.
 * @returns the stage body bound to the opened file.
 */
function FileStageCanvas(props: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<{
  api: ReturnType<typeof createWorkbenchApi>
}>) {
  const sessionId = props.sessionId as SessionId | undefined
  const cwd = props.useSessions(state => sessionId === undefined ? undefined : state.byId[sessionId]?.cwd)
  const info = props.useTabInfo()
  const rel = parseFileAddress(info.tab.contentId)?.path ?? ''
  useEffect(() => {
    if (sessionId === undefined || rel === '') return
    workbenchSelection.set(sessionId, BUILTIN_FILES.id)
    workbenchStage.patch(BUILTIN_FILES.id, { mode: 'files', selected: rel })
  }, [sessionId, rel])
  return <WorkbenchStage t={props.t} api={props.api} sessionId={sessionId} cwd={cwd}
    close={info.tab.actions.close} park={info.tab.actions.park} />
}

/**
 * The main-panel wrapper: resolves the canvas's session through the standard
 * props' selector hook and renders the pure canvas.
 * @param props - the main seat's composed props with the injected face.
 * @returns the canvas.
 */
function MainCreationStage(props: {
  t: (key: Parameters<Parameters<typeof CreationStage>[0]['t']>[0]) => string
  api: ReturnType<typeof createWorkbenchApi>
  openDocument: (sessionId: SessionId, cwd: string, rel: string) => void
  useSessions: <T>(selector: (state: { byId: Record<string, { retainedBy?: { mainView?: number }, cwd?: string } | undefined> }) => T) => T
}) {
  const sessionId = props.useSessions(state => {
    const row = Object.entries(state.byId).find(([, candidate]) => (candidate?.retainedBy?.mainView ?? 0) > 0)?.[0] as SessionId | undefined
    return row
  })
  const cwd = props.useSessions(state => {
    const current = Object.entries(state.byId).find(([, candidate]) => (candidate?.retainedBy?.mainView ?? 0) > 0)?.[0]
    return current === undefined ? undefined : state.byId[current as SessionId]?.cwd
  })
  return CreationStage({ t: props.t as Parameters<typeof CreationStage>[0]['t'], api: props.api, openDocument: props.openDocument, sessionId, cwd })
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
