// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayoutStore } from '../src/client/stores.ts'
import type { MainPanelId } from '../src/client/service.ts'

beforeEach(() => { localStorage.clear(); vi.stubGlobal('innerWidth', 1920) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('createLayoutStore', () => {
  it('starts with the default sidebar and no right panel preference', () => {
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot()).toEqual({
      panelInfo: { activePanelId: null },
      layoutInfo: {
        sidebar: 280,
        viewportWidth: 1920,
        narrowExpanded: false,
        rightbar: null,
        unit: null,
        rightbarCollapsed: false,
        rightbarCollapsePreview: false,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarCanvas: null,
        rightbarRail: false,
        rightbarFullscreen: false,
        rightbarInstant: false,
      },
    })
  })

  it('persists column preferences and restores them in a later instance', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const a = createLayoutStore().create()
    a.actions.setSidebar(400)
    a.actions.openRightbar(true, false, null, false)
    a.actions.setRightbar(500)
    a.actions.setUnit(700)
    expect(write).toHaveBeenCalled()
    // A fresh store instance is a reload: it hydrates the saved geometry.
    const b = createLayoutStore().create()
    expect(b.store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 400, rightbar: 500, unit: 700 })
    localStorage.clear()
    const c = createLayoutStore().create()
    expect(c.store.getSnapshot().layoutInfo.sidebar).toBe(280)
    expect(c.store.getSnapshot().layoutInfo.rightbar).toBeNull()
  })

  it('clamps the sidebar to 264–420px', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(1)
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(264)
    actions.setSidebar(9999)
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(420)
  })

  it('toggles the wide sidebar between closed and default width', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.toggleSidebar()
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(0)
    actions.toggleSidebar()
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(280)
  })

  it('sets the sidebar collapsed state idempotently on wide and narrow frames', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setSidebarCollapsed(true)
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(0)
    const collapsed = store.getSnapshot()
    actions.setSidebarCollapsed(true)
    expect(store.getSnapshot()).toBe(collapsed)
    actions.setSidebarCollapsed(false)
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(280)

    actions.setSidebar(400)
    actions.setViewportWidth(980)
    actions.setSidebarCollapsed(false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 400, narrowExpanded: true })
    actions.setSidebarCollapsed(true)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 400, narrowExpanded: false })
  })

  it('keeps the sidebar preference while toggling its narrow override', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setViewportWidth(980)
    actions.toggleSidebar()
    expect(store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 400, viewportWidth: 980, narrowExpanded: true })
    actions.toggleSidebar()
    expect(store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 400, narrowExpanded: false })
  })

  it('clears the manual override only when crossing 1024px', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setViewportWidth(980)
    actions.toggleSidebar()
    actions.setViewportWidth(980)
    actions.setViewportWidth(1023)
    expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(true)
    actions.setViewportWidth(1024)
    expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(false)
    actions.setViewportWidth(980)
    expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(false)
  })
})

