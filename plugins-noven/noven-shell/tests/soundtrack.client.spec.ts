// @vitest-environment jsdom
/** Playback ownership, deferred audio results, playable titles, and scoped inversion. */
import assert from 'node:assert/strict'
import { act, createElement } from '../node_modules/react/index.js'
import { createRoot } from '../node_modules/react-dom/client.js'
import { afterEach, describe, test, vi } from 'vitest'
import { disposeSoundtrack, isSoundtrackPlaying, reconcileSoundtrack, soundtrackAssetUrl, toggleSoundtrack, useSoundtrackPlayback } from '../lib/client/soundtrack.js'
import { PlayableTitle } from '../lib/client/playable-title.js'
import { SoundtrackEffects } from '../lib/client/soundtrack-effects.js'
import { setFocusedCanvasFile } from '../lib/client/appearance.js'
import { emptyAppearanceDocument, resolveAppearance } from '../lib/appearance/model.js'
import { applyScopedForeground } from '../lib/client/scoped-foreground.js'
import { en } from '../lib/client/locales.js'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ShellT } from '../lib/client/pages/Home.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const t: ShellT = key => en[key]
const track = { kind: 'asset' as const, path: 'rain.mp3' }
const other = { kind: 'asset' as const, path: 'forest.mp3' }
const owner = { sessionId: 'sess-a' as SessionId }
const mounted = new Set()

class FakeAudio {
  static instances = []
  static deferred: { promise: Promise<void> } | null = null
  readonly src: string
  loop = false
  volume = 1
  preload = ''
  paused = true
  playCalls = 0
  currentTime = 0
  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }
  play() {
    this.paused = false
    this.playCalls += 1
    return FakeAudio.deferred?.promise ?? Promise.resolve()
  }
  pause() { this.paused = true }
  removeAttribute(name: string) { if (name === 'src') this.src = '' }
  load() {}
}

