import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import type { LiveSessionGeometry, MainPanelId, PanelActions } from '../src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    selectPanel: vi.fn(),
    retainMainPanels: vi.fn(),
    setSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    setSidebarCollapsed: vi.fn(),
    setUnitSide: vi.fn(),
    enterSession: vi.fn(),
    seedSessionGeometry: vi.fn(),
    seedUnitShare: vi.fn(),
    setViewportWidth: vi.fn(),
    setRightbar: vi.fn(),
    settleRightbar: vi.fn(),
    setUnit: vi.fn(),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
  }
}

/** The controller beside the two constructor faces the registration builds. */
function buildService(panels: PanelActions = fakePanels(), differs: (from: string, to: string) => boolean = () => false) {
  const geometry = createSnapshotStore<LiveSessionGeometry>({
    sidebarCollapsed: false, narrowExpanded: false, unitSide: 'right', rightbarCollapsed: false, byId: {}, active: null,
  })
  const service = new LayoutController(panels, () => true, createSnapshotStore({ activePanelId: null }), geometry, differs)
  return { service, panels, geometry }
}

describe('LayoutController', () => {
  it('forwards right column transitions to the constructor-supplied actions', () => {
    const { service, panels } = buildService()

    service.openRightbar(true, false, false)
    service.openRightbar(true, true, false)
    service.openRightbar(false, true, false)
    service.closeRightbar()

    expect(panels.openRightbar).toHaveBeenNthCalledWith(1, true, false, false)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(2, true, true, false)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(3, false, true, false)
    expect(panels.closeRightbar).toHaveBeenCalledTimes(1)
    // The drag width stays the frame's own business, never the caller's.
    expect(panels.setRightbar).not.toHaveBeenCalled()
  })

  it('can toggle the sidebar immediately after construction', () => {
    const { service, panels } = buildService()

    service.toggleSidebar()

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.setSidebar).not.toHaveBeenCalled()
  })

  it('sets the sidebar presentation without toggling', () => {
    const { service, panels } = buildService()

    service.setSidebarCollapsed(true)
    service.setSidebarCollapsed(false)

    expect(panels.setSidebarCollapsed).toHaveBeenNthCalledWith(1, true)
    expect(panels.setSidebarCollapsed).toHaveBeenNthCalledWith(2, false)
    expect(panels.toggleSidebar).not.toHaveBeenCalled()
  })

  it('forwards panel selection and returning to the Conversation without changing geometry', () => {
    const { service, panels } = buildService()
    const panelId = 'panel-a' as MainPanelId
    service.selectPanel(panelId)
    service.selectPanel(panelId)
    service.selectPanel(null)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(1, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(2, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(3, null)
    expect(panels.toggleSidebar).not.toHaveBeenCalled()
    expect(panels.openRightbar).not.toHaveBeenCalled()
    expect(panels.closeRightbar).not.toHaveBeenCalled()
  })

  it('keeps separately constructed controllers bound to their own instances', () => {
    const first = fakePanels()
    const second = fakePanels()
    const firstService = buildService(first).service
    const secondService = buildService(second).service
    firstService.toggleSidebar()
    expect(first.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(second.toggleSidebar).not.toHaveBeenCalled()
    secondService.closeRightbar()
    expect(first.closeRightbar).not.toHaveBeenCalled()
    expect(second.closeRightbar).toHaveBeenCalledTimes(1)
  })

  it('rejects an absent main entry without changing selection or cancelling pending navigation', () => {
    const panels = fakePanels()
    const present = new Set(['panel-a'])
    const geometry = createSnapshotStore<LiveSessionGeometry>({
      sidebarCollapsed: false, narrowExpanded: false, unitSide: 'right', rightbarCollapsed: false, byId: {}, active: null,
    })
    const service = new LayoutController(panels, id => present.has(id), createSnapshotStore({ activePanelId: null }), geometry, () => false)
    service.selectPanel('panel-a' as MainPanelId)
    const navigation = service.beginNavigation()
    present.delete('panel-a')
    expect(() => { service.selectPanel('panel-a' as MainPanelId) }).toThrow('main panel "panel-a" is not registered')
    expect(panels.selectPanel).toHaveBeenCalledOnce()
    expect(navigation.aborted).toBe(false)
    service.selectPanel(null)
    expect(navigation.aborted).toBe(true)
  })

  it('supersedes asynchronous navigation on another request, any valid selection, and disposal', () => {
    const { service } = buildService()
    const first = service.beginNavigation()
    const second = service.beginNavigation()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    service.selectPanel('panel-a' as MainPanelId)
    expect(second.aborted).toBe(true)
    const repeated = service.beginNavigation()
    service.selectPanel('panel-a' as MainPanelId)
    expect(repeated.aborted).toBe(true)
    const pending = service.beginNavigation()
    service.dispose()
    expect(pending.aborted).toBe(true)
    service.dispose()
  })

  it('forwards structural writes and seeds to the constructor-supplied actions', () => {
    const { service, panels } = buildService()
    service.setUnitSide('left')
    service.seedSessionGeometry('s-a', { sidebarCollapsed: true })
    service.seedUnitShare(0.7)
    expect(panels.setUnitSide).toHaveBeenNthCalledWith(1, 'left')
    expect(panels.seedSessionGeometry).toHaveBeenNthCalledWith(1, 's-a', { sidebarCollapsed: true })
    expect(panels.seedUnitShare).toHaveBeenNthCalledWith(1, 0.7)
  })

  it('answers nav-geometry comparisons through the constructor-supplied reader', () => {
    const { service } = buildService(fakePanels(), (from, to) => from !== to)
    expect(service.navGeometryDiffers('s-a', 's-b')).toBe(true)
    expect(service.navGeometryDiffers('s-a', 's-a')).toBe(false)
  })

  it('relays the provided canvas-claim source and resets to null on detach', () => {
    const { service } = buildService()
    expect(service.canvasClaims.claim('s-a')).toBeNull()
    let side: 'left' | 'right' = 'right'
    const listeners = new Set<() => void>()
    const notify = (): void => { for (const listener of listeners) listener() }
    const detach = service.canvasClaims.provide({
      claim: sessionId => sessionId === 's-a' ? side : null,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    })
    expect(service.canvasClaims.claim('s-a')).toBe('right')
    expect(service.canvasClaims.claim(null)).toBeNull()
    expect(service.canvasClaims.claim('s-b')).toBeNull()
    const seen: ('left' | 'right' | null)[] = []
    const unsubscribe = service.canvasClaims.subscribe(() => { seen.push(service.canvasClaims.claim('s-a')) })
    side = 'left'
    notify()
    expect(seen).toEqual(['left'])
    detach()
    expect(seen).toEqual(['left', null])
    expect(service.canvasClaims.claim('s-a')).toBeNull()
    unsubscribe()
  })

  it('publishes the live session geometry through the shared observable', () => {
    const { service, geometry } = buildService()
    expect(service.sessionGeometry).toBe(geometry)
  })
})
