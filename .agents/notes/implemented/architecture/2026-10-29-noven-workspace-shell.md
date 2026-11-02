# Agent Note: Noven workspace shell — one frame, one auxiliary region, and Workspace-owned work

Status: implemented

English | [中文](2026-10-29-noven-workspace-shell.zh.md)

## Problem

Agent and IDE had diverged into separate navigation, drawer, fold, and restoration implementations. A mode switch could change control position, hide Workspace selection, or discard the canvas. The current Workspace had no single selection action, and canvas tabs belonged to a Session even though the product required Session changes within one Workspace to preserve the project canvas. The accepted interaction prototype required one fixed frame with view-dependent content, not two independently patched views.

## Decision

The shell keeps one stable frame and treats the workbench subject as its only product state. `FrameLayoutPolicy` is derived from that subject (Conversation centre in Agent, Canvas centre in IDE), not from a separate mode store. `shell.topbar` holds the subject switch; the navigation toggle stays with the navigation, where the fixed-topbar brand mark is the one toggle at the rail's leading top. The frame owns one side fold at one fixed slot: a 28px panel button at the side column's top-right, identical while expanded and collapsed; the side column is whichever subject is not in the centre, and its content headers do not render another fold. The frame also owns the side header's trailing row: the shell registers the side subject's parent immediately before the fold, and the content headers reserve that row's single inset instead of placing their own parent. One work-region width follows the content across modes.

`drawer: false` suppresses `SidebarPanel`, feature navigation, automatic fullscreen, and presentation-track reporting without unmounting `CanvasHost`. The canvas claim alone reserves the track in this arrangement; global panels take the full work region while the inactive claim is retained for return. A fixed topbar keeps the 56px capability rail on every platform and suppresses the legacy leading controls. The right pane's duplicate directory and IDE temporary history are removed rather than hidden with product CSS.

`WorkspaceNavigator` keeps the Workspace selector outside the replaceable content seat. Agent renders only the current Workspace's Sessions; IDE renders the Noven directory. `ctx.uiWorkspace.switchWorkspace(id)` selects the Workspace's last ordinary Session through the existing main-selection path, or connects a blank only when no ordinary destination exists. It preserves the active panel and does not read or write product mode. Collapsed navigation uses the same Workspace picker and ordered Session rows in popovers; the directory uses one parent-owned query in expanded and collapsed presentations. The navigator renders the centre subject's parent. The side subject's parent is the same role with a different provider in the frame's trailing seat: the Session-list provider when the side subject is the Conversation, the directory provider when it is the Canvas; choosing from it reveals the side subject without changing the centre. No content registers its own parent.

