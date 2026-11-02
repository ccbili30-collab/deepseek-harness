/**
 * Session-composer adapter for structured block choices. The existing input
 * facade owns draft revisions, chip serialization, submission, and failure
 * restoration; this module only translates one choice group's stable ref prefix
 * into an append or single-chip replacement in detect-projection coordinates.
 * @module ui-chat/client/blocks/commit
 */
import type { InputState, SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BlockCommitRequest } from './registry.tsx'

/** Minimal public input face needed to translate block choice coordinates. */
export interface BlockChoiceInput {
  readonly state: { getSnapshot(): Pick<InputState, 'draft' | 'draftRev' | 'occurrences'> }
  readonly insertReference: SessionInput['insertReference']
  readonly focus: SessionInput['focus']
}

/**
 * Append a choice chip or replace the last chip in the same group.
 * @param input - The viewed Session's public input facade.
 * @param request - Stable group prefix and the selected reference projection.
 * @returns Whether the composer accepted the edit at the current draft revision.
 */
export function commitBlockChoice(input: BlockChoiceInput, request: BlockCommitRequest): boolean {
  const state = input.state.getSnapshot()
  const occurrences = state.occurrences
  let target = -1
  for (let index = occurrences.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrences[index]
    if (occurrence?.source === request.insert.source && occurrence.ref.startsWith(request.refPrefix)) {
      target = index
      break
    }
  }
  let start = state.draft.length - occurrences.reduce((length, occurrence) => length + occurrence.length, 0) + occurrences.length
  let end = start
  if (target !== -1) {
    const previous = occurrences.slice(0, target)
    const occurrence = occurrences[target]
    if (occurrence !== undefined) {
      start = occurrence.offset - previous.reduce((length, item) => length + item.length, 0) + target
      end = start + 1
    }
  }
  const accepted = input.insertReference(request.insert, { start, end, draftRev: state.draftRev })
  if (accepted) input.focus()
  return accepted
}
