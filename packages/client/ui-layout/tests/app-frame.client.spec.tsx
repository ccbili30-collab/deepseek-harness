// @vitest-environment jsdom
/** Frame interactions with a real store and explicitly driven browser measurements. */
import type { GlobalStandardProps, RenderOpts } from '@deepseek-ai/dsh-client-ui-slots'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { AppFrame } from '../src/client/AppFrame.tsx'
import type { AppFrameProps } from '../src/client/AppFrame.tsx'
import type { FrameLayoutPolicy, MainPanelId, RightbarOwnerProps, SidebarOwnerProps } from '../src/client/index.ts'
import type { FrameTransition } from '../src/client/service.ts'
import { createLayoutStore } from '../src/client/stores.ts'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
let selectedSession: SessionId | undefined
let selectedSessionTitle: string | undefined
let selectedSessionCwd: string | undefined
let workspacesReady = true
type AttentionSnapshot = Parameters<Parameters<AppFrameProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: AppFrameProps['useSessionStatus'] = selector => selector(noAttention)

let observers: ResizeObserverStub[]
class ResizeObserverStub {
  disconnected = false
  constructor(private callback: ResizeObserverCallback) { observers.push(this) }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void { this.disconnected = true }
  fire(): void { this.callback([], this) }
}

/** The frame-pulled canvas claim: tests flip it to open or release a canvas. */
let canvasClaim: 'left' | 'right' | null = null
const claimListeners = new Set<() => void>()
const canvasClaims: AppFrameProps['canvasClaims'] = {
  provide: () => () => {},
  claim: sessionId => sessionId === null ? null : canvasClaim,
  subscribe: (listener) => { claimListeners.add(listener); return () => { claimListeners.delete(listener) } },
}
/** Flip the frame-pulled claim and notify, as the occupant's source would. */
function setClaim(side: 'left' | 'right' | null): void {
  canvasClaim = side
  for (const listener of claimListeners) listener()
}

let frameWidth: number
let animationFrames: Map<number, FrameRequestCallback>
let nextFrame: number
let originalTitle: string
const restoreProperties: (() => void)[] = []

function replaceProperty<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)
  restoreProperties.push(() => {
    if (descriptor === undefined) Reflect.deleteProperty(target, key)
    else Object.defineProperty(target, key, descriptor)
  })
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
}

/** Flush one browser frame without depending on the worker's timer cadence. */
function flushFrames(): void {
  for (const [id, callback] of [...animationFrames]) {
    if (!animationFrames.delete(id)) continue
    callback(0)
  }
}

function resize(width: number): void {
  frameWidth = width
  act(() => {
    for (const observer of observers) if (!observer.disconnected) observer.fire()
    flushFrames()
  })
}

function mountFrame(windowWidth = frameWidth, initialPolicy?: FrameLayoutPolicy) {
  vi.stubGlobal('innerWidth', windowWidth)
  const instance = createLayoutStore().create()
  let policy = initialPolicy ?? null
  const policyListeners = new Set<() => void>()
  const policySource = {
    getSnapshot: () => policy,
    subscribe: (listener: () => void) => { policyListeners.add(listener); return () => { policyListeners.delete(listener) } },
  }
  const setPolicy = (next: FrameLayoutPolicy): void => {
    policy = next
    for (const listener of policyListeners) listener()
  }
  const mounts = { main: 0, rightbar: 0 }
  const Probe = ({ name, entryKey }: { name: 'main' | 'rightbar'; entryKey: RenderOpts['entryKey'] }) => {
    useEffect(() => { mounts[name] += 1 }, [name])
    return <div data-testid={`${name}-content`} data-entry-key={entryKey} />
  }
  const slotCalls: { key: string; props: object; options: RenderOpts | undefined }[] = []
  const renderSlot: AppFrameProps['renderSlot'] = (key, owner, options) => {
    slotCalls.push({ key, props: owner, options })
    if (key === 'main' || key === 'rightbar') return <Probe name={key} entryKey={options?.entryKey} />
    return <div data-testid={`${key}-content`} data-entry-key={options?.entryKey} />
  }
  const useSessions: AppFrameProps['useSessions'] = sel => sel({
    ids: selectedSession === undefined ? [] : [selectedSession],
    byId: selectedSession === undefined ? {} : {
      [selectedSession]: {
        id: selectedSession, displayTitle: 'Test', running: false, retainedBy: { mainView: 1 }, blank: false, updatedAt: 1,
        ...(selectedSessionTitle === undefined ? {} : { title: selectedSessionTitle }),
        ...(selectedSessionCwd === undefined ? {} : { cwd: selectedSessionCwd }),
      },
    },
    phase: 'ready',
    projectionsBySession: {},
  })
  const workspaceState: WorkspaceSnapshot = {
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    ...(workspacesReady ? {} : { state: 'loading' as const, phase: 'pending' as const }),
  }
  const useStore = bindSnapshotSelector(instance)
  const usePanelInfo = bindSnapshotSelector({
    getSnapshot: () => instance.getSnapshot().panelInfo,
    subscribe: listener => instance.subscribe(listener),
  })
  let frameTransition: FrameTransition | undefined
  const transitionFrame: FrameTransition = (commit) => {
    if (frameTransition === undefined) { commit(); return }
    frameTransition(commit)
  }
  const element = () => (
    <AppFrame
      useStore={useStore}
      actions={instance.actions}
      renderSlot={renderSlot}
      useSessions={useSessions}
      usePanelInfo={usePanelInfo}
      useFrameLayoutPolicy={bindSnapshotSelector(policySource)}
      useSessionStatus={useSessionStatus}
      useSessionRetainInfo={() => undefined}
      useResource={useResource}
      useWorkspaces={sel => sel(workspaceState)}
      t={key => key === 'brand.localBuild' ? 'DSH Local Build' : key}
      canvasClaims={canvasClaims}
      provideFrameTransition={(runner) => {
        frameTransition = runner
        return () => { if (frameTransition === runner) frameTransition = undefined }
      }}
    />
  )
  const utils = render(element())
  const frame = utils.container.firstElementChild as HTMLElement
  return {
    ...utils, instance, frame, slotCalls, mounts, setPolicy, transitionFrame,
    rerenderFrame: () => { utils.rerender(element()) },
    rightOwner: () => slotCalls.findLast(c => c.key === 'rightbar')!.props as RightbarOwnerProps,
    sidebarOwner: () => slotCalls.findLast(c => c.key === 'sidebar')!.props as SidebarOwnerProps,
  }
}

