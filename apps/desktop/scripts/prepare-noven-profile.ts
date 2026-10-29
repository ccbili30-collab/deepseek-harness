/** Pack and materialize the current Noven Desktop profile from one source checkout. */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { isEntry, pnpmCommand, runConcurrent } from '../../../scripts/release/process.ts'
import { pnpmInvocation } from '../../../scripts/pnpm-invocation.ts'
import { resolveNpmRegistry } from './desktop-release-environment.mjs'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import {
  NOVEN_PLUGIN_PACKAGES,
  finalizeNovenProfile,
  selectNovenProfilePackages,
  verifyNovenProfile,
  verifyNovenProfileLockfile,
  writeNovenProfileBuild,
} from './noven-profile.ts'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..')

/**
 * Require every Noven package selected for a release to declare its own build step.
 * @param root - Repository root containing plugins-noven.
 * @returns Nothing when every selected package declares a nonempty build script.
 */
export function verifyNovenBuildScripts(root = REPOSITORY_ROOT): void {
  for (const name of NOVEN_PLUGIN_PACKAGES) {
    const path = join(root, 'plugins-noven', name, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { scripts?: { build?: unknown } }
    if (typeof manifest.scripts?.build !== 'string' || manifest.scripts.build.trim() === '') {
      throw new Error(`noven profile: ${name} has no build script; refusing to pack stale lib output`)
    }
  }
}

/**
 * Build every Noven package before packing any of them.
 * @param destination - Tarball output directory.
 * @param run - Command runner used by the release pipeline and tests.
 * @param root - Repository root containing plugins-noven.
 * @returns After every package has been built and packed in dependency order.
 */
export async function packNovenPackages(
  destination: string,
  run: typeof runConcurrent = runConcurrent,
  root = REPOSITORY_ROOT,
): Promise<void> {
  verifyNovenBuildScripts(root)
  const invocation = pnpmCommand()
  await run(invocation[0], [
    ...invocation.slice(1), '--dir', join(root, 'plugins-noven'), '-r', '--if-present', 'run', 'build',
  ], { cwd: root })
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  for (const name of NOVEN_PLUGIN_PACKAGES) {
    const directory = join(root, 'plugins-noven', name)
    await run(invocation[0], [
      ...invocation.slice(1), '--dir', directory, 'pack', '--pack-destination', destination,
    ], { cwd: root })
  }
}

/** Install a generated profile with an isolated package store and no user pnpm configuration. */
async function installNovenProfile(projectDir: string): Promise<void> {
  const state = join(projectDir, '.pnpm-state')
  const store = join(state, 'store')
  const userConfig = join(state, 'npmrc')
  mkdirSync(store, { recursive: true })
  writeFileSync(userConfig, '')
  const registry = resolveNpmRegistry(process.env)
  const config = [
    `--config.registry=${registry}`,
    `--config.store-dir=${store}`,
    '--config.enable-global-virtual-store=false',
    `--config.userconfig=${userConfig}`,
  ]
  const environment = {
    ...process.env,
    NODE_OPTIONS: '',
    NODE_PATH: '',
    NPM_CONFIG_REGISTRY: registry,
    NPM_CONFIG_STORE_DIR: store,
    NPM_CONFIG_USERCONFIG: userConfig,
  }
  const run = async (args: readonly string[]): Promise<void> => {
    const invocation = pnpmInvocation(args, process.env)
    await runConcurrent(invocation.command, invocation.args, { cwd: projectDir, env: environment })
  }
  await run(['install', '--lockfile-only', ...config])
  verifyNovenProfileLockfile(projectDir)
  await run(['install', '--prod', '--frozen-lockfile', '--trust-lockfile', ...config])
}

/** Build and validate one channel's profile, replacing the old seed only after every gate passes. */
async function main(): Promise<void> {
  const paths = resolveDesktopTargetBuildPaths()
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      'from-core': { type: 'string', multiple: true },
      'from-noven': { type: 'string' },
    },
    allowPositionals: false,
  })
  const channel = process.env.NOVEN_CHANNEL === 'test' ? 'test' : 'release'
  const output = values.out === undefined
    ? (channel === 'test' ? paths.novenProfileTest : paths.novenProfile)
    : resolve(paths.root, values.out)
  if (output !== paths.root && !output.startsWith(`${paths.root}${sep}`)) {
    throw new Error(`noven profile: output must stay inside ${paths.root}`)
  }
  const staging = join(paths.root, `.${basename(output)}.staging`)
  const coreInputs = (values['from-core'] ?? [paths.packedDsh, paths.packedVendor, paths.packedLandlock])
    .map(path => resolve(REPOSITORY_ROOT, path))
  const novenInput = values['from-noven'] === undefined ? paths.packedNoven : resolve(REPOSITORY_ROOT, values['from-noven'])
  try {
    if (values['from-noven'] === undefined) await packNovenPackages(novenInput)
    const selected = selectNovenProfilePackages(coreInputs, [novenInput])
    rmSync(staging, { recursive: true, force: true })
    const packageSet = writeNovenProfileBuild(staging, selected)
    await installNovenProfile(staging)
    const verification = await verifyNovenProfile(staging, join(paths.dsh, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
    finalizeNovenProfile(staging)
    writeFileSync(join(staging, 'noven-profile-build.json'), `${JSON.stringify({
      channel,
      packages: packageSet.packages,
      verification,
    }, undefined, 2)}\n`, { mode: 0o600 })
    rmSync(output, { recursive: true, force: true })
    renameSync(staging, output)
    console.log(`noven profile: prepared ${output} (${packageSet.packages.length} packages, ${verification.imports} imports checked)`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) await main()
