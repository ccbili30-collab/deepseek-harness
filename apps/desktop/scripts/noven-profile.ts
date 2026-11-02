/** Deterministic Noven Desktop profile assembly and validation. */
import { constants, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { spawnSync } from 'node:child_process'
import { basename, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import {
  createRuntimeResolution,
  loadProfileDirectory,
} from '@deepseek-ai/dsh-app-boot'
import {
  DESKTOP_PACKAGES_DIR,
  DESKTOP_PACKAGE_SET_FILE,
  desktopCorePackageOverrides,
  parseDesktopCorePackageSet,
  verifyDesktopCoreLockfile,
} from '../src/core-package-set.ts'
import { desktopWorkspaceFile } from '../src/project-manager.ts'
import {
  DESKTOP_ROOT_PACKAGES,
  desktopPackageRecord,
  readDesktopPackedPackages,
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from './prepare-package-set.ts'

/** The only bundles enabled by a fresh Noven Desktop profile. */
export const NOVEN_PROFILE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'noven-study',
  'noven-brand',
  'noven-shell',
  'noven-dock',
  'noven-image',
  'noven-workbench',
  'noven-draw-comic',
  'noven-docs',
  'noven-cards',
  'noven-library',
  'noven-skills',
  'noven-explore',
] as const

/** First-party Noven packages packed for every build, including dependency-only packages. */
export const NOVEN_PLUGIN_PACKAGES = [
  'noven-brand',
  'noven-cards',
  'noven-dock',
  'noven-docs',
  'noven-draw-comic',
  'noven-explore',
  'noven-fmg',
  'noven-image',
  'noven-ledger',
  'noven-library',
  'noven-shell',
  'noven-skills',
  'noven-study',
  'noven-workbench',
] as const

const PROFILE_TEMPLATE = resolve(import.meta.dirname, '../noven/profile')
const NOVEN_PLUGIN_PACKAGE_NAMES: ReadonlySet<string> = new Set(NOVEN_PLUGIN_PACKAGES)
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])
const NOVEN_CLIENT_PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
] as const

/**
 * Select the complete core + Noven package closure from immutable tarballs.
 * @param coreInputs - Directories containing the core Desktop tarballs.
 * @param novenInputs - Directories containing the current Noven tarballs.
 * @returns Every required package exactly once, in deterministic name order.
 */
export function selectNovenProfilePackages(
  coreInputs: readonly string[], novenInputs: readonly string[],
): PackedDesktopPackage[] {
  const available = readDesktopPackedPackages(coreInputs)
  for (const [name, packed] of readDesktopPackedPackages(novenInputs)) {
    if (available.has(name)) throw new Error(`noven profile: duplicate package ${name} across core and Noven inputs`)
    available.set(name, packed)
  }
  return selectDesktopPackageClosure(available, [...DESKTOP_ROOT_PACKAGES, ...NOVEN_PLUGIN_PACKAGES])
}

/**
 * Write the install-time profile: exact local tarballs, product bundles, and local overrides.
 * @param projectDir - Empty build-owned directory to populate.
 * @param selected - Packages selected by {@link selectNovenProfilePackages}.
 * @returns The validated package set used for lockfile verification.
 */
