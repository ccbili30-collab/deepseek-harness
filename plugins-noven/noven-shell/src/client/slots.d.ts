/**
 * Local slot declarations bridging the workspace shell and this plugin's
 * published dependency types: content-navigation slots, frame policy/fold
 * contracts and `selfChrome` exist in the runtime before its published package
 * types carry them. Remove this file once the dependency versions register
 * the seats and fields.
 */
import type { SlotHookFactory, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { FrameFoldState, FrameLayoutPolicy } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MenuOpenState, UseMenuOpenState } from '@deepseek-ai/dsh-client-ui-workspace/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The drawer's upper zone above the feature entries: the product's permanent navigation (here, the content tree). */
    'sidebar.right.pane.top': { kind: 'single'; scope: 'session'; owner: { readonly rail: boolean } }
    /** Additional actions in the macOS hidden-sidebar recovery seat. */
    'shell.leading.action': { kind: 'list'; scope: 'root'; owner: Record<never, never> }
    /** Product content navigation replacing the Session browser in IDE mode. */
    'sidebar.workspaces.content': {
      kind: 'single'
      scope: 'session'
      owner: { readonly wide: boolean; readonly expandSidebar: () => void }
    }
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
  interface GlobalStandardProps {
    useFrameLayoutPolicy?: SnapshotSelectorHook<FrameLayoutPolicy | null>
    useFrameFoldState?: SnapshotSelectorHook<FrameFoldState>
  }
}

declare module '@deepseek-ai/dsh-client-ui-workspace/client' {
  interface UiWorkspace {
    /** Temporary Session navigation source; absent on older published builds. */
    readonly sessionBrowser: ObservableSnapshot<boolean>
    showSessionBrowser(): void
    hideSessionBrowser(): void
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
  interface FrameLayoutPolicy {
    readonly primary: 'main' | 'rightbar'
    readonly canvasSide: 'left' | 'right'
  }
  interface FrameFoldState {
    readonly centerCollapsed: boolean
    readonly auxiliaryCollapsed: boolean
  }
  interface ILayout {
    /** Coordinated explicit frame transition; absent on older published builds. */
    transitionFrame(commit: () => void): void
    setSidebarCollapsed(collapsed: boolean): void
    provideFrameLayoutPolicy(source: {
      getSnapshot(): FrameLayoutPolicy
      subscribe(listener: () => void): () => void
    }): () => void
    setCenterCollapsed(collapsed: boolean): void
    setAuxiliaryCollapsed(collapsed: boolean): void
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightOpenTabOptions<K extends string = string> {
    readonly expandColumn?: boolean
    readonly preserveCanvasParked?: boolean
  }
  interface SidebarRightTabDefinition {
    /** The type draws its own canvas chrome; the host's bar is skipped. */
    selfChrome?: boolean
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-owned canvas page kinds; absent on older published builds. */
    canvasPages?: {
      get(kind: string): {
        readonly kind: string
        readonly title: () => string
        readonly component: import('react').ComponentType<{
          readonly sessionId: string
          readonly pageKey: string
          readonly active: boolean
          readonly close: () => void
          readonly openPage: (kind: string) => void
        }>
      } | undefined
      subscribe(listener: () => void): () => void
    }
    /** Persisted settings developer unlock; absent on older published builds. */
    settingsDeveloperMode?: {
      getSnapshot(): boolean
      subscribe(listener: () => void): () => void
    }
    /** Hidden settings-section policy consumed by the settings shell. */
    settingsSectionPolicy?: {
      getHidden(): ReadonlySet<string>
      subscribe(listener: () => void): () => void
    }
  }
}

export {}
