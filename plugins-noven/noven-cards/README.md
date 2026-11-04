# Noven cards

English | [中文](README.zh.md)

Whole-module edits may carry `expectedText`. The Host compares stored Markdown inside the card's serialized write and rejects content conflicts; the HTTP result's `savedText` contains the stored text. Older calls without an expectation retain their semantics, and edits to different modules do not require an identical card revision. These fields do not enter durable card data. `node tests/run.mjs markdown-save` tests conflicts, rejected input and older calls through the real route.

Cards, modules and internal characters share the root card's payload directory. Reads, map requests, reference indexes and exports traverse the complete document tree; each module resolves images through its owning document's resource table.

Internal-character copies allocate ids before transferring text, captions, images and extension files. Self references point to the destination world; external references retain their address. Imports remap local ids per module, keeping identical marker ids in different maps independent. Presentation asset labels, timeline character names and ordinary text fields remain unchanged.

Invalid exchange checksums, missing payloads and malformed structured JSON reject the operation without changing the destination's committed revision. Imports use the existing draft confirmation process.

Existing card, resource path and exchange package versions remain unchanged. Reads do not migrate or rewrite files. Copies and imports rewrite only the owning card's `card-image:` references inside ordinary text. Images and opaque extensions retain their bytes. Earlier runtimes can read copied and imported cards; reverting code does not delete generated cards, historical revisions or payloads.

Build from the repository root with `tsc -p plugins-noven/noven-ledger/tsconfig.json`, `tsc -p plugins-noven/noven-fmg/tsconfig.json`, then `tsc -p plugins-noven/noven-cards/tsconfig.json`. Run regressions with `node plugins-noven/noven-cards/tests/run.mjs resource-closure round-trip routes map`. Test processes use private `NOVEN_HOME` and project directories.
