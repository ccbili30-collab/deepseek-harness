# Agent Note: Inline blocks — content ownership instead of per-site fixes

Status: implemented

English | [中文](2026-10-29-inline-blocks.zh.md)

## Problem

Assistant prose needs rich content at exact reading positions, but tool-result artifacts render only at the turn tail. Early inline approaches also rebuilt content on streamed chunks, reset scrolling, stored global activation, and compensated for late layout independently. Noven's first `code` implementation then confused lightweight message content with a persistent HTML artifact, duplicating the role of the existing HTML module and leaving files to clean up.

## Decision

An inline block is a sealed unit with four invariants:

1. **Append-only, sealed units.** A whole `::view{...}` line must contain complete JSON, a block id, and exactly one content field. Segments use source offsets as keys, so streamed appends cannot move or remount earlier blocks.
2. **Explicit content ownership.** `src` references an existing object; `data` stores a versioned component document in the assistant message. Reference renderers receive a resolved source. Data renderers receive validated JSON, stable Turn/step/text-block/offset identity, workspace media resolution, and an optional Session-scoped commit callback. Lightweight code never creates a file, card, iframe, or module.
3. **Activation is focus.** The frame uses focus and `:focus-within`; Escape releases it. No active-block store or document-level keyboard router exists.
4. **Size follows content.** Reference blocks reserve a declared ratio through loading and failure. Sealed component documents use intrinsic height, while media and charts own their local geometry.

The grammar knows no component. The registry distinguishes reference and data specs without knowing messages and publishes revision notifications, so late registration, disposal, and source-resolver changes refresh mounted content; a failed source resolution never reaches the type renderer. Noven owns the component vocabulary and validation. Its shared catalog drives the system prompt and contract fixtures. Twenty components cover composition, media, OC narrative, collaboration, and lightweight data display; validation permits only each component's declared fields and requires unique selectable ids, so model output cannot smuggle HTML, CSS, script, SVG source, arbitrary style, or base64 media through an extra field.

Choices reuse the existing Session composer. A stable block/group prefix appends or replaces one reference chip, and an input-trigger codec serializes the selected value as ordinary text. The existing input lifecycle preserves submission failure behavior. Viewing and clicking do not synchronize model state.

## Alternatives considered

- **Turn-tail artifacts.** They cannot represent position between prose paragraphs.
- **File-backed HTML code.** It creates duplicate HTML modules, requires artifact cleanup, and makes the model rewrite presentation code instead of reusing stable components.
- **Continuous state synchronization.** It adds cache and logging obligations without improving the requested interaction. Only committed choices need to become user text.
- **A second pending-selection store.** It would duplicate draft persistence, revision checks, serialization, and failure restoration already owned by the composer.

## Verification

`packages/client/ui-chat/tests/inline-blocks.client.spec.tsx` and `block-commit.client.spec.ts` cover sealed reference/data parsing, mixed-content rejection, intrinsic layout, stable identity, source failure, registry registration/disposal refreshes, media resolution, commit forwarding, and append/replacement coordinates. `apply-inject.client.spec.tsx` covers choice insertion and replacement through the real Chat/Conversation assembly. Noven's isolated inline-code suite validates and renders every catalogued component, rejects unsupported payloads and undeclared or duplicate fields, round-trips choice refs, and disables commit-less choices. The module suite covers card-source and choice-codec registration plus display-only map persistence. `apps/web/tests/noven-inline-code.e2e.ts` adds real-browser coverage for every component family, real image loading, light/dark/narrow layouts, historical rerendering, choice replacement and append, ordinary-text submission, unchanged workspace files, and sidecar-aware teardown. `apps/web/tests/noven-inline-gallery.e2e.ts` now waits for the inline product chain to persist the terrain summary, terrain document, and human world, then verifies request clearing and reload; `generate_map` direct generation is accepted through the same chain. The keyless recorded-session scenario `snapshots/web/noven-inline-blocks` authors a committed V4 log, refreshes `ui.expected.md`, replays without a key, and proves two text-block choice groups keep independent chips while the full component catalog renders. The snapshot corpus adapter registry includes the new scenario. ui-chat and noven-shell client/host typechecks, the Noven production build, and the complete repository build pass.

## Consequences

Noven registers `code` for message-owned component documents and `module` for existing card modules. The old file-backed `CodeBlock`, frame resolver, HTML prompt, and chart HTML templates are removed from this path. The shared card `ModuleSurface` remains read-only except for the narrowly authorized map-generation result channel, which accepts only terrain/world saves for the referenced map during a consumed generation request. The component registry does not yet mount in canvas or standalone preview. Isolated Web visual and interaction acceptance passes for all twenty code components and ten module presets; a real model turn remains unverified because no model credential is available in the acceptance environment.
