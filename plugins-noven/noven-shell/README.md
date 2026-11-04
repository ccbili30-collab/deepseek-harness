# Noven shell

English | [中文](README.zh.md)

The Noven shell registers pages, canvases and conversation modules through plugins. `chatBlocks` and `inputTriggers` inject independently, so either service can arrive after the shell. Inline modules do not wait for optional input triggers.

Card backgrounds use covers, world identity images use Logos, and character identity images use avatars. An older Host without a Logo field shows an object placeholder. Card-page styles own tab scrolling and title sizes; image positioning does not move titles or metadata.

Build Host and Client with `tsc -p tsconfig.host.json` and `tsc -p tsconfig.json`; this package's `tsdown` configuration builds the browser bundle. Inline regressions are in `tests/inline-modules.spec.ts`, image regressions in `tests/card-images.spec.ts`, and style guards run with `node tests/mode-style.mjs`.

Text editors share a save buffer. With automatic saving disabled, closing the view discards the manual draft without writing. With it enabled, disposal submits pending input. Failures retain drafts, and acknowledging an older submission preserves later input. Whole-module writes carry `expectedText`; the card Host compares stored text and returns `savedText` to acknowledge parsed Markdown. This protection requires matching `noven-cards` and `noven-shell` installations.

Tabs, previews, reference modules and conversation modules share card snapshots. Late reads cannot overwrite accepted operations or deletions; cache keys include the complete project address. Only HTTP 404 means absence. Other read failures retain content and return errors. Failed commands keep the deleted object's tab or preview open. `tests/save-cache.spec.ts` and `tests/save-entry.client.spec.ts` exercise failures, disposal, manual cancellation and selection changes.

Durable formats remain unchanged: existing card, session and settings fields keep their values. Reverting the client changes caches and save timing; older parsers still read saved Markdown. The shared `SettingsFormModel` acknowledgement fix ships in the desktop runtime build; standalone plugins cannot replace installed shared packages through source links.
