---
description: "Shell layout for the Web GUI: the three-column AppFrame whose right column is a track for an edge-anchored panel, the panel-geometry service, and theme presentation; for users and maintainers of the window chrome."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

## Summary

This package provides the Web GUI's three-column AppFrame, edge-column widths, and `ctx.layout` presentation control. The right column concedes space before the center; its occupant renders fullscreen while the frame retains the wide-screen track underneath. The theme presenter owns color scheme, alias tokens, content font size, and document metadata. Width preferences are the user's global drag memory; structural geometry — nav collapse, the unit side, the drawer's rail fold — belongs to the visible Session, swaps when it changes, and persists per Session. The canvas claim is pulled from the occupant's registered source.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Desktop Mod+B toggles the left sidebar through the same layout action used by its controls. Feature plugins that need a deterministic presentation call `ctx.layout.setSidebarCollapsed(collapsed)` instead: repeated calls are idempotent, and narrow frames change only the expansion override without replacing the saved wide-screen preference. The shortcut command is unavailable behind modal dialogs and yields to terminal input.

The root slot composes the sidebar, main content, and right column. The sidebar spans 264–420px, defaults to 280px, and retains a 56px rail when collapsed; below 1024px it collapses automatically, and opening the right panel collapses a manually expanded sidebar. The right panel retains the user's pixel preference (default 340px, capped at 70% of the frame) down to a 96px floor; a drag past the floor arms the collapse preview — the occupant blurs into its rail mark while the pointer holds — and releasing settles the fold, while dragging back above the floor disarms it. The dragged preference survives either way for the next expanded report. Width preferences (sidebar, rightbar, unit) persist globally in localStorage; structural geometry persists per Session under `bySession` records — the newest 50 survive — and restores when the visible Session changes, so one Session's structure never leaks into another. To protect 400px for the center, the frame first reduces the right panel to the floor, then reports insufficient room so its occupant closes it, and only then compresses the center further. While the occupant claims a canvas, the right column holds both members and gains a second handle on its conversation-facing edge: that seam resizes the whole unit between the conversation's protected share and a floor of the drawn panel plus a 280px canvas page, and the width it saves persists for the next canvas, while the panel's own handle keeps dividing canvas from panel inside the unit. Dragging has no transition delay; the panel's handle is absent while closed or fullscreen.

Global panels occupy the root-scoped `main` keyed slot; `conversation` is the reserved key for the Conversation. `ctx.layout.selectPanel(id)` selects a registered panel, and `null` selects the Conversation without changing the current Session. No global panel is registered by the shipped composition.

### Window-chrome seat

On macOS desktop (`html[data-platform='darwin']`, set only by the desktop preload) a collapsed sidebar hides its column entirely instead of keeping the rail, and the frame mounts the single root-scoped `shell.leading` seat at its top-left — beside the hiddenInset traffic lights, over every main panel; ui-sidebar occupies it with the reopen and New Session controls. While the seat is mounted the frame publishes `--dsh-frame-leading-clearance`, the inline band the window chrome occupies measured from the frame's left edge; a main panel whose content reaches the top-left corner pads by it so nothing lands under the lights or the controls. The frame also always publishes `--dsh-frame-top-clearance` (48px) on the root element, the constant step below the window's top strip; entry pages in the main panel (plugin manager and similar, not the conversation) pad their top by it, and overlay primitives (portal menus, bottom-anchored overlays, the settings panel) keep it as their top viewport margin — the root-element home lets overlays portalled to `document.body` read it too. The frame declares no darwin drag of its own: every chrome row marks itself `data-window-drag`, ui-web base.css turns that mark into the one darwin drag rule, and the row's own box is therefore the window's draggable geometry — a row's blank runs drag while its controls stay clickable. The frame's remaining drag rule is the Windows caption row, which belongs to that platform.

Windows Electron's `data-windows-titlebar` marker reserves the caption height above all columns and removes the collapsed sidebar rail. Only the content area's top-left corner has a 16px radius; the other corners and the internal divider remain square. The frame publishes `--dsh-windows-content-radius` and `--dsh-windows-sidebar-width` for ui-sidebar-right's fullscreen corner and sidebar clearance. Ordinary Web documents do not receive the marker; macOS retains its separate layout.

### Theme presentation

