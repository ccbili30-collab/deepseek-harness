/** Exercise the packaged Noven renderer, runtime migration, and process identity through Electron CDP. */
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import WebSocket, { type RawData } from 'ws'
import { isEntry } from '../../../scripts/release/process.ts'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'

const START_TIMEOUT_MS = 120_000
const CALL_TIMEOUT_MS = 30_000

/** Inputs for a packaged renderer and migration smoke. */
export interface NovenRendererSmokeOptions {
  /** Packaged Noven.app to launch; it is never modified. */
  readonly app: string
  /** Seed a legacy real-directory profile before the first launch to exercise migration. */
  readonly legacyProfile?: boolean
}

interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface PendingCall { readonly resolve: (value: Record<string, unknown>) => void; readonly reject: (error: Error) => void }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`noven renderer smoke: ${message}`)
}

function cdpError(method: string, error: unknown): Error {
  return new Error(`CDP ${method} failed: ${isRecord(error) && typeof error.message === 'string' ? error.message : String(error)}`)
}

class CdpClient {
  private nextId = 1
  private readonly pending = new Map<number, PendingCall>()
  private readonly listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>()

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => { this.receive(data) })
    ws.on('error', (error) => { this.fail(error) })
    ws.on('close', () => { this.fail(new Error('CDP socket closed')) })
  }

  static async connect(url: string): Promise<CdpClient> {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    return new CdpClient(ws)
  }

  private fail(error: Error): void {
    for (const call of this.pending.values()) call.reject(error)
    this.pending.clear()
  }

  on(method: string, listener: (params: Record<string, unknown>) => void): void {
    const listeners = this.listeners.get(method) ?? new Set<(params: Record<string, unknown>) => void>()
    listeners.add(listener)
    this.listeners.set(method, listeners)
  }

  private receive(data: RawData): void {
    const parsed: unknown = JSON.parse(String(data))
    if (isRecord(parsed) && typeof parsed.method === 'string') {
      const params = isRecord(parsed.params) ? parsed.params : {}
      for (const listener of this.listeners.get(parsed.method) ?? []) listener(params)
      return
    }
    if (!isRecord(parsed) || typeof parsed.id !== 'number') return
    const pending = this.pending.get(parsed.id)
    if (pending === undefined) return
    this.pending.delete(parsed.id)
    if (parsed.error !== undefined) pending.reject(cdpError('response', parsed.error))
    else if (isRecord(parsed.result)) pending.resolve(parsed.result)
    else pending.resolve({})
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, CALL_TIMEOUT_MS)
      const settle = (fn: () => void): void => {
        clearTimeout(timer)
        fn()
      }
      this.pending.set(id, {
        resolve: (value) => { settle(() => { resolve(value) }) },
        reject: (error) => { settle(() => { reject(error) }) },
      })
    })
    this.ws.send(JSON.stringify({ id, method, params }))
    return result
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.call('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    })
    if (result.exceptionDetails !== undefined) throw new Error(`renderer evaluation failed: ${expression}`)
    const remote = result.result
    requireCondition(isRecord(remote), 'Runtime.evaluate returned no remote object')
    return remote.value
  }

  async waitFor(expression: string, timeoutMs = CALL_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs
    let lastError: unknown
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(`Boolean(${expression})`) === true) return
      } catch (error) { lastError = error }
      await sleep(100)
    }
    throw new Error(`renderer condition timed out: ${expression}${lastError === undefined ? '' : ` (${String(lastError)})`}`)
  }

  private async rectangle(selector: string): Promise<Rect> {
    const value = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) return undefined
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })()`)
    requireCondition(isRecord(value), `element not found: ${selector}`)
    const { x, y, width, height } = value
    requireCondition(typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number', `invalid bounds: ${selector}`)
    requireCondition(width > 0 && height > 0, `element has no clickable area: ${selector}`)
    return { x, y, width, height }
  }

  private async clickPoint(x: number, y: number): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }

  async click(selector: string): Promise<void> {
    const rect = await this.rectangle(selector)
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const coveredBy = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      const hit = document.elementFromPoint(${String(x)}, ${String(y)})
      return hit === element || element?.contains(hit) === true || hit?.contains(element) === true ? '' : hit?.outerHTML ?? 'no hit target'
    })()`)
    requireCondition(coveredBy === '', `click target is covered: ${selector}: ${String(coveredBy).slice(0, 500)}`)
    await this.clickPoint(x, y)
  }

  async clickText(selector: string, text: string): Promise<void> {
    const value = await this.evaluate(`(() => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(candidate => candidate.textContent?.trim() === ${JSON.stringify(text)})
      if (!element) return undefined
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })()`)
    requireCondition(isRecord(value), `text not found: ${text} (${selector})`)
    const { x, y, width, height } = value
    requireCondition(typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number', `invalid text bounds: ${text}`)
    const pointX = x + width / 2
    const pointY = y + height / 2
    const coveredBy = await this.evaluate(`(() => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(candidate => candidate.textContent?.trim() === ${JSON.stringify(text)})
      const hit = document.elementFromPoint(${String(pointX)}, ${String(pointY)})
      return hit === element || element?.contains(hit) === true || hit?.contains(element) === true ? '' : hit?.outerHTML ?? 'no hit target'
    })()`)
    requireCondition(coveredBy === '', `text click target is covered: ${text}: ${String(coveredBy).slice(0, 500)}`)
    await this.clickPoint(pointX, pointY)
  }

  async text(selector: string): Promise<string> {
    return String(await this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`))
  }

  async close(): Promise<void> {
    this.ws.close()
  }
}

interface RunningRenderer {
  readonly child: ChildProcess
  readonly startedAt: number
  readonly cdp: CdpClient
  readonly stderr: () => string
  readonly diagnostics: () => string
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  requireCondition(typeof address === 'object' && address !== null, 'could not allocate a CDP port')
  const port = address.port
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  return port
}

async function launchRenderer(app: string, home: string): Promise<RunningRenderer> {
  const port = await freePort()
  const executable = process.platform === 'win32' ? join(app, 'Noven.exe') : join(app, 'Contents', 'MacOS', 'Noven')
  requireCondition(existsSync(executable), `application executable is missing: ${executable}`)
  const child = spawn(executable, [`--remote-debugging-port=${String(port)}`], {
    cwd: home,
    env: {
      PATH: process.env.PATH ?? '', HOME: home, TMPDIR: process.env.TMPDIR ?? tmpdir(),
      NOVEN_DATA_ROOT: home, NOVEN_CHANNEL: 'release', DSH_DESKTOP_WEB_PORT: '0', NODE_OPTIONS: '', NOVEN_STARTUP_DEBUG: '1',
      ...(process.env.LANG === undefined ? {} : { LANG: process.env.LANG }),
      ...(process.env.LC_ALL === undefined ? {} : { LC_ALL: process.env.LC_ALL }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-64 * 1024) })
  child.stdout?.pipe(process.stdout)
  try {
    let pages: unknown
    await (async () => {
      const deadline = Date.now() + START_TIMEOUT_MS
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`, { signal: AbortSignal.timeout(1000) })
          if (response.ok) {
            pages = await response.json()
            if (Array.isArray(pages) && pages.some(page => isRecord(page) && typeof page.webSocketDebuggerUrl === 'string')) return
          }
        } catch { /* The Electron debugger is not ready yet. */ }
        await sleep(100)
      }
      throw new Error('Electron CDP did not become ready')
    })()
    requireCondition(Array.isArray(pages), 'CDP returned no pages')
    const page = pages.find(candidate => isRecord(candidate) && typeof candidate.webSocketDebuggerUrl === 'string')
    requireCondition(isRecord(page) && typeof page.webSocketDebuggerUrl === 'string', 'CDP returned no renderer socket')
    const cdp = await CdpClient.connect(page.webSocketDebuggerUrl)
    await cdp.call('Runtime.enable')
    await cdp.call('Log.enable')
    await cdp.call('Page.enable')
    await cdp.call('Network.enable')
    let diagnostics = ''
    const append = (value: unknown): void => { diagnostics = `${diagnostics}${JSON.stringify(value)}\n`.slice(-64 * 1024) }
    cdp.on('Runtime.exceptionThrown', append)
    cdp.on('Network.responseReceived', (params) => {
      if (isRecord(params.response) && typeof params.response.status === 'number' && params.response.status >= 400) append(params.response)
    })
    cdp.on('Network.loadingFailed', append)
    cdp.on('Runtime.consoleAPICalled', (params) => { if (params.type === 'error') append(params) })
    cdp.on('Log.entryAdded', (params) => {
      if (isRecord(params.entry) && params.entry.level === 'error') append(params.entry)
    })
    return { child, startedAt: Date.now(), cdp, stderr: () => stderr, diagnostics: () => diagnostics }
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => { child.once('exit', () => { resolve() }) })
      child.kill('SIGKILL')
      await exited
    }
    throw error
  }
}

