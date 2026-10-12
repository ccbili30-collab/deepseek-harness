/** 手机端 NovexArtifacts 的 TS 移植：novex-def/use/skin 与 html 围栏的解析与投影。 */

export interface NovexUse {
  readonly name: string
  readonly data: Record<string, unknown>
  readonly fullscreen: boolean
}

export type SkinPickMode = 'auto' | 'manual' | 'once' | 'default'

export interface NovexSkin {
  readonly name?: string
  readonly pick?: SkinPickMode
}

export interface NovexDef {
  readonly name: string
  readonly template: string
  readonly fullscreen: boolean
  readonly kind: 'html' | 'canvas' | 'react' | 'skin'
  readonly compat: 'tavern' | null
  readonly usesTheme: boolean
  /** v0.3 B2：声明 input="own" 的件自带输入层，宿主藏原生输入栏、接收 send。 */
  readonly inputOwn: boolean
}

/** 消息文本拆出的渲染块；text 以外的块都从代码围栏解出。 */
export interface RenderBlock {
  readonly type: 'text' | 'def' | 'use' | 'skin' | 'htmlIsland'
  readonly text?: string
  readonly html?: string
  readonly def?: NovexDef
  readonly use?: NovexUse
  readonly skin?: NovexSkin
}

const NOVEX_ATTRS_RE = /(\w[\w-]*)=(?:"([^"]*)"|'([^']*)')/g
const FENCE_OPEN_RE = /^```(novex-def|novex-use|novex-skin|html)[^\n]*\n/gm
const FENCE_CLOSE_RE = /\n```(?=[^\S\n]*(?:\n|$))/g
const DEF_NAME_RE = /name=(?:"([^"]*)"|'([^']*)')/

export interface DefAttributes {
  readonly display?: 'inline' | 'fullscreen'
  readonly kind?: 'html' | 'canvas' | 'react'
  readonly compat?: string
  readonly usesTheme?: boolean
  /** v0.3：input="own" 声明作品自带输入层（模式切换，不是授权）。 */
  readonly input?: 'own'
}

/** 解析 novex-def 开围栏的属性区（display/kind/compat/uses-theme/input）。 */
export function parseDefAttributes(attrLine: string): DefAttributes {
  const out: {
    display?: 'inline' | 'fullscreen'
    kind?: 'html' | 'canvas' | 'react'
    compat?: string
    usesTheme?: boolean
    input?: 'own'
  } = {}
  for (const m of attrLine.matchAll(NOVEX_ATTRS_RE)) {
    const key = m[1]
    const val = m[2] ?? m[3] ?? ''
    if (key === 'name') continue
    if (key === 'display') out.display = val === 'fullscreen' ? 'fullscreen' : 'inline'
    else if (key === 'kind') out.kind = val === 'canvas' || val === 'react' ? val : 'html'
    else if (key === 'compat') out.compat = val
    else if (key === 'uses-theme') out.usesTheme = val === 'true'
    else if (key === 'input') out.input = val === 'own' ? 'own' : undefined
  }
  return out
}

export function parseNovexDef(raw: string): NovexDef | null {
  const open = /^```novex-def[^\n]*\n/m.exec(raw)
  if (!open) return null
  const name = DEF_NAME_RE.exec(open[0])
  const defName = name?.[1] ?? name?.[2]
  if (!defName) return null
  const attrs = parseDefAttributes(open[0])
  const bodyStart = open.index + open[0].length
  const closeIdx = raw.indexOf('\n```', bodyStart)
  const template = (closeIdx >= 0 ? raw.slice(bodyStart, closeIdx) : raw.slice(bodyStart)).trim()
  return {
    name: defName,
    template,
    fullscreen: attrs.display === 'fullscreen',
    kind: attrs.kind ?? 'html',
    compat: attrs.compat === 'tavern' ? 'tavern' : null,
    usesTheme: attrs.usesTheme ?? false,
    inputOwn: attrs.input === 'own',
  }
}

export function parseAllNovexDefs(raw: string): NovexDef[] {
  const defs: NovexDef[] = []
  for (const m of raw.matchAll(/^```novex-def[^\n]*\n[\s\S]*?^```[^\S\n]*$/gm)) {
    const def = parseNovexDef(m[0])
    if (def) defs.push(def)
  }
  return defs
}

/** 解析 ` ```novex-use {…} ``` ` 的 JSON 信封。 */
export function parseNovexUse(raw: string): NovexUse | null {
  const body = raw.replace(/^```novex-use[^\n]*\n/, '').replace(/\n```[^\S\n]*$/, '')
  try {
    const obj = JSON.parse(body) as Record<string, unknown>
    if (typeof obj.name !== 'string' || obj.name === '') return null
    const data = obj.data !== null && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : {}
    return { name: obj.name, data, fullscreen: obj.fullscreen === true }
  } catch {
    return null
  }
}

