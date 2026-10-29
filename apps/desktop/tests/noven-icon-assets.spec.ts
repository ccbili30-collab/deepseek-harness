import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { prepareNovenIconAssets } from '../scripts/noven-icon-assets.mjs'
import { unpackIco } from '../scripts/icon-ico.mjs'

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'noven-icon-test-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function expectInverted(original: string | Buffer, inverted: string | Buffer): Promise<void> {
  const source = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const variant = await sharp(inverted).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect(variant.info).toMatchObject({ width: source.info.width, height: source.info.height, channels: 4 })
  expect(variant.data.length).toBe(source.data.length)
  for (let index = 0; index < source.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      if (variant.data[index + channel]! !== 255 - source.data[index + channel]!) {
        throw new Error(`icon channel ${String(channel)} was not inverted at byte ${String(index)}`)
      }
    }
    if (variant.data[index + 3] !== source.data[index + 3]) throw new Error(`icon alpha changed at byte ${String(index)}`)
  }
}

describe('Noven channel icon assets', () => {
  it('keeps release assets untouched and creates no variant directory', async () => {
    const root = join(temporaryRoot(), 'variant')

    const paths = await prepareNovenIconAssets('release', root)

    expect(existsSync(root)).toBe(false)
    expect(paths.macIcon).toBe(fileURLToPath(new URL('../resources/icon-macos.png', import.meta.url)))
    expect(paths.windowsIcon).toBe(fileURLToPath(new URL('../resources/icon-windows.png', import.meta.url)))
    expect(paths.trayIcon).toBe(fileURLToPath(new URL('../resources/tray-windows.ico', import.meta.url)))
  })

  it('inverts RGB without changing alpha for app and tray icons', async () => {
    const root = join(temporaryRoot(), 'variant')
    const macSource = fileURLToPath(new URL('../resources/icon-macos.png', import.meta.url))
    const windowsSource = fileURLToPath(new URL('../resources/icon-windows.png', import.meta.url))
    const traySource = fileURLToPath(new URL('../resources/tray-windows.ico', import.meta.url))
    const originalBytes = readFileSync(macSource)

    const paths = await prepareNovenIconAssets('test', root)

    expect(readFileSync(macSource)).toEqual(originalBytes)
    await expectInverted(macSource, paths.macIcon)
    await expectInverted(windowsSource, paths.windowsIcon)
    const sourceEntries = unpackIco(readFileSync(traySource))
    const invertedEntries = unpackIco(readFileSync(paths.trayIcon))
    expect(invertedEntries.map(entry => entry.size)).toEqual(sourceEntries.map(entry => entry.size))
    for (const [index, entry] of sourceEntries.entries()) {
      await expectInverted(entry.png, invertedEntries[index]!.png)
    }
  })

  it('selects inverted assets only for the Noven Test package', async () => {
    vi.stubEnv('DSH_DESKTOP_APP_ID', 'com.example.noven')
    vi.stubEnv('DSH_DESKTOP_UNSIGNED', '1')
    try {
      const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
      const environment = {
        DSH_DESKTOP_APP_ID: 'com.example.noven',
        DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
        DSH_DESKTOP_TARGET_ARCH: 'arm64',
        DSH_DESKTOP_UNSIGNED: '1',
      }
      const test = createElectronBuilderConfig({ ...environment, NOVEN_CHANNEL: 'test' }, 'darwin', 'arm64')
      const release = createElectronBuilderConfig(environment, 'darwin', 'arm64')

      expect(test.productName).toBe('Noven Test')
      expect(test.mac.icon).toContain(join('icon-variants', 'test', 'icon-macos.png'))
      expect(test.win.icon).toContain(join('icon-variants', 'test', 'icon-windows.png'))
      expect(test.extraResources.find(resource => resource.to === 'icon.png')?.from)
        .toContain(join('icon-variants', 'test', 'icon-windows.png'))
      expect(release.productName).toBe('Noven')
      expect(release.mac.icon).toBe(fileURLToPath(new URL('../resources/icon-macos.png', import.meta.url)))
      expect(release.win.icon).toBe(fileURLToPath(new URL('../resources/icon-windows.png', import.meta.url)))
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