The presenter consumes resolved theme snapshots and projects them onto the document: `html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens and `--dsh-content-font-size` as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background. Disposing the presenter removes its metadata node with its other global writes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`selectPanel(id)` checks the live `main` registry before changing selection; an absent key throws and leaves the current panel intact. `beginNavigation()` returns an abort signal for an asynchronous UI navigation. A later call, a valid panel selection (including repeated selection), or layout disposal aborts that signal without cancelling underlying Session creation. Consumers check the signal before committing navigation or moving drafts.

One registration declares five child slots and binds `ctx.layout` methods `selectPanel`, `toggleSidebar`, `setSidebarCollapsed`, `openRightbar(track, fullscreen, rail)`, `closeRightbar`, and `setUnitSide(side)` — structural writes that stamp the visible Session's record — plus the `canvasClaims` seam the right column's occupant provides its claim source into (the frame pulls each session's claim from it, so a claim can never go stale waiting on a report), `seedSessionGeometry(sessionId, seed)` for entry-path seeding, `seedUnitShare(share)` for an explicit canvas share the frame resolves once a canvas claims the column, `navGeometryDiffers(from, to)` for scene-change detection, and the `sessionGeometry` observable publishing the live structural slice. One root store separates `panelInfo` selection from `layoutInfo` measurements, width preferences — including the right column's saved `unit` width while a canvas claims it, and the `rightbarCollapsePreview`/`rightbarCollapsed` pair a below-floor drag arms and settles — persisted to localStorage on every commit — and presentation reports. Structural fields live in `layoutInfo` as the visible Session's mirror: `enterSession` stamps the outgoing Session and loads the incoming one's record (fresh Sessions take the default structure), and AppFrame pre-syncs the nav easing baseline so the swap render lands without transition easing while the page turn plays. `ctx.layout.panelInfo` and the standard `usePanelInfo` hook share the same selection source; AppFrame subscribes to the stable layout object. The `rightbar` owner supplies actual `width`, `viewportWidth`, normal-presentation eligibility `canShow`, and `collapsePreview` while a drag holds below the floor; insufficient room causes a deterministic close, never automatic reopening on widening. Fullscreen hides the width handle without releasing a track the occupant retains. AppFrame keeps the column containers mounted. The right column's root controller renders `rightbar.session` through `SessionProvider` only while the Conversation is selected; its unmount report releases the track. The independent title component uses the selected Session title only while the Conversation is visible, with the build-configured product title or localized `common.brand.localBuild` as its fallback; locale revisions update that fallback. The theme presenter is a second effect: pure DOM writes from resolved snapshots — initial state through the getter once, then event-driven only, with no React path. It applies palette, font-size, and token variables before measuring the rendered background as the single color authority. Fullscreen presentation suppresses grid and handle transitions; its occupant reports the new columns only after covering the frame. Fullscreen exit keeps transitions suppressed while the frame installs its destination geometry: close removes the right track, and restore retains it. Subsequent normal geometry actions restore ordinary transitions.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the layout surface is not enough. They move from the frame to the columns it renders and the theme it presents.

- [ui-sidebar](../ui-sidebar/README.md) — occupies the `sidebar` column and its seats.
- [ui-conversation](../ui-conversation/README.md) — occupies the `main` key `conversation`.
- [ui-sidebar-right](../ui-sidebar-right/README.md) — occupies the `rightbar` column with one docking surface per session.
- [ui-theme](../ui-theme/README.md) — the theme seam whose resolved snapshots the presenter consumes.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current layout behavior. They are current package constraints, not a general window-manager comparison or a task backlog.

- **Widths are global, structure is per Session** — a dragged column width is one frame-wide preference; nav collapse, the unit side, and the drawer's rail fold are per-Session records capped at the newest 50, while the canvas's parked state and side persist with each Session's surface in ui-sidebar-right. A legacy v1 record's zero-width collapse encoding does not migrate a fold.
- **Extremely narrow windows** — after the right panel closes, the center may still fall below 400px; the left 56px rail remains.
- **Track and panel travel on one shared curve only while animating** — during a discrete open/close the frame sets `data-animating` and its track transition and the occupant's slide read the same duration and easing variables; an occupant that used its own would detach the panel's edge from the conversation's while squeezing. Drags and instant presentation switches run transition-free, so the curve does not cover them.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The shell viewing-state store behind `ctx.layout` emits no Cordis events; clamp and track sequencing is asserted directly by this package's columns and service specs.
