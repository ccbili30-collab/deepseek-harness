/** 自由界面的工程数据：entry + 多文件 + manifest（名称/封面/说明/是否全屏）。
 * 以 JSON 存在 HTML 模块的首个文字块里；旧 HTML 模块仍是原始 HTML。
 * @module noven-shell/client/surface */
import { transform } from 'sucrase'

export interface SurfaceManifest {
  readonly name: string
  readonly description: string
  /** 资源 id、data URL 或普通 URL；资源 id 由宿主解析成卡内图片。 */
  readonly cover?: string
  /** 推荐整页打开；页面默认已整页，此字段只作库封面/入口提示。 */
  readonly fullscreen?: boolean
  /** 宿主 chrome；'game' 显示存档/暂停/导出，'none' 只留全屏与 ⋯。 */
  readonly chrome?: 'none' | 'game'
}

export interface SurfaceData {
  readonly entry: string
  readonly files: Record<string, string>
  readonly manifest: SurfaceManifest
  /** Durable state owned by the app; injected into the sandbox as NOVEN_FRAME.surfaceState. */
  readonly state?: unknown
  /** Revision loaded with the state; sent back on save for conflict detection. */
  readonly stateVersion?: number
}

const normalizePath = (path: string): string => path.replace(/^\.?\//, '')

/** Parse the surface envelope; raw HTML (or invalid JSON) returns undefined. */
export function parseSurface(raw: string): SurfaceData | undefined {
  const text = raw.trim()
  if (!text.startsWith('{')) return undefined
  try {
    const parsed = JSON.parse(text) as { kind?: unknown; noven?: unknown } & Partial<SurfaceData>
    const data = (parsed.kind === 'surface' && typeof parsed.noven === 'object' && parsed.noven !== null
      ? parsed.noven
      : parsed) as Partial<SurfaceData>
    if (typeof data.entry !== 'string' || typeof data.files !== 'object' || data.files === null || typeof data.manifest !== 'object' || data.manifest === null) return undefined
    const files: Record<string, string> = {}
    for (const [path, content] of Object.entries(data.files)) {
      if (typeof content === 'string') files[normalizePath(path)] = content
    }
    if (Object.keys(files).length === 0) return undefined
    const manifest = data.manifest as Partial<SurfaceManifest>
    return {
      entry: normalizePath(data.entry),
      files,
      manifest: {
        name: typeof manifest.name === 'string' ? manifest.name : 'Free surface',
        description: typeof manifest.description === 'string' ? manifest.description : '',
        ...(typeof manifest.cover === 'string' && manifest.cover !== '' ? { cover: manifest.cover } : {}),
        fullscreen: manifest.fullscreen === true,
        ...(manifest.chrome === 'none' || manifest.chrome === 'game' ? { chrome: manifest.chrome } : {}),
      },
      ...(data.state === undefined ? {} : { state: data.state }),
      ...(typeof data.stateVersion === 'number' && Number.isInteger(data.stateVersion) && data.stateVersion >= 0
        ? { stateVersion: data.stateVersion }
        : {}),
    }
  } catch {
    return undefined
  }
}

/** Resolve an import specifier to a project file, trying the usual extensions. */
function resolveModulePath(target: string, files: Record<string, string>): string | undefined {
  if (files[target] !== undefined) return target
  const candidates = [`${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.mjs`, `${target}/index.ts`, `${target}/index.js`]
  return candidates.find(candidate => files[candidate] !== undefined)
}

/**
 * Erase TypeScript types with sucrase; no type checking. A malformed file
 * becomes a module that throws at load, so the sandbox reports the compile
 * error through the console relay instead of breaking the whole page.
 */
function transpileTypeScript(path: string, source: string): string {
  try {
    return transform(source, {
      transforms: path.toLowerCase().endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
      jsxRuntime: 'classic',
      production: true,
    }).code
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `throw new Error(${JSON.stringify(`${path}: TypeScript 转译失败: ${message}`)})`
  }
}

/** Inline a JS module and its relative imports as nested data URLs. */
function inlineModule(path: string, files: Record<string, string>, seen: Set<string>): string {
  const source = files[path] ?? ''
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
  const imports = new Set(seen)
  imports.add(path)
  const resolved = source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]+)\2/g, (match, prefix: string, quote: string, spec: string) => {
    const target = resolveModulePath(normalizePath(dir + spec), files)
    if (target === undefined || imports.has(target)) return match
    return `${prefix}${quote}${moduleData(target, files, imports)}${quote}`
  })
  return resolved
}

const moduleData = (path: string, files: Record<string, string>, seen: Set<string>): string =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(inlineModule(path, files, seen))}`

/** Inline linked CSS/JS (and compiled TS) into the entry HTML so the sandbox needs one document. */
export function assembleSurface(surface: SurfaceData): string {
  // Work on a copy: .ts/.tsx are type-erased here, never at write time, so the
  // project keeps its source of truth and the runtime gets plain JS.
  const files: Record<string, string> = { ...surface.files }
  for (const [path, source] of Object.entries(files)) {
    if (/\.tsx?$/i.test(path)) files[path] = transpileTypeScript(path, source)
  }
  let html = files[surface.entry] ?? files['index.html'] ?? Object.values(files)[0] ?? ''
  html = html.replace(/<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi, (tag, _before: string, href: string, _after: string) => {
    const file = files[normalizePath(href)]
    if (file === undefined || !/\.css($|\?)/i.test(href)) return tag
    return `<style>${file}</style>`
  })
  html = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before: string, src: string, after: string) => {
    const target = resolveModulePath(normalizePath(src), files)
    if (target === undefined || !/\.(m?js|ts|tsx)($|\?)/i.test(src)) return tag
    return `<script${before}${after}>${inlineModule(target, files, new Set())}</script>`
  })
  return html
}

/** Every file + manifest text, for detecting the local three.js runtime import. */
export function surfaceSource(surface: SurfaceData): string {
  return [surface.entry, surface.manifest.name, surface.manifest.description, ...Object.values(surface.files)].join('\n')
}
