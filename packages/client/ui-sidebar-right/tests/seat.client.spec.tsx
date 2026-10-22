// @vitest-environment jsdom
/** Sidebar presentation and tab subscriptions through the production slot renderer. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PaneId, SplitId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { findTabPane, getPane } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { intentsFor } from '../src/client/shell/SidebarRight.tsx'
import { registerSidebarShortcuts } from '../src/client/shortcuts.ts'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
import type { SidebarRightTabInfo, SidebarRightTabMenuOwnerProps } from '../src/client/contract/slots.ts'
import type { createSidebarRightStore } from '../src/client/stores.ts'

declare module '../src/client/contract/params.ts' {
  interface SidebarRightResourceParamsMap {
    test: { line?: number; x?: number }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** A Conversation-column stand-in rendered before the seat, opening a resource as soon as a seat is mounted. */
    'sidebar-right.test.opener': { kind: 'single'; scope: 'session'; owner: { armed: boolean } }
  }
}

const SESSION = 's-test' as SessionId
const OTHER = 's-other' as SessionId
const runtimes: SlotTestRuntime[] = []
let getAnimationsDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  getAnimationsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, writable: true, value: () => [] })
})

afterEach(async () => {
  try {
    for (const runtime of runtimes.splice(0)) await runtime.dispose()
  } finally {
    vi.restoreAllMocks()
    if (getAnimationsDescriptor === undefined) Reflect.deleteProperty(Element.prototype, 'getAnimations')
    else Object.defineProperty(Element.prototype, 'getAnimations', getAnimationsDescriptor)
  }
})

/** Browser-owned animation completion controlled independently of the test clock. */
function transition(property = 'transform') {
  const done = Promise.withResolvers<Animation>()
  let state: AnimationPlayState = 'running'
  const animation = {
    transitionProperty: property,
    get playState() { return state },
    finished: done.promise,
  } as CSSTransition
  return {
    animation,
    finish: () => { state = 'finished'; done.resolve(animation) },
    cancel: () => { state = 'idle'; done.reject(new DOMException('Transition canceled', 'AbortError')) },
  }
}

