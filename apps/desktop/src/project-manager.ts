/** Desktop profile initialization and native recovery. */

import {
  cpSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  closeSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { NOVEN_PROFILE_RESOURCE } from './noven-profile-resource.ts'
import {
  DESKTOP_HOST_PACKAGE,
  desktopCorePackageOverrides,
  verifyDesktopCorePackageSet,
} from './core-package-set.ts'
import type { DesktopPaths } from './paths.ts'
import type { DesktopRelease } from './release.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import {
  initProfile, PROFILE_TEMPLATES, removeLinkProjections, sanitizeProfile, type ProfileManifest, type ProfileTemplate,
} from '@deepseek-ai/dsh-app-boot'

const PROJECT_NAME = '@deepseek-ai/dsh-desktop-runtime'
const DSH_PACKAGE = '@deepseek-ai/dsh'
const CORE_BUILD_PACKAGE = '@deepseek-ai/dsh-subprocess-local'
const WEB_PROFILE = PROFILE_TEMPLATES.web as ProfileTemplate
const WORKSPACE_SETTINGS = 'nodeLinker: hoisted\nautoInstallPeers: false\n'
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
}

/**
 * Render the pnpm workspace settings used by build and runtime profiles.
 * @param overrides - Exact local package replacements used during a build; empty for runtime use.
 * @returns YAML with deterministic overrides and the reviewed native build allowlist.
 */
export function desktopWorkspaceFile(overrides: Readonly<Record<string, string>> = {}): string {
  const entries = Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))
  const overrideSection = entries.length === 0
    ? ''
    : `overrides:\n${entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`).join('\n')}\n`
  if (entries.length === 0) return `packages:\n  - .\n\n${WORKSPACE_SETTINGS}`
  const coreBuildSpec = overrides[CORE_BUILD_PACKAGE]
  const coreBuildKey = coreBuildSpec === undefined
    ? CORE_BUILD_PACKAGE
    : `${CORE_BUILD_PACKAGE}@${coreBuildSpec.replace('file:./', 'file:')}`
  return `packages:\n  - .\n\n${overrideSection}${WORKSPACE_SETTINGS}allowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  ${JSON.stringify(coreBuildKey)}: true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
}

/**
 * Keep Noven's brand occupant the only registrant of `sidebar.brand.mark`.
 * Older Noven profiles predate this override; the official DSH brand plugin
 * would otherwise collide and abort the rest of the client boot.
 * @param projectDir - initialized Desktop profile.
 */
function ensureNovenProfile(projectDir: string): void {
  let bundles: readonly string[] = []
  try {
    const manifest = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: readonly string[] } }
    }
    bundles = manifest.dsh?.profile?.bundles ?? []
  } catch {
    return
  }
  if (!bundles.includes('noven-brand')) return
  const patchPath = join(projectDir, 'cordis.patch.yml')
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  if (/^\s*-\s*id:\s*ui-brand-official\s*$/mu.test(patch)) return
  writeFileSync(patchPath, `${patch.trimEnd()}\n\n# Noven: the official brand mark would collide with noven-brand.\n- id: ui-brand-official\n  disabled: true\n`)
}

