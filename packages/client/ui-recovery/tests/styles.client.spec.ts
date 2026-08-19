/** Recovery footer placement contracts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/RecoveryCenter.module.css', import.meta.url)), 'utf8')

function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('RecoveryCenter.module.css', () => {
  it('anchors the wide trigger inside the sidebar footer instead of the viewport', () => {
    expect(declarations('.layer')?.get('position')).toBe('absolute')
    expect(declarations('.layer')?.get('right')).toBe('0')
    expect(declarations('.layer')?.get('bottom')).toBe('4px')
    expect(declarations('.trigger')?.get('box-shadow')).toBeUndefined()
  })

  it('returns the trigger to flow when the sidebar is a collapsed rail', () => {
    expect(declarations('.layer.rail')?.get('position')).toBe('relative')
    expect(declarations('.layer.rail')?.get('width')).toBe('36px')
    expect(declarations('.rail .trigger')?.get('height')).toBe('36px')
  })
})
