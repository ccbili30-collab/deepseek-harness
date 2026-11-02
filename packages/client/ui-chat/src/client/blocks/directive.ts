/**
 * The one grammar that turns a line of assistant prose into a sealed block.
 * A directive participates only when a whole line is `::view{...}` with a
 * complete JSON object and exactly one content field: `src` for a referenced
 * object or `data` for message-owned component data. A partial line, malformed
 * payload, or invalid content stays ordinary text.
 * @module ui-chat/client/blocks/directive
 */

/** JSON accepted at the model-output boundary. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject

/** A JSON object with recursively validated values. */
export interface JsonObject { readonly [key: string]: JsonValue }

/**
 * Check recursively whether a parsed value is a JSON object.
 * @param value - Untyped parsed input.
 * @returns Whether every nested value is JSON data and the root is not an array.
 */
export function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(isJsonValue)
}

/**
 * Check recursively whether a parsed value contains only JSON data.
 * @param value - Untyped parsed input.
 * @returns Whether the value can be stored without functions or class instances.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isJsonObject(value)
}

/** A block that addresses an existing object. */
export interface BlockSourceRef {
  /** Registered block type. */
  readonly block: string
  /** Workspace-relative, absolute, or plugin-owned source the block renders. */
  readonly src: string
  /** Optional display title; presentation only, never parsed. */
  readonly title?: string
  /** Optional declared size variant the block type offers, e.g. `wide`. */
  readonly size?: string
}

/** A block whose lightweight content lives in the assistant message. */
export interface BlockDataRef {
  /** Registered block type. */
  readonly block: string
  /** Component data owned by this message, not by a file or card. */
  readonly data: JsonObject
  /** Optional display title; presentation only, never parsed. */
  readonly title?: string
}

/** One sealed block directive. */
export type BlockRef = BlockSourceRef | BlockDataRef

/**
 * One source-ordered run of a text block: prose, or a sealed block directive.
 * The key is the segment's offset in the text, so appending more text never
 * moves an earlier segment and React never remounts a mounted block.
 */
export type BlockSegment =
  | { readonly kind: 'text'; readonly key: number; readonly text: string }
  | { readonly kind: 'block'; readonly key: number; readonly ref: BlockRef }

const DIRECTIVE = '::view'

/**
 * Parse one directive line.
 * @param line - One complete source line, indentation included.
 * @returns The directive when the line is sealed and has exactly one valid content field.
 */
export function parseDirectiveLine(line: string): BlockRef | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith(DIRECTIVE)) return undefined
  const payload = trimmed.slice(DIRECTIVE.length).trim()
  if (!payload.startsWith('{') || !payload.endsWith('}')) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  if (!isJsonObject(parsed)) return undefined
  const block = parsed.block
  if (typeof block !== 'string' || block === '') return undefined
  const hasSource = parsed.src !== undefined
  const hasData = parsed.data !== undefined
  if (hasSource === hasData) return undefined
  const title = parsed.title
  const size = parsed.size
  const common = {
    block,
    ...(typeof title === 'string' && title !== '' ? { title } : {}),
  }
  if (hasData) {
    if (!isJsonObject(parsed.data)) return undefined
    return { ...common, data: parsed.data }
  }
  if (typeof parsed.src !== 'string' || parsed.src === '') return undefined
  return {
    ...common,
    src: parsed.src,
    ...(typeof size === 'string' && size !== '' ? { size } : {}),
  }
}

/**
 * Split one assistant text block into prose runs and sealed block directives.
 * Line endings and prose spelling are preserved byte for byte, so the rendered
 * prose is identical to the recorded text apart from the removed directive lines.
 * @param text - The text block exactly as recorded.
 * @returns Segments in source order, keyed by their offset in `text`.
 */
export function splitBlockSegments(text: string): readonly BlockSegment[] {
  const segments: BlockSegment[] = []
  let lineStart = 0
  let proseStart = 0
  while (lineStart < text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline === -1 ? text.length : newline
    const ref = parseDirectiveLine(text.slice(lineStart, lineEnd))
    if (ref !== undefined) {
      if (lineStart > proseStart) {
        segments.push({ kind: 'text', key: proseStart, text: text.slice(proseStart, lineStart) })
      }
      segments.push({ kind: 'block', key: lineStart, ref })
      proseStart = newline === -1 ? text.length : newline + 1
    }
    if (newline === -1) break
    lineStart = newline + 1
  }
  if (proseStart < text.length) {
    segments.push({ kind: 'text', key: proseStart, text: text.slice(proseStart) })
  }
  return segments
}
