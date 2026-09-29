/**
 * noven-workbench browser half: the **工作台** main panel — the ported shape of
 * the original desktop's sidebar workbench mode — and the sidebar row that
 * opens it.
 *
 * The public panel path, mirroring the Plugins page: one keyed registration
 * into the layout-owned `'main'` slot under a MainPanelId, plus one
 * `sidebar.panellist` entry whose id addresses the same panel. The launcher
 * rail inside the panel carries the workbench rows the original sidebar had,
 * each expanding into its resource tree; the content column carries the
 * gallery, the annotation overlay, and the color picker.
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
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { createWorkbenchApi } from './api.ts'
import { en, zh } from './locales.ts'
import { injectGalleryStyles } from './style.ts'
import { WorkbenchPanel } from './WorkbenchPanel.tsx'
import { WorkbenchPanelIcon } from './WorkbenchPanelIcon.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'novenWorkbench'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'noven-workbench' as MainPanelId

/** Required browser services: the keyed main seat, the sidebar list, the right Sidebar opener, the Remote carrier, and copy. */
export const inject = ['slots', 'locale', 'remote', 'remote.workspaceFiles', 'sidebarRight', 'layout']

/**
 * Open a document through the standard `dsh-resource://file` viewers in the
 * right Sidebar; without a mounted session surface there is nothing to open
 * into, and the panel's row click simply does nothing.
 * @param ctx - the browser plugin context.
 * @param sessionId - the session whose workspace holds the file.
 * @param rel - the file's workspace-relative path.
 */
function openDocumentInSidebar(ctx: ClientContext, sessionId: SessionId, rel: string): void {
  const encoded = rel.replaceAll('\\', '/').split('/').filter(part => part.length > 0).map(encodeURIComponent).join('/')
  try {
    ctx.sidebarRight.openResourceIn(sessionId, `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`)
  } catch { /* no session surface mounted — the viewer is not there to receive it */ }
}

/**
 * Client plugin body: register the dictionaries, the main panel, and its sidebar entry.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  injectGalleryStyles()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-workbench: dictionaries')

  const api = createWorkbenchApi(ctx.remote)
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      inject: () => ({ api, openDocument: (sessionId: SessionId, rel: string) => { openDocumentInSidebar(ctx, sessionId, rel) } }),
    }, WorkbenchPanel)
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 5,
    label: () => t('panel'),
    locale: NS,
  }, WorkbenchPanelIcon))
}
