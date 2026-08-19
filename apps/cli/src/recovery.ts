/**
 * Boot-independent recovery checkpoints for DSH source and control-plane files.
 *
 * This module deliberately imports only Node built-ins. It must stay callable
 * when profile composition, Cordis, or an installed plugin cannot load.
 * @module @deepseek-ai/dsh/recovery
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { RecoveryInvocation } from './args.ts'

const SCHEMA_VERSION = 1 as const
const SNAPSHOT_ID = /^\d{8}T\d{6}\.\d{3}Z-[a-f0-9]{8}$/
const GIT_OBJECT_ID = /^[a-f0-9]{40,64}$/
const PROFILE_FILES = new Set(['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
const HOME_FILES = new Set(['cordis.patch.yml', 'settings.yaml'])
const EXCLUSIONS = [
  'credentials and secret environment files',
  'sessions and attachments',
  'storages and workspace content',
  'node_modules and generated dependencies',
] as const

type SnapshotReason = 'manual' | 'pre-restore'
type SnapshotScope = 'source' | 'dsh-home'
type SnapshotFileType = 'file' | 'symlink'

interface SnapshotFile {
  path: string
  type: SnapshotFileType
  sha256: string
  size: number
  mode: number
  linkTarget?: string
}

interface SourceSnapshot {
  root: string
  gitHead: string
  files: SnapshotFile[]
}

interface HomeSnapshot {
  root: string
  files: SnapshotFile[]
}

interface SnapshotManifest {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  createdAt: string
  reason: SnapshotReason
  label?: string
  source: SourceSnapshot
  dshHome: HomeSnapshot
  exclusions: string[]
}

interface ResolvedRoots {
  source: string
  dshHome: string
  store: string
}

interface RecoveryRootOptions {
  source?: string
  dshHome?: string
  store?: string
}

interface VerificationResult {
  manifest: SnapshotManifest
  files: number
  bytes: number
}

interface CreateOptions extends ResolvedRoots {
  label?: string
  reason: SnapshotReason
}

interface RestoreReport {
  restoredFiles: number
  restoredBytes: number
  rescueSnapshot: string
  dependencyReconciliation: 'required' | 'not-needed'
}

interface RestartSpec {
  executable: string
  execArgv: string[]
  argv: string[]
  cwd: string
}

interface PublishedSnapshotListItem {
  id: string
  createdAt: string
  reason: SnapshotReason
  label: string
  sourceFiles: number
  dshFiles: number
  status: 'published'
}

interface CorruptSnapshotListItem {
  id: string
  status: 'corrupt'
  error: string
}

type SnapshotListItem = PublishedSnapshotListItem | CorruptSnapshotListItem

/** An expected operational failure without an implementation stack in CLI output. */
class RecoveryError extends Error {
  override readonly name = 'RecoveryError'
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashFile(path: string): string {
  return sha256(readFileSync(path))
}

function pathPresent(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') throw new RecoveryError(`invalid manifest: ${key} must be a string`)
  return value
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RecoveryError(`invalid manifest: ${key} must be a non-negative integer`)
  }
  return value
}

function safeRelativePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.startsWith('/')) return false
  const parts = path.split('/')
  return parts.every(part => part !== '' && part !== '.' && part !== '..')
}

function excludedSourcePath(path: string): boolean {
  return path.split('/').some(part => part === '.credentials.yaml' || part === '.credentials.yml' || part === '.env' || part.startsWith('.env.'))
}

function allowedHomePath(path: string): boolean {
  if (HOME_FILES.has(path)) return true
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === 'profiles' && parts[1] !== '' && PROFILE_FILES.has(parts[2] ?? '')
}

