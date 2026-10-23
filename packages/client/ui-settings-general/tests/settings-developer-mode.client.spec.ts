import { describe, expect, it, vi } from 'vitest'
import { createSettingsDeveloperMode, DEVELOPER_MODE_STORAGE_KEY } from '../src/client/settings-developer-mode.ts'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(DEVELOPER_MODE_STORAGE_KEY, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

describe('settings developer mode', () => {
  it('persists the unlock and publishes it once', () => {
    const storage = memoryStorage()
    const mode = createSettingsDeveloperMode(storage)
    const listener = vi.fn()
    mode.subscribe(listener)
    expect(mode.getSnapshot()).toBe(false)
    mode.enable()
    mode.enable()
    expect(mode.getSnapshot()).toBe(true)
    expect(storage.values.get(DEVELOPER_MODE_STORAGE_KEY)).toBe('1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('restores a persisted unlock', () => {
    expect(createSettingsDeveloperMode(memoryStorage('1')).getSnapshot()).toBe(true)
  })

  it('keeps an in-memory unlock when storage is unavailable', () => {
    const mode = createSettingsDeveloperMode({
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    expect(mode.getSnapshot()).toBe(false)
    mode.enable()
    expect(mode.getSnapshot()).toBe(true)
  })
})