/* The frame is two structural layers: the outer template only carries the
   stable navigation track ([sidebar px, 1fr]), and the work layer carries the
   conversation | unit split. specs read the sidebar from the frame and the
   right track's growth limit from [data-work] (jsdom does no layout, so they
   read the specified tracks). The centre's protected minimum must accompany an
   open right track. */
function workEl(frame: HTMLElement): HTMLElement {
  const work = frame.querySelector<HTMLElement>('[data-work]')
  if (work === null) throw new Error('missing work layer')
  return work
}

function tracks(frame: HTMLElement): number[] {
  const outer = /^([\d.]+)px minmax\(0px, 1fr\)$/.exec(frame.style.gridTemplateColumns)
  if (outer === null) throw new Error(`unexpected outer template: ${frame.style.gridTemplateColumns}`)
  const work = workEl(frame)
  const match = /^minmax\((0|320)px, 1fr\) minmax\(0px, ([\d.]+)px\)$/.exec(work.style.gridTemplateColumns)
  if (match === null) throw new Error(`unexpected work template: ${work.style.gridTemplateColumns}`)
  const rightbar = Number(match[2])
  if ((match[1] === '320') !== (rightbar > 0)) throw new Error(`centre minimum out of step: ${work.style.gridTemplateColumns}`)
  return [Number(outer[1]), rightbar]
}

function handleFor(frame: HTMLElement, side: 'sidebar' | 'rightbar'): HTMLElement {
  const handle = frame.querySelector<HTMLElement>(`[data-side="${side}"]`)
  if (handle === null) throw new Error(`missing ${side} resize handle`)
  return handle
}

function pointer(handle: Element, type: string, clientX: number, pointerId = 1, button = 0): void {
  act(() => { handle.dispatchEvent(new PointerEvent(type, { pointerId, clientX, button, bubbles: true })) })
}

function drag(handle: Element, fromX: number, toX: number): void {
  pointer(handle, 'pointerdown', fromX)
  pointer(handle, 'pointermove', toX)
  act(flushFrames)
  pointer(handle, 'pointerup', toX)
}

beforeEach(() => {
  // Frame geometry persists in localStorage; each mount must start unsaved.
  localStorage.clear()
  originalTitle = document.title
  canvasClaim = null
  frameWidth = 1920
  selectedSession = 's-test' as SessionId
  selectedSessionTitle = undefined
  selectedSessionCwd = undefined
  workspacesReady = true
  observers = []
  animationFrames = new Map()
  nextFrame = 1
  vi.stubEnv('DSH_CLIENT_TITLE', undefined)
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    animationFrames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { animationFrames.delete(id) })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: frameWidth, height: 1080, top: 0, left: 0, right: frameWidth, bottom: 1080,
    x: 0, y: 0, toJSON: () => ({}),
  }))
  // jsdom has no pointer capture. Each element retains the actual pointer id,
  // and teardown restores absent methods as well as existing descriptors.
  const captured = new WeakMap<Element, number>()
  replaceProperty(Element.prototype, 'setPointerCapture', function (this: Element, id: number) { captured.set(this, id) })
  replaceProperty(Element.prototype, 'releasePointerCapture', function (this: Element) { captured.delete(this) })
  replaceProperty(Element.prototype, 'hasPointerCapture', function (this: Element, id: number) { return captured.get(this) === id })
})

