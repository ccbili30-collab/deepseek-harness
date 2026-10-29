/** Exercise the generated Noven profile through real Host startup and creative writes. */
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DesktopHostProcess } from '../src/host-process.ts'
import { DesktopProjectManager } from '../src/project-manager.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { isEntry } from '../../../scripts/release/process.ts'

/** Inputs for one real Noven creative smoke run. */
export interface NovenSmokeOptions {
  readonly dshRoot: string
  /** Prepared profile path, or a seed operation that creates one inside the disposable home. */
  readonly profile: string | ((home: string) => Promise<string>)
  /** Immutable app-owned profile used for code and default patches; defaults to a string profile path. */
  readonly runtimeProfile?: string
  readonly electron: string
  readonly resourcesRuntime: string
}

/**
 * Prepare a disposable user profile through the same release reconciliation used by Electron.
 * @param dshRoot - Readable core runtime used to validate the release descriptor.
 * @param runtimeProfile - Immutable app-owned Noven profile.
 * @returns A smoke-profile factory scoped to one disposable home.
 */
export function managedNovenSmokeProfile(dshRoot: string, runtimeProfile: string): (home: string) => Promise<string> {
  return async (home) => {
    const manager = new DesktopProjectManager(resolveDesktopPaths(home), { dsh: dshRoot })
    await manager.applyRelease(runtimeProfile)
    return manager.paths.profile
  }
}

