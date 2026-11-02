/** Coordinate translation for inline block choice chips. */
import { describe, expect, it, vi } from 'vitest'
import { commitBlockChoice, type BlockChoiceInput } from '../src/client/blocks/commit.ts'
import type { BlockCommitRequest } from '../src/client/blocks/registry.tsx'

type DraftState = ReturnType<BlockChoiceInput['state']['getSnapshot']>
type Occurrence = DraftState['occurrences'][number]

function occurrence(source: string, ref: string, offset: number, length: number): Occurrence {
  return { occurrenceId: offset, source, ref, offset, length, label: ref, clipboardText: ref }
}

function request(ref: string): BlockCommitRequest {
  return {
    refPrefix: 'group|',
    insert: { source: 'choice', ref, label: ref, clipboardText: ref },
  }
}

function harness(state: DraftState, insertReference = vi.fn(() => true)) {
  const focus = vi.fn()
  const input: BlockChoiceInput = { state: { getSnapshot: () => state }, insertReference, focus }
  return { input, insertReference, focus }
}

describe('commitBlockChoice', () => {
  it('appends at the detect-projection end after ordinary text and existing chips', () => {
    const state: DraftState = {
      draft: 'abcdef123456',
      draftRev: 7,
      occurrences: [occurrence('other', 'old', 3, 5)],
    }
    const { input, insertReference, focus } = harness(state)
    expect(commitBlockChoice(input, request('group|b'))).toBe(true)
    expect(insertReference).toHaveBeenCalledWith(request('group|b').insert, { start: 8, end: 8, draftRev: 7 })
    expect(focus).toHaveBeenCalledOnce()
  })

  it('replaces only the latest chip in the same group and preserves other references', () => {
    const state: DraftState = {
      draft: 'abcdef1234567890',
      draftRev: 9,
      occurrences: [
        occurrence('other', 'old', 2, 5),
        occurrence('choice', 'group|a', 7, 4),
        occurrence('choice', 'other|a', 11, 5),
      ],
    }
    const { input, insertReference } = harness(state)
    expect(commitBlockChoice(input, request('group|b'))).toBe(true)
    expect(insertReference).toHaveBeenCalledWith(request('group|b').insert, { start: 3, end: 4, draftRev: 9 })
  })

  it('does not focus or pretend success when the composer rejects the edit', () => {
    const state: DraftState = { draft: '', draftRev: 2, occurrences: [] }
    const { input, focus } = harness(state, vi.fn(() => false))
    expect(commitBlockChoice(input, request('group|b'))).toBe(false)
    expect(focus).not.toHaveBeenCalled()
  })
})
