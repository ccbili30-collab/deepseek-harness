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
import type { SessionId } from '@deepseek-ai/dsh-session/types'
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

declare module '@deepseek-ai/dsh-client-ui-workspace/client' {
  interface UiWorkspace {
    /**
     * Resolve a blank host that runs the requested Agent preset; a mismatch is
     * skipped and creation requests the preset. Absent on older published builds.
     */
    connectWorkspace(workspaceId: WorkspaceId, options?: { readonly agentPreset?: string }): Promise<SessionId>
    /** Preset-filtered form of `reusableBlank`; absent on older published builds. */
    reusableBlank(workspaceId?: WorkspaceId, options?: { readonly agentPreset?: string }): SessionId | undefined
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface ISessions {
    /** Create with an explicit Agent preset; absent on older published builds. */
    create(opts?: {
      workspaceId?: WorkspaceId
      cwd?: string
      sessionId?: SessionId
      agentPreset?: string
    }): Promise<SessionId>
  }
}

declare module '@deepseek-ai/dsh-client-ui-layout/client' {
  interface ILayout {
    /** Collapse/expand the navigation column; absent on older published builds. */
    setSidebarCollapsed?(collapsed: boolean): void
    /** Move the drawer+canvas unit to a side of the conversation; absent on older published builds. */
    setUnitSide?(side: 'left' | 'right'): void
    /**
     * Stamp a structural arrangement seed onto one session's geometry record;
     * absent on older published builds.
     */
    seedSessionGeometry?(sessionId: string, seed: {
      sidebarCollapsed?: boolean
      narrowExpanded?: boolean
      unitSide?: 'left' | 'right'
      rightbarCollapsed?: boolean
    }): void
    /** Request an explicit canvas share the frame resolves once; absent on older published builds. */
    seedUnitShare?(share: number): void
    /** Live structural geometry of the visible session; absent on older published builds. */
    readonly sessionGeometry?: {
      getSnapshot(): {
        readonly active: string | null
        readonly sidebarCollapsed: boolean
        readonly narrowExpanded: boolean
        readonly unitSide: 'left' | 'right'
        readonly rightbarCollapsed: boolean
        readonly canvasSide: 'left' | 'right'
        /** Per-session structural records; judge a target session without racing the visible-session swap. */
        readonly byId?: Readonly<Record<string, {
          readonly sidebarCollapsed?: boolean
          readonly unitSide?: 'left' | 'right'
        }>>
      }
      subscribe(listener: () => void): () => void
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabDefinition {
    /** The type draws its own canvas chrome; the host's bar is skipped. */
    selfChrome?: boolean
  }
  interface ISidebarRight {
    /** Park one session's canvas — the arrangement-seeding write path; absent on older published builds. */
    parkCanvasIn?(sessionId: string): void
  }
}

export {}
