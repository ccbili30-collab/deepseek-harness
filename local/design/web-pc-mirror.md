# Noven Web and packaged macOS mirror

English | [中文](web-pc-mirror.zh.md)

## Goal and boundary

Default Noven Web mirrors the packaged macOS ordinary-window presentation: the same shared renderer, Noven defaults, object chrome, navigation semantics, and motion. PC does not lose capabilities to accommodate Web, and Web does not maintain a separate simplified interface.

Mirroring is not data synchronization. Web, Noven Test, and release Noven each own their Host data, project directories, and origin-local layout storage. Modes, folds, and user content do not copy themselves between instances. Project folders remain the user's choice.

## Native facts and presentation facts

- `data-platform="darwin"`: published only by the real Electron preload to identify macOS Desktop. Keyboard runtime, the native drag watcher, `-webkit-app-region`, preload, and Host path bridges consume only this fact.
- `data-chrome-platform="darwin"`: the presentation marker Noven Web sets before its first mount. It affects layout and visual rules only; it does not change the runtime platform, create an Electron bridge, or publish `data-fullscreen`.
- `data-fullscreen`: published only by the real macOS window. The Web mirror always references the ordinary window and never guesses native fullscreen from the browser Fullscreen API or viewport size.

The ordinary window shares full-column hiding, the 52px sidebar strip, 48px top clearance, 88px leading offset, Noven's 196px clearance, right-column insets, colors, menu material, and recovery controls. Web's traffic lights are inert decorations that preserve spatial reference; real Desktop renders no duplicate.

## Capability comparison

| Area | Web / PC relationship | Evidence it cannot replace |
|---|---|---|
| Agent / Handcraft, object chrome, Session list, Canvas tabs and tools | Shared source and behavior | Real Mac visuals still require the packaged candidate |
| Column folds, auxiliary folds, recovery controls, ordinary titlebar geometry | Shared presentation rules | Native fullscreen's 12/120 state requires macOS |
| Mode swaps, tabs, menus, and fold motion | Shared timing, easing, retention, and reduced-motion | Native fullscreen, minimize, and Dock restoration are outside the page |
| Sidebar transparency and vibrancy | Shared gradients and tokens; Web uses a deterministic page background | NSVisualEffectView pixels, wallpaper mixing, and Reduce Transparency |
| Traffic lights | Static Web decoration | Close, minimize, native fullscreen, and hover behavior |
| Keyboard shortcuts | Real Web bindings, commonly Option+Command | Desktop Command-only bindings, system menus, and global shortcuts are not simulated |
| Directory picking, Open In, Finder reveal | Available through the real Node Host and can produce equivalent local results | Dialog parentage, focus, cancellation; a remote browser addresses the Host filesystem |
| File drop | Web uploads bytes | Desktop's local path references are not presented as Web capabilities |
| Export and download | Shared Blob and file-generation logic | Browser download directories, permissions, Save As, and system download UI |
| Tabs and window lifecycle | Host and durable data can recover | Closing a browser tab does not preserve the same document and live scene as Desktop window hiding |
| System menus, Dock, tray, single instance, protocol activation | Not simulated | Requires the native app; protocol deep links also need their own implementation status |
| Signing, Gatekeeper, DMG, install, uninstall, upgrade | Outside Web | Requires the distribution artifact and macOS |

## Data isolation

- Web: repository `.data/harness`, `.data/library`, and `.data/projects`, port 3083.
- Noven Test: its own `Noven Test` root; without a portable `.data`, it uses `~/Library/Application Support/Noven Test`.
- Release Noven: `~/Library/Application Support/Noven`, never a test data root.

`启动诺文.command` resolves the repository from its own location, sets all three Web roots explicitly, and applies the Noven defaults from `apps/desktop/noven/profile/cordis.patch.yml`. An existing port is reused; missing builds, failed starts, and unreachable addresses stop the launcher instead of starting another instance.

## Acceptance

1. Build Web and the packaged candidate from the same source state; never compare a new Web build with an old DMG.
2. Use real browser behavior, DOM geometry, mode retention, interrupted motion, reduced-motion, and negative platform checks on Web.
3. Use the packaged Mac for native visuals, fullscreen, window dragging, menus, lifecycle, and distribution. Web screenshots do not replace that evidence.
4. The browser's address bar and tabs are outside the renderer mirror; Web does not pretend to own a native window frame.