The product shell has one workbench subject (`conversation` or `canvas`); Agent/IDE are derived labels, and the frame policy, main parent, and side parent are derived from it. New Session, import, and handcraft are commands, not main panels: the old Create main destination is removed, and a blank Session's own conversation hero is the creation surface. The 社区/消息/我的 navigation rows remain (社区 and 消息 keep their coming-soon explanation; 我的 remains a real panel). The frame's single side fold is the only auxiliary visibility state; the legacy Canvas switch/park vocabulary is removed. The blank-Session hero keeps the mint bloom; the subject attribute on the root scopes it to the Agent centre, so a blank side Conversation in handcraft does not paint the creation background. Side headers have two ownership groups: content leading controls (the Canvas tab strip, tools, and fullscreen; the Conversation's own header utilities) and the shell/frame trailing row (the side parent then the fold). The side parent and fold share one 28×28 row at the fold's baseline; the side Session-list entry is hidden with the folded side. The Canvas tab strip never creates objects: tabs project already-open objects, the `+` is removed, the tab switcher appears only with more than one tab, and object creation stays in the directory tree. The directory provider is a Session-scoped child entry bound by the slot renderer; the shell holds one Client reference for the current Session while the Agent side Canvas is expanded.

Directory rows and Canvas tabs share one current-object key: every object row, including user directories, derives `current` from the active Canvas tab, and clicking a row calls the same activation. Entity view and file view share the same object set; the view switch changes row names, never which rows exist. Files therefore follow the same current-item rule as Sessions.

Noven object focus resolves the current Workspace root even before that directory carries Noven library metadata; the legacy project registry remains only a fallback. Object Session resolution stays within that root. Every active Conversation seat ensures the shared canvas host in either mode, so a newly selected Session cannot lose the Workspace canvas. Non-single imports reveal IDE before presenting their target dialog. Startup blank-Session routing runs only in Agent and stops as soon as handcraft owns the view.

Canvas layout is Workspace-scoped in `noven.canvas.tabs.v4`, while object operations and I/O retain Session identity. Existing v3 data is read once and never rewritten, and an existing v4 prevents any v3 fallback. Tabs, active objects, splits, and Workspace bindings follow the Workspace; switching Sessions within it does not replace them. Restoration can be disabled without reading or deleting the saved value.

The existing mint-and-white visual tokens, selection rules, Create composer, handcraft path, and import path remain. Noven surface and BlockNote variables resolve on `body` from the active DSH theme tokens, inverse button colors stay separate from primary text, and both editor implementations subscribe to resolved theme changes. The global settings modal gains real auto-save, canvas restoration, and line-number preferences backed by `noven.shell.workbench.v1`. Auto-save-off editing keeps a draft for explicit save. Terminal's default action opens or activates one page instead of minting duplicates, and import opens the first committed object in IDE.

## Alternatives considered

**Patch Agent and IDE separately.** Rejected because it preserves the divergence that caused the defects. Shared hosts, state, and controls are now established before view-specific content.

**Copy the prototype HTML into production.** Rejected because the prototype is the behavioral reference, not the production architecture. Existing Cordis slots, real Session and Workspace services, menus, editors, and persistence remain the implementation owners.

**Add another current-Workspace store.** Rejected because Workspace focus already derives from the selected Session. `switchWorkspace` writes through the existing selection path instead of creating a second authority.

**Keep canvas ownership by Session.** Rejected because it cannot satisfy the invariant that Session changes within one Workspace leave the project canvas intact. Workspace scope now owns layout while Session scope owns object I/O.

**Hide the entire right seat or delete all persistence when restoration is disabled.** Rejected because the canvas must survive drawer suppression and users must not lose saved tabs. The drawer alone is suppressed, and disabled restoration only declines to read the saved value.

**Rewrite the whole Web frontend.** Rejected because visual tokens, Create, real editors, dialogs, and data operations already work. The reform replaces the shell and ownership model while reusing those capabilities.

## Consequences

The fixed topbar, current-Workspace navigator, and Workspace-scoped canvas introduce new public presentation and navigation contracts that generic DSH does not require. They remain opt-in through `FrameLayoutPolicy`; existing behavior is preserved when no policy or drawer preference is supplied. Legacy fold and v3 canvas readers remain compatibility paths, not independent state or downgrade promises.

The reform does not change `agent-loop`, `SessionEventMap`, Session files, model-visible content, or either SDK. No real user data root is used for development acceptance. Any future move of Workspace identity must still keep object I/O bound to the correct Session and must not infer a second current Workspace from project metadata alone.

## Testing

Focused suites cover layout policy switches, host retention, fold compatibility, Workspace switching and supersession, collapsed navigation, drawer suppression, Workspace canvas migration and restoration, and preference persistence. Shell scripts additionally cover the fixed topbar and selection styling. Browser acceptance uses an isolated profile, data root, and port to verify the same mode, Workspace, Session, object, navigation, and auxiliary transitions against the prototype, including responsive and dark presentations and real create, edit, import, terminal, and settings actions. The browser suite also verifies the brand-mark navigation toggle, the single side fold keeping the same rect in both states, the main parent in navigation plus the side parent and fold sharing the frame's trailing row, the tab strip having no `+` and no switcher with one tab, the brand-mark asset, and file rows (including user directories and entity view) sharing the active Canvas tab.