async function mountSeat(viewportWidth = 1440, canShow = true, entryCount = 0, opener = false, keepMounted = false) {
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  // The frame face carries no claim seam here: claims are read straight off
  // the controller, the way AppFrame reads them off its provided source.
  const frame = {
    openRightbar: vi.fn(), closeRightbar: vi.fn(), toggleSidebar: vi.fn(),
  }
  const pin = vi.fn<(address: string, signal: AbortSignal) => void>()
  runtime.ctx.provide('layout', frame as never)
  runtime.ctx.provide('resources', { pin } as never)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  const catalog = createSnapshotStore<readonly ShortcutCatalogEntry[]>([])
  runtime.ctx.provide('shortcuts', { register: () => () => {}, catalog } as never)
  runtime.slots.installLocale(locale)
  await runtime.declare({
    'sidebar-right.test.opener': { kind: 'single', scope: 'session' },
    'rightbar': { kind: 'single', scope: 'root' },
    'conversation.session.header.corner': { kind: 'single', scope: 'session' },
  })
  await runtime.sessions.add({ id: SESSION })
  let reference = runtime.sessions.retainFor(runtime.ctx, SESSION, { source: 'mainView' })
  const feature = await runtime.mount({ inject: [...inject], apply })
  // The frame mounts the Conversation column before the right column, so a
  // Conversation component's mount effect runs before the seat's. The opener
  // stands in for one that opens a resource as soon as a seat is mounted — it
  // reads `mounted` the way a slot component reads its bound hook — and shows
  // only while the Conversation is selected, as the main panel does.
  const opened: string[] = []
  function OpenerMount() {
    const { mounted } = runtime.ctx.sidebarRight
    const seat = useSyncExternalStore(listener => mounted.subscribe(listener), () => mounted.getSnapshot())
    useEffect(() => {
      if (seat === undefined) return
      const address = `dsh-resource://file/session/s-test/arrival-${opened.length + 1}.txt`
      runtime.ctx.sidebarRight.openResource(address)
      opened.push(address)
    }, [seat])
    return null
  }
  function Opener({ usePanelInfo, armed }: PropsRuntime<'sidebar-right.test.opener'>) {
    const visible = usePanelInfo(info => info.activePanelId === null)
    return armed && visible ? <OpenerMount /> : null
  }
  let arm = (_armed: boolean): void => { throw new Error('mountSeat(opener = true) renders the opener') }
  if (opener) {
    await act(async () => { runtime.slots.register({ name: 'sidebar-right.test.opener' }, Opener) })
    const openerView = runtime.renderSlot('sidebar-right.test.opener', { armed: false }, { session: reference })
    arm = (armed) => { openerView.update({ armed }) }
  }
  const bodies = new Map<string, SidebarRightTabInfo>()
  const titles = new Map<string, SidebarRightTabInfo>()
  const hooks = new Map<string, PropsRuntime<'sidebar.right.pane.tab'>['useTabInfo']>()
  let mounts = 0
  function Body(props: PropsRuntime<'sidebar.right.pane.tab'>) {
    const info = props.useTabInfo()
    const [instance] = useState(() => ++mounts)
    bodies.set(info.tab.id, info)
    hooks.set(info.tab.id, props.useTabInfo)
    expect(['tabInfo', 'tab', 'paneId', 'visible', 'navigation', 'signal', 'tabActions'].filter(key => key in props)).toEqual([])
    return <span data-tab-body={info.tab.id} data-instance={instance} data-revision={info.tab.navigation.revision} />
  }
  function Title({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
    const info = useTabInfo()
    titles.set(info.tab.id, info)
    return <span data-tab-title={info.tab.id}>{info.tab.title}</span>
  }
  await act(async () => {
    runtime.ctx.sidebarRightTabs.register({
      id: 'test/text', kind: 'text', priority: 'builtin', patterns: ['dsh-resource://file/**'],
      title: address => address.slice(address.lastIndexOf('/') + 1),
      keepMounted,
      guide: Array.from({ length: entryCount }, (_, order) => ({ id: String(order), order, title: () => 'Test', description: () => 'Test page' })),
    })
    runtime.slots.register({ name: 'sidebar.right.pane.tab', key: 'test/text' }, Body)
    runtime.slots.register({ name: 'sidebar.right.pane.tab.title', key: 'test/text' }, Title)
  })
  const view = runtime.renderSlot('rightbar', { width: 420, viewportWidth, canShow, collapsePreview: false })
  const registerPage = (kind: string, multiple = false): void => {
    runtime.ctx.sidebarRightTabs.register({ id: `test/${kind}`, kind, multiple, title: () => kind })
    runtime.slots.register({ name: 'sidebar.right.pane.tab', key: `test/${kind}` }, Body)
  }
  const instance = runtime.storeOf('rightbar.session', reference) as ReturnType<ReturnType<typeof createSidebarRightStore>['create']>
  const controller = runtime.ctx.sidebarRight
  const layout = () => instance.getSnapshot().bySession[SESSION]!.layout
  const open = (name = 'a.txt', options?: Parameters<typeof controller.openResource>[1]) => {
    act(() => { controller.openResource(`dsh-resource://file/session/s-test/${name}`, options) })
    return controller.active()!
  }
  const selectSession = (id: SessionId): void => {
    const next = runtime.sessions.retainFor(runtime.ctx, id, { source: 'mainView' })
    reference.release()
    reference = next
  }
  return {
    runtime, feature, controller, instance, actions: instance.actions, layout,
    open, selectSession, frame, pin, bodies, titles, hooks, view, arm, opened, registerPage, catalog,
  }
}

function element(container: HTMLElement, selector: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(selector)
  if (node === null) throw new Error(`expected ${selector}`)
  return node
}

describe('RightbarSeat presentation', () => {
  it('keeps a background retained body through standard-source registration and removal', async () => {
    const h = await mountSeat(1440, true, 0, false, true)
    const tab = h.open('retained.txt')
    const body = element(h.view.container, `[data-tab-body="${tab.id}"]`)
    await act(async () => { await h.runtime.sessions.add({ id: OTHER }) })
    act(() => { h.selectSession(OTHER) })
    expect(body.isConnected).toBe(true)
    let withdraw = () => {}
    act(() => {
      withdraw = h.runtime.ctx.uiSession.provide({
        props: ['sidebarRetentionProbe'],
        resolve: () => ({ props: { sidebarRetentionProbe: true } }),
      })
    })
    expect(element(h.view.container, `[data-tab-body="${tab.id}"]`)).toBe(body)
    act(withdraw)
    expect(element(h.view.container, `[data-tab-body="${tab.id}"]`)).toBe(body)
    act(() => { h.selectSession(SESSION) })
    expect(element(h.view.container, `[data-tab-body="${tab.id}"]`)).toBe(body)
    expect(h.bodies.get(tab.id)?.tab.signal.aborted).toBe(false)
  })

  it('releases the departing editable selection while retaining its draft', async () => {
    const h = await mountSeat()
    act(() => { h.registerPage('files') })
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    editor.textContent = 'unsent draft'
    // jsdom does not implement the browser's inherited contenteditable flag.
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    h.view.container.append(editor)
    editor.focus()
    const selection = document.getSelection()!
    selection.selectAllChildren(editor)
    selection.collapseToEnd()
    act(() => { h.controller.openTabFromTarget('files', h.controller.commandTarget()!) })
    expect(document.activeElement?.hasAttribute('data-dockkit-float')).toBe(true)
    expect(editor.contains(selection.anchorNode)).toBe(false)
    expect(editor.textContent).toBe('unsent draft')
  })

  it.each(['macos', 'windows'] as const)('keeps %s close commands on newly opened, revealed and replaced pages', async (platform) => {
    const h = await mountSeat()
    act(() => { h.registerPage('browser', true); h.registerPage('files'); h.registerPage('terminal', true) })
    const registry = new ShortcutRegistry('desktop', platform)
    const closeWindow = vi.fn()
    h.runtime.ctx.effect(() => registerSidebarShortcuts({ register: command => registry.register(command),
      runtime: 'desktop' }, h.controller, h.runtime.ctx.locale.bind('sidebarRight'), closeWindow))
    const focusedPane = () => document.activeElement?.getAttribute('data-dockkit-pane')
      ?? document.activeElement?.getAttribute('data-dockkit-float')
    const close = (): void => {
      act(() => { registry.dispatch({ code: 'KeyW', meta: platform === 'macos', control: platform === 'windows',
        alt: false, shift: false, repeat: false, composing: false, defaultPrevented: false },
      { target: document.activeElement, region: 'page', modal: null }, vi.fn()) })
    }
    const composer = document.createElement('textarea')
    h.view.container.append(composer)
    composer.focus()
    // Opens land on the canvas: the new float takes focus.
    act(() => { h.controller.openTabFromTarget('browser', h.controller.commandTarget()!) })
    expect(focusedPane()).toBe(h.layout().activePaneId)
    close()
    expect(Object.values(h.layout().tabs).map(tab => tab.kind)).toEqual(['guide'])
    expect(closeWindow).not.toHaveBeenCalled()
    act(() => { h.controller.openTabFromTarget('browser', h.controller.commandTarget()!) })
    expect(Object.values(h.layout().tabs).map(tab => tab.kind)).toEqual(['browser'])
    expect(focusedPane()).toBe(h.layout().activePaneId)
    const input = document.createElement('input')
    element(h.view.container, '[data-tab-body]').append(input)
    input.focus()
    // `browser` stacks: the reopen floats a second copy, retiring the first's body.
    act(() => { h.controller.openTabFromTarget('browser', h.controller.commandTarget()!) })
    expect(input.isConnected).toBe(false)
    expect(focusedPane()).toBe(h.layout().activePaneId)
    close()
    expect(Object.values(h.layout().tabs).map(tab => tab.kind)).toEqual(['browser'])
    act(() => { h.controller.openTabFromTarget('files', h.controller.commandTarget()!) })
    const files = h.controller.active()!
    act(() => { h.controller.openTabFromTarget('browser', h.controller.commandTarget()!) })
    act(() => { h.controller.openTabFromTarget('files', h.controller.commandTarget()!) })
    expect(h.controller.active()?.id).toBe(files.id)
    expect(focusedPane()).toBe(h.layout().activePaneId)
    const float = document.querySelector<HTMLElement>(`[data-dockkit-float="${findTabPane(h.layout(), files.id).id}"]`)!
    float.focus()
    act(() => { h.controller.openTabFromTarget('files', h.controller.commandTarget()!) })
    expect(focusedPane()).toBe(float.dataset.dockkitFloat)
    act(() => { h.controller.openTabFromTarget('terminal', h.controller.commandTarget()!) })
    expect(document.activeElement?.hasAttribute('data-dockkit-float')).toBe(true)
    expect(h.controller.active()?.kind).toBe('terminal')
    close()
    expect(h.layout().tabs[files.id]).toBeDefined()
    expect(closeWindow).not.toHaveBeenCalled()
    const outside = document.createElement('input')
    h.view.container.append(outside)
    outside.focus()
    close()
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('focuses the float an open lands on', async () => {
    const h = await mountSeat()
    h.open()
    expect(document.activeElement?.getAttribute('data-dockkit-float')).toBe(h.layout().floats.at(-1))
  })

  it('leaves canvas focus alone across drawer collapse and expansion', async () => {
    const h = await mountSeat()
    h.open()
    const floating = element(h.view.container, '[data-dockkit-float]')
    floating.focus()
    // The drawer is navigation: collapsing it never touches the canvas.
    act(() => { h.controller.toggleExpanded() })
    expect(document.activeElement).toBe(floating)
    act(() => { h.controller.toggleExpanded() })
    expect(document.activeElement).toBe(floating)
  })

  it('keeps a covered float mounted and refocuses it when the top one closes', async () => {
    const h = await mountSeat(1440, true, 0, false, true)
    const tab = h.open()
    const input = document.createElement('input')
    document.querySelector<HTMLElement>('[data-tab-body]')!.append(input)
    input.focus()
    const second = h.open('b.txt')
    const firstPane = findTabPane(h.layout(), tab.id).id
    // The covered pane hides but its retained body — and its input — survive.
    expect(h.view.container.querySelector(`[data-dockkit-float="${firstPane}"]`)?.hasAttribute('hidden')).toBe(true)
    expect(input.isConnected).toBe(true)
    act(() => { h.controller.close(second.id) })
    expect(document.activeElement?.getAttribute('data-dockkit-float')).toBe(firstPane)
  })

  it('hides for a global main panel and retains the Session sidebar state', async () => {
    const h = await mountSeat()
    h.open('retained.txt')
    const retained = h.layout()
    act(() => { h.runtime.panelInfo.set({ activePanelId: 'other-panel' as MainPanelId }) })
    expect(element(h.view.container, '[data-sidebar-right-session]').hidden).toBe(true)
    expect(h.frame.closeRightbar).toHaveBeenCalled()
    expect(h.layout()).toBe(retained)
    act(() => { h.runtime.panelInfo.set({ activePanelId: null }) })
    expect(h.view.container.querySelector('[data-sidebar-right-panel]')).not.toBeNull()
    expect(h.layout()).toBe(retained)
  })

  it('publishes the canvas before the mount announcement, so mounted listeners see the incoming session', async () => {
    const h = await mountSeat()
    h.open('seen.txt')
    // A mounted listener reads the canvas observable in its callback — the
    // virgin-mount seeding decision among them. Announcing the binding with
    // the canvas still reading the previous session parks a restored canvas
    // (the page-back regression).
    const seen: (string | undefined)[] = []
    const unsubscribe = h.controller.mounted.subscribe(() => { seen.push(h.controller.canvas.getSnapshot()?.kind) })
    act(() => { h.runtime.panelInfo.set({ activePanelId: 'other-panel' as MainPanelId }) })
    act(() => { h.runtime.panelInfo.set({ activePanelId: null }) })
    unsubscribe()
    expect(seen.at(-1)).toBe('text')
  })

  it('offers a reopen control for a parked canvas in both rail and expanded chrome', async () => {
    const h = await mountSeat()
    h.open('kept.txt')
    act(() => { h.actions.setCanvasParked(SESSION, true) })
    // Collapsed panel: the rail keeps the parked canvas reachable.
    const rail = h.view.container.querySelector<HTMLElement>('[data-sidebar-right-canvas-unpark]')
    expect(rail).not.toBeNull()
    fireEvent.click(rail!)
    expect(h.instance.getSnapshot().bySession[SESSION]!.canvasParked).toBe(false)
    // Expanded panel: the header carries the same control beside collapse.
    act(() => { h.actions.setCanvasParked(SESSION, true); h.actions.setExpanded(SESSION, true) })
    const head = h.view.container.querySelector<HTMLElement>('[data-sidebar-right-canvas-unpark]')
    expect(head).not.toBeNull()
    fireEvent.click(head!)
    expect(h.instance.getSnapshot().bySession[SESSION]!.canvasParked).toBe(false)
  })

  it('keeps the canvas claim across a retained surface hiding and return without any report', async () => {
    const h = await mountSeat()
    h.open('kept.txt')
    expect(h.controller.canvasClaims.claim(SESSION)).toBe('right')
    // Parking releases the region while the floats survive; any open lifts it.
    act(() => { h.actions.setCanvasParked(SESSION, true) })
    expect(h.controller.canvasClaims.claim(SESSION)).toBeNull()
    act(() => { h.actions.setCanvasParked(SESSION, false) })
    expect(h.controller.canvasClaims.claim(SESSION)).toBe('right')
    // A global panel hides the seat. The claim is surface state, not a report,
    // so it survives the hide and the return (the page-back regression) — the
    // frame re-derives the canvas track from it the moment the panel is shown.
    act(() => { h.runtime.panelInfo.set({ activePanelId: 'other-panel' as MainPanelId }) })
    expect(h.controller.canvasClaims.claim(SESSION)).toBe('right')
    act(() => { h.runtime.panelInfo.set({ activePanelId: null }) })
    expect(h.controller.canvasClaims.claim(SESSION)).toBe('right')
    expect(h.view.container.querySelector('[data-sidebar-right-canvas-host]')).not.toBeNull()
    // The member-sort swap commits through the surface's own side field.
    act(() => { h.actions.setCanvasSide(SESSION, 'left') })
    expect(h.controller.canvasClaims.claim(SESSION)).toBe('left')
    expect(h.controller.canvasClaims.claim(OTHER)).toBeNull()
    expect(h.controller.canvasClaims.claim(null)).toBeNull()
  })

  it('publishes the mounted seat so a Conversation opener acts in the commit that returns from a global panel', async () => {
    const h = await mountSeat(1440, true, 0, true)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(h.controller.mounted.getSnapshot()).toBe(SESSION)
    // Armed while the seat is already bound: the ordinary case.
    act(() => { h.arm(true) })
    expect(h.opened).toHaveLength(1)
    expect(Object.values(h.layout().tabs).map(tab => tab.contentId)).toEqual(h.opened)
    // A global panel hides the Sidebar and releases its public navigation binding.
    act(() => { h.runtime.panelInfo.set({ activePanelId: 'other-panel' as MainPanelId }) })
    expect(element(h.view.container, '[data-sidebar-right-session]').hidden).toBe(true)
    expect(h.controller.mounted.getSnapshot()).toBeUndefined()
    // The opener waits until the foreground seat republishes its navigation binding.
    act(() => { h.runtime.panelInfo.set({ activePanelId: null }) })
    expect(h.controller.mounted.getSnapshot()).toBe(SESSION)
    expect(h.opened).toHaveLength(2)
    expect(Object.values(h.layout().tabs).map(tab => tab.contentId)).toEqual(h.opened)
    expect(h.controller.active()?.contentId).toBe(h.opened[1])
    expect(errors.mock.calls.map(call => String(call[0])).filter(text => text.includes('slot entry crashed'))).toEqual([])
    expect(document.querySelector('[data-slot-error]')).toBeNull()
  })

  it.each([0, 1, 2])('selects the default from %i guide entries and protects only a sole guide', async (entryCount) => {
    const h = await mountSeat(1440, true, entryCount)
    act(() => { h.controller.toggleExpanded() })
    const initial = Object.values(h.layout().tabs)[0]!
    expect(initial.kind).toBe(entryCount === 1 ? 'text' : 'guide')
    if (entryCount !== 1) {
      // The sole docked guide is protected: closing it changes nothing.
      const before = h.layout()
      act(() => { h.controller.close(initial.id) })
      expect(h.layout()).toBe(before)
      return
    }
    act(() => { h.controller.close(initial.id) })
    expect(h.layout().expanded).toBe(false)
    // The close leaves the layout empty; the next expansion reseeds.
    expect(Object.keys(h.layout().tabs)).toHaveLength(0)
    act(() => { h.controller.toggleExpanded() })
    const reseeded = Object.values(h.layout().tabs)[0]!
    expect(reseeded.kind).toBe('text')
    expect(reseeded.id).not.toBe(initial.id)
    // A guide page opens onto the canvas beside the docked seed.
    act(() => { h.controller.openTab('guide') })
    const guide = Object.values(h.layout().tabs).find(tab => tab.kind === 'guide')!
    expect(findTabPane(h.layout(), guide.id).host).toBe('float')
    // A floating guide is just a page: it closes like any other canvas tab.
    act(() => { h.controller.close(guide.id) })
    expect(h.layout().tabs[guide.id]).toBeUndefined()
    const preview = h.open('ordinary.txt')
    expect(h.view.container.querySelector(`[data-sidebar-right-canvas-close="${preview.id}"]`)).not.toBeNull()
    act(() => { h.controller.close(preview.id) })
    expect(h.layout().tabs[preview.id]).toBeUndefined()
    expect(Object.keys(h.layout().tabs)).toEqual([reseeded.id])
  })

  it('closes the top canvas page from its own chrome while the docked root reseeds', async () => {
    const h = await mountSeat()
    const floating = h.open('floating.txt')
    const close = document.querySelector<HTMLButtonElement>(`[data-sidebar-right-canvas-close="${floating.id}"]`)
    expect(close).not.toBeNull()

    fireEvent.click(close!)

    expect(h.layout().tabs[floating.id]).toBeUndefined()
    expect(h.layout().floats).toHaveLength(0)
    expect(getPane(h.layout(), h.layout().rootId).tabs).toHaveLength(1)
  })

  it('keeps the panel mounted while collapsed and releases the frame on unmount', async () => {
    const h = await mountSeat()
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    expect(panel.hasAttribute('data-sidebar-right-open')).toBe(false)
    // The collapsed panel draws its icon rail and keeps a narrow track.
    expect(panel.hasAttribute('data-sidebar-right-rail')).toBe(true)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, true)
    h.open()
    expect(element(h.view.container, '[data-sidebar-right-panel]')).toBe(panel)
    expect(panel.hasAttribute('data-sidebar-right-open')).toBe(true)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, false)
    await h.runtime.dispose()
    expect(h.frame.closeRightbar).toHaveBeenCalled()
  })

  it('keeps the product zone in the rail and opens feature pages beside the collapsed column', async () => {
    const h = await mountSeat(1440, true, 2)
    await act(async () => {
      h.runtime.slots.register({ name: 'sidebar.right.pane.top' }, ({ rail }: PropsRuntime<'sidebar.right.pane.top'>) => (
        <span data-top-zone data-rail={rail} />
      ))
    })
    // Collapsed: the rail carries the zone's icon form, marked for it.
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    expect(panel.hasAttribute('data-sidebar-right-rail')).toBe(true)
    expect(element(h.view.container, '[data-top-zone]').dataset.rail).toBe('true')
    // A feature icon opens its kind on the canvas without unfolding the column.
    const icon = h.view.container.querySelector<HTMLElement>('[data-sidebar-right-panel] button[aria-label="Test"]')
    expect(icon).not.toBeNull()
    fireEvent.click(icon!)
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().floats).toHaveLength(1)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, true)
    act(() => { h.actions.setExpanded(SESSION, true) })
    expect(element(h.view.container, '[data-top-zone]').dataset.rail).toBe('false')
  })

  it('fills the viewport without replacing the content tree or releasing the wide track', async () => {
    const h = await mountSeat()
    const tab = h.open()
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    const body = element(h.view.container, '[data-tab-body]')
    expect(panel.style.width).toBe('420px')
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(h.layout().mode).toBe('fullscreen')
    expect(panel.style.width).toBe('100vw')
    expect(panel.dataset['sidebarRightPanel']).toBe('fullscreen')
    expect(element(h.view.container, '[data-tab-body]')).toBe(body)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, true, false)
    expect(h.bodies.get(tab.id)?.sidebar).toEqual({ expanded: true, fullscreen: true })
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(panel.style.width).toBe('420px')
    expect(element(h.view.container, '[data-tab-body]')).toBe(body)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, false)
    fireEvent.click(element(h.view.container, '[data-sidebar-right-toggle]'))
    expect(h.layout().expanded).toBe(false)
    // Collapse shrinks the panel to its icon rail — still a track claim, at the
    // rail width, with the canvas held for its exit slide.
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, true)
  })

  it('derives narrow fullscreen without recording mode and returns to normal when widened', async () => {
    const h = await mountSeat(767, false)
    h.open()
    expect(h.layout().mode).toBe('push')
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(false, true, false)
    const stored = h.instance.getSnapshot()
    const body = element(h.view.container, '[data-tab-body]')
    h.view.update({ width: 420, viewportWidth: 768, canShow: true, collapsePreview: false })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(element(h.view.container, '[data-tab-body]')).toBe(body)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, false)
  })

  it('closes on automatic fullscreen exit and stays closed after widening', async () => {
    const h = await mountSeat(500, false)
    const tab = h.open()
    const signal = h.bodies.get(tab.id)!.tab.signal
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().mode).toBe('push')
    const stored = h.instance.getSnapshot()
    h.view.update({ width: 420, viewportWidth: 1440, canShow: true, collapsePreview: false })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(h.layout().tabs[tab.id]).toBeDefined()
    expect(signal.aborted).toBe(false)
    expect(h.layout().expanded).toBe(false)
  })

  it('preserves manual fullscreen through narrow and wide viewport changes', async () => {
    const h = await mountSeat()
    h.open()
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    const stored = h.instance.getSnapshot()
    h.view.update({ width: 420, viewportWidth: 500, canShow: false, collapsePreview: false })
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(false, true, false)
    h.view.update({ width: 420, viewportWidth: 1440, canShow: true, collapsePreview: false })
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, true, false)
    expect(h.instance.getSnapshot()).toBe(stored)
  })

  it('collapses a normal panel that cannot fit without clearing records or reopening on growth', async () => {
    const h = await mountSeat()
    const tab = h.open()
    const signal = h.bodies.get(tab.id)!.tab.signal
    h.view.update({ width: 420, viewportWidth: 900, canShow: false, collapsePreview: false })
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().tabs[tab.id]).toBeDefined()
    expect(signal.aborted).toBe(false)
    const stored = h.instance.getSnapshot()
    h.view.update({ width: 420, viewportWidth: 1440, canShow: true, collapsePreview: false })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(h.layout().expanded).toBe(false)
  })
})