function defaultNovenSmokeOptions(): NovenSmokeOptions {
  const paths = resolveDesktopTargetBuildPaths()
  const runtimeProfile = process.env.NOVEN_CHANNEL === 'test' ? paths.novenProfileTest : paths.novenProfile
  return {
    dshRoot: paths.dsh,
    profile: managedNovenSmokeProfile(paths.dsh, runtimeProfile),
    runtimeProfile,
    electron: join(paths.electron, process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron'),
    resourcesRuntime: paths.runtime,
  }
}

/**
 * Reject Host diagnostics that prove an enabled plugin did not activate or a registration conflicted.
 * @param diagnostic - Bounded Host stderr captured after startup or creative operations.
 * @returns Nothing when every enabled plugin activated without a registration conflict.
 */
export function assertNovenPluginActivation(diagnostic: string): void {
  if (/(?:did not activate|already registered|has been registered)/u.test(diagnostic)) {
    throw new Error(`noven smoke: Host plugin activation audit failed: ${diagnostic}`)
  }
}

/** Start a disposable Host and verify real project, card, document, map, Session, and terminal writes. */
export async function smokeNovenProfile(options: NovenSmokeOptions): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'noven-profile-smoke-'))
  const project = join(home, 'project')
  const libraryHome = join(home, 'library')
  const projectsRoot = join(home, 'projects')
  mkdirSync(project, { recursive: true })
  let host: DesktopHostProcess | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function requireCondition(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`noven smoke: ${message}`)
  }

  try {
    const profile = typeof options.profile === 'function' ? await options.profile(home) : options.profile
    const runtimeProfile = options.runtimeProfile ?? (typeof options.profile === 'string' ? options.profile : undefined)
    host = new DesktopHostProcess(options.electron, options.dshRoot, profile, undefined, {
      ...process.env,
      NODE_OPTIONS: '',
      DSH_DESKTOP_WEB_PORT: '0',
      DSH_HOME: home,
      NOVEN_HOME: libraryHome,
      NOVEN_PROJECTS_ROOT: projectsRoot,
      ...(runtimeProfile === undefined ? {} : { NOVEN_RUNTIME_PROFILE: runtimeProfile }),
    }, undefined, join(options.resourcesRuntime, 'primary-runtime'), {
      pnpm: join(options.resourcesRuntime, 'pnpm', 'bin', 'pnpm.cjs'),
      nodeBin: join(options.resourcesRuntime, 'bin'),
    })
    const ready = await Promise.race([host.start(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('noven smoke: Host readiness exceeded 120 seconds')) }, 120_000)
    })])
    clearTimeout(timer)
    assertNovenPluginActivation(host.hostDiagnostic)
    const login = await fetch(ready.url, { redirect: 'manual' })
    requireCondition(login.status === 303 || login.status === 200, `authentication failed with HTTP ${login.status}`)
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const get = async (path: string): Promise<unknown> => {
      const response = await fetch(new URL(path, ready.url), { headers: { cookie }, signal: AbortSignal.timeout(30_000) })
      const text = await response.text()
      requireCondition(response.ok, `GET ${path} failed with HTTP ${response.status}: ${text.slice(0, 500)}`)
      return JSON.parse(text)
    }
    const post = async (path: string, body: unknown): Promise<unknown> => {
      const response = await fetch(new URL(path, ready.url), {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
      const text = await response.text()
      requireCondition(response.ok, `POST ${path} failed with HTTP ${response.status}: ${text.slice(0, 500)}`)
      return JSON.parse(text)
    }
    const rpc = async <T>(method: string, args: unknown): Promise<T> => {
      const body = await post(`/api/${method}`, {
        type: 'client-request', rpcId: `noven-smoke-${method}-${randomUUID()}`, method, payload: { args },
      }) as { result: { ok: boolean; value?: unknown; error?: { code: string; message: string } } }
      requireCondition(body.result.ok, `${method} failed: ${JSON.stringify(body.result.error)}`)
      return body.result.value as T
    }

    const projects = await get('/api/noven-projects') as { projects: unknown[]; miscRoot: string }
    requireCondition(Array.isArray(projects.projects), 'project registry did not return a list')
    requireCondition(projects.miscRoot === join(projectsRoot, '杂项'), 'misc project root is not isolated')
    const registration = await post('/api/noven-projects', { op: 'register', root: project, title: 'Smoke Project' }) as { ok?: boolean }
    requireCondition(registration.ok === true, 'project registration failed')
    requireCondition(existsSync(join(libraryHome, 'projects.json')), 'registry was not written to the isolated library root')

    const library = await get(`/api/noven-library?root=${encodeURIComponent(project)}`)
    requireCondition(typeof library === 'object' && library !== null, 'library payload is unavailable')

    const createdCard = await post(`/api/noven-cards?root=${encodeURIComponent(project)}`, {
      op: 'create', kind: 'WORLD', name: 'Smoke World', starter: 'blank',
    }) as { ok?: boolean; cardId?: string }
    requireCondition(createdCard.ok === true && typeof createdCard.cardId === 'string', 'world card creation failed')
    const cardId = createdCard.cardId
    const cardPath = `/api/noven-cards?root=${encodeURIComponent(project)}`

    const documentModule = await post(cardPath, {
      op: 'apply', cardId, command: { kind: 'add_module', name: 'Chapter One' },
    }) as { createdModuleIds?: string[] }
    const documentModuleId = documentModule.createdModuleIds?.[0]
    requireCondition(typeof documentModuleId === 'string', 'document module creation returned no id')
    await post(cardPath, {
      op: 'apply', cardId,
      command: { kind: 'write_markdown', moduleId: documentModuleId, name: 'Chapter One', text: '# Smoke chapter\n\nA real document write.' },
    })

    const mapModule = await post(cardPath, {
      op: 'apply', cardId, command: { kind: 'add_module', name: 'Atlas', preset: 'map' },
    }) as { createdModuleIds?: string[] }
    const mapModuleId = mapModule.createdModuleIds?.[0]
    requireCondition(typeof mapModuleId === 'string', 'map module creation returned no id')
    await post(cardPath, {
      op: 'apply', cardId,
      command: { kind: 'map_add_marker', moduleId: mapModuleId, marker: { label: 'Citadel', x: 10, y: 20 } },
    })
    const cardPayload = JSON.stringify(await get(`${cardPath}&card=${encodeURIComponent(cardId)}`))
    requireCondition(cardPayload.includes('Chapter One'), 'written document module is absent from card payload')
    requireCondition(cardPayload.includes('A real document write.'), 'document text is absent from card payload')
    requireCondition(cardPayload.includes('Citadel'), 'map marker is absent from card payload')

    const createdSession = await rpc('session/create', { request: { cwd: project } }) as { sessionId: string }
    requireCondition(typeof createdSession.sessionId === 'string', 'session creation returned no sessionId')
    const terminalEnvironment = await rpc('terminal/environment', { agentId: createdSession.sessionId }) as { cwd: string }
    console.log('noven smoke: terminal cwd', terminalEnvironment.cwd)
    console.log('noven smoke: shells', await rpc('terminal/shells', { agentId: createdSession.sessionId }))
    const terminal = await rpc('terminal/create', {
      agentId: createdSession.sessionId,
      request: { id: 'noven-smoke-terminal', cols: 80, rows: 24, shellPath: '/bin/bash' },
    }) as { id: string; shell?: { path?: string } }
    requireCondition(typeof terminal.id === 'string', 'terminal creation returned no terminal id')
    await rpc('terminal/close', { agentId: createdSession.sessionId, id: terminal.id })
    assertNovenPluginActivation(host.hostDiagnostic)
    console.log(`noven smoke: Host, project, card, document, map, session, and terminal passed (${profile})`)
  } catch (error) {
    console.error('noven smoke: Host stderr', host?.hostDiagnostic)
    throw error
  } finally {
    clearTimeout(timer)
    await host?.stop()
    rmSync(home, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) await smokeNovenProfile(defaultNovenSmokeOptions())