function parseSnapshotFile(value: unknown, scope: SnapshotScope): SnapshotFile {
  if (!isRecord(value)) throw new RecoveryError('invalid manifest: file entry must be an object')
  const path = requireString(value, 'path')
  const type = requireString(value, 'type')
  const digest = requireString(value, 'sha256')
  const size = requireNumber(value, 'size')
  const mode = requireNumber(value, 'mode')
  if (!safeRelativePath(path)) throw new RecoveryError(`invalid manifest path ${JSON.stringify(path)}`)
  if (scope === 'source' && excludedSourcePath(path)) throw new RecoveryError(`manifest contains excluded source path ${JSON.stringify(path)}`)
  if (scope === 'dsh-home' && !allowedHomePath(path)) throw new RecoveryError(`manifest contains out-of-scope DSH path ${JSON.stringify(path)}`)
  if (type !== 'file' && type !== 'symlink') throw new RecoveryError(`invalid manifest file type ${JSON.stringify(type)}`)
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new RecoveryError(`invalid SHA-256 for ${JSON.stringify(path)}`)
  if (mode > 0o777) throw new RecoveryError(`invalid mode for ${JSON.stringify(path)}`)
  const linkTarget = value.linkTarget
  if (type === 'symlink' && typeof linkTarget !== 'string') {
    throw new RecoveryError(`invalid symlink target for ${JSON.stringify(path)}`)
  }
  if (type === 'file' && linkTarget !== undefined) {
    throw new RecoveryError(`regular file has a symlink target: ${JSON.stringify(path)}`)
  }
  return {
    path,
    type,
    sha256: digest,
    size,
    mode,
    ...typeof linkTarget === 'string' ? { linkTarget } : {},
  }
}

function parseFiles(value: unknown, scope: SnapshotScope): SnapshotFile[] {
  if (!Array.isArray(value)) throw new RecoveryError('invalid manifest: files must be an array')
  const files = value.map(entry => parseSnapshotFile(entry, scope))
  const paths = new Set<string>()
  for (const file of files) {
    if (paths.has(file.path)) throw new RecoveryError(`invalid manifest: duplicate path ${JSON.stringify(file.path)}`)
    paths.add(file.path)
  }
  return files
}

function parseManifest(text: string): SnapshotManifest {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new RecoveryError('invalid manifest: manifest.json is not valid JSON')
  }
  if (!isRecord(value)) throw new RecoveryError('invalid manifest: root must be an object')
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new RecoveryError(`unsupported recovery schema ${JSON.stringify(value.schemaVersion)}`)
  }
  const id = requireString(value, 'id')
  const createdAt = requireString(value, 'createdAt')
  const reason = requireString(value, 'reason')
  if (!SNAPSHOT_ID.test(id)) throw new RecoveryError(`invalid checkpoint id ${JSON.stringify(id)}`)
  if (Number.isNaN(Date.parse(createdAt))) throw new RecoveryError(`invalid checkpoint timestamp ${JSON.stringify(createdAt)}`)
  if (reason !== 'manual' && reason !== 'pre-restore') throw new RecoveryError(`invalid checkpoint reason ${JSON.stringify(reason)}`)
  if (!isRecord(value.source) || !isRecord(value.dshHome)) throw new RecoveryError('invalid manifest: source and dshHome must be objects')
  const sourceRoot = requireString(value.source, 'root')
  const gitHead = requireString(value.source, 'gitHead')
  const homeRoot = requireString(value.dshHome, 'root')
  if (!isAbsolute(sourceRoot) || !isAbsolute(homeRoot)) throw new RecoveryError('invalid manifest: roots must be absolute')
  if (!GIT_OBJECT_ID.test(gitHead)) throw new RecoveryError(`invalid Git HEAD ${JSON.stringify(gitHead)}`)
  if (!Array.isArray(value.exclusions) || !value.exclusions.every(item => typeof item === 'string')) {
    throw new RecoveryError('invalid manifest: exclusions must be strings')
  }
  const label = value.label
  if (label !== undefined && typeof label !== 'string') throw new RecoveryError('invalid manifest: label must be a string')
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    createdAt,
    reason,
    ...typeof label === 'string' ? { label } : {},
    source: { root: sourceRoot, gitHead, files: parseFiles(value.source.files, 'source') },
    dshHome: { root: homeRoot, files: parseFiles(value.dshHome.files, 'dsh-home') },
    exclusions: [...value.exclusions] as string[],
  }
}

