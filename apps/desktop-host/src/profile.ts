/** Desktop profile composition: app-owned defaults and packages, then user-owned overrides. */

import { loadProfileDirectory, type Profile } from '@deepseek-ai/dsh-app-boot'

/**
 * Load the mutable Desktop profile with an optional immutable Noven runtime profile.
 * App bundles win duplicate code selections; their patches run before user patches.
 * @param projectDir - Mutable user profile containing configuration and data.
 * @param installAnchor - Core dsh installation package.json.
 * @param runtimeProfileDir - App-owned Noven profile from Resources; undefined preserves generic Desktop behavior.
 * @returns The user profile location with app-owned bundle layers followed by user-only bundles and user patches.
 */
export function loadDesktopProfile(
  projectDir: string,
  installAnchor: string,
  runtimeProfileDir = process.env.NOVEN_RUNTIME_PROFILE,
): Profile {
  const user = loadProfileDirectory('dsh', projectDir, installAnchor)
  if (runtimeProfileDir === undefined || runtimeProfileDir === '') return user
  const runtime = loadProfileDirectory('noven-runtime', runtimeProfileDir, installAnchor)
  if (runtime.skippedBundles.length > 0) {
    throw new Error(`noven runtime: required bundles did not load: ${runtime.skippedBundles
      .map(bundle => `${bundle.packageName} (${bundle.reason})`).join('; ')}`)
  }
  const runtimeNames = new Set(runtime.layers.map(layer => layer.packageName))
  return {
    ...user,
    layers: [...runtime.layers, ...user.layers.filter(layer => !runtimeNames.has(layer.packageName))],
    patches: [...runtime.patches, ...user.patches],
    skippedBundles: user.skippedBundles,
  }
}
