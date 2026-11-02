/**
 * Structured choices from inline code components. A stable block/group prefix
 * identifies one replaceable composer chip; the selected value and its final
 * plain text live in the ref so the existing input-trigger codec can serialize
 * without a parallel selection store.
 * @module noven-shell/client/code/choices
 */

/** Input-trigger source used only for inline code choice serialization. */
export const CODE_CHOICE_SOURCE = 'noven-code-choice'

/** One component-originated choice before it is encoded for the composer. */
export interface CodeChoice {
  readonly group: string
  readonly optionId: string
  readonly label: string
  readonly text: string
}

/** Minimal commit face mirrored from ui-chat's Session-scoped block scope. */
export interface CodeChoiceCommitRequest {
  readonly refPrefix: string
  readonly insert: {
    readonly source: string
    readonly ref: string
    readonly label: string
    readonly clipboardText: string
  }
}

/** Commit one encoded choice to the current Session's composer. */
export type CodeChoiceCommitter = (request: CodeChoiceCommitRequest) => boolean

function part(value: string): string {
  return `${value.length}:${value}`
}

function groupPrefix(blockId: string, group: string): string {
  return `v1|${part(blockId)}|${part(group)}|`
}

function readPart(ref: string, offset: number): { readonly value: string; readonly next: number } | undefined {
  const colon = ref.indexOf(':', offset)
  if (colon === -1) return undefined
  const length = Number(ref.slice(offset, colon))
  if (!Number.isInteger(length) || length < 0) return undefined
  const start = colon + 1
  const end = start + length
  if (end > ref.length) return undefined
  return { value: ref.slice(start, end), next: end }
}

/**
 * Encode and commit one choice.
 * @param commit - Session-scoped block choice sink.
 * @param blockId - Stable assistant-step and source-offset identity.
 * @param choice - Selected group, value, chip label, and final user text.
 * @returns Whether the composer accepted the chip.
 */
export function commitCodeChoice(commit: CodeChoiceCommitter, blockId: string, choice: CodeChoice): boolean {
  const refPrefix = groupPrefix(blockId, choice.group)
  const ref = `${refPrefix}${part(choice.optionId)}|${part(choice.text)}`
  return commit({
    refPrefix,
    insert: {
      source: CODE_CHOICE_SOURCE,
      ref,
      label: `${choice.group} · ${choice.label}`,
      clipboardText: choice.text,
    },
  })
}

/** Decode the final plain-text form from a host-generated choice reference. */
export function codeChoiceText(ref: string): string | undefined {
  if (!ref.startsWith('v1|')) return undefined
  let offset = 3
  const fields: string[] = []
  for (let index = 0; index < 4; index += 1) {
    const next = readPart(ref, offset)
    if (next === undefined) return undefined
    fields.push(next.value)
    if (index < 3) {
      if (next.next >= ref.length || ref[next.next] !== '|') return undefined
      offset = next.next + 1
    } else {
      offset = next.next
    }
  }
  return offset === ref.length ? fields[3] : undefined
}

/** Codec clipboard projection for a code choice chip. */
export function codeChoiceClipboardText(ref: string): string {
  return codeChoiceText(ref) ?? ref
}

/** Codec submission projection for a code choice chip. */
export function codeChoiceSerialize(ref: string): string {
  const text = codeChoiceText(ref)
  if (text === undefined) throw new Error('noven-shell: invalid inline code choice reference')
  return text
}