afterEach(() => {
  act(() => { disposeSoundtrack() })
  for (const root of mounted) act(() => { root.unmount() })
  mounted.clear()
  document.body.replaceChildren()
  FakeAudio.instances = []
  FakeAudio.deferred = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function mountPlayback() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.add(root)
  function Probe() {
    const playback = useSoundtrackPlayback()
    return createElement('output', {}, playback.status)
  }
  await act(async () => { root.render(createElement(Probe)) })
}

describe('soundtrack controller', () => {
  test('plays only from a user toggle, pauses without automatic reopening, and exposes asset URLs', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    await mountPlayback()
    assert.equal(FakeAudio.instances.length, 0)
    assert.match(soundtrackAssetUrl(owner.sessionId, track, 4), /audio-asset\?session=sess-a&path=rain.mp3&revision=4/u)
    await act(async () => { toggleSoundtrack(owner, track, 4) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'playing'))
    assert.equal(FakeAudio.instances.length, 1)
    assert.equal(FakeAudio.instances[0].volume, 0.4)
    assert.equal(FakeAudio.instances[0].loop, true)
    await act(async () => { toggleSoundtrack(owner, track, 4) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'paused'))
    await act(async () => { reconcileSoundtrack({ sessionId: owner.sessionId, filePath: 'a.md' }, other, 5) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'idle'))
    assert.equal(FakeAudio.instances.length, 1)
  })

  test('crossfades a changed central track and ignores a late play resolution', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Audio', FakeAudio)
    await mountPlayback()
    await act(async () => { toggleSoundtrack(owner, track, 1) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'playing'))
    await act(async () => { reconcileSoundtrack({ sessionId: owner.sessionId, filePath: 'b.md' }, other, 2) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'playing'))
    assert.equal(FakeAudio.instances.length, 2)
    assert.match(FakeAudio.instances[1].src, /forest.mp3/u)
    await vi.runAllTimersAsync()
    assert.equal(FakeAudio.instances[0].paused, true)
    const current = { status: 'playing', owner: { sessionId: owner.sessionId, filePath: 'b.md' }, track: other, revision: 2 } as const
    assert.equal(isSoundtrackPlaying(current, { sessionId: owner.sessionId, filePath: 'b.md' }, other, 2), true)

    const first = Promise.withResolvers()
    FakeAudio.deferred = first
    await act(async () => { toggleSoundtrack(owner, track, 3) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'loading'))
    FakeAudio.deferred = null
    await act(async () => { toggleSoundtrack(owner, other, 4) })
    await vi.waitFor(() => assert.equal(document.querySelector('output')?.textContent, 'playing'))
    first.resolve()
    await Promise.resolve()
    assert.match(FakeAudio.instances.at(-1).src, /forest.mp3/u)
  })

  test('retains position and the audio element across revisions, preferences, pause and another presentation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Audio', FakeAudio)
    await mountPlayback()
    const scoped = { ...owner, workspaceRoot: '/project-a', filePath: 'a.md' }
    await act(async () => { toggleSoundtrack(scoped, track, 1) })
    const audio = FakeAudio.instances[0]
    audio.currentTime = 42
    await act(async () => { reconcileSoundtrack(scoped, { ...track, volume: 0.2, loop: false }, 8) })
    assert.equal(audio.volume, 0.2)
    assert.equal(audio.loop, false)
    assert.equal(audio.currentTime, 42)
    assert.equal(FakeAudio.instances.length, 1)
    await act(async () => { toggleSoundtrack(scoped, track, 9) })
    await act(async () => { await vi.runAllTimersAsync() })
    assert.equal(audio.paused, true)
    const otherPresentation = { ...scoped, sessionId: 'sess-other' as SessionId }
    await act(async () => { reconcileSoundtrack(otherPresentation, track, 10) })
    assert.equal(document.querySelector('output')?.textContent, 'paused')
    await act(async () => { toggleSoundtrack(otherPresentation, track, 10) })
    assert.equal(FakeAudio.instances.length, 1)
    assert.equal(audio.currentTime, 42)
    assert.equal(audio.volume, 0.4)
  })

  test('distinguishes equal paths in different projects and fences rejection after disposal', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Audio', FakeAudio)
    await mountPlayback()
    await act(async () => { toggleSoundtrack({ ...owner, workspaceRoot: '/a' }, track, 1) })
    await act(async () => { reconcileSoundtrack({ ...owner, workspaceRoot: '/b' }, track, 1) })
    assert.equal(FakeAudio.instances.length, 2)
    const pending = Promise.withResolvers<void>()
    FakeAudio.deferred = pending
    await act(async () => { toggleSoundtrack(owner, other, 2) })
    await act(async () => { disposeSoundtrack() })
    assert.equal(vi.getTimerCount(), 0)
    assert.ok(FakeAudio.instances.every(audio => audio.paused && audio.src === ''))
    pending.reject(new Error('disposed transport'))
    await act(async () => { await pending.promise.catch(() => {}) })
    assert.equal(document.querySelector('output')?.textContent, 'idle')
  })

  test('reports play failure and retries only after a new user action', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    await mountPlayback()
    const pending = Promise.withResolvers<void>()
    FakeAudio.deferred = pending
    await act(async () => { toggleSoundtrack(owner, track, 1) })
    await act(async () => { pending.reject(new Error('blocked playback')); await pending.promise.catch(() => {}) })
    assert.equal(document.querySelector('output')?.textContent, 'error')
    await act(async () => { reconcileSoundtrack(owner, track, 2) })
    assert.equal(FakeAudio.instances[0].playCalls, 1)
    FakeAudio.deferred = null
    await act(async () => { toggleSoundtrack(owner, track, 3) })
    assert.equal(document.querySelector('output')?.textContent, 'playing')
  })

  test('uses the new Session root without borrowing a stale canvas focus and stops on unmount', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    await mountPlayback()
    await act(async () => { toggleSoundtrack({ ...owner, workspaceRoot: '/a' }, track, 1) })
    setFocusedCanvasFile(owner.sessionId, 'stale.md')
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async input => {
      requests.push(String(input))
      return {
        ok: true,
        json: async () => ({
          ...resolveAppearance({ ...emptyAppearanceDocument(), workspace: { canvasTrack: track } }, 'sess-new'),
          workspaceRoot: '/b',
        }),
      }
    }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    mounted.add(root)
    await act(async () => {
      root.render(createElement(SoundtrackEffects, {
        current: { getSnapshot: () => 'sess-new' as SessionId, subscribe: () => () => {} },
        subject: { getSnapshot: () => 'canvas' as const, subscribe: () => () => {} },
      }))
    })
    await vi.waitFor(() => assert.equal(FakeAudio.instances.length, 2))
    assert.ok(requests.every(url => !url.includes('file=')))
    await act(async () => { root.unmount() })
    mounted.delete(root)
    assert.equal(document.querySelector('output')?.textContent, 'idle')
  })
})

describe('playable title and scoped foreground', () => {
  test('keeps ordinary activation without a track and toggles a bound title', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    const activate = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    mounted.add(root)
    await act(async () => {
      root.render(createElement(PlayableTitle, {
        title: '首页文案.md', track: null, revision: 0, owner, onActivate: activate, t,
      }))
    })
    await act(async () => { document.querySelector('button')!.click() })
    assert.equal(activate.mock.calls.length, 1)
    assert.equal(FakeAudio.instances.length, 0)
    await act(async () => {
      root.render(createElement(PlayableTitle, {
        title: '首页文案.md', track, revision: 1, owner, onActivate: activate, t,
      }))
    })
    assert.match(document.querySelector('button')!.getAttribute('aria-label')!, /Play/u)
    await act(async () => { document.querySelector('button')!.click() })
    await vi.waitFor(() => assert.match(document.querySelector('button')!.getAttribute('aria-label')!, /Pause/u))
  })

  test('inverts only text tokens and clears them on inherit', async () => {
    const element = document.createElement('div')
    element.style.backgroundColor = 'rgb(31, 45, 42)'
    document.body.appendChild(element)
    await applyScopedForeground(element, 'invert')
    assert.equal(element.style.getPropertyValue('--nv-primary-text'), '#e0d2d5')
    await applyScopedForeground(element, 'dark')
    assert.equal(element.style.getPropertyValue('--nv-primary-text'), '#16181a')
    await applyScopedForeground(element, 'system')
    assert.equal(element.style.getPropertyValue('--nv-primary-text'), '')
  })
})