async function stopRenderer(running: RunningRenderer): Promise<void> {
  const { child, cdp } = running
  if (child.exitCode !== null || child.signalCode !== null) {
    await cdp.close()
    return
  }
  const exited = new Promise<void>((resolve) => { child.once('exit', () => { resolve() }) })
  try { await cdp.call('Browser.close') } catch { /* The app may already have closed the socket. */ }
  if (!await Promise.race([exited.then(() => true), sleep(10_000, false)])) child.kill('SIGTERM')
  if (!await Promise.race([exited.then(() => true), sleep(5_000, false)])) child.kill('SIGKILL')
  await exited
  await cdp.close()
}

async function enterWorkbench(cdp: CdpClient): Promise<void> {
  await cdp.waitFor('document.querySelector(\'.nv-create-page\') || (document.querySelector(\'.nv-tree\') && document.querySelector(\'.nv-canvas\'))', START_TIMEOUT_MS)
  await cdp.waitFor('!document.documentElement.hasAttribute(\'data-create-scene\')')
  if (await cdp.evaluate('Boolean(document.querySelector(\'.nv-create-page\'))') === true) {
    await cdp.click('.nv-create-path')
  }
  await cdp.waitFor('document.querySelector(\'.nv-tree\') && document.querySelector(\'.nv-canvas\')', 30_000)
  await cdp.waitFor('!document.documentElement.hasAttribute(\'data-create-scene\')')
}