afterEach(() => {
  try {
    cleanup()
  } finally {
    delete document.documentElement.dataset.platform
    delete document.documentElement.dataset.chromePlatform
    delete document.documentElement.dataset.createScene
    delete document.documentElement.dataset.panelHandoff
    for (const restore of restoreProperties.splice(0).reverse()) restore()
    document.title = originalTitle
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})

describe('AppFrame', () => {
  it('localizes the product title without a configured build title', () => {
    mountFrame()
    expect(document.title).toBe('DSH Local Build')
  })

  it('follows the selected durable Session title', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Product')
    selectedSessionTitle = 'First'
    const { rerenderFrame } = mountFrame()
    expect(document.title).toBe('First — Product')
    selectedSessionTitle = 'Revised'
    rerenderFrame()
    expect(document.title).toBe('Revised — Product')
    selectedSession = undefined
    rerenderFrame()
    expect(document.title).toBe('Product')
  })

  it('renders owner props for the default sidebar and prospective right panel', () => {
    const { frame, rightOwner, sidebarOwner, slotCalls } = mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
    expect(sidebarOwner()).toEqual({ collapsed: false, width: 280 })
    expect(rightOwner()).toEqual({ width: 320, viewportWidth: 1920, canShow: true, collapsePreview: false })
    expect(slotCalls.find(c => c.key === 'main')).toEqual({ key: 'main', props: {}, options: { entryKey: 'conversation' } })
  })

  it('collapses to the canvas column while canvas fullscreen is on', () => {
    const { frame, instance } = mountFrame()
    const work = frame.querySelector<HTMLElement>('[data-work]')!
    act(() => { instance.actions.setCanvasFullscreen(true) })
    expect(frame.hasAttribute('data-canvas-fullscreen')).toBe(true)
    expect(frame.style.gridTemplateColumns).toBe('minmax(0px, 1fr)')
    expect(work.style.gridTemplateColumns).toBe('minmax(0px, 1fr)')
    act(() => { instance.actions.setCanvasFullscreen(false) })
    expect(frame.hasAttribute('data-canvas-fullscreen')).toBe(false)
    expect(frame.style.gridTemplateColumns).toMatch(/^280px minmax\(0px, 1fr\)$/)
  })

  it('renders the main, sidebar, and root-scoped rightbar outlets without a current Session', () => {
    selectedSession = undefined
    const { frame, getByTestId } = mountFrame()
    expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe('conversation')
    expect(getByTestId('sidebar-content')).toBeTruthy()
    expect(getByTestId('rightbar-content')).toBeTruthy()
    expect(tracks(frame)).toEqual([280, 0])
  })

  it('renders both occupants before workspace baselines settle', () => {
    workspacesReady = false
    const { getByTestId } = mountFrame()
    expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe('conversation')
    expect(getByTestId('rightbar-content')).toBeTruthy()
  })

  it('keeps Windows caption controls mounted with a zero-width collapsed column', () => {
    document.documentElement.setAttribute('data-windows-titlebar', '')
    try {
      const { frame, instance, sidebarOwner, getByTestId, queryByTestId } = mountFrame()
      act(() => { instance.actions.toggleSidebar() })
      expect(tracks(frame)[0]).toBe(0)
      expect(sidebarOwner()).toMatchObject({ collapsed: true, width: 0 })
      expect(getByTestId('sidebar-content')).toBeTruthy()
      // The caption row keeps the reopen controls; the darwin-only
      // shell.leading seat must not mount a duplicate set.
      expect(queryByTestId('shell.leading-content')).toBeNull()
    } finally {
      document.documentElement.removeAttribute('data-windows-titlebar')
    }
  })

  it('keeps the closed sidebar mounted at its 56px rail without a handle', () => {
    const { frame, instance, sidebarOwner, getByTestId, queryByTestId } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([56, 0])
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 56 })
    expect(getByTestId('sidebar-content')).toBeTruthy()
    expect(frame.querySelector('[data-side="sidebar"]')).toBeNull()
    // The rail keeps the window chrome housed: no shell.leading seat.
    expect(queryByTestId('shell.leading-content')).toBeNull()
    expect(frame.querySelector('[data-shell-leading-band]')).toBeNull()
  })

  it('mounts the shell.leading seat only while the darwin collapse hides the column', () => {
    document.documentElement.dataset.platform = 'darwin'
    const { frame, instance, sidebarOwner, queryByTestId } = mountFrame()
    // The frame declares no window drag of its own: every chrome row owns its
    // run (ui-sidebar, ui-dockkit, ui-conversation, ui-plugin-manager).
    expect(frame.querySelector('[data-shell-leading-band]')).toBeNull()
    expect(frame.querySelector('[data-chrome-mirror-lights]')).toBeNull()
    expect(queryByTestId('shell.leading-content')).toBeNull()
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 0 })
    expect(frame.querySelector('[data-shell-leading]')).not.toBeNull()
    expect(queryByTestId('shell.leading-content')).toBeTruthy()
    act(() => { instance.actions.toggleSidebar() })
    expect(queryByTestId('shell.leading-content')).toBeNull()
  })

  it('mirrors macOS window geometry without changing the native platform fact', () => {
    document.documentElement.dataset.chromePlatform = 'darwin'
    const { frame, instance, sidebarOwner, queryByTestId } = mountFrame()
    expect(document.documentElement.dataset.platform).toBeUndefined()
    expect(document.documentElement.dataset.fullscreen).toBeUndefined()
    expect(frame.querySelector('[data-chrome-mirror-lights]')).not.toBeNull()

    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 0 })
    expect(frame.querySelector('[data-shell-leading]')).not.toBeNull()
    expect(queryByTestId('shell.leading-content')).toBeTruthy()
    act(() => { instance.actions.toggleSidebar() })
    expect(queryByTestId('shell.leading-content')).toBeNull()
  })

  it('switches only the keyed main outlet when the active panel changes', () => {
    selectedSessionTitle = 'Session title'
    const { instance, frame, slotCalls, getByTestId } = mountFrame()
    const sessionId = selectedSession
    const layoutInfo = instance.getSnapshot().layoutInfo
    for (const panelId of ['panel-a' as MainPanelId, 'panel-b' as MainPanelId, null]) {
      slotCalls.length = 0
      act(() => { instance.actions.selectPanel(panelId) })
      // Selecting a panel re-renders the frame (panelActive gates the region
      // sort), which re-dispatches the rightbar owner props — same values, no
      // remount. The keyed main outlet is the only call that changes.
      expect(slotCalls.filter(c => c.key === 'main')).toEqual([{ key: 'main', props: {}, options: { entryKey: panelId ?? 'conversation' } }])
      expect(slotCalls.every(c => c.key === 'main' || c.key === 'rightbar')).toBe(true)
      expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe(panelId ?? 'conversation')
      expect(instance.getSnapshot().panelInfo).toEqual({ activePanelId: panelId })
      expect(instance.getSnapshot().layoutInfo).toBe(layoutInfo)
      expect(tracks(frame)).toEqual([280, 0])
      expect(selectedSession).toBe(sessionId)
      expect(document.title).toBe(panelId === null ? 'Session title — DSH Local Build' : 'DSH Local Build')
    }
  })
})