describe('main panel selection', () => {
  const panelA = 'panel-a' as MainPanelId
  const panelB = 'panel-b' as MainPanelId

  it('changes only panelInfo when switching panels and returning to the Conversation', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.openRightbar(true, true, null, false)
    actions.closeRightbar()
    const layoutInfo = store.getSnapshot().layoutInfo
    for (const activePanelId of [panelA, panelB, null]) {
      const previousPanelInfo = store.getSnapshot().panelInfo
      actions.selectPanel(activePanelId)
      expect(store.getSnapshot().panelInfo).toEqual({ activePanelId })
      expect(store.getSnapshot().panelInfo).not.toBe(previousPanelInfo)
      expect(store.getSnapshot().layoutInfo).toBe(layoutInfo)
    }
  })

  it('keeps the complete snapshot when selecting the current panel again', () => {
    const { store, actions } = createLayoutStore().create()
    actions.selectPanel(panelA)
    const selected = store.getSnapshot()
    actions.selectPanel(panelA)
    expect(store.getSnapshot()).toBe(selected)
    expect(store.getSnapshot().panelInfo.activePanelId).toBe(panelA)
  })

  it('returns to the Conversation only when the selected main registration disappears', () => {
    const { store, actions } = createLayoutStore().create()
    const initial = store.getSnapshot()
    actions.retainMainPanels([])
    expect(store.getSnapshot()).toBe(initial)
    actions.selectPanel(panelA)
    const selected = store.getSnapshot()
    actions.retainMainPanels(['conversation', panelA, panelB])
    expect(store.getSnapshot()).toBe(selected)
    actions.retainMainPanels(['conversation', panelB])
    expect(store.getSnapshot().panelInfo).toEqual({ activePanelId: null })
    expect(store.getSnapshot().layoutInfo).toBe(selected.layoutInfo)
  })

  it.each(['setSidebar', 'toggleSidebar', 'setViewportWidth', 'setRightbar', 'setUnit', 'openRightbar', 'closeRightbar'] as const)(
    'preserves panelInfo identity when %s changes layoutInfo', (action) => {
      const { store, actions } = createLayoutStore().create()
      actions.selectPanel(panelA)
      if (action === 'closeRightbar') actions.openRightbar(true, true, null, false)
      const previous = store.getSnapshot()
      switch (action) {
        case 'setSidebar': actions.setSidebar(400); break
        case 'toggleSidebar': actions.toggleSidebar(); break
        case 'setViewportWidth': actions.setViewportWidth(980); break
        case 'setRightbar': actions.setRightbar(500); break
        case 'setUnit': actions.setUnit(500); break
        case 'openRightbar': actions.openRightbar(true, true, null, false); break
        case 'closeRightbar': actions.closeRightbar(); break
      }
      expect(store.getSnapshot().panelInfo).toBe(previous.panelInfo)
      expect(store.getSnapshot().layoutInfo).not.toBe(previous.layoutInfo)
    },
  )
})

describe('right panel', () => {
  it('initializes at the contract width only on first opening', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setViewportWidth(1000)
    expect(store.getSnapshot().layoutInfo.rightbar).toBeNull()
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(340)
    actions.setViewportWidth(2000)
    actions.openRightbar(true, true, null, false)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(340)
    actions.closeRightbar()
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(340)
  })

  it('keeps track and fullscreen reports independent and clears both on close', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: true, rightbarTrack: true, rightbarFullscreen: false })
    actions.openRightbar(true, true, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: true, rightbarTrack: true, rightbarFullscreen: true })
    actions.openRightbar(false, true, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: true, rightbarTrack: false, rightbarFullscreen: true })
    actions.closeRightbar()
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: false, rightbarTrack: false, rightbarFullscreen: false })
  })

  it('keeps dragged px preferences across resize, close, and reopen', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, false, null, false)
    actions.setRightbar(1100)
    actions.setViewportWidth(800)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(1100)
    actions.closeRightbar()
    actions.openRightbar(false, true, null, false)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(1100)
  })

  it('clamps drag preferences to 96px and 70% of the current frame', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setViewportWidth(1600)
    actions.setRightbar(9999)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(1120)
    actions.setViewportWidth(1000)
    actions.setRightbar(9999)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(700)
    actions.setRightbar(96)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(96)
  })

  it('arms the collapse preview below the floor and folds only on settle', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, false, null, false)
    actions.setRightbar(400)
    actions.setRightbar(1)
    // Held below the floor: the preview is armed but the panel still stands.
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbar: 400, rightbarCollapsed: false, rightbarCollapsePreview: true })
    actions.settleRightbar()
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbar: 400, rightbarCollapsed: true, rightbarCollapsePreview: false })
    // A rail report keeps the request; the expanded report clears it and the
    // preserved preference returns.
    actions.openRightbar(true, false, null, true)
    expect(store.getSnapshot().layoutInfo.rightbarCollapsed).toBe(true)
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbar: 400, rightbarCollapsed: false })
    // Pulling back above the floor before release disarms the preview.
    actions.setRightbar(220)
    actions.setRightbar(1)
    actions.setRightbar(300)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbar: 300, rightbarCollapsed: false, rightbarCollapsePreview: false })
    actions.settleRightbar()
    expect(store.getSnapshot().layoutInfo.rightbarCollapsed).toBe(false)
  })

  it('clamps the saved unit column width between the canvas floor and the centre share', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setViewportWidth(1600)
    actions.setUnit(1)
    expect(store.getSnapshot().layoutInfo.unit).toBe(280)
    actions.setUnit(9999)
    expect(store.getSnapshot().layoutInfo.unit).toBe(1200)
    actions.setViewportWidth(700)
    actions.setUnit(9999)
    expect(store.getSnapshot().layoutInfo.unit).toBe(300)
    actions.setViewportWidth(1600)
    actions.setUnit(640)
    expect(store.getSnapshot().layoutInfo.unit).toBe(640)
  })

  it('retains a minimum normal preference when first opened fullscreen on a phone', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setViewportWidth(320)
    actions.openRightbar(false, true, null, false)
    expect(store.getSnapshot().layoutInfo.rightbar).toBe(224)
  })

  it('collapses a manually expanded narrow sidebar on opening, not presentation reports', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setViewportWidth(800)
    actions.toggleSidebar()
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 400, narrowExpanded: false })
    actions.toggleSidebar()
    actions.openRightbar(true, true, null, false)
    expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(true)
    actions.closeRightbar()
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(false)
  })

  it('keeps the wide sidebar preference and never opens a closed right panel on resize', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(420)
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo.sidebar).toBe(420)
    actions.closeRightbar()
    actions.setViewportWidth(3000)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ sidebar: 420, rightbarShown: false, rightbarTrack: false })
  })
})