describe('RightbarSeat fullscreen entry', () => {
  it('retains the previous report until its transform finishes, then leaves the track in place on exit', async () => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    const slide = transition()
    const unrelated = transition('opacity')
    vi.spyOn(panel, 'getAnimations').mockReturnValue([slide.animation, unrelated.animation])
    // Mount reports the rail; clear so only the fullscreen entry remains.
    h.frame.closeRightbar.mockClear()
    h.frame.openRightbar.mockClear()
    h.open()
    expect(panel.hasAttribute('data-sidebar-right-open')).toBe(true)
    expect(panel.dataset['sidebarRightPanel']).toBe('fullscreen')
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    expect(h.frame.closeRightbar).not.toHaveBeenCalled()
    await act(async () => { slide.finish(); await slide.animation.finished })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(true, true, false)
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false, false)
    unrelated.finish()
  })

  it('reports immediately without a transform transition, including zero-duration and reduced-motion entry', async () => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const unrelated = transition('opacity')
    const ended = transition()
    ended.finish()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations')
      .mockReturnValue([unrelated.animation, ended.animation])
    h.frame.openRightbar.mockClear()
    h.open()
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(true, true, false)
    unrelated.finish()
  })

  it('reports when reduced motion cancels the entering transition', async () => {
    const h = await mountSeat(767, false)
    const slide = transition()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations').mockReturnValue([slide.animation])
    h.frame.openRightbar.mockClear()
    h.open()
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    await act(async () => { slide.cancel(); await Promise.allSettled([slide.animation.finished]) })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(false, true, false)
  })

  it('waits for a replacement transform after cancellation', async () => {
    const h = await mountSeat(767, false)
    const first = transition()
    const replacement = transition()
    const animations = vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations')
      .mockReturnValue([first.animation])
    h.frame.openRightbar.mockClear()
    h.open()
    animations.mockReturnValue([replacement.animation])
    await act(async () => { first.cancel(); await Promise.allSettled([first.animation.finished]) })
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    await act(async () => { replacement.finish(); await replacement.animation.finished })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(false, true, false)
  })

  it.each(['close', 'push', 'session', 'unmount'])('ignores a late completion after %s', async (change) => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const slide = transition()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations').mockReturnValue([slide.animation])
    h.frame.openRightbar.mockClear()
    h.open()
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    if (change === 'close') fireEvent.click(element(h.view.container, '[data-sidebar-right-toggle]'))
    else if (change === 'push') fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    else if (change === 'session') {
      await h.runtime.sessions.add({ id: OTHER })
      act(() => { h.selectSession(OTHER) })
      act(() => { h.controller.openResource('dsh-resource://file/session/s-other/b.txt') })
    } else await h.runtime.dispose()
    const openCalls = [...h.frame.openRightbar.mock.calls]
    const closeCalls = h.frame.closeRightbar.mock.calls.length
    await act(async () => { slide.finish(); await slide.animation.finished })
    expect(h.frame.openRightbar.mock.calls).toEqual(openCalls)
    expect(h.frame.closeRightbar).toHaveBeenCalledTimes(closeCalls)
  })

  it('uses the current viewport report when entry crosses the fullscreen breakpoint', async () => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const slide = transition()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations').mockReturnValue([slide.animation])
    h.frame.openRightbar.mockClear()
    h.open()
    h.view.update({ width: 420, viewportWidth: 500, canShow: false, collapsePreview: false })
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    await act(async () => { slide.finish(); await slide.animation.finished })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(false, true, false)
  })

  it('does not delay normal presentation behind its slide', async () => {
    const h = await mountSeat()
    const slide = transition()
    const animations = vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations')
      .mockReturnValue([slide.animation])
    h.frame.openRightbar.mockClear()
    h.open()
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(true, false, false)
    expect(animations).not.toHaveBeenCalled()
    slide.finish()
  })
})

