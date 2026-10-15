/** Registers the sidebar shell and global panel navigation. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Session root standard-props merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SidebarPanelMetadata, SidebarRootInjected } from './contract/slots.ts'
import { HeaderLeadingControls } from './HeaderLeadingControls.tsx'
import { SidebarPanelService } from './service.ts'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, zh, type SidebarKey } from './locales.ts'

export type {
  SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps, SidebarFooterActionOwnerProps,
  SidebarPanelIconOwnerProps, SidebarPanelMetadata,
  SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from './contract/slots.ts'
export type { SidebarKey } from './locales.ts'
export { SidebarPanelService } from './service.ts'
export type { ISidebarPanels, SidebarPanelActivation } from './service.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar controls and global panel copy. */
    sidebar: SidebarKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'sidebar'

interface WorkspaceNavigation {
  startSession(workspaceId?: Parameters<SidebarRootInjected['startSession']>[0]): void
}

/** Services required by the sidebar plugin. */
export const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts']

/** Registers the sidebar shell and its service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.plugin(SidebarPanelService)
  ctx.inject(['sidebarPanels'], (scope: ClientContext) => {
    const workspaceNavigation = scope.get('uiWorkspace') as unknown as WorkspaceNavigation
    scope.effect(() => scope.locale.register(NS, { zh, en }), 'ui-sidebar: dictionaries')
    const panels = createSnapshotStore<readonly SidebarPanelMetadata[]>([])
    const syncPanels = (): void => {
      const next = scope.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => {
        // The list registration requires an id; StoredEntry erases the slot kind.
        const id = options.id as MainPanelId
        return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
      }).sort((a, b) => a.order - b.order)
      const previous = panels.getSnapshot()
      if (previous.length === next.length && previous.every((panel, index) => {
        const candidate = next[index] as SidebarPanelMetadata
        return panel.id === candidate.id && panel.order === candidate.order && panel.label === candidate.label
      })) return
      panels.set(next)
    }
    scope.effect(() => scope.slots.subscribe('sidebar.panellist', syncPanels), 'ui-sidebar: panel entries')
    scope.effect(() => scope.locale.subscribe(syncPanels), 'ui-sidebar: panel labels')

    const injectProps = (): SidebarRootInjected => ({
      // The shell's New Session button rides the Workspace UI's shared action
      // (current Session Workspace, then recent Workspace).
      startSession: (workspaceId) => { workspaceNavigation.startSession(workspaceId) },
      toggleSidebar: () => { scope.layout.toggleSidebar() },
      selectPanel: (id) => { scope.layout.selectPanel(id) },
      activatePanel: (id, target) => { scope.sidebarPanels.activate(id, target) },
      hooks: { panels, shortcuts: scope.shortcuts.catalog },
    })
    scope.slots.inject('sidebar', () => scope.slots.register({
      name: 'sidebar',
      locale: NS,
      children: {
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      },
      inject: injectProps,
    }, SidebarRoot))
    // macOS desktop hides the collapsed sidebar entirely, so the open/New
    // Session controls move into the frame's window-chrome seat beside the
    // traffic lights; the occupant reuses the shell's injected actions, and
    // the AppFrame mounts the seat only while the column is fully hidden.
    scope.slots.inject('shell.leading', () => scope.slots.register({
      name: 'shell.leading',
      locale: NS,
      inject: injectProps,
    }, HeaderLeadingControls))
    syncPanels()
  })
}
