// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createFrameFoldState } from '../src/client/policy.ts'
import { createLayoutStore } from '../src/client/stores.ts'

describe('createFrameFoldState', () => {
  it('publishes every actual fold change to every subscriber with a stable snapshot', () => {
    const instance = createLayoutStore().create()
    const source = createFrameFoldState(instance)
    const first = vi.fn(), second = vi.fn()
    source.subscribe(first)
    source.subscribe(second)
    const initial = source.getSnapshot()
    expect(initial).toEqual({ centerCollapsed: false, auxiliaryCollapsed: true })

    instance.actions.setAuxiliaryCollapsed(false)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(source.getSnapshot()).not.toBe(initial)
    expect(source.getSnapshot().auxiliaryCollapsed).toBe(false)

    instance.actions.setAuxiliaryCollapsed(false)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    instance.actions.setCenterCollapsed(true)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot()).toEqual({ centerCollapsed: true, auxiliaryCollapsed: false })
  })
})
