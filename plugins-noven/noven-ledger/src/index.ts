/**
 * noven-ledger — 应用侧账本的唯一地址簿。
 *
 * 分层：
 *   <项目目录>/.noven/project.json   项目纹身（{version:2, id, title?, …} 备份字段）
 *   <项目目录>/卡/<卡名>/             卡本体——用户内容，Finder 可见
 *   ~/.noven/projects.json          注册表 v2：创作库指针 + 权威项目名 + id
 *   ~/.noven/ledger/<id>/           项目账本：library.json / sidecar / workbenches…
 *   ~/.noven/ledger/w-<hash>/       未登记目录的账本（按路径哈希，无主簿记）
 *   ~/.noven/bindings/<sid>.json    会话↔卡绑定——按会话归档，不随目录走
 *
 * 纹身只存身份；丢了可由注册表补写，注册表丢了由纹身重建。两层互为备份，
 * 但项目名永远以注册表为准——纹身里的 title 只是跨机器搬运时的种子。
 * @module noven-ledger
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** 应用私有根目录——AI 作业半径之外。 */
export const APP_HOME = join(homedir(), '.noven')
const REGISTRY_PATH = join(APP_HOME, 'projects.json')
const MARKER = join('.noven', 'project.json')

// ---------- 纹身（项目内的最小标记） ----------

/** `.noven/project.json` 的落盘形态。title/description 是注册表的备份种子，不参与展示。 */
export interface ProjectMarker {
  readonly version: 2
  id: string
  title?: string
  description?: string
  createdAt?: string
}

/** 读纹身；缺文件或损坏返回 undefined。 */
export async function readMarker(root: string): Promise<ProjectMarker | undefined> {
  try {
    const raw = JSON.parse(await readFile(join(root, MARKER), 'utf8')) as Record<string, unknown>
    if (typeof raw !== 'object' || raw === null || typeof raw.id !== 'string' || raw.id.length === 0) return undefined
    return {
      version: 2,
      id: raw.id,
      ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {}),
    }
  } catch {
    return undefined
  }
}

/** 原子写纹身。 */
export async function writeMarker(root: string, marker: ProjectMarker): Promise<void> {
  const target = join(root, MARKER)
  await mkdir(dirname(target), { recursive: true })
  const tmp = `${target}.noven-tmp`
  await writeFile(tmp, `${JSON.stringify(marker, null, 2)}\n`)
  await rename(tmp, target)
}

/** 新项目编号。 */
export function mintProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 杂项项目（设计理念 §15）：没有归属的新会话/新卡/散件的默认落点。
 * 固定根、固定 id、固定名——宿主每次启动幂等保证它存在；它不可被移出注册表，
 * 名字也不允许改，保证上游工作区与创作库始终用同一把钥匙找到它。
 */
export const MISC_PROJECT_ROOT = join(homedir(), '诺文', '杂项')
export const MISC_PROJECT_ID = 'proj-misc'
export const MISC_PROJECT_TITLE = '杂项'

/**
 * 幂等保证杂项项目存在：目录建出、注册进表（带固定 id 与名）、从 excluded 移除。
 * 已经被用户改名的注册表标题不覆盖——它只能从「杂项」开始，移动过的文件夹不会
 * 被这里重建（normalizeRoot 后路径不同则视为另一个目录）。
 * @returns 杂项项目的注册表行（保证已存在）。
 */
export async function ensureMiscProject(): Promise<RegisteredProject> {
  await mkdir(MISC_PROJECT_ROOT, { recursive: true })
  const projects = await registerProject(MISC_PROJECT_ROOT, { id: MISC_PROJECT_ID, title: MISC_PROJECT_TITLE })
  const row = projects.find(p => p.root === normalizeRoot(MISC_PROJECT_ROOT))
  if (row === undefined) throw new Error('misc project missing after register')
  return row
}

/** 一个根是否就是杂项项目（防被移出/改名）。 */
export function isMiscProjectRoot(root: string): boolean {
  return normalizeRoot(root) === normalizeRoot(MISC_PROJECT_ROOT)
}

// ---------- 注册表（~/.noven/projects.json） ----------

/** One registered project pointer; title is the single display authority. */
export interface RegisteredProject {
  readonly root: string
  /** Project id (marker twin); absent only on un-migrated v1 rows. */
  id?: string
  /** Authoritative display name — every surface reads this. */
  title?: string
  readonly addedAt: string
}

interface RegistryFile {
  readonly version: number
  readonly projects: readonly RegisteredProject[]
  /** Ids (and legacy roots) the user explicitly removed — auto-claim skips them. */
  readonly excluded?: readonly string[]
}

