/** 自由界面的工程数据：entry + 多文件 + manifest（名称/封面/说明/是否全屏）。
 * 以 JSON 存在 HTML 模块的首个文字块里；旧 HTML 模块仍是原始 HTML。
 * @module noven-shell/client/surface */

export interface SurfaceManifest {
  readonly name: string
  readonly description: string
  /** 资源 id、data URL 或普通 URL；资源 id 由宿主解析成卡内图片。 */
  readonly cover?: string
  readonly fullscreen?: boolean
}

export interface SurfaceData {
  readonly entry: string
  readonly files: Record<string, string>
  readonly manifest: SurfaceManifest
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
      },
    }
  } catch {
    return undefined
  }
}

/** Inline a JS module and its relative imports as nested data URLs. */
function inlineModule(path: string, files: Record<string, string>, seen: Set<string>): string {
  const source = files[path] ?? ''
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
  const imports = new Set(seen)
  imports.add(path)
  const resolved = source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]+)\2/g, (match, prefix: string, quote: string, spec: string) => {
    const target = normalizePath(dir + spec)
    if (files[target] === undefined || imports.has(target)) return match
    return `${prefix}${quote}${moduleData(target, files, imports)}${quote}`
  })
  return resolved
}

const moduleData = (path: string, files: Record<string, string>, seen: Set<string>): string =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(inlineModule(path, files, seen))}`

/** Inline linked CSS/JS files into the entry HTML so the sandbox needs one document. */
export function assembleSurface(surface: SurfaceData): string {
  let html = surface.files[surface.entry] ?? surface.files['index.html'] ?? Object.values(surface.files)[0] ?? ''
  html = html.replace(/<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi, (tag, _before: string, href: string, _after: string) => {
    const file = surface.files[normalizePath(href)]
    if (file === undefined || !/\.css($|\?)/i.test(href)) return tag
    return `<style>${file}</style>`
  })
  html = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before: string, src: string, after: string) => {
    const file = surface.files[normalizePath(src)]
    if (file === undefined || !/\.m?js($|\?)/i.test(src)) return tag
    return `<script${before}${after}>${inlineModule(normalizePath(src), surface.files, new Set())}</script>`
  })
  return html
}

/** Every file + manifest text, for detecting the local three.js runtime import. */
export function surfaceSource(surface: SurfaceData): string {
  return [surface.entry, surface.manifest.name, surface.manifest.description, ...Object.values(surface.files)].join('\n')
}