describe('slot-owned useTabInfo', () => {
  it('updates body and title navigation with no layout commit and retains the bound hook', async () => {
    const h = await mountSeat()
    const tab = h.open('a.txt', { params: { line: 3 } })
    const stored = h.instance.getSnapshot()
    const hook = h.hooks.get(tab.id)
    const signal = h.bodies.get(tab.id)!.tab.signal
    act(() => { h.controller.tabDomain.navigate(SESSION, tab.id, { address: tab.contentId, params: { line: 7 } }) })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(h.hooks.get(tab.id)).toBe(hook)
    expect(h.bodies.get(tab.id)?.tab.navigation).toEqual({ address: tab.contentId, params: { line: 7 }, revision: 2 })
    expect(h.titles.get(tab.id)?.tab.navigation).toBe(h.bodies.get(tab.id)?.tab.navigation)
    expect(h.bodies.get(tab.id)?.tab.signal).toBe(signal)
    expect(element(h.view.container, '[data-tab-body]').dataset['revision']).toBe('2')
  })

  it('isolates same-kind record state and reports which page tops the canvas', async () => {
    const h = await mountSeat()
    const topBody = (): HTMLElement => element(h.view.container, '[data-canvas-top] [data-tab-body]')
    const a = h.open('a.txt')
    const b = h.open('b.txt')
    // Every float's body mounts; only the stack top shows.
    expect(topBody().dataset['tabBody']).toBe(b.id)
    const bodyB = topBody()
    act(() => { h.actions.focusTab(SESSION, a.id) })
    const bodyA = topBody()
    expect(bodyA.dataset['instance']).not.toBe(bodyB.dataset['instance'])
    expect(bodyA.dataset['tabBody']).toBe(a.id)
    const signal = h.bodies.get(a.id)!.tab.signal
    // Collapsing the drawer does not cover the canvas: the float stays visible.
    act(() => { h.actions.setExpanded(SESSION, false) })
    expect(h.bodies.get(a.id)?.tab.visible).toBe(true)
    expect(topBody()).toBe(bodyA)
    expect(signal.aborted).toBe(false)
    // Docking takes the page off the canvas; the record and its signal survive.
    act(() => { h.controller.dock(findTabPane(h.layout(), a.id).id) })
    expect(findTabPane(h.layout(), a.id).host).toBe('dock')
    expect(h.bodies.get(a.id)?.tab.signal).toBe(signal)
  })

  it('keeps session records and navigation while unmounted, aborting only removal and plugin unload', async () => {
    const h = await mountSeat()
    const own = h.open()
    const info = h.bodies.get(own.id)!
    const stored = h.instance.getSnapshot()
    await h.runtime.sessions.add({ id: OTHER })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(info.tab.signal.aborted).toBe(false)
    act(() => { h.selectSession(OTHER) })
    act(() => { h.controller.openResource('dsh-resource://file/session/s-other/other.txt', { params: { line: 9 } }) })
    const otherTab = h.controller.active()!
    // OTHER is a brand-new Session: it inherits the left Session's drawer state
    // (契约 C9 新会话继承), so its ids need not line up with SESSION's. What must
    // hold is that records never cross Sessions.
    expect(otherTab.contentId).not.toBe(own.contentId)
    const otherInfo = h.bodies.get(otherTab.id)!
    expect(otherInfo.tab.signal).not.toBe(info.tab.signal)
    act(() => { info.tab.actions.openResource('dsh-resource://file/session/s-test/b.txt') })
    expect(Object.values(h.layout().tabs).map(tab => tab.title)).toContain('b.txt')
    expect(h.controller.active()?.contentId).toBe(otherTab.contentId)
    expect(h.bodies.get(otherTab.id)?.tab.navigation.params).toEqual({ line: 9 })
    act(() => { info.tab.actions.close() })
    expect(info.tab.signal.aborted).toBe(true)
    expect(otherInfo.tab.signal.aborted).toBe(false)
    const remaining = h.bodies.get(h.controller.active()!.id)!
    expect(remaining.tab.navigation.revision).toBe(1)
    await h.feature.dispose()
    expect(remaining.tab.signal.aborted).toBe(true)
    expect(otherInfo.tab.signal.aborted).toBe(true)
    expect(h.runtime.ctx.get('sidebarRight')).toBeUndefined()
  })

  it('updates guide replacements through the same hook and guide boxes through framework injection', async () => {
    const h = await mountSeat()
    // The first expansion seeds the guide the replacement renders over; the
    // docked seed is invisible, so it opens onto the canvas first.
    act(() => { h.controller.toggleExpanded() })
    act(() => { h.controller.openTab('guide') })
    let captured: SidebarRightTabInfo | undefined
    await act(async () => {
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/files', kind: 'files', title: () => 'Files',
        guide: [{ id: 'default', order: 1, title: () => 'Files' }],
      })
    })
    expect(h.view.container.querySelector('[data-sidebar-right-guide-entry="files"]')).not.toBeNull()
    await act(async () => {
      h.runtime.slots.register({ name: 'sidebar.right.tab.guide', select: () => true },
        ({ useTabInfo }: PropsRuntime<'sidebar.right.tab.guide'>) => {
          captured = useTabInfo()
          return <span data-guide-replacement={captured.tab.navigation.revision} />
        })
    })
    expect(h.view.container.querySelector('[data-sidebar-right-guide]')).toBeNull()
    expect(captured?.tab.kind).toBe('guide')
    act(() => { h.controller.openTab('guide') })
    const stored = h.instance.getSnapshot()
    const guide = h.controller.active()!
    act(() => { h.controller.tabDomain.navigate(SESSION, guide.id, { address: guide.contentId, params: undefined }) })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(captured?.tab.navigation.revision).toBe(3)
    expect(element(h.view.container, '[data-guide-replacement]').dataset['guideReplacement']).toBe('3')
    expect(captured?.sidebar.expanded).toBe(true)
  })

  it('follows type replacement and returns to the builtin when it leaves', async () => {
    const h = await mountSeat()
    h.open()
    let release = () => {}
    await act(async () => {
      release = h.runtime.ctx.sidebarRightTabs.register({ id: 'extension/text', kind: 'text', title: () => 'Extension' })
      h.runtime.slots.register({ name: 'sidebar.right.pane.tab', key: 'extension/text' },
        ({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) => <b data-extension>{useTabInfo().tab.title}</b>)
    })
    expect(element(h.view.container, '[data-extension]').textContent).toBe('a.txt')
    await act(async () => { release() })
    expect(h.view.container.querySelector('[data-extension]')).toBeNull()
    expect(h.view.container.querySelector('[data-tab-body]')).not.toBeNull()
  })

  it('renders unavailable kinds and keeps menu tab/dismiss arguments', async () => {
    const h = await mountSeat()
    let menu: SidebarRightTabMenuOwnerProps | undefined
    await act(async () => {
      h.runtime.slots.register({ name: 'sidebar.right.tab.menu.item', id: 'test' },
        (props: PropsRuntime<'sidebar.right.tab.menu.item'>) => { menu = props; return null })
      h.actions.openContent(SESSION, { kind: 'missing', contentId: 'missing://content', title: 'Missing' }, () => {})
    })
    expect(h.view.container.querySelector('[data-sidebar-right-unavailable]')).not.toBeNull()
    const missing = Object.values(h.layout().tabs).find(tab => tab.kind === 'missing')!
    // The canvas chrome owns the page's context menu now that there is no strip.
    fireEvent.contextMenu(element(h.view.container, '[data-sidebar-right-canvas-chrome]'))
    expect(menu?.tab.id).toBe(missing.id)
    act(() => { menu?.dismiss() })
    expect(document.querySelector('[data-dockkit-tab-menu]')).toBeNull()
  })

  it('advertises configured pane and page-close controls', async () => {
    const h = await mountSeat()
    const entry = (id: string): ShortcutCatalogEntry => ({ id: id as ShortcutCommandId,
      label: id, aliases: [], binding: null, modified: true, conflicts: [], issue: null,
      keys: ['Ctrl', 'G'], aria: 'Control+G' })
    act(() => {
      h.catalog.set(['page.close', 'pane.fullscreen.toggle', 'sidebar.right.toggle'].map(entry))
      h.controller.toggleExpanded()
    })
    for (const selector of ['[data-sidebar-right-mode]', '[data-sidebar-right-toggle]']) {
      expect(element(h.view.container, selector).getAttribute('aria-keyshortcuts')).toBe('Control+G')
    }
  })

})