export function writeNovenProfileBuild(
  projectDir: string, selected: readonly PackedDesktopPackage[],
) {
  const records = selected.map(desktopPackageRecord)
  const packageSet = parseDesktopCorePackageSet({ schemaVersion: 1, packages: records })
  const packageDir = join(projectDir, DESKTOP_PACKAGES_DIR)
  mkdirSync(packageDir, { recursive: true })
  for (const packed of selected) copyFileSync(packed.tarball, join(packageDir, basename(packed.tarball)), constants.COPYFILE_EXCL)
  writeFileSync(join(projectDir, DESKTOP_PACKAGE_SET_FILE), `${JSON.stringify(packageSet, undefined, 2)}\n`, { mode: 0o600 })
  const versions = new Map(records.map(record => [record.name, record.version]))
  const manifest = {
    name: 'noven-desktop-profile',
    private: true,
    version: '0.1.0',
    dependencies: Object.fromEntries(NOVEN_PLUGIN_PACKAGES.map((name) => {
      const version = versions.get(name)
      if (version === undefined) throw new Error(`noven profile: selected packages omit ${name}`)
      return [name, version]
    })),
    // Core packages participate in the lockfile audit but are not installed by
    // the production profile; the assembled Desktop runtime supplies them.
    devDependencies: Object.fromEntries(records.filter(record => !NOVEN_PLUGIN_PACKAGE_NAMES.has(record.name))
      .map(record => [record.name, record.version])),
    dsh: { profile: { bundles: [...NOVEN_PROFILE_BUNDLES] } },
  }
  writeFileSync(join(projectDir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, { mode: 0o600 })
  cpSync(join(PROFILE_TEMPLATE, 'cordis.yml'), join(projectDir, 'cordis.yml'))
  cpSync(join(PROFILE_TEMPLATE, 'cordis.patch.yml'), join(projectDir, 'cordis.patch.yml'))
  writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), desktopWorkspaceFile(desktopCorePackageOverrides(packageSet)), { mode: 0o600 })
  return packageSet
}

/** Verify that the generated lockfile keeps every first-party package on its local tarball. */
export function verifyNovenProfileLockfile(projectDir: string): void {
  verifyDesktopCoreLockfile(
    readFileSync(join(projectDir, 'pnpm-lock.yaml'), 'utf8'),
    parseDesktopCorePackageSet(JSON.parse(readFileSync(join(projectDir, DESKTOP_PACKAGE_SET_FILE), 'utf8'))),
  )
}

/**
 * Resolve the profile through the same app-boot code used by the Host.
 * @param projectDir - Generated Noven profile.
 * @param installAnchor - The assembled dsh package.json used as installation anchor.
 * @returns Bundle and runtime package counts.
 */
export async function verifyNovenProfileResolution(projectDir: string, installAnchor: string) {
  const profile = loadProfileDirectory('noven-profile', projectDir, installAnchor, { userLayer: false })
  if (profile.skippedBundles.length > 0) {
    throw new Error(`noven profile: skipped bundles: ${profile.skippedBundles
      .map(bundle => `${bundle.packageName} (${bundle.reason})`).join('; ')}`)
  }
  const resolution = await createRuntimeResolution({
    installAnchor,
    profile,
    home: join(projectDir, '.resolution-home'),
  })
  const names = resolution.entries.map(entry => entry.name)
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index)
  if (duplicates.length > 0) throw new Error(`noven profile: duplicate runtime entries: ${[...new Set(duplicates)].join(', ')}`)
  return { bundles: profile.layers.length, packages: resolution.entries.length }
}

function javascriptFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true, recursive: true }).flatMap((entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.js')) return []
    return [join(entry.parentPath, entry.name)]
  })
}

const IMPORT_RESOLVER_SCRIPT = `
import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { sep } from 'node:path'
let input = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) input += chunk
const { tasks, anchor, profile, clientPlatformModules } = JSON.parse(input)
const profileRoot = realpathSync(profile)
const insideProfile = path => {
  const real = realpathSync(path)
  return real === profileRoot || real.startsWith(profileRoot + sep)
}
const packageName = specifier => specifier.startsWith('@')
  ? specifier.split('/').slice(0, 2).join('/')
  : specifier.split('/')[0]
const missing = []
let imports = 0
for (const task of tasks) {
  for (const specifier of task.specifiers) {
    imports += 1
    let local = false
    let profileError
    try {
      const resolved = createRequire(task.file).resolve(specifier)
      local = insideProfile(resolved)
      if (!local) profileError = new Error('resolved outside the generated profile: ' + resolved)
    } catch (error) {
      profileError = error
    }
    let core = false
    let coreError
    try {
      createRequire(anchor).resolve(specifier)
      core = true
    } catch (error) {
      coreError = error
    }
    const name = packageName(specifier)
    if (!local && !core) {
      const clientPlatform = !task.host && clientPlatformModules.some(module =>
        specifier === module || specifier.startsWith(module + '/'))
      if (!clientPlatform) {
        missing.push({ file: task.file, specifier, profile: String(profileError), core: String(coreError) })
      }
    } else if (!local && core && task.host && !task.peerDependencies.includes(name)) {
      missing.push({ file: task.file, specifier,
        diagnostic: task.file + ': ' + specifier + ' requires ' + name
          + ' in ' + task.owner + ' peerDependencies when the package is linked from the app resources' })
    }
  }
}
process.stdout.write(JSON.stringify({ missing, imports }))
`

