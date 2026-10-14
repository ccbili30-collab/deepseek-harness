---
description: "The right Sidebar of the dsh web client: one navigation column and one content canvas per session, two presentations, the navigation controller ctx.sidebarRight, the tab-type registry ctx.sidebarRightTabs, and the Tab domain."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right

English | [中文](README.zh.md)

## Summary

The right Sidebar: where the docking kit meets this product. It holds one surface per session and draws it as two pieces — a navigation column anchored in the frame's right column, and a canvas that carries every open tab as a floating stack between the conversation and the panel. It puts the expand button in the conversation header, and owns the navigation controller (`ctx.sidebarRight`), the tab-type registry (`ctx.sidebarRightTabs`), and the Tab domain that tells each open tab how it was navigated to and how long it lives.

## Table of Contents

- [What lives here, and what does not](#what-lives-here-and-what-does-not)
- [Presentations](#presentations)
- [The expand button](#the-expand-button)
- [State](#state)
- [Extension seats](#extension-seats)
- [`ctx.sidebarRight`](#ctxsidebarright)
- [The Tab domain](#the-tab-domain)
- [The guide](#the-guide)
- [Copy](#copy)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-lives-here-and-what-does-not"></a>
## What lives here, and what does not

The layout itself — the split tree, its operations, the drag gestures, the floating panels — belongs to `@deepseek-ai/dsh-client-ui-dockkit` and stays host-agnostic. This package supplies everything that kit refuses to know: the product's copy, what a tab's `kind` means, which tab a fresh pane is seeded with, where the surface is mounted, and how other plugins reach it.

<a id="presentations"></a>
## Presentations

The panel is a navigation column, not a content host: its upper zone is the product navigation seat (`sidebar.right.pane.top`), a hairline separates it from the feature list below, which rows one entry per `guide` contribution and ends in the panel's two controls — presentation switch and collapse. Opening an entry lands the page on the canvas, never in the column.

Normal and fullscreen presentations share the same content tree, so switching does not remount tabs. The normal panel anchors to the right column; fullscreen covers the viewport while retaining the wide-screen columns underneath. Opening below 768px uses fullscreen automatically; leaving fullscreen on a narrow viewport closes the panel, and widening does not reopen a closed panel. A fullscreen opening keeps the underlying columns unchanged until its slide finishes, then prepares the normal track without a column transition. Before a fullscreen panel retreats, closing prepares a full-width conversation and restoring prepares the normal right track; the background does not animate during the retreat.

| Mode | The track | The panel |
|---|---|---|
| `push` (default) | Panel width: the conversation makes room | In the track; its left edge and the conversation's right edge travel together, on the frame's own curve |
| `fullscreen` | Retains the wide-screen normal track; automatic narrow-screen fullscreen takes no track | Covers the entire viewport |

In Windows Electron, `html[data-windows-titlebar]` keeps fullscreen panels below the caption and to the right of the expanded sidebar. The frame's `--dsh-windows-sidebar-width` supplies that inset and maximum width; `--dsh-windows-content-radius` supplies the top-left radius. Only fullscreen panels clip overflow for that corner.

The seat reports presentation through `ctx.layout.openRightbar(track, fullscreen, canvas, rail)` / `closeRightbar()`; the frame does not inject this package. The `rail` flag reports the collapsed presentation, for which the frame substitutes the icon-rail width for the panel's preference. Switching fullscreen on a wide viewport leaves the center width unchanged, and the width handle appears only in expanded normal mode.

The panel is a navigation column, not a content host: the upper zone is the product navigation seat (`sidebar.right.pane.top`), and below the hairline the feature entries lay out per `guide` contribution, closing with the panel's two controls — mode switch and collapse. Picking an entry lands the page on the canvas, not in this column. Collapsed, the column keeps an icon rail carrying both halves — the zone's icon form above the feature icons — so its rows keep their expanded arrangement; a rail icon opens its page on the canvas without unfolding the column, and the rail's own expand control is the only way the column opens.

The canvas draws the surface's floating pane stack inside the right column's track, beside the panel — a claimed layout region, not an overlay: the seat reports an open canvas through `openRightbar`'s `canvas` argument and the frame widens the column to hold it, so the conversation shrinks instead of sitting underneath. Every open lands there: the newest float covers the rest, and covered floats stay mounted — hidden and inert, so a page keeps its state while another covers it — with the registered `keepMounted` bodies retained across being covered. Closing the stack top peels the layer off and focus lands on the float it reveals; closing the last float dismisses the canvas. Escape peels the top unless the event started inside an input, textarea, or contenteditable. The canvas parks the session rail for room while it is up and restores it on close. A canvas-side toggle parks the stack against either the panel's inner edge or the frame's right edge. A tab type that declares `selfChrome` draws its own top bar on the canvas; the host's title, side toggle, and collapse control step out of its way.

<a id="the-expand-button"></a>
## The expand button

The shortcut reference includes right-sidebar toggle, split and panel fullscreen commands. The same effective binding appears on the corresponding controls. Split requires focus within a visible dock pane; conversation focus leaves it unavailable. Files, browser, and terminal providers contribute their own commands. Guide buttons display effective shortcuts as unboxed text inline without duplicate tooltips.

While the panel is hidden, one button in the conversation header's corner seat (`conversation.session.header.corner`, past the utilities' right edge and level with the Session log control) is the way back in. Its glyph is the left sidebar's collapse icon mirrored. It uses the shared compact Button, matching the adjacent More action’s radius and hover fill. It shares the panel's store (the slot runtime allows one handle across two same-scope seats); while the panel is shown it renders nothing, and the corner seat collapses with it. A collapsed Sidebar therefore costs the conversation nothing: no rail, no width, and the transcript's scrollbar stays at the column's edge. Without a session there is no button and no panel.

The panel takes the conversation's ground colour and content font sizes rather than a raised layer of its own: it is a column of the page, not a card over it.

The root-scoped `rightbar` entry renders the selected Session and background Sessions with initialized `keepMounted` bodies through separate `rightbar.session` subtrees. Each View owns its Session reference. Only the foreground Conversation reports a frame track and binds public navigation; other subtrees stay hidden without deleting tab state.

<a id="state"></a>
## State

One `SurfaceState` per session id — the layout, its recorded sequence, and how many ids it has minted — held in a store declared at the registration. Every action follows the same shape: mint the ids the intent needs, ask a kit planner which operations carry it out, record them, then assign the session's whole surface back. No action edits a layout in place, which is what keeps the kit's pure functions the only thing that computes one.

Carrying the mint counter in the surface is what makes a recorded sequence replayable: operations embed the ids they create, so replaying from the same initial state reproduces the same tree. Every action records one history entry, however many operations it needed. Expanding, collapsing, and switching presentation are recorded too.

After every action the kit's settle planner keeps the surface tidy: a docked pane whose last tab was moved out or floated is merged away, and an emptied root pane receives the default page — except while floats stand, because the canvas is already presenting content and the docked column hosts only navigation. A collapsed surface holds no such backfill — a session starts collapsed and empty, and a close that collapses the column leaves it empty — the expansion that would first show an empty layout is what seeds the default page. Explicit closing follows [the default-page and close rules](#the-guide).

The docked surface's last tab carries one more rule, decided in the store's `closeTab` and mirrored to the kit through `canCloseTab`: the guide standing as the only docked tab records nothing on close while the canvas holds no floats — docked and invisible, removing it would only confuse the seeding rule — and once a float stands it follows the shared sole-tab path, closing together with the column. Any other docked tab standing alone closes the same way — the layout stays empty until the next expansion seeds its current default page. Floating tabs take no part in the rule: they close freely whatever the column holds.

The store saves a workbench's layout, tab identities, selection, split ratios, floating rectangles, presentation and identity counter as JSON under `dsh.sidebar-right.v2.<sessionId>` in localStorage: each Session keeps its own workbench. A Session with no record of its own migrates a legacy workspace record (`dsh.sidebar-right.v2.ws:<cwd>`, read once, never written) or, failing that, starts from the skeleton of the Session the user just left — its drawer open state, presentation mode and zone order, without its tabs. Reload restores that layout before tab bodies render. Providers restore their own content from the retained tab identity and resource address, including [terminal reconnection](../ui-sidebar-terminal/README.md#use-this-package). Navigation parameters, resource contents and live connections are not layout state. Undo history stays in memory and resets on reload. Saved field types, node membership, selection, identity counters and the one-pane or two-horizontal-pane dock layout are validated before adoption or startup discovery; invalid data clears only its scope key. Storage failures leave the current layout usable in memory. Windows at the same origin share the last saved layout per scope; each active window keeps its own current layout until reload.

`sidebarRight.openTabs` publishes stable metadata for every open tab across saved and adopted Sessions. Startup discovery reads the layout keys without mounting dormant content, pinning files or activating Agents. Adopted stores replace their own metadata on membership commits, and permanently cleared scopes remove it. Other windows' storage writes do not overwrite this window's live membership. Providers use this inventory to restore their own resource lifetimes.

<a id="extension-seats"></a>
## Extension seats

A tab type registers in two stages, and the shipped guide type goes through exactly the same public path a type from another package does (`ui-sidebar-documentpreview` is the live proof). Both stages sit inside the type's own `ctx.effect`, so the registration lives exactly as long as the plugin that made it.

1. **The type** — `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide?, keepMounted? })`, a static declaration with no runtime hook, returning a disposer. `id` is this implementation's identity in the tab system, unique across every registration (a package name is the natural value; the shipped guide is `@deepseek-ai/dsh-client-ui-sidebar-right/guide`): a kind is not unique once an extension may take a builtin's over, so the implementation names itself, and a second registration of an `id` throws. A resource type names `patterns`, globs over `dsh-resource://` addresses: one containing `:` matches the whole address (`dsh-resource://file/**`); one without matches the URI's path at any depth, ignoring case (`*.md`), and an address that is not a URI matches no such pattern. A page type — the guide, a file tree — names none and is opened by kind. `canOpen(address)` vetoes a match. `title(address)` is the tab chip's text, captured when the tab opens. `guide` lists entry boxes for the guide page; picking one opens the contributing type as a page. A `kind` carries at most one `builtin` and one `extension` registration (the extension is in force; the builtin resumes when it leaves); any other collision on a kind throws. The `id` is also the key the type's body and title register under, so an extension and the builtin it takes over hold distinct cells and the seat renders the one in force.
2. **The body** — `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` reads `{ sidebar, panel, tab }` through the framework-injected `useTabInfo()`. `sidebar` supplies expansion and fullscreen information; `panel.id` identifies its pane; `tab` contains the record fields, `visible`, `navigation`, `signal`, and `actions`. These are not parallel owner props; the type's own store still uses `useStore`/`actions`. Optional title registrations and guide replacements share this hook; an absent title registration uses the text captured at open time. The title wrapper retains tab and occurrence DOM markers without adding a layout box, so dockkit controls icon spacing and vertical alignment in docked tabs and floating headers.

Which type opens a resource follows the editor-resolver convention: the types whose `patterns` match are ranked by `priority` band — `extension` (a type from outside the product, the highest, and the default when none is named), `builtin`, `fallback` (plain viewers anything more specific should beat) — then by the length of the matched pattern, then by registration order; `canOpen` removes a candidate. The bands are string literals so a type in another package needs no runtime import from here. `candidates(address)` returns the ranking, `claim(address, kind?)` the decision; naming a `kind` skips its globs but keeps its `canOpen`.

Two more seats extend what is already there: `sidebar.right.tab.guide` (chain) replaces the guide tab's body without replacing the tab, and `sidebar.right.tab.menu.item` (list) appends content-level actions to a tab's menu after the kit's own layout actions.

The `sidebar.right.pane.top` seat (single, session-scoped) owns the column's upper zone, hairlined off from the feature list below it: product-level navigation that belongs to the column rather than to any one tab — the workbench's own navigation is the shipped occupant. The zone contributes no box while the seat is empty and slides with the rest of the column on collapse. The same seat renders inside the collapsed rail with owner `rail: true`, where the occupant draws the zone's icon form; the expanded zone receives `rail: false`. No seat exists for pane-level actions or for collapsed-state controls yet, because nothing needs one.

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` and `openTab(kind, options?)` are the navigation controller, and every way into the surface calls one of them: the conversation's file links and a tool row's line reference (`openResource(fileAddress, { params: { line } })`), a feature row or guide entry box (`openTab`), a file tree's rows (`tab.actions.openResource`). A resource address is a `dsh-resource://<type>/…` URI; without `options.kind` the registry claims it (globs and `canOpen`, best band wins), with it that kind's type in force opens it. A page is named by kind; the tab is recorded under an address this package composes and nobody else spells (`contract/seed.ts`). Both run the same steps as one history entry: a resource tab already showing the same (kind, contentId) is focused wherever it sits unless `revealIfOpened: false`; ordinary page tabs deduplicate across the whole surface — a float on the canvas wins over a docked record, because the canvas is what the user is looking at; otherwise a new tab lands in `options.replaceTab`'s pane and slot (closing that tab), else `options.paneId`, else the active docked pane; the panel expands, because content the user cannot see is not opened — `expandColumn: false` declines exactly that step, the rail's pick landing the page on the canvas beside the still-collapsed column. A tab that lands docked is floated in the same entry — opened content presents on the canvas. Then the Tab domain records the navigation — `params` reach the body as `navigation.params`, with `revision` stepped — outside the layout history. `params` is typed by what is opened: a viewer for a resource type merges its entry into `SidebarRightResourceParamsMap` (the text preview declares `{ line?: number }`); a page type that takes parameters merges into `SidebarRightTabParamsMap` under its kind; values are JSON-shaped by convention, unchecked at run time. An address outside `dsh-resource://`, one no type claims, or a kind nothing registered throws: that is a wiring mistake, not a user error.

`preferNewPane: true` first asks the target docked pane to split under the normal two-pane and room rules, then falls back to that pane when no split is available. `replaceTab` takes precedence and disables this preference.

`close(tabId)` closes a tab; `active()` reads the active tab. `isExpanded()` and `toggleExpanded()` read and drive the column's expansion; `toggleFullscreen(target)` applies the panel control’s display-mode action to any captured pane — docked or the canvas's float — because the mode belongs to the panel, not the pane. Layout operations, for callers that arrange the column programmatically, each recorded like the gesture it stands in for: `focus(tabId)` focuses a tab and its pane; `split(paneId?)` splits a docked pane (the active one by default) under the pane budget and room rule and returns the new pane's id, or `undefined` — recording nothing — when it cannot; `float(tabId, rect?)` takes a docked tab out into a panel; `dock(paneId)` returns a floating panel to the active docked pane. A tab or pane that does not exist, or already is where the call would put it, is left alone. The face exposes operations only: no layout snapshot, no operation log, no lookup by address. `_undo()` / `_redo()` step the mounted surface's history; they are `@internal` — the sequence has no user-facing control, and these exist for tests. Commands need a mounted session surface; with none, they throw rather than write into a surface nobody draws. `mounted` is the observable of the session whose seat is on screen, `undefined` while a global panel replaces the Conversation or no session is selected. A component that opens content from its own mount effect reads it through a bound hook and acts once it is defined: the frame mounts the Conversation column ahead of this seat, and the seat publishes its binding from a passive effect of the same commit, so an effect that assumed a bound seat would run first and throw. The plan review's automatic open reads it this way.

`focusedTarget(element?)` resolves the current DOM pane and tab, including an embedding iframe; outside focus returns no page. `commandTarget(element?)` additionally allows an outside open to use the mounted Session's active dock pane. Captures include the occurrence and navigation revision; `isTargetCurrent(target)` rejects changed Sessions, moved or reopened tabs, and intervening navigation. Focus and pointer activation remain separate from persisted layout selection.

<a id="the-tab-domain"></a>
## The Tab domain

The Tab domain retains a branded occurrence id, navigation, an abort signal, and bound actions per (Session, tab id). A private assembly callback adopts each Session's store, reconciles restored records immediately, and follows its commits. Reconstructing a Session store replaces its adoption, releasing the old subscription and cleanup reference. Only record removal or plugin unload aborts the signal; closing the sidebar and switching Sessions retain records, while undo restores a new occurrence. `useTabInfo()` composes framework-bound store and navigation hooks without manual component subscriptions or render-time record creation. `tab.actions` always target their own Session; `tab.visible` distinguishes bodies from titles and excludes background Sessions; foreground floating tabs remain visible when the sidebar closes. `adopt` is absent from the public controller.

A type's `keepMounted: true` retains visited bodies across tab and Session changes, collapse, and docking. Each View supplies its stable hold callback through owner props, so rebuilding Session injection bindings does not release a body. Unvisited bodies are not mounted eagerly.

Tab owners register `registerCloseHandler(kind, handler)` through an effect. A handler synchronously retains any background cleanup before allowing explicit close or replacement. The resource owner tracks completion and retry; the sidebar does not wait. A thrown handler preserves the tab. Collapse, presentation changes and plugin disposal do not invoke close handlers; the tab abort signal identifies occurrence disposal, not an explicit close.

Close and refresh commands resolve the focused pane and tab occurrence. Page bodies bind their refresh operation through `tab.actions.bindCommands()` and release it on unmount; ended occurrences cannot regain capabilities. Refresh never reloads the application. Shortcut page opens, sidebar expansion, and all splits focus the selected dock or floating pane after its DOM commits, including singleton reveals and guide replacements. Sidebar expansion focuses the active dock pane; collapse preserves focus inside floating panes. Pane focus preserves existing text selections. If a focused page input or iframe is replaced, focus returns to its visible pane only while no other element owns focus; an outside pointer gesture or explicit blur cancels this restoration. Close checks the captured identity again and uses resource cleanup. After a keyboard or native-menu close, focus moves to a surviving visible pane in the same Session so consecutive close commands continue there. Stale targets and cleanup failures never fall back to closing a window. Modal restrictions follow the [shortcut service](../shortcuts/README.md). The close command first requests the foreground modal’s close action; a modal that declines dismissal, a menu, or an unregistered dialog blocks closing the sidebar or window behind it. Closing the sole docked guide with a shortcut or native menu collapses the sidebar and retains the guide. Desktop requests window closure through the shortcut service only when no modal is open and no sidebar page owns focus; Web leaves the browser open.

<a id="the-guide"></a>
## The guide

Each `guide` entry has an `id` unique within its provider. The guide renders `sidebar.right.tab.guide.entry` by the active definition id, forwarding the entry id, resolved title and optional description, plus the framework `useTabInfo` hook. A provider can register a custom card under its definition id; otherwise the standard icon/title button renders. The sidebar owns width and placement, while custom components own their markup and interaction. Guide cards use the shared R20 radius, including hover fills and provider-owned split buttons. Entry identity remains stable across sorting and unrelated registrations. Unboxed shortcut text aligns at the right. The terminal shell menu sits beside its entry title.

A tab type can declare `multiple: true` for independent instances such as terminals. Each open receives a distinct content address, so placement and docking preserve those instances; ordinary pages retain per-pane uniqueness.

Default pages depend on the number of registered guide entries, not the number of tab types or open tabs. Exactly one entry opens its page directly; zero or multiple entries open the guide. Explicitly adding a guide still opens the guide, even with one entry. The sole docked guide refuses close while the canvas holds no floats; closing any other sole docked tab also collapses the column. The context menu and `close` API apply the same rule.

The guide tab is a muted compass over one entry capsule per `guide` entry the registered types contributed, in `order`, centred in the body; the guide has no words of its own. A capsule shows the entry's glyph — or the guide's quieter cube placeholder when the entry registered none — and its title; while at most four entries are listed, an entry that registered a `description` shows it under the title, and a longer list drops every description. Picking a default capsule calls `tab.actions.openTab(entry.kind, { replaceTab: true })`, so the guide gives way to the page it opened. A pane holds at most one guide tab; opening the guide into a pane that already has one focuses it instead; `duplicateTab` on the guide records nothing. An expanded empty root pane seeds the default page only while the canvas holds no floats. A plain `openTab('guide')` opens or focuses the guide only within the active or named pane.

<a id="copy"></a>
## Copy

Every string in the column comes from the `sidebarRight` locale namespace, including the kit's accessible names. A tab's title is fixed when the tab is minted; a type's display name follows the current language.

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Browser-local layout.** Layout does not synchronize between devices; provider-specific state requires its provider's recovery support.
- **No surface without a session.** State is keyed by session id, so the hero screen shows nothing on the right.
- **Hard-coded stacking.** The content tree uses a fixed stacking layer; floats reorder within it without raising that layer above menus.
- **Retained Session deletion.** Catalog absence alone does not retire an initialized retained View; its tab lifetimes and plugin teardown own release.
- **Undo is not exposed.** The recorded sequence is stepped only through the `@internal` service methods; product controls are deliberately absent.
- **Titles are fixed at open time.** A type's `title(address)` is captured into the record; a live title comes only from the optional title seat.
- **No content navigation stack.** Stepping back replays layout operations; an editor-style back/forward over visited content is not built.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The two services (`sidebarRight`, `sidebarRightTabs`) are provided through `ctx.reflect.provide` inside one effect and torn down with it; the seat's binding and the Tab domain's occurrence lifetimes are asserted directly by this package's specs, and no independent observation exists to diverge from them.
