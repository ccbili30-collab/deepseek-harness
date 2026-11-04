/**
 * Text acknowledgement shared by file and card editors.
 * @module noven-shell/client/text-save-buffer
 */

/** Persistence outcome; callbacks returning void acknowledge submission. */
export type TextWriteResult = void | boolean | 'ok' | 'conflict' | 'error' | { readonly savedText: string }

/** Retains newer input while a submitted revision is being saved. */
export class TextSaveBuffer {
  private accepted: string
  private draft: string
  private expected: string
  private submitted: string | undefined
  private pending: Promise<boolean> | undefined
  private requested = false

  /** @param text - Initial accepted text. */
  constructor(text: string) {
    this.accepted = this.draft = this.expected = text
  }

  /** @returns Whether input still needs acknowledgement. */
  get dirty(): boolean { return this.draft !== this.accepted }

  /** @param text - Latest editor input. */
  stage(text: string): void { this.draft = text }

  /**
   * Accept external text only when no local input would be replaced.
   * @param text - Latest owner snapshot.
   * @returns Whether the editor may display this snapshot.
   */
  receive(text: string): boolean {
    if (text === this.accepted || text === this.submitted || this.dirty) return false
    this.accepted = this.draft = this.expected = text
    return true
  }

  /**
   * Save requested input serially; failure retains the draft for explicit retry.
   * @param write - Owner's persistence callback, including expected stored text.
   * @returns Whether all requested writes were accepted.
   */
  flush(write: (text: string, expectedText: string) => TextWriteResult | Promise<TextWriteResult>): Promise<boolean> {
    this.requested = true
    if (this.pending !== undefined) return this.pending
    const run = async (): Promise<boolean> => {
      while (this.requested) {
        this.requested = false
        if (!this.dirty) continue
        const text = this.draft
        this.submitted = text
        try {
          const result = await write(text, this.expected)
          if (result === false || result === 'conflict' || result === 'error') return false
          this.accepted = text
          this.expected = typeof result === 'object' ? result.savedText : text
        } catch (_error) {
          // The persistence owner reports failures; input remains pending.
          return false
        } finally {
          this.submitted = undefined
        }
      }
      return true
    }
    this.pending = run().finally(() => { this.pending = undefined })
    return this.pending
  }
}
