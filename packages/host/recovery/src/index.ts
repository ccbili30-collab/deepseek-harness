/** Loopback-only bridge from the running Host to the boot-independent recovery CLI. */

import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-cmdline'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  RecoveryCheckpoint,
  RecoveryCreateResult,
  RecoveryOverview,
  RecoveryRestoreReceipt,
  RecoveryShutdownReceipt,
  RecoveryVerifyResult,
} from './types.ts'

export type * from './types.ts'

interface CliVerification {
  id: string
  valid: boolean
  files: number
  bytes: number
}

interface CliList {
  snapshots: Array<Partial<RecoveryCheckpoint> & { id: string; status: 'published' | 'corrupt' }>
}

interface CliCreate {
  manifest: { id: string; source: { files: unknown[] }; dshHome: { files: unknown[] } }
  files: number
  bytes: number
}

interface RestartSpec {
  executable: string
  execArgv: string[]
  argv: string[]
  cwd: string
}

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const SNAPSHOT_ID = /^\d{8}T\d{6}\.\d{3}Z-[a-f0-9]{8}$/

function recoveryStore(): string {
  return resolve(process.env.DSH_RECOVERY_HOME ?? join(homedir(), '.dsh-recovery'))
}

function sourceRoot(): string | undefined {
  const value = process.env.DSH_SOURCE_HOME
  return value === undefined || value === '' ? undefined : resolve(value)
}

function cliPrefix(): string[] {
  const script = process.argv[1]
  if (script === undefined || script === '') throw new Error('recovery: the current DSH CLI script is unavailable')
  return [
    ...process.execArgv.filter(argument => !argument.startsWith('--inspect')),
    script,
  ]
}

function rootArguments(source: string): string[] {
  return [
    '--source', source,
    '--dsh-home', resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh')),
    '--store', recoveryStore(),
  ]
}

function runCli<T>(args: readonly string[]): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [...cliPrefix(), 'recovery', ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let bytes = 0
    const append = (chunks: Buffer[], chunk: Buffer): void => {
      bytes += chunk.length
      if (bytes > MAX_OUTPUT_BYTES) {
        child.kill()
        reject(new Error('recovery: CLI output exceeded the safety limit'))
        return
      }
      chunks.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => { append(stdout, chunk) })
    child.stderr.on('data', (chunk: Buffer) => { append(stderr, chunk) })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `recovery CLI exited with ${String(code)}`))
        return
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(stdout).toString('utf8')) as T)
      } catch (error) {
        reject(new Error('recovery: CLI returned invalid JSON', { cause: error }))
      }
    })
  })
}

function requireSource(): string {
  const source = sourceRoot()
  if (source === undefined) {
    throw new Error('Recovery is unavailable: launch DSH from a Git checkout or set DSH_SOURCE_HOME')
  }
  return source
}

function checkpointOf(item: CliList['snapshots'][number]): RecoveryCheckpoint {
  return {
    id: item.id,
    status: item.status,
    createdAt: item.createdAt ?? '',
    reason: item.reason === 'pre-restore' ? 'pre-restore' : 'manual',
    label: item.label ?? '',
    sourceFiles: item.sourceFiles ?? 0,
    dshFiles: item.dshFiles ?? 0,
    error: item.error ?? '',
  }
}

/** Local recovery control plane. Connection pins every exported endpoint to loopback. */
export class RecoveryGateway extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'recovery')
  }

  /**
   * Read checkpoints without requiring the source checkout to be healthy.
   * @returns Current availability and every published or corrupt checkpoint.
   */
  @Remote('list')
  async list(): Promise<RecoveryOverview> {
    const source = sourceRoot()
    const listed = await runCli<CliList>(['list', '--store', recoveryStore(), '--json'])
    return {
      available: source !== undefined,
      sourceRoot: source ?? '',
      storeRoot: recoveryStore(),
      checkpoints: listed.snapshots.map(checkpointOf),
      unavailableReason: source === undefined
        ? 'Launch DSH from a Git checkout or set DSH_SOURCE_HOME.'
        : '',
    }
  }

  /**
   * Create a manual immutable checkpoint.
   * @param label - Human-readable checkpoint label; blank selects the default.
   * @returns Created checkpoint identity and payload totals.
   */
  @Remote('create')
  async create(label: string): Promise<RecoveryCreateResult> {
    const source = requireSource()
    const result = await runCli<CliCreate>([
      'create', ...rootArguments(source), '--label', label.trim() || 'Manual checkpoint', '--json',
    ])
    return { id: result.manifest.id, files: result.files, bytes: result.bytes }
  }

  /**
   * Verify the manifest and every stored payload hash.
   * @param snapshot - Exact checkpoint id.
   * @returns Verification totals for the valid checkpoint.
   */
  @Remote('verify')
  async verify(snapshot: string): Promise<RecoveryVerifyResult> {
    const result = await runCli<CliVerification>(['verify', snapshot, '--store', recoveryStore(), '--json'])
    return result
  }

  /**
   * Start the detached guardian, then request bounded shutdown of this Host.
   * @param snapshot - Exact verified checkpoint id selected by the user.
   * @returns Receipt written before the Host begins shutting down.
   */
  @Remote('scheduleRestore')
  async scheduleRestore(snapshot: string): Promise<RecoveryRestoreReceipt> {
    if (!SNAPSHOT_ID.test(snapshot)) throw new Error('recovery: invalid checkpoint id')
    const source = requireSource()
    await this.verify(snapshot)
    const exit = this.ctx.get('appExit')
    if (exit === undefined) throw new Error('recovery: the launcher did not provide appExit')

    const store = recoveryStore()
    const logs = join(store, 'logs')
    mkdirSync(logs, { recursive: true, mode: 0o700 })
    const logPath = join(logs, `restore-${snapshot}.log`)
    const descriptor: RestartSpec = {
      executable: process.execPath,
      execArgv: [...process.execArgv],
      argv: process.argv.slice(1),
      cwd: process.cwd(),
    }
    const log = openSync(logPath, 'a', 0o600)
    let guardian: ChildProcess
    try {
      guardian = spawn(process.execPath, [
        ...cliPrefix(),
        'recovery', 'guardian-restore',
        '--snapshot', snapshot,
        '--parent-pid', String(process.pid),
        '--restart-spec', Buffer.from(JSON.stringify(descriptor)).toString('base64url'),
        ...rootArguments(source),
      ], {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: ['ignore', log, log],
      })
      await new Promise<void>((resolvePromise, reject) => {
        guardian.once('spawn', resolvePromise)
        guardian.once('error', reject)
      })
      guardian.unref()
    } finally {
      closeSync(log)
    }
    setTimeout(() => { exit(0) }, 250)
    return { accepted: true, snapshot, logPath }
  }

  /**
   * Request a clean shutdown without starting a guardian or replacement Host.
   * @returns Receipt sent before the bounded app-exit request runs.
  */
  @Remote('shutdown')
  shutdown(): Promise<RecoveryShutdownReceipt> {
    const exit = this.ctx.get('appExit')
    if (exit === undefined) throw new Error('recovery: the launcher did not provide appExit')
    setTimeout(() => { exit(0) }, 250)
    return Promise.resolve({ accepted: true })
  }
}

export default RecoveryGateway
