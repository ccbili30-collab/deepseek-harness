# Noven shell

English | [中文](README.zh.md)

The Noven shell registers pages, canvases and conversation modules through plugins. `chatBlocks` and `inputTriggers` inject independently, so either service can arrive after the shell. Inline modules do not wait for optional input triggers.

Card backgrounds use covers, world identity images use Logos, and character identity images use avatars. An older Host without a Logo field shows an object placeholder. Card-page styles own tab scrolling and title sizes; image positioning does not move titles or metadata.

Build Host and Client with `tsc -p tsconfig.host.json` and `tsc -p tsconfig.json`; this package's `tsdown` configuration builds the browser bundle. Inline regressions are in `tests/inline-modules.spec.ts`, image regressions in `tests/card-images.spec.ts`, and style guards run with `node tests/mode-style.mjs`.

Text editors share a save buffer. With automatic saving disabled, closing the view discards the manual draft without writing. With it enabled, disposal submits pending input. Failures retain drafts, and acknowledging an older submission preserves later input. Whole-module writes carry `expectedText`; the card Host compares stored text and returns `savedText` to acknowledge parsed Markdown. This protection requires matching `noven-cards` and `noven-shell` installations.

Tabs, previews, reference modules and conversation modules share card snapshots. Late reads cannot overwrite accepted operations or deletions; cache keys include the complete project address. Only HTTP 404 means absence. Other read failures retain content and return errors. Failed commands keep the deleted object's tab or preview open. `tests/save-cache.spec.ts` and `tests/save-entry.client.spec.ts` exercise failures, disposal, manual cancellation and selection changes.

Durable formats remain unchanged: existing card, session and settings fields keep their values. Reverting the client changes caches and save timing; older parsers still read saved Markdown. The shared `SettingsFormModel` acknowledgement fix ships in the desktop runtime build; standalone plugins cannot replace installed shared packages through source links.

Noven settings registrations supply optional metadata while retaining the current gear icons and order. [Shared settings compatibility](../../packages/client/ui-settings-general/README.md#ledger-projections) owns the core/renderer/settings release unit. A metadata-aware plugin on an older core registers with legacy navigation. Noven's other required services, including `canvasPages`, still need a matching runtime; missing required providers prevent activation. This plugin consumes the renderer's `canvasPages` declaration directly.

After building the shared packages, Session Controller, store/util libraries, ledger and fmg, run `node plugins-noven/noven-shell/tests/packed-runtime.mjs` from the repository root. It packs their real `files` payloads, installs them into an isolated consumer, verifies that package paths stay inside that installation, builds both Noven clients against installed declarations, resolves their real factories, tests Cordis registration/disposal, and checks the published rc.2 core's metadata fallback. Candidate packs are staging inputs, not published rc.2 replacements. This smoke does not replace desktop or complete Loader acceptance.
