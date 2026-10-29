import { describe, expect, it } from 'vitest'
import { parseRules } from './stylesheet-scan.ts'

describe('stylesheet selector scanning', () => {
  it('keeps functional-selector commas inside their selector', () => {
    const [rule] = parseRules("html:is([data-platform='darwin'], [data-chrome-platform='darwin']) body, html[data-other] body { color: red; }")
    expect(rule?.selectors).toEqual([
      "html:is([data-platform='darwin'], [data-chrome-platform='darwin']) body",
      'html[data-other] body',
    ])
    expect(rule?.declarations).toEqual([['color', 'red']])
  })
})
