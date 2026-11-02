/** Resolved-theme store shared by document and card editors. */
import { expect, test, vi } from 'vitest'
import {
  bindNovenEditorTheme, readNovenColorScheme, subscribeNovenColorScheme, type NovenColorScheme,
} from '../src/client/doc-editor.tsx'

test('editor theme follows resolved changes and both subscriptions dispose', () => {
  let current: NovenColorScheme = 'light'
  let sourceListener: ((scheme: NovenColorScheme) => void) | undefined
  const listener = vi.fn()
  const off = subscribeNovenColorScheme(listener)
  const dispose = bindNovenEditorTheme(() => current, next => {
    sourceListener = next
    return () => { sourceListener = undefined }
  })
  expect(readNovenColorScheme()).toBe('light')

  sourceListener?.('dark')
  expect(readNovenColorScheme()).toBe('dark')
  expect(listener).toHaveBeenCalledTimes(1)
  dispose()
  expect(sourceListener).toBeUndefined()
  off()

  const secondListener = vi.fn()
  const offSecond = subscribeNovenColorScheme(secondListener)
  current = 'light'
  const stop = bindNovenEditorTheme(() => current, () => () => {})
  expect(readNovenColorScheme()).toBe('light')
  expect(secondListener).toHaveBeenCalledTimes(1)
  stop()
  offSecond()
})
