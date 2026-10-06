/**
 * Local slot declarations bridging the workspace shell and this plugin's
 * published dependency types: `sidebar.right.pane.top`, `selfChrome`, and
 * `ILayout.setUnitSide` exist in the workspace before its published package
 * types carry them. Remove this file once the dependency versions register
 * the seats and fields.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The drawer's upper zone above the feature entries: the product's permanent navigation (here, the content tree). */
    'sidebar.right.pane.top': { kind: 'single'; scope: 'session'; owner: { readonly rail: boolean } }
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
