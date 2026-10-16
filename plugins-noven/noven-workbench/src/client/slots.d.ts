/**
 * Local slot declarations bridging the workspace shell and this plugin's
 * published dependency types: `sidebar.right.pane.top`, `selfChrome`, and
 * the rail pick's `expandColumn` placement exist in the workspace's
 * ui-sidebar-right before its published package types carry them.
 * Remove this file once the dependency version registers the seat and fields.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The drawer's upper zone above the feature entries: the workbench's own navigation. */
    'sidebar.right.pane.top': { kind: 'single'; scope: 'session'; owner: { readonly rail: boolean } }
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabDefinition {
    /** The type draws its own canvas chrome; the host's bar is skipped. */
    selfChrome?: boolean
  }
  interface SidebarRightTabActions {
    /** Park the canvas hosting this tab; the page stays mounted while the region frees. */
    park(): void
  }
  interface SidebarRightOpenTabOptions<K extends string = string> {
    /** `false` floats the opened page to the canvas beside a collapsed column. */
    readonly expandColumn?: boolean
  }
  interface ISidebarRight {
    /** The mounted session's canvas surface — the topmost floating pane's active tab. */
    canvas: {
      getSnapshot(): { readonly kind: string; readonly contentId: string } | undefined
      subscribe(listener: () => void): () => void
    }
  }
}

export {}
