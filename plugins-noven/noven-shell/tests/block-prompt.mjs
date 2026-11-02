import assert from 'node:assert/strict'
import { BLOCK_SECTION_TEXT } from '../lib/blocks-prompt.js'
import { CODE_COMPONENT_CATALOG } from '../lib/code-catalog.js'
import { validateCodeDocument } from '../lib/client/code/model.js'

for (const entry of CODE_COMPONENT_CATALOG) {
  assert.ok(BLOCK_SECTION_TEXT.includes(`\`${entry.id}\``), `missing component ${entry.id}`)
}
assert.ok(BLOCK_SECTION_TEXT.includes('::view{"block":"module","src":"card:<cardId>/<moduleId>"}'))
assert.ok(!BLOCK_SECTION_TEXT.includes('Write the file first'))
assert.ok(!BLOCK_SECTION_TEXT.includes('<workspace-relative>.html'))

const example = BLOCK_SECTION_TEXT.split('\n').find(line => line.startsWith('::view{"block":"code"'))
assert.ok(example !== undefined)
const directive = JSON.parse(example.slice('::view'.length))
assert.equal(directive.block, 'code')
assert.ok(validateCodeDocument(directive.data) !== undefined)
console.log('inline block prompt: all component ids and the example are valid')
