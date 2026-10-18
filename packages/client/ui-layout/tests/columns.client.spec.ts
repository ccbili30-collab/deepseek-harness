import { describe, expect, it } from 'vitest'
import { canvasShareWidth, clampWidth, computeColumns } from '../src/client/columns.ts'

describe('clampWidth', () => {
  it('clamps into the range and rounds', () => {
    expect(clampWidth(250.4, 240, 420)).toBe(250)
    expect(clampWidth(100, 240, 420)).toBe(240)
    expect(clampWidth(9999, 240, 420)).toBe(420)
  })
})

describe('computeColumns', () => {
  it('gives each edge column its preference when the center has enough room', () => {
    expect(computeColumns(1920, 280, 864)).toEqual({ sidebar: 280, center: 776, rightbar: 864 })
  })

  it('keeps only the left rail when both panels are closed', () => {
    expect(computeColumns(1920, 0, 0)).toEqual({ sidebar: 56, center: 1864, rightbar: 0 })
  })

  it('clamps sidebar preferences and limits the right panel to 70% of the frame', () => {
    expect(computeColumns(3000, 9999, 9999)).toEqual({ sidebar: 420, center: 480, rightbar: 2100 })
    expect(computeColumns(1920, 1, 1)).toEqual({ sidebar: 264, center: 1560, rightbar: 96 })
  })

  it.each([
    [1300, 280, 700, 320],
    [1100, 280, 500, 320],
    [1120, 420, 380, 320],
    [1119, 420, 379, 320],
    [1024, 420, 284, 320],
    [999, 420, 259, 320],
    [756, 0, 380, 320],
    [755, 0, 379, 320],
    [455, 0, 0, 399],
    [20, 0, 0, 0],
  ])('solves frame %i and sidebar %i to right %i and center %i', (viewport, sidebar, rightbar, center) => {
    expect(computeColumns(viewport, sidebar, 864)).toEqual({ sidebar: sidebar || 56, center, rightbar })
  })

  it('does not reduce the wide sidebar to keep a normal right panel open', () => {
    expect(computeColumns(1024, 420, 500)).toEqual({ sidebar: 420, center: 320, rightbar: 284 })
  })

  it('restores a still-open preference when the frame widens', () => {
    expect(computeColumns(1100, 280, 864).rightbar).toBe(500)
    expect(computeColumns(1920, 280, 864).rightbar).toBe(864)
  })

  it('leaves a closed right track closed when the frame widens', () => {
    expect(computeColumns(755, 0, 0).rightbar).toBe(0)
    expect(computeColumns(1920, 0, 0).rightbar).toBe(0)
  })
})

describe('canvasShareWidth', () => {
  it.each([
    [1944, 220, 1427],
    [2000, 220, 1466],
    [1640, 340, 1250],
    [1384, 340, 1064],
    [800, 180, 480],
  ])('reserves the drawer before dividing work=%i drawer=%i', (work, drawer, unit) => {
    expect(canvasShareWidth(work, drawer, 0.7)).toBe(unit)
  })
})