describe('AppFrame product layout policy', () => {
  it('suppresses legacy leading controls when the fixed topbar owns navigation', () => {
    document.documentElement.dataset.chromePlatform = 'darwin'
    const { instance, queryByTestId, getByTestId, sidebarOwner } = mountFrame(1920, { primary: 'main', canvasSide: 'right' })
    act(() => { instance.actions.toggleSidebar() })
    expect(queryByTestId('shell.leading-content')).toBeNull()
    expect(getByTestId('shell.topbar.navigation-content')).toBeTruthy()
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 56 })
  })

  it('removes the topbar without changing the product rail or leading controls', () => {
    document.documentElement.dataset.chromePlatform = 'darwin'
    const { instance, frame, queryByTestId, sidebarOwner } = mountFrame(1920, {
      primary: 'main', canvasSide: 'right', topbar: false,
    })
    expect(frame.hasAttribute('data-topbar')).toBe(false)
    expect(queryByTestId('shell.topbar-content')).toBeNull()
    act(() => { instance.actions.toggleSidebar() })
    expect(queryByTestId('shell.leading-content')).toBeNull()
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 56 })
  })

  it('publishes content inset separately and lets canvas content own its chrome row', () => {
    document.documentElement.dataset.chromePlatform = 'darwin'
    const { frame, instance } = mountFrame(1920, {
      primary: 'main', canvasSide: 'right', topbar: false, contentInset: 12, sideChrome: 'content', drawer: false,
    })
    expect(frame.style.getPropertyValue('--dsh-product-content-inset')).toBe('12px')
    act(() => {
      setClaim('right')
      instance.actions.setAuxiliaryCollapsed(false)
    })
    expect(frame.querySelector('[data-side-trailing]')).toBeNull()
    expect(frame.querySelector('[data-side-fold]')).toBeNull()
    act(() => { instance.actions.setAuxiliaryCollapsed(true) })
    expect(frame.querySelector('[data-side-fold]')).not.toBeNull()
  })

  it('switches primary regions without remounting or reading Session arrangement', () => {
    const b = mountFrame(1920, { primary: 'main', canvasSide: 'left' })
    const { instance, frame, mounts, setPolicy, getByTestId } = b
    const work = workEl(frame)
    act(() => {
      instance.actions.openRightbar(true, false, false)
      instance.actions.setUnit(777)
      instance.actions.setAuxiliaryCollapsed(false)
      instance.actions.setUnitSide('left')
      setClaim('left')
    })
    const main = getByTestId('main-content')
    const rightbar = getByTestId('rightbar-content')
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
    expect(work.dataset.unitSide).toBe('right')

    act(() => { setPolicy({ primary: 'rightbar', canvasSide: 'right' }) })
    expect(work.dataset.unitSide).toBe('left')
    expect(getByTestId('main-content')).toBe(main)
    expect(getByTestId('rightbar-content')).toBe(rightbar)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
    expect(instance.getSnapshot().layoutInfo.unit).toBe(777)

    act(() => { setPolicy({ primary: 'main', canvasSide: 'left' }) })
    expect(work.dataset.unitSide).toBe('right')
    expect(getByTestId('main-content')).toBe(main)
    expect(getByTestId('rightbar-content')).toBe(rightbar)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
  })

  it('animates explicit mirror transitions and redirects an in-flight swap without remounting', async () => {
    const b = mountFrame(1920, { primary: 'main', canvasSide: 'right' })
    const { instance, frame, mounts, setPolicy, transitionFrame, getByTestId } = b
    act(() => {
      instance.actions.openRightbar(true, false, false)
      instance.actions.setAuxiliaryCollapsed(false)
      setClaim('right')
    })
    // oxlint-disable-next-line typescript/unbound-method -- Each region invokes the captured native method with its own element as `this`.
    const originalRect = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && (this.hasAttribute('data-center-col') || this.hasAttribute('data-rightbar-col'))) {
        const base = Number(this.style.order) === 1 ? 0 : 600
        const transform = /translateX\((-?[\d.]+)px\)/.exec(this.style.transform)
        const dx = transform === null ? 0 : Number(transform[1])
        return new DOMRect(base + dx, 0, 600, 800)
      }
      return originalRect.call(this)
    })
    type StubAnimation = Animation & { advance: (fraction: number) => void; cancelled: boolean }
    class StubAnimationPlayer extends EventTarget implements StubAnimation {
      currentTime: CSSNumberish | null = null
      effect: AnimationEffect | null = null
      id = ''
      oncancel: Animation['oncancel'] = null
      onfinish: Animation['onfinish'] = null
      onremove: Animation['onremove'] = null
      overallProgress: number | null = null
      pending = false
      playState: AnimationPlayState = 'running'
      playbackRate = 1
      ready: Promise<Animation>
      replaceState: AnimationReplaceState = 'active'
      startTime: CSSNumberish | null = null
      timeline: AnimationTimeline | null = null
      finished: Promise<Animation>
      cancelled = false
      private settle!: (value: Animation) => void

      constructor(private readonly element: HTMLElement, private readonly firstDx: number, private readonly lastTransform: string) {
        super()
        const deferred = Promise.withResolvers<Animation>()
        this.finished = deferred.promise
        this.settle = deferred.resolve
        this.ready = Promise.resolve(this)
      }

      cancel(): void {
        this.cancelled = true
        this.playState = 'idle'
        this.element.style.transform = ''
        this.settle(this)
      }

      finish(): void {
        this.playState = 'finished'
        this.element.style.transform = this.lastTransform
        this.settle(this)
      }

      advance(fraction: number): void {
        this.element.style.transform = `translateX(${this.firstDx * (1 - fraction)}px)`
      }

      commitStyles = vi.fn()
      pause = vi.fn()
      persist = vi.fn()
      play = vi.fn()
      reverse = vi.fn()
      updatePlaybackRate = vi.fn()
    }
    const animations: StubAnimationPlayer[] = []
    replaceProperty(Element.prototype, 'animate', function (this: Element, keyframes, _options) {
      const frames = Array.isArray(keyframes) ? keyframes : [keyframes]
      const firstTransform = typeof frames[0]?.transform === 'string' ? frames[0].transform : ''
      const lastFrame = frames.at(-1)
      const lastTransform = typeof lastFrame?.transform === 'string' ? lastFrame.transform : ''
      const firstDx = Number(/translateX\((-?[\d.]+)px\)/.exec(firstTransform)?.[1] ?? 0)
      const element = this as HTMLElement
      element.style.transform = firstTransform
      const animation = new StubAnimationPlayer(element, firstDx, lastTransform)
      animations.push(animation)
      return animation
    })
    const center = frame.querySelector<HTMLElement>('[data-center-col]')!
    const rightbar = frame.querySelector<HTMLElement>('[data-rightbar-col]')!
    const main = getByTestId('main-content')
    const right = getByTestId('rightbar-content')

    act(() => { transitionFrame(() => { setPolicy({ primary: 'rightbar', canvasSide: 'right' }) }) })
    expect(animations).toHaveLength(2)
    expect(center.style.transform).toBe('translateX(-600px)')
    expect(rightbar.style.transform).toBe('translateX(600px)')
    expect(workEl(frame).dataset.modeScene).toBe('swap')
    expect(workEl(frame).dataset.animating).toBeUndefined()

    animations[0]!.advance(0.5)
    animations[1]!.advance(0.5)
    act(() => { transitionFrame(() => { setPolicy({ primary: 'main', canvasSide: 'right' }) }) })
    expect(animations).toHaveLength(4)
    expect(animations[0]!.cancelled).toBe(true)
    expect(animations[1]!.cancelled).toBe(true)
    expect(center.style.transform).toBe('translateX(300px)')
    expect(rightbar.style.transform).toBe('translateX(-300px)')

    for (const animation of animations.slice(-2)) animation.finish()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(workEl(frame).hasAttribute('data-mode-scene')).toBe(false)
    expect(center.style.willChange).toBe('')
    expect(rightbar.style.willChange).toBe('')
    expect(getByTestId('main-content')).toBe(main)
    expect(getByTestId('rightbar-content')).toBe(right)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
  })

  it('commits reduced-motion and existing creation scenes without starting another animation', () => {
    const animate = vi.fn()
    replaceProperty(Element.prototype, 'animate', animate)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const reduced = mountFrame(1920, { primary: 'main', canvasSide: 'right' })
    act(() => { reduced.transitionFrame(() => { reduced.setPolicy({ primary: 'rightbar', canvasSide: 'right' }) }) })
    expect(workEl(reduced.frame).dataset.unitSide).toBe('left')
    expect(animate).not.toHaveBeenCalled()

    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    document.documentElement.dataset.createScene = 'handcraft'
    const scene = mountFrame(1920, { primary: 'main', canvasSide: 'right' })
    act(() => { scene.transitionFrame(() => { scene.setPolicy({ primary: 'rightbar', canvasSide: 'right' }) }) })
    expect(workEl(scene.frame).dataset.unitSide).toBe('left')
    expect(animate).not.toHaveBeenCalled()
  })

  it('folds Conversation into a retained rail and restores it without remounting', () => {
    const b = mountFrame(1920, { primary: 'rightbar', canvasSide: 'right' })
    const { instance, frame, mounts, getByTestId, getByRole } = b
    act(() => { instance.actions.openRightbar(true, false, false); setClaim('right') })
    const main = getByTestId('main-content')
    act(() => { getByRole('button', { name: 'collapse' }).click() })
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(0px, 1fr) minmax(0px, 56px)')
    expect(getByTestId('main-content').parentElement?.getAttribute('aria-hidden')).toBe('true')
    expect(getByTestId('main-content').parentElement?.inert).toBe(true)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })

    act(() => { getByRole('button', { name: 'expand' }).click() })
    expect(getByTestId('main-content')).toBe(main)
    expect(getByTestId('main-content').parentElement?.getAttribute('aria-hidden')).toBeNull()
    expect(getByTestId('main-content').parentElement?.inert).toBe(false)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
  })

  it('keeps a header-height fold before a Session exists', () => {
    selectedSession = undefined
    const b = mountFrame(1920, { primary: 'rightbar', canvasSide: 'right', foldMode: 'shared' })
    const { instance, frame, getByRole } = b
    act(() => {
      instance.actions.openRightbar(true, false, false)
      instance.actions.setAuxiliaryCollapsed(false)
    })
    act(() => { getByRole('button', { name: 'collapse' }).click() })
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(0px, 1fr) minmax(0px, 56px)')
    expect(getByRole('button', { name: 'expand' })).toBeTruthy()
  })

  it('folds the auxiliary Canvas in Agent and carries the same fold through mode switches', () => {
    const b = mountFrame(1920, { primary: 'main', canvasSide: 'right', drawer: false, foldMode: 'shared' })
    const { instance, frame, mounts, setPolicy, getByTestId, getByRole, rightOwner } = b
    act(() => {
      instance.actions.setAuxiliaryCollapsed(false)
      setClaim('right')
    })
    const main = getByTestId('main-content')
    const rightbar = getByTestId('rightbar-content')
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(320px, 1fr) minmax(0px, 820px)')
    expect(rightOwner().width).toBe(0)
    expect(frame.querySelector('[data-side="unit"]')).not.toBeNull()
    act(() => { instance.actions.setAuxiliaryCollapsed(true) })
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(0px, 1fr) 0px')
    expect(rightbar.parentElement?.getAttribute('aria-hidden')).toBe('true')
    expect(rightbar.parentElement?.inert).toBe(true)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })

    act(() => { setPolicy({ primary: 'rightbar', canvasSide: 'right', drawer: false, foldMode: 'shared' }) })
    expect(getByTestId('main-content')).toBe(main)
    expect(getByTestId('rightbar-content')).toBe(rightbar)
    expect(main.parentElement?.getAttribute('aria-hidden')).toBe('true')
    expect(rightbar.parentElement?.getAttribute('aria-hidden')).toBeNull()
    expect(mounts).toEqual({ main: 1, rightbar: 1 })

    act(() => { setPolicy({ primary: 'main', canvasSide: 'right', drawer: false, foldMode: 'shared' }) })
    act(() => { getByRole('button', { name: 'expand' }).click() })
    expect(rightbar.parentElement?.getAttribute('aria-hidden')).toBeNull()
    expect(rightbar.parentElement?.inert).toBe(false)
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(320px, 1fr) minmax(0px, 820px)')
    expect(rightOwner().width).toBe(0)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
  })

  it('never folds a global panel with the Conversation', () => {
    const b = mountFrame(1920, { primary: 'rightbar', canvasSide: 'right' })
    const { instance, frame, getByTestId, queryByRole } = b
    act(() => { instance.actions.setCenterCollapsed(true); instance.actions.selectPanel('settings' as MainPanelId) })
    expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe('settings')
    expect(getByTestId('main-content').parentElement?.hidden).toBe(false)
    expect(workEl(frame).style.gridTemplateColumns).not.toBe('minmax(0px, 1fr) minmax(0px, 56px)')
    expect(queryByRole('button', { name: 'collapse' })).toBeNull()
  })

  it('gives global panels the full work region and restores the hidden Canvas on return', () => {
    const b = mountFrame(1920, { primary: 'rightbar', canvasSide: 'right', drawer: false })
    const { instance, frame, mounts } = b
    act(() => { instance.actions.setAuxiliaryCollapsed(false); setClaim('right') })
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(320px, 1fr) minmax(0px, 820px)')

    act(() => { instance.actions.selectPanel('settings' as MainPanelId) })
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(0px, 0px) minmax(0px, 1fr)')
    expect(mounts).toEqual({ main: 1, rightbar: 1 })

    act(() => { instance.actions.selectPanel(null) })
    expect(workEl(frame).style.gridTemplateColumns).toBe('minmax(320px, 1fr) minmax(0px, 820px)')
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
  })

  it('keeps content claims from reopening a folded auxiliary Canvas or resetting widths', () => {
    const b = mountFrame(1920, { primary: 'main', canvasSide: 'left' })
    const { instance, frame, mounts } = b
    act(() => { instance.actions.openRightbar(true, false, false); instance.actions.setUnit(733); setClaim('left') })
    const folded = workEl(frame).style.gridTemplateColumns
    expect(folded).toContain('minmax(0px, 320px)')
    act(() => { setClaim('right') })
    expect(workEl(frame).style.gridTemplateColumns).toBe(folded)
    expect(instance.getSnapshot().layoutInfo.unit).toBe(733)

    act(() => { instance.actions.setAuxiliaryCollapsed(false) })
    expect(workEl(frame).style.gridTemplateColumns).not.toBe(folded)
    expect(mounts).toEqual({ main: 1, rightbar: 1 })
    act(() => { instance.actions.setAuxiliaryCollapsed(true) })
    expect(workEl(frame).style.gridTemplateColumns).toBe(folded)
    expect(instance.getSnapshot().layoutInfo.unit).toBe(733)
  })
})