/** Serialize registry read-modify-write: two concurrent passes must not mint split identities. */
let registryQueue: Promise<unknown> = Promise.resolve()

function withRegistryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = registryQueue.then(fn, fn)
  registryQueue = run.then(() => undefined, () => undefined)
  return run
}

async function loadFile(): Promise<{ projects: RegisteredProject[]; excluded: string[] }> {
  try {
    const parsed = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as RegistryFile
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.projects)) return { projects: [], excluded: [] }
    return {
      projects: parsed.projects.filter(p => typeof p?.root === 'string' && p.root.length > 0),
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded.filter((r): r is string => typeof r === 'string') : [],
    }
  } catch {
    return { projects: [], excluded: [] }
  }
}

async function saveFile(projects: readonly RegisteredProject[], excluded: readonly string[]): Promise<void> {
  await mkdir(dirname(REGISTRY_PATH), { recursive: true })
  const file: RegistryFile = { version: 2, projects, excluded }
  const tmp = `${REGISTRY_PATH}.noven-tmp`
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`)
  await rename(tmp, REGISTRY_PATH)
}

/** Read the registry; a missing or malformed file is an empty set. */
export async function loadRegistry(): Promise<readonly RegisteredProject[]> {
  return (await loadFile()).projects
}

/** Ids/roots the user explicitly removed — auto-claim must not re-add them. */
export async function loadExcluded(): Promise<ReadonlySet<string>> {
  return new Set((await loadFile()).excluded)
}

/** Normalize a user-supplied root: absolute, de-slashed, `.`/`..` folded. */
export function normalizeRoot(root: string): string {
  return resolve(root)
}

/** The registry row for one root, when present. */
export async function registryRow(root: string): Promise<RegisteredProject | undefined> {
  const canonical = normalizeRoot(root)
  return (await loadFile()).projects.find(p => p.root === canonical)
}

/**
 * Register a root: reuse the folder's marker id when present so a moved or
 * re-added project keeps its identity and its ledger; mint one otherwise.
 * Writes the marker into the folder and clears any 移出 exclusion.
 * @param opts.title - display name; marker title or dir basename when omitted.
 */
export async function registerProject(root: string, opts: { id?: string; title?: string } = {}): Promise<readonly RegisteredProject[]> {
  const canonical = normalizeRoot(root)
  const marker = await readMarker(canonical)
  const id = opts.id ?? marker?.id ?? mintProjectId()
  const title = opts.title ?? marker?.title ?? canonical.split('/').pop() ?? canonical
  const projects = await withRegistryLock(async () => {
    const file = await loadFile()
    const excluded = file.excluded.filter(r => r !== canonical && r !== id)
    const existing = file.projects.find(p => p.id === id || p.root === canonical)
    const next = existing !== undefined
      ? file.projects.map(p => p === existing
        ? { root: canonical, id, title: existing.title ?? title, addedAt: existing.addedAt }
        : p)
      : [...file.projects, { root: canonical, id, title, addedAt: new Date().toISOString() }]
    await saveFile(next, excluded)
    return next
  })
  await writeMarker(canonical, {
    version: 2,
    id,
    title: projects.find(p => p.id === id)?.title ?? title,
    ...(marker?.description !== undefined ? { description: marker.description } : {}),
    createdAt: marker?.createdAt ?? new Date().toISOString(),
  }).catch(() => { /* a read-only folder still registers; the marker just stays absent */ })
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 12)
  await liftTree(join(APP_HOME, 'ledger', `w-${hash}`), join(APP_HOME, 'ledger', id))
  return projects
}

/**
 * v1→v2 migration + marker heal: rows lacking an id adopt the folder's marker
 * id (or mint one) and gain a title; registered roots whose marker was wiped
 * get it rewritten from the row. Runs once per listing; excluded ids are
 * untouched.
 */
export async function upgradeRegistry(): Promise<readonly RegisteredProject[]> {
  const projects = await withRegistryLock(async () => {
    const file = await loadFile()
    let changed = false
    const next: RegisteredProject[] = []
    for (const p of file.projects) {
      const marker = await readMarker(p.root).catch(() => undefined)
      // The marker travels with the folder — when it disagrees with the row's
      // id, the folder's own identity wins (a foreign folder landed on the
      // path, or an upgrade raced).
      if (marker !== undefined && p.id !== undefined && marker.id !== p.id) {
        next.push({ root: p.root, id: marker.id, title: p.title ?? marker.title, addedAt: p.addedAt })
        changed = true
        continue
      }
      if (p.id !== undefined && p.title !== undefined) { next.push(p); continue }
      const id = p.id ?? marker?.id ?? mintProjectId()
      const title = p.title ?? marker?.title ?? p.root.split('/').pop() ?? p.root
      next.push({ root: p.root, id, title, addedAt: p.addedAt })
      changed = true
    }
    if (changed) await saveFile(next, file.excluded)
    return next
  })
  for (const p of projects) {
    if (p.id === undefined || !(await dirExists(p.root))) continue
    const marker = await readMarker(p.root).catch(() => undefined)
    // A different marker id means a foreign folder landed on the registered path — leave it alone.
    if (marker !== undefined) continue
    await writeMarker(p.root, {
      version: 2,
      id: p.id,
      ...(p.title !== undefined ? { title: p.title } : {}),
      createdAt: new Date().toISOString(),
    }).catch(() => { /* read-only folder — the row still resolves */ })
  }
  return projects
}

/** Drop the pointer and exclude its id from marker-based auto-claim; the folder is never touched.
 *  The 杂项 project is permanent and rejects removal (设计理念 §15). */
export async function unregisterProject(root: string): Promise<readonly RegisteredProject[]> {
  const canonical = normalizeRoot(root)
  if (canonical === normalizeRoot(MISC_PROJECT_ROOT)) throw new Error('misc project cannot be unregistered')
  return withRegistryLock(async () => {
    const file = await loadFile()
    const row = file.projects.find(p => p.root === canonical)
    const next = file.projects.filter(p => p.root !== canonical)
    const key = row?.id ?? canonical
    const excluded = file.excluded.includes(key) ? file.excluded : [...file.excluded, key]
    if (next.length !== file.projects.length || excluded.length !== file.excluded.length) await saveFile(next, excluded)
    return next
  })
}

/** Update the authoritative title; refreshes the marker's backup copy in the same write. */
export async function renameProject(root: string, title: string): Promise<readonly RegisteredProject[]> {
  const canonical = normalizeRoot(root)
  if (canonical === normalizeRoot(MISC_PROJECT_ROOT)) throw new Error('misc project cannot be renamed')
  const row = await withRegistryLock(async () => {
    const file = await loadFile()
    const found = file.projects.find(p => p.root === canonical)
    if (found === undefined) return undefined
    await saveFile(file.projects.map(p => p === found ? { ...p, title } : p), file.excluded)
    return found
  })
  if (row === undefined) return loadRegistry()
  if (row.id !== undefined) {
    const marker = await readMarker(canonical)
    await writeMarker(canonical, {
      version: 2,
      id: row.id,
      title,
      ...(marker?.description !== undefined ? { description: marker.description } : {}),
      createdAt: marker?.createdAt ?? new Date().toISOString(),
    }).catch(() => { /* marker rewrite is best-effort; registry already holds the name */ })
  }
  return loadRegistry()
}

/**
 * Re-point a registered id at a new root — the folder moved and the marker
 * carried its identity to the new path. Returns the updated row or undefined
 * when the id is unknown.
 */
export async function relinkProject(id: string, newRoot: string): Promise<RegisteredProject | undefined> {
  const canonical = normalizeRoot(newRoot)
  return withRegistryLock(async () => {
    const file = await loadFile()
    const row = file.projects.find(p => p.id === id)
    if (row === undefined || row.root === canonical) return row
    const conflict = file.projects.find(p => p.root === canonical && p.id !== id)
    if (conflict !== undefined) return undefined
    const next = file.projects.map(p => p === row ? { ...p, root: canonical } : p)
    await saveFile(next, file.excluded)
    return next.find(p => p.id === id)
  })
}

/** Whether the root exists on disk right now — a moved-away folder reports missing, not removal. */
export async function dirExists(root: string): Promise<boolean> {
  try {
    return (await stat(root)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Whether a directory carries noven markers — a project tattoo, a visible
 * `卡/` store, or legacy `.noven/` state awaiting migration.
 */
export async function hasNovenMarkers(root: string): Promise<boolean> {
  const probe = async (rel: string): Promise<boolean> => stat(join(root, rel)).then(() => true, () => false)
  return (await probe(MARKER))
    || (await probe('卡'))
    || (await probe(join('.noven', 'library.json')))
    || (await probe(join('.noven', 'cards')))
}

// ---------- 账本目录（项目账本，应用侧） ----------

/**
 * Resolve the per-project ledger dir: the marker id wins; when the marker was
 * wiped but the registry still knows this path, the id is recovered and the
 * tattoo rewritten (self-heal). Unmarked directories get a path-hash bucket so
 * stray session cwds never write `.noven` they don't own.
 */
export async function ledgerDir(root: string): Promise<string> {
  const canonical = normalizeRoot(root)
  const marker = await readMarker(canonical)
  if (marker !== undefined) return join(APP_HOME, 'ledger', marker.id)
  const row = await registryRow(canonical)
  if (row?.id !== undefined) {
    await writeMarker(canonical, {
      version: 2,
      id: row.id,
      ...(row.title !== undefined ? { title: row.title } : {}),
      createdAt: new Date().toISOString(),
    }).catch(() => { /* read-only folder — the ledger still resolves */ })
    return join(APP_HOME, 'ledger', row.id)
  }
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 12)
  return join(APP_HOME, 'ledger', `w-${hash}`)
}

/** Ledger dir for a known project id (no root lookup). */
export function ledgerDirForId(id: string): string {
  return join(APP_HOME, 'ledger', id)
}

/** Per-session binding files — keyed by session, surviving folder moves. */
export function bindingsDir(): string {
  return join(APP_HOME, 'bindings')
}

/** The visible card store inside a project folder. */
export function cardsDir(root: string): string {
  return join(root, '卡')
}

/** Legacy card store — read path for unmigrated projects. */
export function legacyCardsDir(root: string): string {
  return join(root, '.noven', 'cards')
}

/** Synchronous {@link readMarker} for sync stores (sidecar et al.). */
export function readMarkerSync(root: string): ProjectMarker | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(root, MARKER), 'utf8')) as Record<string, unknown>
    if (typeof raw !== 'object' || raw === null || typeof raw.id !== 'string' || raw.id.length === 0) return undefined
    return {
      version: 2,
      id: raw.id,
      ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {}),
    }
  } catch {
    return undefined
  }
}

/** Synchronous registry row lookup — tolerates a missing/corrupt registry file. */
export function registryRowSync(root: string): RegisteredProject | undefined {
  const canonical = normalizeRoot(root)
  try {
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.projects)) return undefined
    return parsed.projects.find(p => typeof p?.root === 'string' && p.root === canonical)
  } catch {
    return undefined
  }
}

/** Synchronous {@link ledgerDir} — same key rules, no marker rewrite on the slow path. */
export function ledgerDirSync(root: string): string {
  const canonical = normalizeRoot(root)
  const marker = readMarkerSync(canonical)
  if (marker !== undefined) return join(APP_HOME, 'ledger', marker.id)
  const row = registryRowSync(canonical)
  if (row?.id !== undefined) return join(APP_HOME, 'ledger', row.id)
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 12)
  return join(APP_HOME, 'ledger', `w-${hash}`)
}

/** Synchronous {@link liftTree}. */
export function liftTreeSync(oldAbs: string, newAbs: string): void {
  if (!existsSync(oldAbs) || existsSync(newAbs)) return
  mkdirSync(dirname(newAbs), { recursive: true })
  try {
    renameSync(oldAbs, newAbs)
  } catch {
    // Cross-device or locked — leave the legacy copy for the next pass.
  }
}

// ---------- 目录名与迁移 ----------

/**
 * Sanitize a card name into a Finder-safe directory name: filesystem-illegal
 * characters become `·`, control chars drop, edges trimmed; empty → '卡'.
 */
export function sanitizeDirName(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/gu, '·')
    .replace(/[\u0000-\u001f]/gu, '')
    .trim()
    .replace(/^[. ]+|[. ]+$/gu, '')
  return cleaned.length === 0 ? '卡' : cleaned
}

/** Pick a free directory name under parent: `名`, then `名 2`, `名 3`… */
export async function uniqueDirName(parent: string, base: string, taken?: ReadonlySet<string>): Promise<string> {
  let candidate = base
  for (let i = 2; ; i += 1) {
    if (taken !== undefined ? !taken.has(candidate) : await stat(join(parent, candidate)).then(() => false, () => true)) return candidate
    candidate = `${base} ${i}`
  }
}

/** Move a legacy file/dir to its ledger location when it exists and the target does not. Idempotent. */
export async function liftTree(oldAbs: string, newAbs: string): Promise<void> {
  try {
    await stat(oldAbs)
  } catch {
    return
  }
  try {
    await stat(newAbs)
    return
  } catch { /* target absent — proceed */ }
  await mkdir(dirname(newAbs), { recursive: true })
  try {
    await rename(oldAbs, newAbs)
  } catch {
    // Cross-device or locked — leave the legacy copy for the next pass.
  }
}
