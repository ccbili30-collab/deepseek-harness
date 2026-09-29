/**
 * noven-workbench browser half: register `noven.workbench` — the 诺文展厅 —
 * as a right-Sidebar tab type.
 *
 * The public two-stage path, unmodified: the type into `ctx.sidebarRightTabs`,
 * the body into the keyed `sidebar.right.pane.tab` seat. Both registrations
 * ride `ctx.slots.inject`, so they wait for the seats' declaration whatever
 * the load order (the noven-brand lesson). The chip title is the definition's
 * own — a page type without a live title registers nothing there.
 *
 * @module noven-workbench/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { createWorkbenchApi } from './api.ts'
import { WORKBENCH_ID, workbenchDefinition } from './definition.tsx'
import { GalleryBody } from './GalleryBody.tsx'
import { en, zh } from './locales.ts'
import { injectGalleryStyles } from './style.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'novenWorkbench'

/** Required browser services: the tab registry, the keyed seat, the Remote carrier, and copy. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the type, its dictionaries, and its gallery body.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  injectGalleryStyles()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-workbench: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(workbenchDefinition(t)), 'noven-workbench: gallery type')

  const api = createWorkbenchApi(ctx.remote)
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: WORKBENCH_ID, locale: NS, inject: () => ({ api }) },
    GalleryBody,
  )), 'noven-workbench: gallery body')
}
