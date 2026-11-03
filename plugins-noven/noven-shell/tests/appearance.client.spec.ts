// @vitest-environment jsdom
/** Root appearance variables and per-canvas style projection. */
import assert from 'node:assert/strict'
import { act, createElement } from '../node_modules/react/index.js'
import { createRoot } from '../node_modules/react-dom/client.js'
import { afterEach, describe, test, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AppearanceView } from '../lib/appearance/model.js'
import { AppearanceEffects, appearanceMaterial, canvasBackgroundStyle, updateAppearance, useAppearance, useAppearanceVisual } from '../lib/client/appearance.js'

const view: AppearanceView = {
  version: 1,
  revision: 7,
  globalRevision: 0,
  global: {},
  workspace: {},
  session: {},
  resolved: {
    shell: { kind: 'asset', path: '外观/shell.webp' },
    canvas: { kind: 'asset', path: '外观/canvas.webp' },
    conversation: { kind: 'transparent' },
    assistantAvatar: { kind: 'asset', path: '外观/avatar.webp' },
  },
}

const mounted = new Set()
const theme = {
  active: false,
  scheme: 'light',
  listeners: new Set(),
  overrides: undefined,
  getTheme() { return { active: { colorScheme: this.scheme } } },
  setTheme(next) {
    if (this.scheme === next) return
    this.scheme = next
    for (const listener of this.listeners) listener()
  },
  overrideTokens(_source, tokens) {
    this.active = true
    this.overrides = tokens
    return () => { this.active = false }
  },
}
const scheme = {
  getSnapshot: () => theme.scheme,
  subscribe: (listener: () => void) => { theme.listeners.add(listener); return () => { theme.listeners.delete(listener) } },
}
async function mount(element) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.add(root)
  await act(async () => { root.render(element) })
  return {
    unmount: () => {
      act(() => { root.unmount() })
      mounted.delete(root)
      container.remove()
    },
  }
}

afterEach(() => {
  for (const root of mounted) act(() => { root.unmount() })
  mounted.clear()
  document.body.replaceChildren()
  theme.active = false
  theme.scheme = 'light'
  theme.listeners.clear()
  theme.overrides = undefined
  vi.unstubAllGlobals()
})