describe('right panel instant geometry', () => {
  it.each([true, false])('closes fullscreen with track=%s in one instant update and retains repeated close reports', (track) => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(track, true, null, false)
    actions.closeRightbar()
    expect(store.getSnapshot().layoutInfo).toMatchObject({
      rightbarShown: false, rightbarTrack: false, rightbarFullscreen: false, rightbarInstant: true,
    })
    const closed = store.getSnapshot()
    actions.closeRightbar()
    expect(store.getSnapshot()).toBe(closed)
  })

  it('restores the normal track instantly, retaining the marker on an identical report', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, true, null, false)
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({
      rightbarShown: true, rightbarTrack: true, rightbarFullscreen: false, rightbarInstant: true,
    })
    const restored = store.getSnapshot()
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot()).toBe(restored)
    actions.openRightbar(false, false, null, false)
    expect(store.getSnapshot().layoutInfo.rightbarInstant).toBe(false)
  })

  it('allows a normal close to animate, including after restoring from fullscreen', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, false, null, false)
    actions.closeRightbar()
    expect(store.getSnapshot().layoutInfo.rightbarInstant).toBe(false)
    actions.openRightbar(true, true, null, false)
    actions.openRightbar(true, false, null, false)
    expect(store.getSnapshot().layoutInfo.rightbarInstant).toBe(true)
    actions.closeRightbar()
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbarTrack: false, rightbarInstant: false })
  })

  it.each(['setSidebar', 'toggleSidebar', 'setRightbar', 'setUnit', 'setViewportWidth'] as const)('clears instant geometry on %s', (action) => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, true, null, false)
    actions.closeRightbar()
    expect(store.getSnapshot().layoutInfo.rightbarInstant).toBe(true)
    if (action === 'toggleSidebar') actions.toggleSidebar()
    else actions[action](action === 'setViewportWidth' ? 1800 : 350)
    expect(store.getSnapshot().layoutInfo.rightbarInstant).toBe(false)
    actions.closeRightbar()
    expect(store.getSnapshot().layoutInfo.rightbarInstant).toBe(false)
  })

  it('does not let an unchanged frame measurement reset the fullscreen-exit marker', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, true, null, false)
    actions.closeRightbar()
    const closed = store.getSnapshot()
    actions.setViewportWidth(closed.layoutInfo.viewportWidth)
    expect(store.getSnapshot()).toBe(closed)
  })

  it.each([true, false])('clears the exit marker on a fresh opening with fullscreen=%s', (fullscreen) => {
    const { store, actions } = createLayoutStore().create()
    actions.openRightbar(true, true, null, false)
    actions.closeRightbar()
    actions.openRightbar(true, fullscreen, null, false)
    expect(store.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: true, rightbarFullscreen: fullscreen, rightbarInstant: false })
  })
})
