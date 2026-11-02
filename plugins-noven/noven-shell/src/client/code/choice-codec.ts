/**
 * Codec-only input-trigger registration for inline code choices. Chips never
 * open a menu; submission decodes the host-generated ref into ordinary text.
 * @module noven-shell/client/code/choice-codec
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CODE_CHOICE_SOURCE, codeChoiceClipboardText, codeChoiceSerialize } from './choices.ts'

interface CodeChoiceTriggerService {
  registerSource(src: {
    trigger: '@'
    name: string
    showGroupTitle: false
    candidates(): Promise<readonly never[]>
    onPick(): 'handled'
    codec: {
      clipboardText(ref: string): string
      serialize(ref: string, signal: AbortSignal): Promise<string>
    }
  }): () => void
}

/**
 * Register plain-text serialization for code choice chips.
 * @param ctx - Client root with the existing input-trigger service.
 * @throws When choices could otherwise be inserted without a submission codec.
 */
export function registerCodeChoiceCodec(ctx: ClientContext): void {
  const inputTriggers = ctx.get('inputTriggers') as CodeChoiceTriggerService | undefined
  if (inputTriggers === undefined) throw new Error('noven-shell: inline code choices require inputTriggers')
  ctx.effect(() => inputTriggers.registerSource({
    trigger: '@',
    name: CODE_CHOICE_SOURCE,
    showGroupTitle: false,
    candidates: async () => [],
    onPick: () => 'handled',
    codec: {
      clipboardText: codeChoiceClipboardText,
      serialize: async ref => codeChoiceSerialize(ref),
    },
  }), 'noven-shell: inline code choice codec')
}