describe('appearance effects', () => {
  test('applies body variables so theme-token mixes resolve, and clears them with the Session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => view })))
    let current: string | undefined = 'sess-1'
    const listeners = new Set<() => void>()
    const source = {
      getSnapshot: () => current,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    const mountedView = await mount(createElement(AppearanceEffects, { current: source, scheme, theme }))
    await act(async () => {
      await vi.waitFor(() => assert.match(document.body.style.getPropertyValue('--noven-shell-background-image'), /shell\.webp/u))
    })
    assert.equal(document.documentElement.hasAttribute('data-noven-shell-appearance'), true)
    assert.equal(document.documentElement.hasAttribute('data-noven-assistant-avatar'), true)
    assert.equal(document.documentElement.getAttribute('data-noven-conversation-skin'), 'frosted')
    assert.equal(document.documentElement.hasAttribute('data-noven-conversation-image'), false)
    assert.notEqual(document.body.style.getPropertyValue('--noven-conversation-skin-surface'), '')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-reading-surface'), 'transparent')
    assert.match(document.body.style.getPropertyValue('--noven-assistant-avatar-image'), /avatar\.webp/u)

    await act(async () => {
      current = undefined
      for (const listener of listeners) listener()
    })
    await vi.waitFor(() => assert.equal(document.documentElement.hasAttribute('data-noven-shell-appearance'), false))
    assert.equal(document.body.style.getPropertyValue('--noven-shell-background-image'), '')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-reading-surface'), '')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-skin-surface'), '')
    assert.equal(document.documentElement.hasAttribute('data-noven-conversation-skin'), false)
    assert.equal(document.documentElement.hasAttribute('data-noven-conversation-image'), false)
    assert.equal(document.documentElement.hasAttribute('data-noven-assistant-avatar'), false)
    mountedView.unmount()
  })

  test('projects focus, fade, and background-only blur without adding paper', () => {
    const style = canvasBackgroundStyle('sess-1', {
      kind: 'asset', path: '外观/canvas.webp', dim: 0.3, blur: 8, focus: 'top', material: 'frosted', foreground: 'light',
    }, 3)
    assert.equal(style?.backgroundImage, 'none')
    assert.equal(Reflect.get(style ?? {}, '--noven-canvas-background-position'), 'center top')
    assert.equal(Reflect.get(style ?? {}, '--noven-canvas-background-blur'), '8px')
    assert.match(String(Reflect.get(style ?? {}, '--nv-surface')), /^color-mix/u)
    assert.equal(Reflect.get(style ?? {}, '--nv-primary-text'), '#F4F7F5')
    assert.equal(Reflect.get(style ?? {}, '--nv-select'), '#6EE7B7')
    assert.equal(Reflect.get(style ?? {}, '--dsw-alias-label-primary'), '#F4F7F5')
    assert.equal(appearanceMaterial({ kind: 'asset', path: 'a.png' }), 'frosted')
    assert.equal(appearanceMaterial({ kind: 'asset', path: 'a.png', material: 'clear' }), 'clear')
    const layer = String(Reflect.get(style ?? {}, '--noven-canvas-background-layer'))
    assert.match(layer, /linear-gradient/u)
    assert.match(layer, /30%/u)
    assert.match(layer, /canvas\.webp/u)
    assert.equal(Reflect.get(style ?? {}, '--noven-canvas-paper'), undefined)
    const sharp = canvasBackgroundStyle('sess-1', { kind: 'asset', path: 'a.png', dim: 0.2 }, 4)
    assert.match(String(sharp?.backgroundImage), /20%/u)
    assert.equal(sharp?.backgroundClip, 'border-box')
    const dark = canvasBackgroundStyle('sess-1', null, 1, {
      view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.9,
    })
    assert.equal(dark?.backgroundImage, 'none')
    assert.equal(Reflect.get(dark ?? {}, '--nv-primary-text'), '#F4F7F5')
    assert.match(String(Reflect.get(dark ?? {}, '--nv-surface')), /23%/u)
    assert.match(String(Reflect.get(dark ?? {}, '--noven-skin-island')), /0.15/u)
  })

  test('keeps conversation text and chrome transparent while only the background blurs', async () => {
    const rawView: AppearanceView = {
      ...view,
      revision: 8,
      globalRevision: 9,
      global: { unified: { kind: 'asset', path: 'global-conversation.webp', blur: 6 } },
      visual: { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.75 },
      resolved: {
        ...view.resolved,
        conversation: {
          kind: 'asset', path: '外观/conversation.webp', source: 'global', focus: 'bottom', blur: 6, dim: 0.2,
          material: 'frosted',
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rawView })))
    const source = {
      getSnapshot: () => 'sess-raw' as const,
      subscribe: () => () => {},
    }
    const mountedView = await mount(createElement(AppearanceEffects, { current: source, scheme, theme }))
    await act(async () => {
      await vi.waitFor(() => assert.equal(document.documentElement.hasAttribute('data-noven-conversation-blur'), true))
    })
    assert.equal(document.documentElement.hasAttribute('data-noven-conversation-surface'), false)
    assert.equal(document.documentElement.getAttribute('data-noven-conversation-skin'), 'frosted')
    assert.equal(document.documentElement.getAttribute('data-noven-conversation-foreground'), 'light')
    assert.equal(document.documentElement.hasAttribute('data-noven-conversation-image'), true)
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-skin-primary'), '#F4F7F5')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-skin-select'), '#6EE7B7')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-reading-surface'), 'transparent')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-chrome-background'), 'transparent')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-background-image'), 'none')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-background-position'), 'center bottom')
    assert.equal(document.body.style.getPropertyValue('--noven-conversation-background-blur'), '6px')
    assert.match(document.body.style.getPropertyValue('--noven-conversation-background-layer'), /20%/u)
    assert.match(document.body.style.getPropertyValue('--noven-conversation-background-layer'), /global-asset/u)
    assert.match(document.body.style.getPropertyValue('--noven-conversation-background-layer'), /revision=9/u)
    assert.equal(theme.active, true)
    assert.equal(theme.scheme, 'dark')
    assert.equal(theme.overrides['--dsw-menu-surface-fill'].light, 'rgba(14, 19, 17, 0.21)')
    assert.equal(theme.overrides['--dsw-specific-menu'].dark, 'rgba(14, 19, 17, 0.21)')
    assert.equal(theme.overrides['--dsw-alias-label-primary'].light, '#F4F7F5')
    assert.equal(theme.overrides['--dsw-alias-label-tertiary'].light, 'rgba(244, 247, 245, 0.68)')
    assert.equal(theme.overrides['--dsw-alias-menu-icon'].dark, '#F4F7F5')
    mountedView.unmount()
    assert.equal(theme.active, false)
  })

  test('reasserts the appearance view after an unrelated theme change without rewriting it', async () => {
    const stored: AppearanceView = {
      ...view,
      visual: { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.75 },
    }
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
      if (init?.method === 'POST') writes.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return { ok: true, json: async () => stored }
    }))
    const source = { getSnapshot: () => 'sess-theme' as const, subscribe: () => () => {} }
    theme.scheme = 'dark'
    const mountedView = await mount(createElement(AppearanceEffects, { current: source, scheme, theme }))
    await act(async () => {
      await vi.waitFor(() => assert.equal(theme.active, true))
    })
    await act(async () => { theme.setTheme('light') })
    await vi.waitFor(() => assert.equal(theme.scheme, 'dark'))
    assert.equal(stored.visual?.view, 'dark')
    assert.equal(writes.length, 0)
    mountedView.unmount()
  })

  test('publishes one shared visual snapshot immediately after a write', async () => {
    let stored: AppearanceView = {
      ...view,
      visual: { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.75 },
    }
    vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
      if (init?.method === 'POST') {
        const action = JSON.parse(String(init.body)) as Record<string, unknown>
        stored = {
          ...stored,
          revision: stored.revision + 1,
          visual: { ...stored.visual!, view: action.view as 'light' | 'dark' },
        }
      }
      return { ok: true, json: async () => stored }
    }))
    function Probe() {
      useAppearance('sess-visual')
      return createElement('output', {}, useAppearanceVisual('sess-visual').view)
    }
    const mountedView = await mount(createElement(Probe))
    await act(async () => {
      await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'dark'))
    })
    await act(async () => { await updateAppearance('sess-visual', { action: 'visual', view: 'light' }) })
    assert.equal(document.querySelector('output')?.textContent, 'light')
    mountedView.unmount()
  })

  test('projects resolved canvas backgrounds into actual container styles', () => {
    const defaultPaper = { backgroundColor: 'var(--nv-surface)', backgroundImage: 'none' }
    assert.deepEqual(canvasBackgroundStyle('sess-1', null, 1), defaultPaper)
    assert.deepEqual(canvasBackgroundStyle('sess-desk', null, 1), defaultPaper)
    const transparent = canvasBackgroundStyle('sess-1', { kind: 'transparent' }, 2)
    assert.equal(transparent?.backgroundColor, 'transparent')
    assert.equal(transparent?.backgroundImage, 'none')
    assert.match(String(Reflect.get(transparent ?? {}, '--nv-surface')), /^color-mix/u)
    const style = canvasBackgroundStyle('sess-1', { kind: 'asset', path: '外观/canvas.webp' }, 3)
    assert.equal(style?.backgroundColor, 'transparent')
    assert.match(String(style?.backgroundImage), /canvas\.webp/u)
    const globalStyle = canvasBackgroundStyle('sess-1', { kind: 'asset', path: 'global.png', source: 'global' }, 3, undefined, 9)
    assert.match(String(globalStyle?.backgroundImage), /global-asset/u)
    assert.match(String(globalStyle?.backgroundImage), /revision=9/u)
    assert.doesNotMatch(String(globalStyle?.backgroundImage), /revision=3/u)
  })

  test('invalidates every Session after a global default write', async () => {
    let stored: AppearanceView = { ...view, globalRevision: 0, global: {} }
    vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
      if (init?.method === 'POST') stored = { ...stored, globalRevision: stored.globalRevision + 1 }
      return { ok: true, json: async () => stored }
    }))
    function Probe({ sessionId }: { readonly sessionId: SessionId }) {
      const current = useAppearance(sessionId)
      return createElement('output', { 'data-session': sessionId }, current?.globalRevision ?? -1)
    }
    const mountedView = await mount(createElement('div', {},
      createElement(Probe, { sessionId: 'sess-global-a' }),
      createElement(Probe, { sessionId: 'sess-global-b' }),
    ))
    await act(async () => {
      await vi.waitFor(() => {
        assert.equal(document.querySelector('[data-session="sess-global-a"]')?.textContent, '0')
        assert.equal(document.querySelector('[data-session="sess-global-b"]')?.textContent, '0')
      })
    })
    await act(async () => { await updateAppearance('sess-global-a', { action: 'global_unified', background: { kind: 'default' } }) })
    await vi.waitFor(() => {
      assert.equal(document.querySelector('[data-session="sess-global-a"]')?.textContent, '1')
      assert.equal(document.querySelector('[data-session="sess-global-b"]')?.textContent, '1')
    })
    mountedView.unmount()
  })
})