describe('AppFrame normal width concessions', () => {
  it('measures the frame, not the window, before choosing the first-open preference', () => {
    frameWidth = 1000
    const { instance, rightOwner } = mountFrame(1920)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1000)
    expect(rightOwner()).toEqual({ width: 320, viewportWidth: 1000, canShow: true, collapsePreview: false })
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(320)
    resize(1920)
    expect(rightOwner().width).toBe(320)
  })

  it('shrinks the right panel to the floor, drops its track, and only then squeezes center', () => {
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.setSidebar(420); instance.actions.openRightbar(true, false, false) })
    resize(1200)
    // The template carries the preference; the panel (rightOwner width)
    // reports the resolved squeeze.
    expect(tracks(frame)).toEqual([420, 320])
    expect(rightOwner()).toEqual({ width: 320, viewportWidth: 1200, canShow: true, collapsePreview: false })
    resize(1120)
    expect(tracks(frame)).toEqual([420, 320])
    expect(rightOwner()).toEqual({ width: 320, viewportWidth: 1120, canShow: true, collapsePreview: false })
    // Crossing the breakpoint folds the sidebar to its rail, freeing the
    // panel's room back; the track drops only when even the rail leaves under
    // the panel's floor.
    resize(1023)
    expect(tracks(frame)).toEqual([56, 320])
    expect(rightOwner()).toEqual({ width: 320, viewportWidth: 1023, canShow: true, collapsePreview: false })
    // The 96px floor still fits beside the rail: the track keeps the
    // preference's cap while the drawn width squeezes to 635 - 56 - 320 = 259.
    resize(635)
    expect(tracks(frame)).toEqual([56, 320])
    expect(rightOwner()).toEqual({ width: 259, viewportWidth: 635, canShow: true, collapsePreview: false })
    resize(470)
    expect(tracks(frame)).toEqual([56, 0])
    expect(rightOwner()).toEqual({ width: 0, viewportWidth: 470, canShow: false, collapsePreview: false })
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: true, rightbar: 320 })
    act(() => { instance.actions.closeRightbar() })
    resize(455)
    expect(tracks(frame)).toEqual([56, 0])
    resize(1920)
    expect(tracks(frame)).toEqual([420, 0])
  })

  it('uses the post-collapse left rail to permit a narrow first opening', () => {
    frameWidth = 800
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(rightOwner()).toEqual({ width: 320, viewportWidth: 800, canShow: true, collapsePreview: false })
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(tracks(frame)).toEqual([56, 320])
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ narrowExpanded: false, rightbar: 320 })
    expect(rightOwner().canShow).toBe(true)
  })

  it.each([[756, 320, true], [636, 260, true], [635, 259, true], [551, 175, true], [470, 0, false]] as const)('reports eligibility at %ipx', (width, rightbar, canShow) => {
    frameWidth = width
    const { instance, rightOwner } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    expect(rightOwner()).toEqual({ width: rightbar, viewportWidth: width, canShow, collapsePreview: false })
  })

  it('does not anticipate another left collapse after the right panel is already shown', () => {
    frameWidth = 800
    const { instance, rightOwner } = mountFrame()
    act(() => { instance.actions.openRightbar(true, false, false); instance.actions.toggleSidebar() })
    // The halved floor fits beside the wide sidebar: 800 - 280 - 400 = 120.
    expect(rightOwner().canShow).toBe(true)
  })

  it('auto-collapses only below 1024px and preserves the wide sidebar preference', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.setSidebar(400) })
    resize(1024)
    expect(tracks(frame)[0]).toBe(400)
    resize(1023)
    expect(tracks(frame)[0]).toBe(56)
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(400)
    resize(980)
    expect(tracks(frame)[0]).toBe(400)
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(56)
    resize(1920)
    expect(tracks(frame)[0]).toBe(400)
  })

  it('re-expands a narrow-toggled sidebar while keeping the width preference', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    resize(980)
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(280)
    // Narrow re-expansion rides the override; the wide fold stays for the
    // return to a wide frame, where the width preference also survives.
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ sidebar: 280, narrowExpanded: true })
  })
})

