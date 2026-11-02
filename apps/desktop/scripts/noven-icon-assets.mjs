/** Channel-owned Noven icon selection and color-inverted test asset generation. */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { packIco, unpackIco } from './icon-ico.mjs'

const RESOURCES = fileURLToPath(new URL('../resources/', import.meta.url))
const MAC_SOURCE = join(RESOURCES, 'icon-macos.png')
const WINDOWS_SOURCE = join(RESOURCES, 'icon-windows.png')
const TRAY_SOURCE = join(RESOURCES, 'tray-windows.ico')

/**
 * Resolve the icon files used by one Noven channel.
 * @param {'release' | 'test'} channel - Formal release or visually distinct test channel.
 * @param {string} variantRoot - Build-owned directory for generated test assets.
 * @returns {{ macIcon: string, windowsIcon: string, trayIcon: string }} Icon source paths for electron-builder.
 */
export function novenIconAssetPaths(channel, variantRoot) {
  const test = channel === 'test'
  return {
    macIcon: test ? join(variantRoot, 'icon-macos.png') : MAC_SOURCE,
    windowsIcon: test ? join(variantRoot, 'icon-windows.png') : WINDOWS_SOURCE,
    trayIcon: test ? join(variantRoot, 'tray-windows.ico') : TRAY_SOURCE,
  }
}

/**
 * Materialize color-inverted test icons while preserving alpha and the formal assets.
 * @param {'release' | 'test'} channel - Formal release or test channel.
 * @param {string} variantRoot - Build-owned directory for generated test assets.
 * @returns {Promise<{ macIcon: string, windowsIcon: string, trayIcon: string }>} The selected icon paths.
 */
export async function prepareNovenIconAssets(channel, variantRoot) {
  const paths = novenIconAssetPaths(channel, variantRoot)
  if (channel !== 'test') return paths
  await mkdir(variantRoot, { recursive: true })
  const invert = input => sharp(input).negate({ alpha: false }).png()
  await Promise.all([
    invert(MAC_SOURCE).toFile(paths.macIcon),
    invert(WINDOWS_SOURCE).toFile(paths.windowsIcon),
    (async () => {
      const entries = unpackIco(await readFile(TRAY_SOURCE))
      const inverted = await Promise.all(entries.map(async entry => ({
        size: entry.size,
        png: await invert(entry.png).toBuffer(),
      })))
      await writeFile(paths.trayIcon, packIco(inverted))
    })(),
  ])
  return paths
}
