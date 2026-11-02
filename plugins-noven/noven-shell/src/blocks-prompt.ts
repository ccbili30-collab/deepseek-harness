/**
 * Inline block grammar supplied to the model. `code` composes host-owned
 * components directly in the assistant message; `module` references an existing
 * card module. Neither path creates a presentation artifact.
 * @module noven-shell/blocks-prompt
 */
import type { Context } from '@deepseek-ai/cordis'
import { CODE_COMPONENT_CATALOG_TEXT } from './code-catalog.ts'

const EXAMPLE = '::view{"block":"code","data":{"version":1,"component":"stack","children":[{"component":"text","text":"阿七第一次出场。"},{"component":"dialogue","turns":[{"speaker":"阿七","role":"修钟匠","portrait":"characters/aqi/stern.png","text":"别碰那根指针。"}]},{"component":"choices","group":"剧情分支","options":[{"id":"trust","label":"相信阿七"},{"id":"test","label":"要求证明"}]}]}}'

/** Inline block grammar and the current component catalog. */
export const BLOCK_SECTION_TEXT = `## Inline blocks in replies

A reply can place lightweight components or existing card modules at exact positions in the prose. Put one complete JSON directive on its own line, with no code fence and no other text on that line.

- \`::view{"block":"code","data":{"version":1,"component":"…",...}}\` renders message-owned component data.
- \`::view{"block":"module","src":"card:<cardId>/<moduleId>"}\` displays an existing card module in place. Optional module sizes: \`"size":"wide"\`, \`"square"\`, or \`"tall"\`.

For \`code\`, use \`stack\` to compose several components. Content belongs to the message: never create an HTML file, card, module, iframe, or artifact for it. Do not emit HTML, CSS, JavaScript, SVG source, arbitrary styles, or base64 media. Image fields are existing workspace-relative resource paths. Text supports safe Markdown. Use \`module\` for complete HTML, 3D, map, timeline, scene, relation, collection, profile, or document interfaces instead of recreating them with \`code\`.

Choices are local interactions only. Selecting one inserts a chip into the user's next message; do not claim that a choice changed a card, file, or model state. Use a stable, specific \`group\` label for each choice group.

Current \`code\` components and fields:
${CODE_COMPONENT_CATALOG_TEXT}

Example:
${EXAMPLE}`

/**
 * Register inline block grammar with the system prompt.
 * @param ctx - Host context; builds without a prompt service leave the feature off.
 */
export function registerBlockPrompt(ctx: Context): void {
  const prompt = ctx.get('systemPrompt')
  if (prompt === undefined) return
  ctx.effect(() => prompt.section({
    name: 'noven:inline-blocks',
    order: 900,
    text: BLOCK_SECTION_TEXT,
    interpolate: false,
  }), 'noven-shell: inline block grammar')
}