export function parseNovexSkin(raw: string): NovexSkin | null {
  const body = raw.replace(/^```novex-skin[^\n]*\n/, '').replace(/\n```[^\S\n]*$/, '')
  try {
    const obj = JSON.parse(body) as Record<string, unknown>
    const name = typeof obj.name === 'string' ? obj.name : undefined
    const pick = typeof obj.pick === 'string' ? obj.pick : undefined
    const pickMode: SkinPickMode | undefined =
      pick === 'auto' || pick === 'manual' || pick === 'once' || pick === 'default' ? pick : undefined
    return { name, pick: pickMode }
  } catch {
    return null
  }
}

/** {{name}}、{{a.b}} 形式的字段代入；对象值 JSON 序列化。 */
export function substituteNovexArtifact(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.@/-]+)\s*\}\}/g, (_, path: string) => {
    let cur: unknown = data
    for (const part of path.split('.')) {
      if (cur === null || cur === undefined) return ''
      if (Array.isArray(cur)) {
        const idx = Number(part)
        cur = Number.isNaN(idx) ? undefined : cur[idx]
      } else if (typeof cur === 'object') {
        cur = (cur as Record<string, unknown>)[part]
      } else {
        return ''
      }
    }
    if (cur === null || cur === undefined) return ''
    if (typeof cur === 'object') return JSON.stringify(cur)
    return String(cur)
  })
}

interface FenceHit {
  readonly start: number
  readonly end: number
  readonly kind: 'def' | 'use' | 'skin' | 'html'
  readonly raw: string
}

/** 找下一个顶层代码围栏（novex-* 或 html）；只认顶位未缩进的开围栏。 */
function nextFence(s: string): FenceHit | null {
  FENCE_OPEN_RE.lastIndex = 0
  const open = FENCE_OPEN_RE.exec(s)
  if (!open) return null
  const lang = open[1]
  const kind: FenceHit['kind'] =
    lang === 'novex-def' ? 'def' : lang === 'novex-use' ? 'use' : lang === 'novex-skin' ? 'skin' : 'html'
  FENCE_CLOSE_RE.lastIndex = open.index + open[0].length
  const close = FENCE_CLOSE_RE.exec(s)
  const end = close === null ? s.length : close.index + '\n```'.length
  return { start: open.index, end, kind, raw: s.slice(open.index, end) }
}

/** 手机端 sharedRenderBlocks 语义：消息文本 → text/def/use/skin/htmlIsland 块流。 */
export function renderBlocks(raw: string): RenderBlock[] {
  const blocks: RenderBlock[] = []
  let rest = raw
  let guard = 0
  while (rest.length > 0 && guard++ < 500) {
    const hit = nextFence(rest)
    if (!hit) {
      if (rest.trim()) blocks.push({ type: 'text', text: rest })
      break
    }
    const before = rest.slice(0, hit.start)
    if (before.trim()) blocks.push({ type: 'text', text: before })
    if (hit.kind === 'html') {
      const body = hit.raw.replace(/^```html[^\n]*\n/, '').replace(/\n```[^\S\n]*$/, '')
      blocks.push({ type: 'htmlIsland', html: body.trim() })
    } else if (hit.kind === 'def') {
      const def = parseNovexDef(hit.raw)
      blocks.push(def === null ? { type: 'text', text: hit.raw } : { type: 'def', def })
    } else if (hit.kind === 'use') {
      const use = parseNovexUse(hit.raw)
      blocks.push(use === null ? { type: 'text', text: hit.raw } : { type: 'use', use })
    } else {
      const skin = parseNovexSkin(hit.raw)
      blocks.push(skin === null ? { type: 'text', text: hit.raw } : { type: 'skin', skin })
    }
    rest = rest.slice(hit.end)
  }
  return blocks
}

/**
 * 作品文件声明 input:own 的探测（v0.3 增补：作品清单外的 .html 作品走
 * `<meta name="novex-input" content="own">`，与 def 的 input="own" 等价）。
 */
export function stageInputOwn(html: string): boolean {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    if (/name\s*=\s*["']novex-input["']/i.test(tag) && /content\s*=\s*["']own["']/i.test(tag)) return true
  }
  return false
}

/** 归集一段会话消息里出现的 novex 件与投影点（转录渲染要用 defs 查 use 的模板）。 */
export interface ArtifactScene {
  readonly defs: ReadonlyMap<string, NovexDef>
}

export function collectNovexDefs(raws: readonly string[]): ArtifactScene {
  const defs = new Map<string, NovexDef>()
  for (const raw of raws) {
    for (const block of renderBlocks(raw)) {
      if (block.type === 'def' && block.def !== undefined) defs.set(block.def.name, block.def)
    }
  }
  return { defs }
}