describe('AppFrame right panel presentation', () => {
  it('releases the fullscreen track with the instant marker while clearing fullscreen', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openRightbar(true, true, false) })
    expect(tracks(frame)).toEqual([280, 320])
    act(() => { instance.actions.closeRightbar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
    expect(workEl(frame).dataset.rightbarInstant).toBe('true')
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    act(() => { instance.actions.closeRightbar() })
    expect(workEl(frame).dataset.rightbarInstant).toBe('true')
  })

  it('marks restoration instant without suppressing the following normal close', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openRightbar(true, true, false) })
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(tracks(frame)).toEqual([280, 320])
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
    expect(workEl(frame).dataset.rightbarInstant).toBe('true')
    act(() => { instance.actions.closeRightbar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
    expect(workEl(frame).dataset.rightbarInstant).toBeUndefined()
  })

  it.each(['setSidebar', 'toggleSidebar', 'setRightbar', 'viewport', 'open'] as const)('reenables normal transitions after %s', (action) => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openRightbar(true, true, false); instance.actions.closeRightbar() })
    expect(workEl(frame).dataset.rightbarInstant).toBe('true')
    act(() => {
      if (action === 'viewport') resize(1800)
      else if (action === 'open') instance.actions.openRightbar(true, false, false)
      else if (action === 'toggleSidebar') instance.actions.toggleSidebar()
      else instance.actions[action](350)
    })
    expect(workEl(frame).dataset.rightbarInstant).toBeUndefined()
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
  })

  it('eases tracks only across a discrete toggle, never for viewport updates', () => {
    const { frame, instance } = mountFrame()
    expect(frame.dataset.animating).toBeUndefined()
    // Window-driven track updates follow the frame edge instantly.
    resize(1600)
    expect(frame.dataset.animating).toBeUndefined()
    act(() => { instance.actions.toggleSidebar() })
    expect(frame.dataset.animating).toBe('true')
    // Foreign transition ends (e.g. the handle's left) do not settle it...
    act(() => {
      frame.dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'left' }))
    })
    expect(frame.dataset.animating).toBe('true')
    // ...the track transition's own end does.
    act(() => {
      frame.dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'grid-template-columns' }))
    })
    expect(frame.dataset.animating).toBeUndefined()
  })

  it('lands the responsive auto-collapse instantly, keeping user toggles eased', () => {
    const { frame, instance } = mountFrame()
    // Shrinking across the breakpoint flips the collapse in the same update as
    // the viewport change: no easing, the tracks land with the window edge.
    resize(900)
    expect(frame.dataset.sidebarCollapsed).toBe('true')
    expect(frame.dataset.animating).toBeUndefined()
    // A user toggle at the now-stable viewport still eases.
    act(() => { instance.actions.toggleSidebar() })
    expect(frame.dataset.animating).toBe('true')
  })

  it('animates the rightbar track flip and settles by timeout without a transition end', () => {
    vi.useFakeTimers()
    try {
      const { frame, instance } = mountFrame()
      act(() => { instance.actions.openRightbar(true, false, false) })
      expect(workEl(frame).dataset.animating).toBe('true')
      // Covered or reduced-motion frames fire no transitionend; the timeout settles.
      act(() => { vi.advanceTimersByTime(600) })
      expect(workEl(frame).dataset.animating).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves an explicit canvas preset over a dragged width and lets a drag reclaim it', () => {
    const { frame, instance } = mountFrame()
    // A dragged width exists; the explicit preset must still take effect.
    act(() => { instance.actions.setUnit(600); setClaim('left'); instance.actions.openRightbar(true, false, false) })
    act(() => { instance.actions.seedUnitShare(0.7) })
    // 1920 - 280 nav = 1640 work; drawer 320 reserved; 0.7 of the rest.
    expect(workEl(frame).style.gridTemplateColumns).toMatch(/minmax\(0px, 1244px\)/)
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ unitCanvasShare: null, unit: 1244 })
    // The user's drag settles the width again and survives a reload.
    act(() => { instance.actions.setUnit(900) })
    expect(workEl(frame).style.gridTemplateColumns).toMatch(/minmax\(0px, 900px\)/)
  })

  it('keeps fullscreen suppression independent from resetting the instant marker', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openRightbar(true, true, false) })
    act(() => { instance.actions.setSidebar(350) })
    expect(workEl(frame).dataset.rightbarInstant).toBeUndefined()
    expect(workEl(frame).dataset.rightbarFullscreen).toBe('true')
  })

  it('preserves normal tracks through fullscreen and hides the outer resize handle', () => {
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(tracks(frame)).toEqual([280, 320])
    expect(handleFor(frame, 'rightbar').style.left).toBe('1320px')
    act(() => { instance.actions.openRightbar(true, true, false) })
    expect(tracks(frame)).toEqual([280, 320])
    expect(rightOwner().width).toBe(320)
    expect(workEl(frame).dataset.rightbarFullscreen).toBe('true')
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(tracks(frame)).toEqual([280, 320])
    expect(handleFor(frame, 'rightbar').style.left).toBe('1320px')
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
    act(() => { instance.actions.closeRightbar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
  })

  it('inserts a fullscreen track and its transition-suppression marker in the same render', () => {
    const { frame, instance } = mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
    act(() => { instance.actions.openRightbar(true, true, false) })
    expect(tracks(frame)).toEqual([280, 320])
    expect(workEl(frame).dataset.rightbarFullscreen).toBe('true')
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(tracks(frame)).toEqual([280, 320])
    expect(workEl(frame).dataset.rightbarFullscreen).toBeUndefined()
  })

  it('retains fullscreen without a track when normal columns cannot fit', () => {
    frameWidth = 470
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.openRightbar(false, true, false) })
    expect(tracks(frame)).toEqual([56, 0])
    expect(rightOwner()).toEqual({ width: 0, viewportWidth: 470, canShow: false, collapsePreview: false })
    expect(instance.getSnapshot().layoutInfo.rightbarShown).toBe(true)
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
  })

  it('keeps resolved panel width independent of the requested track', () => {
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.openRightbar(false, false, false) })
    resize(1100)
    expect(tracks(frame)).toEqual([280, 0])
    expect(rightOwner().width).toBe(320)
    drag(handleFor(frame, 'rightbar'), 680, 690)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(310)
    expect(rightOwner().width).toBe(310)
    expect(tracks(frame)[1]).toBe(0)
  })
})