function canonicalExistingDirectory(path: string, label: string): string {
  const absolute = resolve(path)
  let status
  try {
    status = lstatSync(absolute)
  } catch {
    throw new RecoveryError(`${label} does not exist: ${absolute}`)
  }
  if (!status.isDirectory() || status.isSymbolicLink()) throw new RecoveryError(`${label} is not a real directory: ${absolute}`)
  return realpathSync(absolute)
}

function canonicalOptionalDirectory(path: string): string {
  const absolute = resolve(path)
  if (!pathPresent(absolute)) return absolute
  return canonicalExistingDirectory(absolute, 'DSH_HOME')
}

function gitText(source: string, args: readonly string[]): string {
  try {
    return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RecoveryError(`cannot inspect Git source at ${source}: ${message}`)
  }
}

function gitSourceRoot(path: string): string {
  const candidate = canonicalExistingDirectory(path, 'source root')
  return canonicalExistingDirectory(gitText(candidate, ['rev-parse', '--show-toplevel']), 'Git source root')
}

function gitHead(source: string): string {
  const head = gitText(source, ['rev-parse', 'HEAD'])
  if (!GIT_OBJECT_ID.test(head)) throw new RecoveryError(`Git returned an invalid HEAD for ${source}`)
  return head
}

function gitFiles(source: string): string[] {
  let output: Buffer
  try {
    output = execFileSync('git', ['-C', source, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 128 * 1024 * 1024,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RecoveryError(`cannot enumerate Git source at ${source}: ${message}`)
  }
  return output.toString('utf8').split('\0').filter(path => path !== '' && !excludedSourcePath(path)).sort()
}

function presentGitFiles(source: string): string[] {
  return gitFiles(source).filter((path) => {
    try {
      lstatSync(join(source, ...path.split('/')))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  })
}

function pathWithin(parent: string, child: string): boolean {
  const relation = relative(parent, child)
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
}

function assertDisjointRoots(roots: ResolvedRoots): void {
  const pairs: ReadonlyArray<readonly [string, string, string, string]> = [
    [roots.source, roots.store, 'source root', 'recovery store'],
    [roots.dshHome, roots.store, 'DSH_HOME', 'recovery store'],
    [roots.source, roots.dshHome, 'source root', 'DSH_HOME'],
  ]
  for (const [left, right, leftName, rightName] of pairs) {
    if (pathWithin(left, right) || pathWithin(right, left)) {
      throw new RecoveryError(`${leftName} and ${rightName} must be separate directories: ${left} ; ${right}`)
    }
  }
}

function resolveRoots(invocation: RecoveryRootOptions): ResolvedRoots {
  const requestedSource = invocation.source ?? process.env.DSH_SOURCE_HOME
  if (requestedSource === undefined || requestedSource === '') {
    throw new RecoveryError('a DSH source checkout is required: pass --source <path> or set DSH_SOURCE_HOME')
  }
  const source = gitSourceRoot(requestedSource)
  const dshHome = canonicalOptionalDirectory(invocation.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'))
  const store = resolve(invocation.store ?? process.env.DSH_RECOVERY_HOME ?? join(homedir(), '.dsh-recovery'))
  const roots = { source, dshHome, store }
  assertDisjointRoots(roots)
  return roots
}

function resolveStore(path?: string): string {
  return resolve(path ?? process.env.DSH_RECOVERY_HOME ?? join(homedir(), '.dsh-recovery'))
}

function payloadPath(snapshotRoot: string, scope: SnapshotScope, path: string): string {
  if (!safeRelativePath(path)) throw new RecoveryError(`unsafe recovery path ${JSON.stringify(path)}`)
  const root = join(snapshotRoot, 'payload', scope)
  const target = join(root, ...path.split('/'))
  if (!pathWithin(root, target)) throw new RecoveryError(`recovery path escapes payload root: ${JSON.stringify(path)}`)
  return target
}

function snapshotId(now = new Date()): string {
  return `${now.toISOString().replaceAll('-', '').replaceAll(':', '')}-${randomBytes(4).toString('hex')}`
}

function describePath(root: string, path: string): SnapshotFile {
  const absolute = join(root, ...path.split('/'))
  const status = lstatSync(absolute)
  const mode = status.mode & 0o777
  if (status.isSymbolicLink()) {
    const linkTarget = readlinkSync(absolute)
    return { path, type: 'symlink', sha256: sha256(linkTarget), size: Buffer.byteLength(linkTarget), mode, linkTarget }
  }
  if (!status.isFile()) throw new RecoveryError(`recovery captures only files and symlinks: ${absolute}`)
  return { path, type: 'file', sha256: hashFile(absolute), size: status.size, mode }
}

function captureFile(root: string, path: string, scope: SnapshotScope, snapshotRoot: string): SnapshotFile {
  const before = describePath(root, path)
  if (before.type === 'symlink') return before
  const source = join(root, ...path.split('/'))
  const destination = payloadPath(snapshotRoot, scope, path)
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  copyFileSync(source, destination)
  chmodSync(destination, 0o600)
  const after = describePath(root, path)
  if (before.sha256 !== after.sha256 || before.type !== after.type || before.size !== after.size) {
    throw new RecoveryError(`file changed while checkpoint was being created: ${source}`)
  }
  if (hashFile(destination) !== before.sha256) throw new RecoveryError(`copied payload failed verification: ${path}`)
  return before
}

function collectHomePaths(home: string): string[] {
  if (!pathPresent(home)) return []
  const paths: string[] = []
  for (const file of HOME_FILES) {
    const absolute = join(home, file)
    if (pathPresent(absolute)) paths.push(file)
  }
  const profiles = join(home, 'profiles')
  if (!pathPresent(profiles)) return paths.sort()
  const profileStatus = lstatSync(profiles)
  if (!profileStatus.isDirectory() || profileStatus.isSymbolicLink()) {
    throw new RecoveryError(`profiles path is not a real directory: ${profiles}`)
  }
  for (const entry of readdirSync(profiles, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    for (const file of PROFILE_FILES) {
      const path = `profiles/${entry.name}/${file}`
      if (pathPresent(join(home, 'profiles', entry.name, file))) paths.push(path)
    }
  }
  return paths.sort()
}

function verifySnapshotDirectory(snapshotRoot: string, expectedId?: string): VerificationResult {
  const status = lstatSync(snapshotRoot)
  if (!status.isDirectory() || status.isSymbolicLink()) throw new RecoveryError(`checkpoint is not a real directory: ${snapshotRoot}`)
  const manifestPath = join(snapshotRoot, 'manifest.json')
  const manifestStatus = lstatSync(manifestPath)
  if (!manifestStatus.isFile() || manifestStatus.isSymbolicLink()) throw new RecoveryError(`checkpoint manifest is not a regular file: ${manifestPath}`)
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'))
  if (expectedId !== undefined && manifest.id !== expectedId) {
    throw new RecoveryError(`checkpoint id mismatch: requested ${expectedId}, manifest contains ${manifest.id}`)
  }
  let bytes = 0
  const verifyFiles = (scope: SnapshotScope, files: readonly SnapshotFile[]): void => {
    for (const file of files) {
      bytes += file.size
      if (file.type === 'symlink') {
        if (sha256(file.linkTarget ?? '') !== file.sha256 || Buffer.byteLength(file.linkTarget ?? '') !== file.size) {
          throw new RecoveryError(`checkpoint symlink metadata is corrupt: ${scope}/${file.path}`)
        }
        continue
      }
      const scopeRoot = join(snapshotRoot, 'payload', scope)
      const scopeStatus = lstatSync(scopeRoot)
      if (!scopeStatus.isDirectory() || scopeStatus.isSymbolicLink()) {
        throw new RecoveryError(`checkpoint payload root is not a real directory: ${scope}`)
      }
      assertNoSymlinkParents(scopeRoot, file.path)
      const payload = payloadPath(snapshotRoot, scope, file.path)
      const payloadStatus = lstatSync(payload)
      if (!payloadStatus.isFile() || payloadStatus.isSymbolicLink()) {
        throw new RecoveryError(`checkpoint payload is not a regular file: ${scope}/${file.path}`)
      }
      if (payloadStatus.size !== file.size || hashFile(payload) !== file.sha256) {
        throw new RecoveryError(`checkpoint payload hash mismatch: ${scope}/${file.path}`)
      }
    }
  }
  verifyFiles('source', manifest.source.files)
  verifyFiles('dsh-home', manifest.dshHome.files)
  return { manifest, files: manifest.source.files.length + manifest.dshHome.files.length, bytes }
}

function verifyPublishedSnapshot(store: string, id: string): VerificationResult {
  if (!SNAPSHOT_ID.test(id)) throw new RecoveryError(`invalid checkpoint id ${JSON.stringify(id)}`)
  const root = join(store, id)
  if (!existsSync(root)) throw new RecoveryError(`checkpoint does not exist: ${id}`)
  return verifySnapshotDirectory(root, id)
}

function createSnapshot(options: CreateOptions): VerificationResult {
  assertDisjointRoots(options)
  mkdirSync(options.store, { recursive: true, mode: 0o700 })
  const store = canonicalExistingDirectory(options.store, 'recovery store')
  const resolvedOptions = { ...options, store }
  assertDisjointRoots(resolvedOptions)
  const id = snapshotId()
  const temporary = join(store, `.tmp-${id}-${process.pid}`)
  const published = join(store, id)
  mkdirSync(temporary, { mode: 0o700 })
  try {
    const sourceHead = gitHead(options.source)
    // A tracked file may be intentionally or accidentally deleted. Omit that
    // current absence from this checkpoint instead of preventing a rescue
    // checkpoint before an older copy restores it.
    const sourceFiles = presentGitFiles(options.source).map(path => captureFile(options.source, path, 'source', temporary))
    const homeFiles = collectHomePaths(options.dshHome).map(path => captureFile(options.dshHome, path, 'dsh-home', temporary))
    if (gitHead(options.source) !== sourceHead) {
      throw new RecoveryError(`Git HEAD changed while checkpoint was being created: ${options.source}`)
    }
    const manifest: SnapshotManifest = {
      schemaVersion: SCHEMA_VERSION,
      id,
      createdAt: new Date().toISOString(),
      reason: options.reason,
      ...options.label === undefined ? {} : { label: options.label },
      source: { root: options.source, gitHead: sourceHead, files: sourceFiles },
      dshHome: { root: options.dshHome, files: homeFiles },
      exclusions: [...EXCLUSIONS],
    }
    writeFileSync(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, { mode: 0o600 })
    const verified = verifySnapshotDirectory(temporary, id)
    renameSync(temporary, published)
    return verified
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

function listSnapshots(store: string): SnapshotListItem[] {
  if (!existsSync(store)) return []
  const storeRoot = canonicalExistingDirectory(store, 'recovery store')
  return readdirSync(storeRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && SNAPSHOT_ID.test(entry.name))
    .map((entry): SnapshotListItem => {
      try {
        const manifest = parseManifest(readFileSync(join(storeRoot, entry.name, 'manifest.json'), 'utf8'))
        if (manifest.id !== entry.name) {
          return { id: entry.name, status: 'corrupt', error: `manifest contains checkpoint id ${manifest.id}` }
        }
        return {
          id: manifest.id,
          createdAt: manifest.createdAt,
          reason: manifest.reason,
          label: manifest.label ?? '',
          sourceFiles: manifest.source.files.length,
          dshFiles: manifest.dshHome.files.length,
          status: 'published',
        }
      } catch (error) {
        return { id: entry.name, status: 'corrupt', error: error instanceof Error ? error.message : String(error) }
      }
    })
    .sort((left, right) => right.id.localeCompare(left.id))
}

function assertSameRoot(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new RecoveryError(`${label} mismatch: checkpoint=${expected} requested=${actual}`)
}

function assertNoSymlinkParents(root: string, path: string): void {
  const parts = path.split('/')
  let current = root
  for (const part of parts.slice(0, -1)) {
    current = join(current, part)
    if (!existsSync(current)) continue
    const status = lstatSync(current)
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new RecoveryError(`restore parent is not a real directory: ${current}`)
    }
  }
}

function currentMatches(root: string, expected: SnapshotFile | undefined, path: string): boolean {
  const absolute = join(root, ...path.split('/'))
  if (!pathPresent(absolute)) return expected === undefined
  if (expected === undefined) return false
  let actual: SnapshotFile
  try {
    actual = describePath(root, path)
  } catch {
    return false
  }
  return actual.type === expected.type
    && actual.sha256 === expected.sha256
    && actual.size === expected.size
    && actual.linkTarget === expected.linkTarget
}

function atomicRestoreFile(snapshotRoot: string, scope: SnapshotScope, targetRoot: string, file: SnapshotFile): void {
  assertNoSymlinkParents(targetRoot, file.path)
  const target = join(targetRoot, ...file.path.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  const temporary = join(dirname(target), `.${basename(target)}.dsh-recovery-${process.pid}-${randomBytes(4).toString('hex')}`)
  try {
    if (file.type === 'symlink') {
      symlinkSync(file.linkTarget ?? '', temporary)
    } else {
      copyFileSync(payloadPath(snapshotRoot, scope, file.path), temporary)
      chmodSync(temporary, file.mode)
    }
    renameSync(temporary, target)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

function restoreSnapshot(roots: ResolvedRoots, snapshot: string, confirm: string | undefined, offline: boolean): RestoreReport {
  if (confirm !== snapshot) throw new RecoveryError(`restore requires --confirm ${snapshot}`)
  if (!offline) throw new RecoveryError('restore requires --offline after the DSH Host has been stopped')
  const verification = verifyPublishedSnapshot(roots.store, snapshot)
  const manifest = verification.manifest
  assertSameRoot(roots.source, manifest.source.root, 'source root')
  assertSameRoot(roots.dshHome, manifest.dshHome.root, 'DSH_HOME')
  const head = gitHead(roots.source)
  if (head !== manifest.source.gitHead) {
    throw new RecoveryError(`Git HEAD mismatch: checkpoint=${manifest.source.gitHead} requested=${head}`)
  }
  const rescue = createSnapshot({
    ...roots,
    reason: 'pre-restore',
    label: `Automatic rescue before restoring ${snapshot}`,
  })
  const currentByKey = new Map<string, SnapshotFile>()
  for (const file of rescue.manifest.source.files) currentByKey.set(`source:${file.path}`, file)
  for (const file of rescue.manifest.dshHome.files) currentByKey.set(`dsh-home:${file.path}`, file)
  const planned: Array<{ scope: SnapshotScope; root: string; file: SnapshotFile }> = [
    ...manifest.source.files.map(file => ({ scope: 'source' as const, root: roots.source, file })),
    ...manifest.dshHome.files.map(file => ({ scope: 'dsh-home' as const, root: roots.dshHome, file })),
  ]
  for (const item of planned) {
    assertNoSymlinkParents(item.root, item.file.path)
    const current = currentByKey.get(`${item.scope}:${item.file.path}`)
    if (!currentMatches(item.root, current, item.file.path)) {
      throw new RecoveryError(`target changed after rescue checkpoint: ${item.scope}/${item.file.path}`)
    }
  }
  let restoredBytes = 0
  for (const item of planned) {
    const current = currentByKey.get(`${item.scope}:${item.file.path}`)
    if (!currentMatches(item.root, current, item.file.path)) {
      throw new RecoveryError(`target changed during restore: ${item.scope}/${item.file.path}`)
    }
    atomicRestoreFile(join(roots.store, snapshot), item.scope, item.root, item.file)
    restoredBytes += item.file.size
  }
  return {
    restoredFiles: planned.length,
    restoredBytes,
    rescueSnapshot: rescue.manifest.id,
    dependencyReconciliation: manifest.dshHome.files.some(file => file.path.startsWith('profiles/')) ? 'required' : 'not-needed',
  }
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, undefined, 2)}\n`)
}

function printCreate(result: VerificationResult): void {
  process.stdout.write([
    `Created recovery checkpoint ${result.manifest.id}`,
    `Source files: ${result.manifest.source.files.length}`,
    `DSH control files: ${result.manifest.dshHome.files.length}`,
    `Payload bytes: ${result.bytes}`,
    '',
  ].join('\n'))
}

function parseRestartSpec(encoded: string): RestartSpec {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown
  } catch {
    throw new RecoveryError('guardian restart specification is not valid base64url JSON')
  }
  if (!isRecord(value)
    || typeof value.executable !== 'string' || value.executable === ''
    || typeof value.cwd !== 'string' || value.cwd === ''
    || !Array.isArray(value.execArgv) || !value.execArgv.every(item => typeof item === 'string')
    || !Array.isArray(value.argv) || !value.argv.every(item => typeof item === 'string')
    || value.argv.length === 0) {
    throw new RecoveryError('guardian restart specification has an invalid shape')
  }
  return {
    executable: value.executable,
    cwd: value.cwd,
    execArgv: [...value.execArgv],
    argv: [...value.argv],
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    throw error
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (processAlive(pid)) {
    if (Date.now() >= deadline) throw new RecoveryError(`Host process ${String(pid)} did not stop within ${String(timeoutMs)} ms`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
}

async function runGuardianRestore(invocation: Extract<RecoveryInvocation, { action: 'guardian-restore' }>): Promise<void> {
  const restart = parseRestartSpec(invocation.restartSpec)
  await waitForProcessExit(invocation.parentPid)
  const roots = resolveRoots(invocation)
  const report = restoreSnapshot(roots, invocation.snapshot, invocation.snapshot, true)
  process.stdout.write([
    `Restored recovery checkpoint ${invocation.snapshot}.`,
    `Rescue checkpoint: ${report.rescueSnapshot}`,
    `Restored files: ${report.restoredFiles}`,
    'Restarting DSH.',
    '',
  ].join('\n'))
  const child = spawn(restart.executable, [...restart.execArgv, ...restart.argv], {
    cwd: restart.cwd,
    env: process.env,
    detached: true,
    stdio: 'ignore',
  })
  await new Promise<void>((resolvePromise, reject) => {
    child.once('spawn', resolvePromise)
    child.once('error', reject)
  })
  child.unref()
}

/** Execute one boot-independent recovery invocation. */
export async function runRecovery(invocation: RecoveryInvocation): Promise<void> {
  try {
    switch (invocation.action) {
      case 'create': {
        const roots = resolveRoots(invocation)
        const result = createSnapshot({
          ...roots,
          reason: 'manual',
          ...invocation.label === undefined ? {} : { label: invocation.label },
        })
        if (invocation.json) writeJson(result)
        else printCreate(result)
        return
      }
      case 'list': {
        const snapshots = listSnapshots(resolveStore(invocation.store))
        if (invocation.json) writeJson({ snapshots })
        else if (snapshots.length === 0) process.stdout.write('No recovery checkpoints.\n')
        else {
          for (const snapshot of snapshots) {
            const suffix = snapshot.status === 'published'
              ? `${snapshot.createdAt}  ${snapshot.label}`.trimEnd()
              : `CORRUPT  ${snapshot.error}`.trimEnd()
            process.stdout.write(`${snapshot.id}  ${suffix}\n`)
          }
        }
        return
      }
      case 'verify': {
        const result = verifyPublishedSnapshot(resolveStore(invocation.store), invocation.snapshot)
        const report = { id: result.manifest.id, valid: true, files: result.files, bytes: result.bytes }
        if (invocation.json) writeJson(report)
        else process.stdout.write(`Verified recovery checkpoint ${report.id}: ${report.files} files, ${report.bytes} bytes.\n`)
        return
      }
      case 'restore': {
        const roots = resolveRoots(invocation)
        const report = restoreSnapshot(roots, invocation.snapshot, invocation.confirm, invocation.offline)
        if (invocation.json) writeJson(report)
        else process.stdout.write([
          `Restored recovery checkpoint ${invocation.snapshot}.`,
          `Rescue checkpoint: ${report.rescueSnapshot}`,
          `Restored files: ${report.restoredFiles}`,
          `Profile dependency reconciliation: ${report.dependencyReconciliation}`,
          '',
        ].join('\n'))
        return
      }
      case 'guardian-restore': {
        await runGuardianRestore(invocation)
        return
      }
      default:
        invocation satisfies never
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`dsh recovery: ${message}\n`)
    process.exitCode = 1
  }
}
