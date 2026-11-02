// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { isDarwinChrome, isDarwinDesktop } from '../src/darwin-desktop.ts'

afterEach(() => {
  delete document.documentElement.dataset.platform
  delete document.documentElement.dataset.chromePlatform
  delete document.documentElement.dataset.fullscreen
})

it('keeps native platform facts separate from the macOS presentation mirror', () => {
  expect(isDarwinDesktop()).toBe(false)
  expect(isDarwinChrome()).toBe(false)

  document.documentElement.dataset.chromePlatform = 'darwin'
  expect(isDarwinDesktop()).toBe(false)
  expect(isDarwinChrome()).toBe(true)
  expect(document.documentElement.dataset.platform).toBeUndefined()
  expect(document.documentElement.dataset.fullscreen).toBeUndefined()

  document.documentElement.dataset.platform = 'darwin'
  expect(isDarwinDesktop()).toBe(true)
  expect(isDarwinChrome()).toBe(true)
})
