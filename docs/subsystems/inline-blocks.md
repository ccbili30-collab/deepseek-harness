# Inline blocks

English | [中文](inline-blocks.zh.md)

An inline block is a sealed unit inside assistant text. It either references an existing object or carries message-owned component data. Sealed ordering, explicit content ownership, focus activation, and content-appropriate sizing keep streaming, identity, keyboard handling, and layout consistent.

## The directive

A block exists only when a whole line is `::view{...}` with a complete JSON object, a non-empty `block`, and exactly one content field. `src` addresses an existing object; `data` contains a JSON object owned by the message. A partial line, malformed JSON, missing or mixed content fields, or surrounding inline text remains ordinary prose. While a message streams, a trailing unfinished directive is hidden instead of being painted as prose.

```text
::view{"block":"code","data":{"version":1,"component":"text","text":"阿七第一次出场。"}}
::view{"block":"module","src":"card:card-1/module-1","size":"wide"}
```

The first example renders a host-owned text component without creating a file or card. The second displays an existing card module. Reference types may declare named `size` variants; an unknown variant falls back to the type default.

## Segments and identity

`splitBlockSegments` returns prose runs and blocks in source order, keyed by text offset. Appending a streamed chunk can only extend or split the trailing prose run, so earlier blocks keep their React instances. Directive lines leave the prose while surrounding spelling and line endings remain byte for byte.

Each block also receives a stable identity derived from its assistant Turn/step, assistant text-block index, and source offset. Inline choice groups use that identity, so neither two messages nor two text blocks in one message can replace each other's selections.

## The registry

`ctx.chatBlocks` maps block ids to `BlockSpec`. A reference spec declares `size.ratio`, an optional `source`, and a renderer receiving `source`. A data spec declares `content: 'data'` and a renderer receiving `data`, `blockId`, a workspace media resolver, and an optional Session-scoped commit callback. Empty ids, duplicate ids, duplicate source resolvers, and non-positive reference ratios fail at registration.

Reference sources are `raw`, `workspace`, `frame`, or `card`; the container resolves them before rendering. Mounted segments subscribe to registry revisions, so late registration, HMR disposal, and source-resolver changes refresh existing content. A failed resolution shows the controlled notice without invoking the type renderer. Data blocks never resolve their component data through a file. Their media fields still resolve workspace resource paths through the containing view. Without a provider or any registered types, the original Markdown path remains unchanged.

Noven registers `code` and `module`. `module` loads `card:<cardId>/<moduleId>` through the existing card API and displays the shared read-only `ModuleSurface`. `code` validates a versioned component document and renders host-owned React components: text, media, icons, stack, split, frame, badge, media grid, palette, dialogue, narration, story panel, canon diff, choices, conflict list, stat, meter, bar chart, line chart, and radar chart. Validation permits only each component's declared fields, recursively rejects extra fields, and requires unique identities within selectable groups. It accepts no HTML, CSS, script, SVG source, arbitrary style, or base64 media and creates no presentation file or module. `noven-shell/src/code-catalog.ts` supplies the model-facing component catalog and the validation fixture ids.

## The frame

Reference blocks reserve their declared ratio before loading, so pending, ready, and failed bodies cannot move the transcript. Data blocks use intrinsic height because their complete component content is already sealed; individual media and charts own their local geometry. Unknown inline content shows a controlled notice without dumping its JSON.

Activation is focus. The frame is focusable, `:focus-within` draws the ring, and Escape blurs it. No component stores an active block and no document-level listener routes keyboard ownership.

## Choices and model visibility

Interactive code components call the Session-scoped commit callback with a stable group prefix and a structured reference. Chat translates that prefix into an append or single-chip replacement in the existing composer draft. The input-trigger codec serializes the selected reference into ordinary text on submission, and the existing draft lifecycle handles failure restoration. Read-only containers omit the callback and disable selection.

Blocks do not report viewing or interaction state to the model. Only a user's committed choice becomes text with the next message. Inline component data already lives in assistant text, so this mechanism adds neither a Session event nor an agent-loop change.
