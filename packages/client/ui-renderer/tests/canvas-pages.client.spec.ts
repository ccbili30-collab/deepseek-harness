import { describe, expect, it, vi } from 'vitest'
import { createCanvasPages } from '../src/client/canvas-pages.ts'

const component = () => null

describe('canvas page registry', () => {
  it('registers, resolves, and lists page kinds in order', () => {
    const pages = createCanvasPages()
    const offTerminal = pages.register({ kind: 'terminal', title: () => 'Terminal', component })
    pages.register({ kind: 'tasks', title: () => 'Tasks', component })
    expect(pages.get('terminal')?.title()).toBe('Terminal')
    expect(pages.list().map(page => page.kind)).toEqual(['terminal', 'tasks'])
    offTerminal()
    expect(pages.get('terminal')).toBeUndefined()
    expect(pages.list().map(page => page.kind)).toEqual(['tasks'])
  })

  it('replaces a duplicate kind and leaves the newer definition in place when the old disposer runs', () => {
    const pages = createCanvasPages()
    const offFirst = pages.register({ kind: 'terminal', title: () => 'first', component })
    pages.register({ kind: 'terminal', title: () => 'second', component })
    expect(pages.get('terminal')?.title()).toBe('second')
    offFirst()
    expect(pages.get('terminal')?.title()).toBe('second')
  })

  it('notifies subscribers on registration and disposal, and stops after unsubscribe', () => {
    const pages = createCanvasPages()
    const listener = vi.fn()
    const off = pages.subscribe(listener)
    const dispose = pages.register({ kind: 'terminal', title: () => 'Terminal', component })
    dispose()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    pages.register({ kind: 'tasks', title: () => 'Tasks', component })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
