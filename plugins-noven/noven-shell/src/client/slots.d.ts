/**
 * Local slot declarations bridging the workspace shell and this plugin's
 * published dependency types: `sidebar.right.pane.top`,
 * `sidebar.workspaces.workspace.menu.item`, `selfChrome`, and
 * `ILayout.setUnitSide` exist in the runtime before its published package
 * types carry them. Remove this file once the dependency versions register
 * the seats and fields.
 */
import type { SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { MenuOpenState, UseMenuOpenState } from '@deepseek-ai/dsh-client-ui-workspace/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The drawer's upper zone above the feature entries: the product's permanent navigation (here, the content tree). */
    'sidebar.right.pane.top': { kind: 'single'; scope: 'session'; owner: { readonly rail: boolean } }
    /**
     * Extra rows of one Workspace header's "…" menu — the runtime seat
     * ui-workspace registers; the published rc.2 types do not carry it yet.
     */
    'sidebar.workspaces.workspace.menu.item': {
      kind: 'list'
      scope: 'root'
      owner: {
        /** Workspace the row shows; real Workspaces only (the ungrouped bucket shows no menu). */
        workspaceId: WorkspaceId
        /** Workspace canonical path — the identity a contributed action addresses. */
        path: string | undefined
        /** Row display title. */
        displayTitle: string
      }
      hookContext: MenuOpenState
      inject: { hooks: {
        menuOpenState: SlotHookFactory<'sidebar.workspaces.workspace.menu.item', UseMenuOpenState>
      } }
    }
    /**
     * Ordered actions for one durable user message — lands in ui-chat source
     * ahead of its published package types.
     */
    'conversation.chat.user-actions': {
      kind: 'list'
      scope: 'session'
      owner: {
        /** Durable `user/message` event seq — the rewind/edit fork boundary minus one. */
        seq: number
        /** The message's clipboard text, as rendered for copy. */
        text: string
      }
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-layout/client' {
  interface ILayout {
    /** Move the drawer+canvas unit to a side of the conversation; absent on older published builds. */
    setUnitSide?(side: 'left' | 'right'): void
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabDefinition {
    /** The type draws its own canvas chrome; the host's bar is skipped. */
    selfChrome?: boolean
  }
}

export {}
