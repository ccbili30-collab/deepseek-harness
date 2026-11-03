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
import type { ReactNode } from 'react'

/** 内联块的递归 JSON 数据。 */
type InlineJson = null | boolean | number | string | readonly InlineJson[] | InlineJsonObject
interface InlineJsonObject { readonly [key: string]: InlineJson }

/** 引用已有对象的内联块。 */
interface InlineBlockSourceRef {
  readonly block: string
  readonly src: string
  readonly title?: string | undefined
  readonly size?: string | undefined
}

/** 内容直接属于消息的内联块。 */
interface InlineBlockDataRef {
  readonly block: string
  readonly data: InlineJsonObject
  readonly title?: string | undefined
}

/** 选择提交请求；由当前 Session 的 Chat 容器实现。 */
interface InlineBlockCommitRequest {
  readonly refPrefix: string
  readonly insert: import('@deepseek-ai/dsh-client-ui-conversation/client').ReferenceInsert
}

interface InlineBlockSpecBase { readonly id: string }

/** 引用块类型：声明尺寸与来源。 */
interface InlineBlockReferenceSpec extends InlineBlockSpecBase {
  readonly content?: 'reference' | undefined
  readonly source?: 'raw' | 'workspace' | 'frame' | 'card' | undefined
  readonly size: { readonly ratio: number }
  readonly variants?: Readonly<Record<string, number>> | undefined
  readonly render: (props: {
    readonly source: InlineBlockSourceRef
    readonly commit?: ((request: InlineBlockCommitRequest) => boolean) | undefined
  }) => ReactNode
}

/** 内联数据块类型：自然高度、消息内位置和工作区媒体解析。 */
interface InlineBlockDataSpec extends InlineBlockSpecBase {
  readonly content: 'data'
  readonly render: (props: {
    readonly data: InlineJsonObject
    readonly blockId: string
    readonly resolveMedia: (src: string) => string | undefined
    readonly commit?: ((request: InlineBlockCommitRequest) => boolean) | undefined
  }) => ReactNode
}

type InlineBlockSpec = InlineBlockReferenceSpec | InlineBlockDataSpec

/** 内联块注册表（发布的 ui-chat 类型尚未带该服务）。 */
interface InlineBlockRegistry {
  register(spec: InlineBlockSpec): () => void
  registerSource(
    kind: 'raw' | 'workspace' | 'frame' | 'card',
    resolver: (src: string, sessionId: string, workspaceRoot: string | undefined) => string | undefined,
  ): () => void
  resolve(id: string): InlineBlockSpec | undefined
  count(): number
  subscribe(listener: () => void): () => void
  revision(): number
  resolveSource(kind: string, src: string, sessionId: string, workspaceRoot?: string): string | undefined
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Product navigation beside the expanded brand; absent from older published types. */
    'sidebar.brand.trailing': { kind: 'single'; scope: 'root'; owner: Record<never, never> }
    /** Side-subject trailing seat before the frame's one fold. */
    'side.header.trailing': { kind: 'single'; scope: 'root'; owner: { readonly collapsed: boolean } }
    /** Directory provider bound to the side parent's current Session. */
    'side.parent.directory': { kind: 'single'; scope: 'session' }

    /** Fixed application-topbar content, including the product mode switch. */
    'shell.topbar': { kind: 'list'; scope: 'root'; owner: { readonly collapsed: boolean } }
    /** Fixed navigation toggle outside the sidebar track. */
    'shell.topbar.navigation': { kind: 'single'; scope: 'root'; owner: { readonly collapsed: boolean } }
    /** Legacy drawer upper-zone seat retained for composition compatibility. */
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
    readonly topbar?: boolean
    readonly contentInset?: number
    readonly sideChrome?: 'frame' | 'content'
    readonly drawer?: boolean
    readonly foldMode?: 'shared' | 'independent'
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
    /** 对话内联块注册表；未组合 Chat 时缺席。 */
    chatBlocks?: InlineBlockRegistry
  }
}

export {}
