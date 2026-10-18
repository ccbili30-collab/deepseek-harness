// @vitest-environment jsdom
/** Session page turn: direction from row order, weight attribute, and fallback without the API. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handOffPanel, PAGE_TURN_ATTRIBUTE, rowDirection, turnPage } from '../src/client/page-turn.ts'

function rows(ids: readonly string[]): HTMLElement {
  const list = document.createElement('div')
  for (const id of ids) {
    const row = document.createElement('div')
    row.dataset['rowKey'] = `session:${id}`
    list.append(row)
  }
  document.body.append(list)
  return list
}

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute(PAGE_TURN_ATTRIBUTE)
  vi.unstubAllGlobals()
})

describe('rowDirection', () => {
  it('turns down toward a lower row and up toward a higher row', () => {
    rows(['a', 'b', 'c'])
    expect(rowDirection('a', 'c')).toBe('down')
    expect(rowDirection('c', 'a')).toBe('up')
  })

  it('defaults to down when a row is not rendered', () => {
    rows(['a'])
    expect(rowDirection('a', 'missing')).toBe('down')
    expect(rowDirection('missing', 'a')).toBe('down')
  })
})

describe('turnPage', () => {
  it('applies the update directly without the View Transitions API', () => {
    const update = vi.fn()
    turnPage(update, 'down', 'session', document as never)
    expect(update).toHaveBeenCalledTimes(1)
    expect(document.documentElement.hasAttribute(PAGE_TURN_ATTRIBUTE)).toBe(false)
  })

  it('applies the update directly under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const start = vi.fn()
    const update = vi.fn()
    turnPage(update, 'up', 'project', { documentElement: document.documentElement, startViewTransition: start } as never)
    expect(update).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('marks weight and direction for the transition and clears it when finished', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => { finish = resolve })
    let pending: Promise<void> | void = undefined
    const doc = {
      documentElement: document.documentElement,
      startViewTransition: (callback: () => Promise<void> | void) => { pending = callback(); return { finished } },
    }
    const update = vi.fn()
    turnPage(update, 'up', 'project', doc as never)
    expect(document.documentElement.getAttribute(PAGE_TURN_ATTRIBUTE)).toBe('project-up')
    expect(update).toHaveBeenCalledTimes(1)
    await pending
    finish()
    await finished
    await Promise.resolve()
    expect(document.documentElement.hasAttribute(PAGE_TURN_ATTRIBUTE)).toBe(false)
  })
})

describe('handOffPanel', () => {
  it('applies the update directly without the View Transitions API', () => {
    const update = vi.fn()
    handOffPanel(update, {} as never)
    expect(update).toHaveBeenCalledTimes(1)
    expect(document.documentElement.hasAttribute(PAGE_TURN_ATTRIBUTE)).toBe(false)
  })

  it('applies the update directly under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const start = vi.fn()
    const update = vi.fn()
    handOffPanel(update, { documentElement: document.documentElement, startViewTransition: start } as never)
    expect(update).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('runs the commit inside the transition without publishing a page turn', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => { finish = resolve })
    let pending: Promise<void> | void = undefined
    const doc = {
      documentElement: document.documentElement,
      startViewTransition: (callback: () => Promise<void> | void) => { pending = callback(); return { finished } },
    }
    const update = vi.fn()
    handOffPanel(update, doc as never)
    expect(document.documentElement.hasAttribute(PAGE_TURN_ATTRIBUTE)).toBe(false)
    expect(document.documentElement.hasAttribute('data-panel-handoff')).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    await pending
    finish()
    await finished
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
    expect(document.documentElement.hasAttribute(PAGE_TURN_ATTRIBUTE)).toBe(false)
    expect(document.documentElement.hasAttribute('data-panel-handoff')).toBe(false)
  })
})
