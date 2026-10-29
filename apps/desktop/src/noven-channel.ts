/** Product channel and the isolated data roots selected for this Desktop launch. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/** The two shipping channels; development runs as `test` unless it supplies its own home. */
export type NovenChannel = 'release' | 'test'

/** Product name for this channel. */
export const NOVEN_PRODUCT_NAME = resolveNovenChannel() === 'test' ? 'Noven Test' : 'Noven'

/** Public URL scheme for this channel. */
export const NOVEN_PROTOCOL = resolveNovenChannel() === 'test' ? 'noven-test' : 'noven'

/** Absolute roots every Noven process in this launch must use. */
export interface NovenPaths {
  readonly channel: NovenChannel
  /** Common parent of this channel's data; portable for a test build beside `.data`. */
  readonly dataRoot: string
  /** Harness home: sessions, settings, credentials, workspaces. */
  readonly harnessHome: string
  /** Noven ledger home: project registry, library ledger, bindings. */
  readonly libraryHome: string
  /** Default/misc project root, kept inside the same data root. */
  readonly projectsRoot: string
  /** Electron browser data, keybindings, and single-instance identity. */
  readonly electronData: string
  readonly logs: string
}

/**
 * Resolve the channel from an explicit environment value or the packaged app name.
 * @returns `test` for a build named "Noven Test"; `release` otherwise.
 */
export function resolveNovenChannel(): NovenChannel {
  const configured = process.env.NOVEN_CHANNEL?.trim()
  if (configured === 'test' || configured === 'release') return configured
  // Electron's app name can come from the manifest rather than the bundle
  // display name; the executable path always names the packaged app.
  return `${app.getName()} ${process.execPath}`.toLowerCase().includes('noven test') ? 'test' : 'release'
}

/** A test build placed beside a `.data/` directory stays fully portable. */
function portableDataRoot(): string | undefined {
  if (!app.isPackaged) return undefined
  // <root>/Noven Test.app/Contents/Resources -> <root>/.data
  const appRoot = dirname(dirname(process.resourcesPath))
  const candidate = join(dirname(appRoot), '.data')
  return existsSync(candidate) ? candidate : undefined
}

/**
 * Resolve every root for this launch. `NOVEN_DATA_ROOT` isolates the complete
 * channel tree; explicit `DSH_HOME`, `NOVEN_HOME`, and `NOVEN_PROJECTS_ROOT`
 * then override their individual roots, so test launchers own disposable data.
 * @returns the channel and its absolute data roots.
 */
export function resolveNovenPaths(): NovenPaths {
  const channel = resolveNovenChannel()
  const dataRoot = process.env.NOVEN_DATA_ROOT?.trim() || (channel === 'test'
    ? portableDataRoot() ?? join(app.getPath('appData'), 'Noven Test')
    : join(app.getPath('appData'), 'Noven'))
  const harnessHome = process.env.DSH_HOME?.trim() || join(dataRoot, 'harness')
  const libraryHome = process.env.NOVEN_HOME?.trim() || join(dataRoot, 'library')
  const projectsRoot = process.env.NOVEN_PROJECTS_ROOT?.trim() || join(dataRoot, 'projects')
  return {
    channel,
    dataRoot,
    harnessHome,
    libraryHome,
    projectsRoot,
    electronData: join(dataRoot, 'electron'),
    logs: join(dataRoot, 'logs'),
  }
}

/**
 * Apply the channel identity before Electron derives its userData, logs, and
 * single-instance identity. Development keeps the launcher's `--user-data-dir`.
 * @param paths - roots resolved for this launch.
 */
export function applyNovenIdentity(paths: NovenPaths): void {
  app.setName(paths.channel === 'test' ? 'Noven Test' : 'Noven')
  if (!app.isPackaged) {
    app.setAppLogsPath()
    return
  }
  app.setPath('userData', paths.electronData)
  app.setPath('sessionData', paths.electronData)
  app.setAppLogsPath(paths.logs)
}

/**
 * Build the Host environment for this launch without mutating the shell's own
 * environment.
 * @param paths - roots resolved for this launch.
 * @param environment - the shell environment to extend.
 * @param runtimeProfile - optional app-owned Noven profile that supplies code and default patches.
 * @returns a copy carrying the three Noven roots and optional runtime profile.
 */
export function novenHostEnvironment(
  paths: NovenPaths,
  environment: NodeJS.ProcessEnv = process.env,
  runtimeProfile?: string,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    DSH_HOME: paths.harnessHome,
    NOVEN_HOME: paths.libraryHome,
    NOVEN_PROJECTS_ROOT: paths.projectsRoot,
    ...(runtimeProfile === undefined ? {} : { NOVEN_RUNTIME_PROFILE: runtimeProfile }),
  }
}