function migrateProfileSettings(projectDir: string): void {
  const path = join(projectDir, 'pnpm-workspace.yaml')
  if (!existsSync(path)) return
  const legacy = `packages:\n  - .\n\n${WORKSPACE_SETTINGS}strictDepBuilds: true\nallowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  "${CORE_BUILD_PACKAGE}": true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') === legacy) {
    writeFileSync(path, desktopWorkspaceFile())
  }
}

interface ManagedNovenPackage {
  readonly name: string
  readonly target: string
}

function readManifest(path: string): ProfileManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as ProfileManifest
}

function managedNovenPackages(seed: string): ManagedNovenPackage[] {
  const modules = join(seed, 'node_modules')
  const packages: ManagedNovenPackage[] = []
  const add = (name: string, target: string): void => {
    const manifest = readManifest(join(target, 'package.json'))
    if (manifest.name !== name) throw new Error(`desktop project: packaged Noven dependency ${name} has an invalid manifest`)
    packages.push({ name, target })
  }
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const target = join(modules, entry.name)
    if (entry.name.startsWith('@')) {
      for (const child of readdirSync(target, { withFileTypes: true })) {
        if (child.isDirectory() || child.isSymbolicLink()) add(`${entry.name}/${child.name}`, join(target, child.name))
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) add(entry.name, target)
  }
  return packages
}

function preflightManagedLink(profileDir: string, pkg: ManagedNovenPackage): void {
  const link = join(profileDir, 'node_modules', pkg.name)
  const existing = lstatSync(link, { throwIfNoEntry: false })
  if (existing === undefined || existing.isSymbolicLink()) return
  const manifest = readManifest(join(link, 'package.json'))
  if (manifest.name !== pkg.name) {
    throw new Error(`desktop project: refusing to replace ${link}; expected package ${pkg.name}, found ${String(manifest.name)}`)
  }
}

function linkManagedPackage(profileDir: string, pkg: ManagedNovenPackage): void {
  const link = join(profileDir, 'node_modules', pkg.name)
  const existing = lstatSync(link, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    try {
      if (realpathSync(link) === realpathSync(pkg.target)) return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    unlinkSync(link)
  } else if (existing !== undefined) {
    rmSync(link, { recursive: true, force: true })
  }
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(pkg.target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

function reconcileNovenManifest(profileDir: string, seed: string): void {
  const path = join(profileDir, 'package.json')
  const current = readManifest(path)
  const managed = readManifest(join(seed, 'package.json'))
  const managedBundles = managed.dsh?.profile?.bundles ?? []
  const currentBundles = current.dsh?.profile?.bundles ?? []
  const next: ProfileManifest = {
    ...current,
    dependencies: { ...current.dependencies, ...managed.dependencies },
    dsh: {
      ...current.dsh,
      profile: {
        ...current.dsh?.profile,
        bundles: [...managedBundles, ...currentBundles.filter(name => !managedBundles.includes(name))],
      },
    },
  }
  if (JSON.stringify(next) !== JSON.stringify(current)) writeJson(path, next)
}

/** Point managed runtime packages at the app while leaving user packages and patches in place. */
function reconcileNovenRuntime(profileDir: string, seed: string): void {
  const packages = managedNovenPackages(seed)
  for (const pkg of packages) preflightManagedLink(profileDir, pkg)
  for (const pkg of packages) linkManagedPackage(profileDir, pkg)
  reconcileNovenManifest(profileDir, seed)
}

function copyNovenConfiguration(seed: string, profileDir: string): void {
  for (const name of ['package.json', 'cordis.yml', 'cordis.patch.yml', 'pnpm-workspace.yaml', 'noven-profile-build.json']) {
    const source = join(seed, name)
    const destination = join(profileDir, name)
    if (existsSync(source) && !existsSync(destination)) cpSync(source, destination)
  }
}

/** Initializes the Desktop profile and disables third-party bundles during recovery. */
export class DesktopProjectManager {
  /**
   * @param paths - Electron-owned package state and reserved desktop profile paths.
   * @param runtime - location of the bundled application runtime.
   */
  constructor(
    readonly paths: DesktopPaths,
    readonly runtime: { readonly dsh: string },
  ) {}

  /**
   * Back up the profile patch and disable third-party bundles without loading application resources.
   * The caller must stop the Host first.
   * @returns Backup path after the locked profile write, or undefined if the patch was absent.
   */
  async disableAllPlugins(): Promise<string | undefined> {
    return this.withLock(() => sanitizeProfile('dsh', this.paths.profile, WEB_PROFILE.bundles))
  }

  /**
   * Load application metadata and prepare the external plugin profile without installing packages.
   * @param runtimeProfile - Explicit app-owned profile resource; defaults to the Electron Resources directory.
   */
  async applyRelease(runtimeProfile?: string): Promise<void> {
    await this.withLock(() => {
      // Validation only: an unreadable or mismatched runtime descriptor stops preparation before the Host starts.
      readDesktopRuntime(this.runtime.dsh)
      const resourcesPath = process.resourcesPath
      const seed = runtimeProfile ?? (typeof resourcesPath === 'string' && resourcesPath !== ''
        ? join(resourcesPath, NOVEN_PROFILE_RESOURCE)
        : undefined)
      if (seed !== undefined && existsSync(seed) && !existsSync(join(this.paths.profile, 'package.json'))) {
        copyNovenConfiguration(seed, this.paths.profile)
      }
      migrateProfileSettings(this.paths.profile)
      createPluginProfile(this.paths.profile)
      removeLinkProjections(this.paths.profile)
      if (seed !== undefined && existsSync(seed)) reconcileNovenRuntime(this.paths.profile, seed)
      ensureNovenProfile(this.paths.profile)
    })
  }

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    mkdirSync(this.paths.profile, { recursive: true, mode: 0o700 })
    const lockPath = join(realpathSync(this.paths.profile), 'lock')
    let descriptor: number
    try {
      descriptor = openSync(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const lock = lstatSync(lockPath)
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error('desktop project: profile lock is not a regular file')
        }
        const owner = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10)
        let active = !Number.isSafeInteger(owner) || owner <= 0
        if (!active) {
          try {
            process.kill(owner, 0)
            active = true
          } catch (signalError) {
            active = (signalError as NodeJS.ErrnoException).code !== 'ESRCH'
          }
        }
        if (active) throw new Error('desktop project: another profile operation is active')
        unlinkSync(lockPath)
        descriptor = openSync(lockPath, 'wx', 0o600)
      } else {
        throw error
      }
    }
    try {
      writeSync(descriptor, `${String(process.pid)}\n`)
      fsyncSync(descriptor)
      return await operation()
    } finally {
      closeSync(descriptor)
      unlinkSync(lockPath)
    }
  }
}

/** Create build-only project metadata for materializing the signed runtime. */
export function createRuntimeProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const packageSet = verifyDesktopCorePackageSet(projectDir, release.version)
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: desktopCorePackageOverrides(packageSet),
    dsh: { profile: { bundles: [...WEB_PROFILE.bundles] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(
    join(projectDir, 'pnpm-workspace.yaml'),
    desktopWorkspaceFile(desktopCorePackageOverrides(packageSet)),
    { mode: 0o600 },
  )
}

/**
 * Create metadata for the unpackaged development project that links the current workspace.
 * @param projectDir - Disposable development profile directory.
 * @param release - Release identity shared by the linked CLI package and Electron shell.
 */
export function createDevelopmentProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: {
      [DSH_PACKAGE]: release.version,
      [DESKTOP_HOST_PACKAGE]: release.version,
    },
    dsh: { profile: { bundles: [...WEB_PROFILE.bundles] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), desktopWorkspaceFile(), { mode: 0o600 })
}

/** Create the first external plugin profile without running a package manager. */
export function createPluginProfile(projectDir: string): void {
  initProfile(projectDir, WEB_PROFILE.bundles)
}