describe('AppFrame pointer resizing', () => {
  it('updates columns during the gesture and freezes the drag-start width', () => {
    const { frame, instance } = mountFrame()
    const handle = handleFor(frame, 'sidebar')
    pointer(handle, 'pointerdown', 280)
    expect(frame.dataset.dragging).toBe('true')
    pointer(handle, 'pointermove', 320)
    pointer(handle, 'pointermove', 320)
    expect(animationFrames.size).toBe(1)
    act(flushFrames)
    expect(tracks(frame)[0]).toBe(320)
    pointer(handle, 'pointermove', 360)
    act(flushFrames)
    expect(tracks(frame)[0]).toBe(360)
    pointer(handle, 'pointerup', 360)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
    expect(frame.dataset.dragging).toBeUndefined()
    expect(handle.hasPointerCapture(1)).toBe(false)
  })

  it('starts a conceded right drag at its actual width, shared by panel and track', () => {
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.openRightbar(true, false, false) })
    resize(1100)
    const handle = handleFor(frame, 'rightbar')
    expect(rightOwner().width).toBe(320)
    expect(tracks(frame)[1]).toBe(320)
    expect(handle.style.left).toBe('500px')
    drag(handle, 500, 510)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(310)
    expect(rightOwner().width).toBe(310)
    expect(tracks(frame)[1]).toBe(310)
    expect(handle.style.left).toBe('510px')
  })

  it('widens to the 70% limit and parks the rail request below the floor through pointer input', () => {
    frameWidth = 3000
    const { frame, instance, rightOwner } = mountFrame()
    act(() => { instance.actions.toggleSidebar(); instance.actions.openRightbar(true, false, false) })
    drag(handleFor(frame, 'rightbar'), 1650, 0)
    expect(rightOwner().width).toBe(1970)
    expect(tracks(frame)[1]).toBe(1970)
    // Below the floor the panel offers zero width: the occupant collapses to
    // its rail while the dragged preference survives for the return.
    drag(handleFor(frame, 'rightbar'), 900, 3000)
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ rightbar: 1970, rightbarCollapsed: true })
    expect(rightOwner()).toEqual({ width: 0, viewportWidth: 3000, canShow: false, collapsePreview: false })
    expect(tracks(frame)[1]).toBe(0)
    act(() => { instance.actions.openRightbar(true, false, true) })
    expect(tracks(frame)[1]).toBe(56)
    expect(rightOwner().width).toBe(56)
    act(() => { instance.actions.openRightbar(true, false, false) })
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ rightbar: 1970, rightbarCollapsed: false })
    expect(rightOwner().width).toBe(1970)
  })

  it('halves conversation and canvas on the first user open, then owns the ratio by drag', () => {
    const { frame, instance } = mountFrame()
    act(() => { setClaim('left'); instance.actions.openRightbar(true, false, false) })
    // One-shot halving: (1920 - 280 sidebar - 320 panel) / 2 + 320 = 990.
    expect(tracks(frame)).toEqual([280, 980])
    expect(instance.getSnapshot().layoutInfo.unit).toBe(980)
    // The unit seam sits at the column's conversation-facing edge (work-layer
    // coordinates); the panel handle keeps canvas/panel split inside it.
    const unit = frame.querySelector<HTMLElement>('[data-side="unit"]')!
    expect(unit.style.left).toBe('660px')
    expect(handleFor(frame, 'rightbar').style.left).toBe('1320px')
    drag(unit, 660, 760)
    expect(instance.getSnapshot().layoutInfo.unit).toBe(880)
    expect(tracks(frame)).toEqual([280, 880])
    // The panel stays anchored to the right edge while the seam moves.
    expect(handleFor(frame, 'rightbar').style.left).toBe('1320px')
    // The floor keeps the drawn panel plus a canvas page inside the unit:
    // 320 panel + 280 canvas minimum.
    drag(unit, 760, 3000)
    expect(tracks(frame)).toEqual([280, 600])
    act(() => { instance.actions.openRightbar(true, false, true) })
    expect(frame.querySelector('[data-side="unit"]')).not.toBeNull()
    act(() => { setClaim(null); instance.actions.openRightbar(true, false, false) })
    expect(frame.querySelector('[data-side="unit"]')).toBeNull()
  })

  it('changes the drawer width from its conversation-facing line without moving the canvas-facing line', () => {
    const { frame, instance } = mountFrame()
    act(() => { setClaim('right'); instance.actions.openRightbar(true, false, false) })
    const before = instance.getSnapshot().layoutInfo
    const unitBefore = before.unit ?? 0
    const rightbarBefore = before.rightbar ?? 0
    const canvasBefore = unitBefore - rightbarBefore
    const innerBefore = handleFor(frame, 'rightbar').style.left
    const unitHandle = frame.querySelector<HTMLElement>('[data-side="unit"]')!
    const start = parseFloat(unitHandle.style.left)
    drag(unitHandle, start, start - 100)
    const after = instance.getSnapshot().layoutInfo
    expect(after.unit).toBe(unitBefore + 100)
    expect(after.rightbar).toBe(rightbarBefore + 100)
    expect((after.unit ?? 0) - (after.rightbar ?? 0)).toBe(canvasBefore)
    // The canvas-facing line is the drawer's other edge: it stays put while
    // the conversation-facing line resizes the drawer from the left.
    expect(handleFor(frame, 'rightbar').style.left).toBe(innerBefore)
    expect(tracks(frame)).toEqual([280, unitBefore + 100])
  })

  it('commits the pointerup coordinate and cancels its pending animation frame', () => {
    const { frame, instance } = mountFrame()
    const handle = handleFor(frame, 'sidebar')
    pointer(handle, 'pointerdown', 280)
    pointer(handle, 'pointermove', 320)
    pointer(handle, 'pointerup', 360)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
    expect(animationFrames.size).toBe(0)
    act(flushFrames)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
  })

  it('ignores uncaptured motion, secondary buttons, and a second pointer', () => {
    const { frame, instance } = mountFrame()
    const handle = handleFor(frame, 'sidebar')
    pointer(handle, 'pointermove', 500, 9)
    pointer(handle, 'pointerup', 500, 9)
    pointer(handle, 'pointercancel', 500, 9)
    pointer(handle, 'pointerdown', 500, 9, 2)
    expect(frame.dataset.dragging).toBeUndefined()
    pointer(handle, 'pointerdown', 280)
    pointer(handle, 'pointerdown', 500, 9)
    pointer(handle, 'pointermove', 500, 9)
    pointer(handle, 'pointerup', 500, 9)
    expect(animationFrames.size).toBe(0)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(280)
    pointer(handle, 'pointerup', 300)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(300)
  })

  it.each(['pointercancel', 'lostpointercapture'])('ends %s without committing queued motion', (event) => {
    const { frame, instance } = mountFrame()
    const handle = handleFor(frame, 'sidebar')
    pointer(handle, 'pointerdown', 280)
    pointer(handle, 'pointermove', 320)
    if (event === 'lostpointercapture') handle.releasePointerCapture(1)
    pointer(handle, event, 320)
    act(flushFrames)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(280)
    expect(animationFrames.size).toBe(0)
    expect(frame.dataset.dragging).toBeUndefined()
    expect(handle.hasPointerCapture(1)).toBe(false)
  })

  it.each(['fullscreen', 'close', 'unmount'])('cancels a pending drag on %s', (change) => {
    const { frame, instance, unmount } = mountFrame()
    act(() => { instance.actions.openRightbar(true, false, false) })
    const handle = handleFor(frame, 'rightbar')
    pointer(handle, 'pointerdown', 1056)
    pointer(handle, 'pointermove', 1000)
    act(() => {
      if (change === 'fullscreen') instance.actions.openRightbar(true, true, false)
      else if (change === 'close') instance.actions.closeRightbar()
      else unmount()
    })
    const settled = instance.getSnapshot()
    act(flushFrames)
    expect(instance.getSnapshot()).toBe(settled)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(320)
    expect(animationFrames.size).toBe(0)
    expect(handle.hasPointerCapture(1)).toBe(false)
    if (change !== 'unmount') expect(frame.dataset.dragging).toBeUndefined()
  })
})