async function basicWorkbench(running: RunningRenderer): Promise<void> {
  const { cdp } = running
  try {
    await enterWorkbench(cdp)
  } catch (error) {
    const url = String(await cdp.evaluate('location.href'))
    const body = (await cdp.text('body')).slice(0, 1200)
    const finalBoot = await cdp.evaluate(`(async () => {
      const gate = globalThis.__DSH_BOOT_READY__
      const gateState = gate?.promise === undefined ? 'missing' : await Promise.race([
        gate.promise.then(() => 'resolved', error => 'rejected:' + String(error)),
        new Promise(resolve => setTimeout(() => resolve('pending'), 1000)),
      ])
      const desktop = globalThis.dshDesktopBoot
      const desktopState = desktop?.ready === undefined ? 'missing' : await Promise.race([
        desktop.ready().then(result => ({ injections: result.injections?.length }), error => 'rejected:' + String(error)),
        new Promise(resolve => setTimeout(() => resolve('pending'), 1000)),
      ])
      return { gateState, desktopState,
        hasModuleLoader: typeof globalThis.__ModuleLoader__ !== 'undefined',
        hasBootManifest: typeof globalThis.__DSH_BOOT__ !== 'undefined',
        bootType: typeof globalThis.__DSH_BOOT__,
        bootKeys: Object.keys(globalThis.__DSH_BOOT__ ?? {}),
        bootSample: JSON.stringify(globalThis.__DSH_BOOT__).slice(0, 5000),
        novenEntries: globalThis.__DSH_BOOT__?.entries?.filter(entry => entry.id.includes('noven')).map(entry => ({ id: entry.id, inject: entry.inject, external: entry.external, immediately: entry.immediately })),
        entryCount: globalThis.__DSH_BOOT__?.entries?.length,
        rootChildren: document.querySelector('#root')?.childElementCount,
        arc: document.querySelector('[data-dsh-boot-spinner]')?.style.getPropertyValue('--dsh-boot-arc'),
        rootHtml: document.querySelector('#root')?.outerHTML?.slice(0, 4000),
        resources: performance.getEntriesByType('resource').slice(-20).map(entry => ({ name: entry.name, duration: entry.duration, initiator: entry.initiatorType })),
        scripts: [...document.scripts].map(script => ({ src: script.src, type: script.type })),
      }
    })()`)
    throw new Error(`${String(error)}; url=${url}; finalBoot=${JSON.stringify(finalBoot)}; body=${body}`)
  }
  requireCondition(!(await cdp.text('body')).includes('DeepSeek Harness'), 'DSH fallback UI is visible')
  requireCondition((await cdp.text('body')).includes('Noven'), 'Noven brand is missing')

  if (await cdp.evaluate('!document.querySelector(\'[data-sidebar-collapsed]\')') === true) {
    await cdp.click('[data-sidebar-col] button[aria-label="收起侧边栏"]')
    await cdp.waitFor('document.querySelector(\'[data-sidebar-collapsed]\')')
  }
  await cdp.waitFor('document.querySelector(\'[data-shell-leading] button[aria-label="打开侧边栏"]\')')
  await cdp.click('[data-shell-leading] button[aria-label="打开侧边栏"]')
  await cdp.waitFor('!document.querySelector(\'[data-sidebar-collapsed]\')')

  await cdp.clickText('.nv-desk-name', '空白世界')
  await cdp.waitFor('document.querySelector(\'.nv-cardpage\')')
  await cdp.click('.nv-tree-card .nv-tree-add')
  await cdp.waitFor('document.querySelector(\'.nv-modlib\')')
  await cdp.clickText('.nv-modlib-tilename', '文档')
  await cdp.waitFor('[...document.querySelectorAll(\'.nv-tree-module .nv-tree-name\')].some(element => element.textContent?.trim() === \'文档\')')
  await cdp.clickText('.nv-tree-module .nv-tree-name', '文档')
  await cdp.waitFor('document.querySelector(\'.nv-card-bn\')')
  await cdp.click('.nv-tree-card .nv-tree-add')
  await cdp.waitFor('document.querySelector(\'.nv-modlib\')')
  await cdp.clickText('.nv-modlib-tilename', '地图')
  await cdp.waitFor('[...document.querySelectorAll(\'.nv-tree-module .nv-tree-name\')].some(element => element.textContent?.trim() === \'地图\')')
  await cdp.clickText('.nv-tree-module .nv-tree-name', '地图')
  await cdp.waitFor('document.querySelector(\'.nv-fmg-host[data-ready]\')')

  await cdp.clickText('.nv-tree-foothalf', '工具')
  await cdp.clickText('[role="menu"] [role="menuitem"], [role="menu"] button', '新建终端')
  await cdp.waitFor('document.querySelector(\'.nv-canvas-page-slot:not([hidden]) .nv-canvas-page .xterm\')')
  await cdp.waitFor(`(() => {
    const element = document.querySelector('.nv-canvas-page-slot:not([hidden]) .nv-canvas-page .xterm textarea')
    const rect = element?.getBoundingClientRect()
    return rect !== undefined && rect.width > 0 && rect.height > 0
  })()`)
  await cdp.click('.nv-canvas-page-slot:not([hidden]) .nv-canvas-page .xterm textarea')
  await cdp.call('Input.insertText', { text: "printf 'NOVEN_RENDERER_OK\\n'" })
  await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.waitFor('document.querySelector(\'.nv-canvas-page-slot:not([hidden]) .nv-canvas-page\')?.textContent?.includes(\'NOVEN_RENDERER_OK\')')
  await cdp.clickText('.nv-canvas-tabtitle', '起点')
  await cdp.clickText('.nv-canvas-tabtitle', '终端')
  requireCondition((await cdp.text('.nv-canvas-page-slot:not([hidden]) .nv-canvas-page')).includes('NOVEN_RENDERER_OK'), 'terminal marker was lost after tab switching')
  await cdp.click('.nv-canvas-tab-on .nv-canvas-tabx')
  await cdp.waitFor('![...document.querySelectorAll(\'.nv-canvas-tabtitle\')].some(element => element.textContent?.trim() === \'终端\')')
  await cdp.waitFor('!document.querySelector(\'.nv-canvas-page .xterm\')')
}