describe('intentsFor — the kit\'s gestures as one session\'s store actions', () => {
  it('binds every intent to the session, and asks the navigation face for a guide on add', () => {
    const actions = {
      focusTab: vi.fn(), focusPane: vi.fn(), splitPane: vi.fn(), closeTab: vi.fn(), duplicateTab: vi.fn(),
      floatTab: vi.fn(), unfloatPane: vi.fn(), placeTab: vi.fn(), dropTab: vi.fn(), moveFloat: vi.fn(),
      resizeFloat: vi.fn(), resizeSplit: vi.fn(),
    }
    const openTab = vi.fn()
    const intents = intentsFor(SESSION, actions as unknown as Parameters<typeof intentsFor>[1], openTab)
    const rect = { x: 1, y: 2, width: 300, height: 200 }
    const TAB_1 = 'tab-1' as TabId
    const PANE_1 = 'pane-1' as PaneId
    const PANE_2 = 'pane-2' as PaneId
    const SPLIT_1 = 'split-1' as SplitId
    intents.focusTab(TAB_1)
    intents.focusPane(PANE_1)
    intents.splitPane(PANE_1)
    intents.closeTab(TAB_1)
    intents.duplicateTab(TAB_1)
    intents.floatTab(TAB_1, rect)
    intents.unfloatPane(PANE_2)
    intents.placeTab(TAB_1, PANE_1, 0)
    intents.dropTab(TAB_1, PANE_1, 'right')
    intents.moveFloat(PANE_2, 30, 40)
    intents.resizeFloat(PANE_2, rect)
    intents.resizeSplit(SPLIT_1, [0.3, 0.7])
    expect(actions.focusTab).toHaveBeenCalledWith(SESSION, TAB_1)
    expect(actions.focusPane).toHaveBeenCalledWith(SESSION, PANE_1)
    expect(actions.splitPane).toHaveBeenCalledWith(SESSION, PANE_1)
    expect(actions.closeTab).toHaveBeenCalledWith(SESSION, TAB_1)
    expect(actions.duplicateTab).toHaveBeenCalledWith(SESSION, TAB_1)
    expect(actions.floatTab).toHaveBeenCalledWith(SESSION, TAB_1, rect)
    expect(actions.unfloatPane).toHaveBeenCalledWith(SESSION, PANE_2)
    expect(actions.placeTab).toHaveBeenCalledWith(SESSION, TAB_1, PANE_1, 0)
    expect(actions.dropTab).toHaveBeenCalledWith(SESSION, TAB_1, PANE_1, 'right')
    expect(actions.moveFloat).toHaveBeenCalledWith(SESSION, PANE_2, 30, 40)
    expect(actions.resizeFloat).toHaveBeenCalledWith(SESSION, PANE_2, rect)
    expect(actions.resizeSplit).toHaveBeenCalledWith(SESSION, SPLIT_1, [0.3, 0.7])
    // The add control is the guide opened by kind, in that pane, beside any guide elsewhere.
    intents.addTab(PANE_1)
    expect(openTab).toHaveBeenCalledWith('guide', { paneId: PANE_1, revealIfOpened: false })
  })
})

it('keeps a resource tab and reports a synchronous cleanup failure from its close button', async () => {
  const h = await mountSeat()
  const tab = h.open('terminal')
  const failure = new Error('process still running')
  const release = h.controller.registerCloseHandler('text', () => { throw failure })
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    fireEvent.click(element(h.view.container, `[data-sidebar-right-canvas-close="${tab.id}"]`))
    await expect.poll(() => logged.mock.calls).toEqual([['Sidebar tab close failed:', failure]])
    expect(h.layout().tabs[tab.id]).toBeDefined()
    release()
    fireEvent.click(element(h.view.container, `[data-sidebar-right-canvas-close="${tab.id}"]`))
    expect(h.layout().tabs[tab.id]).toBeUndefined()
  } finally {
    logged.mockRestore()
    release()
  }
})