describe('AppFrame frame measurement lifecycle', () => {
  it('coalesces observer reports and publishes the latest frame measurement', () => {
    const { instance, rightOwner } = mountFrame()
    const observer = observers.at(-1)!
    act(() => {
      frameWidth = 900
      observer.fire()
      frameWidth = 1200
      observer.fire()
    })
    expect(animationFrames.size).toBe(1)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1920)
    act(flushFrames)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1200)
    expect(rightOwner().viewportWidth).toBe(1200)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBeNull()
  })

  it('retains the last positive measurement while the frame is hidden', () => {
    const { instance, rightOwner } = mountFrame()
    resize(0)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1920)
    expect(rightOwner().viewportWidth).toBe(1920)
  })

  it('disconnects the observer and prevents queued or late reports after unmount', () => {
    const { instance, unmount } = mountFrame()
    const observer = observers.at(-1)!
    frameWidth = 800
    act(() => { observer.fire() })
    expect(animationFrames.size).toBe(1)
    unmount()
    expect(observer.disconnected).toBe(true)
    expect(animationFrames.size).toBe(0)
    act(() => { observer.fire(); flushFrames() })
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1920)
    expect(animationFrames.size).toBe(0)
  })
})

describe('AppFrame session switching', () => {
  it('lands a switched session on its geometry without easing the work layer', () => {
    const { frame, instance, rerenderFrame } = mountFrame()
    act(() => { instance.actions.openRightbar(true, false, false) })
    act(() => {
      workEl(frame).dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'grid-template-columns' }))
    })
    expect(workEl(frame).dataset.animating).toBeUndefined()
    // Switching session and recovering a different presentation in the same
    // commit is recovery, not a user toggle: no track easing.
    selectedSession = 's-other' as SessionId
    selectedSessionCwd = '/Users/noven/诺文/另一项目'
    act(() => {
      rerenderFrame()
      setClaim('left')
    })
    expect(workEl(frame).dataset.animating).toBeUndefined()
  })

  it('keeps the navigation column outside the page-turned work layer', () => {
    const { frame } = mountFrame()
    const work = workEl(frame)
    expect(work.contains(frame.querySelector('[data-testid="sidebar-content"]'))).toBe(false)
    expect(work.contains(frame.querySelector('[data-testid="main-content"]'))).toBe(true)
    expect(work.contains(frame.querySelector('[data-testid="rightbar-content"]'))).toBe(true)
  })
})