function persistenceSnapshot(home: string): Record<string, unknown> {
  const registry = join(home, 'library', 'projects.json')
  const projects = join(home, 'projects')
  return {
    registry: existsSync(registry) ? readFileSync(registry, 'utf8') : '<missing>',
    files: existsSync(projects) ? readdirSync(projects, { recursive: true }).slice(0, 200) : [],
  }
}

function assertIsolatedWorkspaces(home: string): void {
  const state = JSON.parse(readFileSync(join(home, 'harness', 'storages', 'workspace.json'), 'utf8')) as {
    tables: { workspaces: Record<string, { path: string }> }
  }
  const projectsRoot = realpathSync(resolve(home, 'projects'))
  for (const workspace of Object.values(state.tables.workspaces)) {
    const path = realpathSync(workspace.path)
    requireCondition(path === projectsRoot || path.startsWith(`${projectsRoot}${sep}`), `Workspace escaped the isolated projects root: ${path}`)
  }
}

/** Start the packaged renderer, check real creative UI and migration, then restart with a new process identity. */
export async function smokeNovenRenderer(options: NovenRendererSmokeOptions): Promise<void> {
  const app = resolve(options.app)
  const home = mkdtempSync(join(tmpdir(), 'noven-renderer-smoke-'))
  const profile = join(home, 'harness', 'profiles', 'desktop')
  if (options.legacyProfile === true) {
    cpSync(join(app, 'Contents', 'Resources', 'noven-profile'), profile, { recursive: true })
    writeFileSync(join(profile, 'user-marker.txt'), 'preserve-user-state\n')
    mkdirSync(join(profile, 'user-plugin'), { recursive: true })
    writeFileSync(join(profile, 'user-plugin', 'package.json'), '{"name":"user-plugin","version":"1.0.0"}\n')
  }
  let first: RunningRenderer | undefined
  let second: RunningRenderer | undefined
  try {
    first = await launchRenderer(app, home)
    await basicWorkbench(first)
    assertIsolatedWorkspaces(home)
    const firstPid = first.child.pid
    requireCondition(typeof firstPid === 'number', 'first renderer has no PID')
    if (options.legacyProfile === true) {
      requireCondition(readFileSync(join(profile, 'user-marker.txt'), 'utf8') === 'preserve-user-state\n', 'user marker was lost')
      requireCondition(lstatSync(join(profile, 'node_modules', 'noven-brand')).isSymbolicLink(), 'legacy Noven package was not migrated to a link')
      requireCondition(lstatSync(join(profile, 'user-plugin')).isDirectory(), 'user package was not preserved')
    }
    const beforeRestart = persistenceSnapshot(home)
    await stopRenderer(first)
    second = await launchRenderer(app, home)
    requireCondition(second.child.pid !== firstPid, 'restart reused the old process identity')
    await enterWorkbench(second.cdp)
    try {
      await second.cdp.waitFor('document.body.textContent?.includes(\'未命名世界\')')
    } catch (error) {
      const body = (await second.cdp.text('body')).slice(0, 4000)
      throw new Error(`${String(error)}; restoredBody=${body}; beforeRestart=${JSON.stringify(beforeRestart)}; afterRestart=${JSON.stringify(persistenceSnapshot(home))}`)
    }
    assertIsolatedWorkspaces(home)
    await stopRenderer(second)
    console.log(`noven renderer smoke: first-run, creative UI, migration, restart, and process identity passed (${app})`)
  } catch (error) {
    if (first !== undefined) console.error('noven renderer smoke: Host stderr', first.stderr())
    if (first !== undefined) console.error('noven renderer smoke: renderer diagnostics', first.diagnostics())
    if (second !== undefined) console.error('noven renderer smoke: restart stderr', second.stderr())
    if (second !== undefined) console.error('noven renderer smoke: restart diagnostics', second.diagnostics())
    throw error
  } finally {
    if (first !== undefined && first.child.exitCode === null && first.child.signalCode === null) await stopRenderer(first)
    if (second !== undefined && second.child.exitCode === null && second.child.signalCode === null) await stopRenderer(second)
    rmSync(home, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) {
  const paths = resolveDesktopTargetBuildPaths()
  const app = join(paths.unsignedArtifacts, 'mac-arm64', 'Noven.app')
  await smokeNovenRenderer({ app, legacyProfile: true })
}