interface ImportCheck {
  file: string
  specifiers: string[]
  owner: string
  host: boolean
  peerDependencies: readonly string[]
}

/** Resolve imports in a plain Node process, without tsx/tsconfig mappings hiding missing packages. */
function resolveImportsWithoutLoader(tasks: readonly ImportCheck[], projectDir: string, installAnchor: string) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', IMPORT_RESOLVER_SCRIPT], {
    input: JSON.stringify({ tasks, anchor: installAnchor, profile: projectDir, clientPlatformModules: NOVEN_CLIENT_PLATFORM_MODULES }),
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`noven profile: import resolver failed: ${result.stderr}`)
  return JSON.parse(result.stdout) as {
    missing: { file: string; specifier: string; profile: string; core: string; diagnostic?: string }[]
    imports: number
  }
}

/**
 * Check every literal runtime import in each Noven package's built JavaScript.
 * @param projectDir - Generated Noven profile with installed dependencies.
 * @param installAnchor - The assembled dsh package.json used as the core-runtime fallback.
 * @returns The number of files and import specifiers checked.
 */
export async function verifyNovenProfileImports(projectDir: string, installAnchor: string) {
  const missing: string[] = []
  const tasks: ImportCheck[] = []
  let files = 0
  for (const name of NOVEN_PLUGIN_PACKAGES) {
    const packageRoot = join(projectDir, 'node_modules', name)
    if (!existsSync(join(packageRoot, 'package.json'))) {
      missing.push(`${name}: package directory is missing`)
      continue
    }
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      peerDependencies?: Record<string, unknown>
    }
    const peerDependencies = Object.keys(manifest.peerDependencies ?? {})
    for (const file of javascriptFiles(join(packageRoot, 'lib'))) {
      files += 1
      const source = readFileSync(file, 'utf8')
      const specifiers = ts.preProcessFile(source, true, true).importedFiles.map(entry => entry.fileName)
        .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('/')
          && !specifier.startsWith('file:') && !NODE_BUILTINS.has(specifier))
      const artifact = relative(packageRoot, file)
      const host = artifact !== join('lib', 'client.js') && !artifact.startsWith(`lib${sep}client${sep}`)
      if (specifiers.length > 0) tasks.push({ file, specifiers, owner: name, host, peerDependencies })
    }
  }
  const result = resolveImportsWithoutLoader(tasks, projectDir, installAnchor)
  for (const failure of result.missing) {
    missing.push(failure.diagnostic
      ?? `${failure.file}: ${failure.specifier} (profile: ${failure.profile}; core: ${failure.core})`)
  }
  if (missing.length > 0) throw new Error(`noven profile: unresolved runtime imports:\n${missing.join('\n')}`)
  return { files, imports: result.imports }
}

/**
 * Run both app-boot resolution and built-import validation.
 * @param projectDir - Generated Noven profile with installed dependencies.
 * @param installAnchor - The assembled dsh package.json used as installation anchor.
 * @returns Validation counts for the build manifest.
 */
export async function verifyNovenProfile(projectDir: string, installAnchor: string) {
  const resolution = await verifyNovenProfileResolution(projectDir, installAnchor)
  const imports = await verifyNovenProfileImports(projectDir, installAnchor)
  return { ...resolution, ...imports }
}

/**
 * Remove install-only state and leave a portable runtime profile.
 * @param projectDir - Generated profile that already passed validation.
 */
export function finalizeNovenProfile(projectDir: string): void {
  for (const path of [DESKTOP_PACKAGES_DIR, 'pnpm-lock.yaml', '.pnpm-store', '.pnpm-state', '.plugin-manager', '.resolution-home']) {
    rmSync(join(projectDir, path), { recursive: true, force: true })
  }
  writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), desktopWorkspaceFile(), { mode: 0o600 })
}
