/**
 * AI 管卡工具面——手机版 33 工具的同名移植（含四个久经实战的协议设计：
 * 按卡串行写入（不再要求整卡版本号）+ saved 新编号直链、宏通道优先、容错解析、失败不
 * 谎报），外加桌面补充：list_cards（无卡片界面时的发现入口）、export_card
 * / import_card / commit_import（交换与导入确认）。
 *
 * 授权模型：DSH 会话即授权面（用户在会话里让 AI 管卡）；权限三分开的
 * 注入侧（routing/use）保留在数据模型，注入通道后议。
 * @module noven-cards/tools
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'

/** 任何可落 JSON 的值（工具返回值契约）。 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
import { flattenModules, organizeFolders, assertValid, findTarget, emptyCardDocument, IMAGE_MEDIA, type ContentDocument, type ContentModule, type ModuleUse } from './model.ts'
import { BindingStore } from './bindings.ts'
import { CardStore, cardsRoot, type SavedCard } from './store.ts'
import { applyAndCommit, type EditorCommand } from './editor.ts'
import { calendarOf, decodeCollection, decodeRelation, decodeTimeline, decodeSurface, normalizeSurfacePath, validateSurface } from './formats.ts'
import { readDiagnostics } from './diagnostics.ts'
import { buildPresetDocument, listPresets, loadPreset } from './presets.ts'
import { MODULE_PRESETS } from './module-presets.ts'
import { buildBulkModules, parseBulkTree } from './bulk.ts'
import { exportCard, importExchange, importForeignFile, readProjectFile } from './exchange.ts'
import { dirExists, loadRegistry, normalizeRoot } from 'noven-ledger'
import { listCustomModules, saveCustomModule } from './custom-modules.ts'

/** 模型给新建块惯用的伪编号——一律按"新建"处理而不是报错（实测高频翻车点）。 */
const NEW_BLOCK_HINTS = new Set(['new', 'create', 'new_block', 'newblock', 'new text block', 'auto', 'null', 'none', 'todo', '新建'])

/** 正文分页大小（码点）。 */
const PAGE_LIMIT = 4000



const RESULT_SCHEMA = { type: 'object' as const, additionalProperties: true as const }

/** 模型面的结果就是结构化值的 JSON——版本号、新编号、卡摘要全靠它回传。 */
function render(_args: unknown, value: JsonValue): { type: 'text', text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** 写卡工具把 saved 结果原样投影进 tool/result.meta，供客户端渲染保存回执卡。 */
function presentSaved(_args: unknown, value: JsonValue): JsonValue {
  return value
}

/** 写卡工具的 output 声明：JSON 结果同时喂模型面与保存回执卡。 */
const WRITE_OUTPUT = { schema: RESULT_SCHEMA, render, presentationMeta: presentSaved }

/** 目标定位三件套的参数说明。 */
const TARGET_PARAMS = {
  root_id: { type: 'string' as const, required: true as const, description: '根作品编号' },
  target_id: { type: 'string' as const, required: true as const, description: '实际目标卡编号（世界内角色用其编号，否则同 root_id）' },
  draft_version: { type: 'string' as const, description: '可省略，不再参与冲突判定：编辑总是套用到卡的最新内容上（不同模块的修改互不影响）。同一文字块被别人改过时，写入会提示重读' },
  project: { type: 'string' as const, description: '卡所在项目：项目名/编号/绝对路径；省略=自动在全部项目里找（本会话项目优先）' },
}

type Tools = Context['tools']
type CommandBuilder = (args: Record<string, unknown>) => EditorCommand

/** 注册全部工具。 */
export function registerCardTools(ctx: Context): void {
  const tools = ctx.tools

  /** 读这张卡当前最新的内容：草稿 > head。 */
  async function currentCard(store: CardStore, cardId: string): Promise<ContentDocument> {
    const saved = await store.open(cardId)
    if (saved === undefined) throw new Error(`卡不存在或已删除：${cardId}（先 list_cards）`)
    return (await store.draft(cardId))?.document ?? saved.document
  }

  function locate(document: ContentDocument, targetId: string): ContentDocument {
    if (document.id === targetId) return document
    const character = document.internalCharacters.find(candidate => candidate.id === targetId)
    if (character === undefined) throw new Error('目标卡片不在当前内容树中')
    return character
  }

  /** 读卡结构摘要（不读正文）。 */
  function summarize(card: ContentDocument): Record<string, JsonValue> {
    const moduleSummary = (module: ContentModule): Record<string, JsonValue> => ({
      id: module.id, name: module.name, layout: module.layout,
      tags: module.tags,
      ...(module.use !== undefined ? { use: module.use } : {}),
      ...(module.routing !== undefined ? { routing: module.routing } : {}),
      ...(module.temporality !== undefined ? { temporality: module.temporality } : {}),
      ...(module.widget !== undefined ? { widget: { type: module.widget.type, ...(module.widget.height !== undefined ? { height: module.widget.height } : {}) } } : {}),
      ...(module.characterIds.length > 0 ? { characters: module.characterIds } : {}),
      blocks: module.blocks.map((block): JsonValue => block.kind === 'text'
        ? { kind: 'text', id: block.id, content_ref: block.content }
        : { kind: 'image', id: block.id, resource_id: block.resourceId, ...(block.caption !== undefined ? { caption_ref: block.caption } : {}) }),
      ...(module.children.length > 0 ? { children: module.children.map(moduleSummary) } : {}),
    })
    return {
      id: card.id, kind: card.kind, name: card.name,
      appearance: { ...card.appearance }, resources: card.resources.map(resource => ({ id: resource.id, media_type: resource.mediaType })),
      modules: card.modules.map(moduleSummary),
      ...(card.internalCharacters.length > 0 ? { internal_characters: card.internalCharacters.map(character => ({ id: character.id, name: character.name })) } : {}),
    }
  }

  /**
   * Read the JSON payload behind a structured widget. Collection, timeline,
   * relation, map and scene modules keep their payload in the first text block;
   * this helper gives the describe tools one validated path to it.
   */
  async function widgetPayload(store: CardStore, rootId: string, card: ContentDocument, moduleId: string, type: string): Promise<{ module: ContentModule, raw: string }> {
    const module = flattenModules(card.modules).find(candidate => candidate.id === moduleId)
    if (module === undefined) throw new Error('目标模块不存在或不属于当前卡片')
    if (module.widget?.type !== type) throw new Error(`目标模块不是 ${type} 类型`)
    const block = module.blocks.find(candidate => candidate.kind === 'text')
    if (block === undefined) throw new Error('模块没有数据块')
    const raw = new TextDecoder().decode(await store.readPayload(rootId, block.content))
    return { module, raw }
  }

  // ---------- 读 ----------
  tools.register(defineTool({
    name: 'list_projects',
    description: '列出全部已注册项目（名称、编号、目录、卡数）。跨项目找卡先调它；project 参数可填项目名、编号或目录路径。',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render },
    async execute(_args, exec) {
      const cwd = normalizeRoot(sessionCwd(exec))
      const rows = await Promise.all((await loadRegistry()).map(async project => ({
        name: project.title ?? '(未命名)', id: project.id ?? null, root: project.root,
        current: normalizeRoot(project.root) === cwd,
        missing: !(await dirExists(project.root)),
        card_count: (await new CardStore(project.root).list().catch(() => [] as string[])).length,
      })))
      return { status: 'read', projects: rows }
    },
  }))

  tools.register(defineTool({
    name: 'save_user_module',
    description: '把一个声明式模块定义保存到本项目的用户模块库（.noven/modules），之后用户可以在“新建模块 → 我的模块”里预览并添加到任意卡。用于用户要求“做一个可复用的门派名册/图鉴/年表/界面”时。definition 必须包含 name、shape（collection/timeline/map/doc/surface）；collection 还要 fields[{name,type}]，可选 view、cardAspect、labels，以及 presentation 窗口契约（contract、layout、core、optional、detail、editor、assets、links）；缺省时服务端会从 fields 生成 presentation。timeline 可选 unit、timelineView。surface 传 surface:{entry,files,manifest}（与自由界面工程同构，可带 three.js）。只保存定义，不直接改卡。',
    parameters: {
      definition: { type: 'json', required: true, description: '完整模块定义 JSON；示例：{"name":"门派名册","shape":"collection","fields":[{"name":"名称","type":"text"},{"name":"徽记","type":"image"},{"name":"立场","type":"chips"}],"view":"cards","cardAspect":"square","labels":{"add":"添加门派"},"presentation":{"contract":"sect-roster","layout":"heraldry","core":["名称","徽记"],"optional":["立场"],"detail":[{"title":"立场","fields":["立场"]}],"editor":{"create":["名称","徽记"],"detail":["立场"]},"assets":[{"id":"emblem","role":"徽记","ratio":"1:1","render":"96x96","export":"192x192"}],"links":["place"]}}' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const saved = await saveCustomModule(sessionCwd(exec), args.definition)
      if (typeof saved === 'string') throw new Error(`用户模块定义无效：${saved}`)
      return { status: 'saved', module: JSON.parse(JSON.stringify(saved)) }
    },
  }))

  tools.register(defineTool({
    name: 'list_cards',
    description: '列出项目卡库的全部卡：编号、卡类（WORLD 世界 / CHARACTER 角色）、名称、修订号、是否有未提交草稿。缺省列本会话项目；project 参数可列其他项目。',
    parameters: {
      project: { type: 'string', description: '项目名/编号/绝对路径；省略=本会话项目' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const store = new CardStore(await resolveProjectRoot(cwd, args.project))
      const rows: Record<string, JsonValue>[] = []
      for (const id of await store.list()) {
        const saved = await store.open(id)
        if (saved === undefined) continue
        const draft = await store.draft(id)
        rows.push({ id, kind: saved.document.kind, name: saved.document.name, revision: saved.revision, has_draft: draft !== undefined })
      }
      const mounted = await mountedRows(cwd, exec.agent?.session?.id as SessionId | undefined)
      return {
        status: 'read',
        cards: rows,
        ...(mounted.length > 0 ? { mounted } : {}),
        ...(rows.length === 0 ? { hint: mounted.length > 0
          ? '本项目卡库为空；挂载的卡见 mounted（引用卡可读写，跨项目也可用 list_projects + project 参数）。'
          : '还没有卡。标准角色/世界卡用 create_card_from_preset（先 list_card_presets）；纯文档树才用 create_card_bulk；跨项目找卡用 list_projects。' } : {}),
      }
    },
  }))

  tools.register(defineTool({
    name: 'read_card',
    description: '读取目标卡最新模块结构、编辑版本和修改来源，不读取全部正文，也不新建草稿。修改前先读取。卡在本项目、会话挂载引用或其他项目都能找到（project 可显式指定），跨项目卡照常读写。集合/时间线/关系图的结构化数据分别用 collection_describe / timeline_describe / relation_describe 读。',
    parameters: {
      root_id: TARGET_PARAMS.root_id,
      target_id: { type: 'string', required: true, description: '目标卡编号' },
      project: TARGET_PARAMS.project,
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const rootId = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, rootId, optionalId(args.project) ?? undefined)
      const draft = await resolved.store.draft(rootId)
      const card = draft?.document ?? resolved.saved.document
      const dirName = await resolved.store.dirName(rootId)
      return {
        status: 'read',
        project_root: resolved.projectRoot,
        ...(resolved.via === 'ref' ? { reference: true as const } : {}),
        ...(dirName !== undefined ? { card_dir: join(cardsRoot(resolved.projectRoot), dirName) } : {}),
        draft_version: draft?.version ?? resolved.saved.version,
        has_unsaved_draft: draft !== undefined,
        source: draft?.source ?? resolved.saved.source,
        page_limit: PAGE_LIMIT,
        card: summarize(locate(card, String(args.target_id))),
      }
    },
  }))

  tools.register(defineTool({
    name: 'read_text_block',
    description: '读取一个文字块或图片图注的一页。位置按万国码码点计算；has_more 为真时还未读完，继续使用 next_offset。图片本体未发送。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '模块编号' },
      block_id: { type: 'string', required: true, description: '内容块编号' },
      offset: { type: 'integer', description: '首段从零开始，后续用返回位置' },
      count: { type: 'integer', description: `本页字符数，不超过 ${String(PAGE_LIMIT)}` },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const target = locate(card, String(args.target_id))
      const module = flattenModules(target.modules).find(candidate => candidate.id === args.module_id)
      if (module === undefined) throw new Error('目标模块不存在或不属于当前卡片')
      const block = module.blocks.find(candidate => candidate.id === args.block_id)
      if (block === undefined) throw new Error('内容块不存在')
      const ref = block.kind === 'text' ? block.content : block.caption
      if (ref === undefined) throw new Error('这个块没有可读文字')
      const text = new TextDecoder().decode(await resolved.store.readPayload(root, ref))
      const codepoints = Array.from(text)
      const offset = typeof args.offset === 'number' ? args.offset : 0
      const count = Math.min(typeof args.count === 'number' ? args.count : PAGE_LIMIT, PAGE_LIMIT)
      const slice = codepoints.slice(offset, offset + count)
      const next = offset + slice.length
      return {
        status: 'read', content_ref: ref, offset, count: slice.length,
        has_more: next < codepoints.length,
        ...(next < codepoints.length ? { next_offset: next } : {}),
        text: slice.join(''),
      }
    },
  }))

  tools.register(defineTool({
    name: 'surface_read',
    description: '读取自由界面（HTML/自由 3D）工程：entry、manifest、文件清单、字节大小、运行时 state 的版本/字节与静态校验结果；给 path 时回该文件正文和 content_ref，include_state 为真时回 state 正文。改工程前先读，写入时把它当 content_ref 传回。旧原始 HTML 模块会被识别为待迁移（legacy）。运行时错误用 surface_diagnostics 读。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '自由界面模块编号' },
      path: { type: 'string', description: '可选：只读这一个工程文件' },
      include_state: { type: 'boolean', description: '可选：连同运行时 state（例如可编辑 3D 的场景）一起返回' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec): Promise<Record<string, JsonValue>> {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const target = locate(card, String(args.target_id))
      const module = flattenModules(target.modules).find(candidate => candidate.id === args.module_id)
      if (module === undefined) throw new Error('目标模块不存在或不属于当前卡片')
      if (module.widget?.type !== 'html') throw new Error('目标模块不是自由界面（html）类型')
      const block = module.blocks.find(candidate => candidate.kind === 'text')
      const raw = block === undefined || block.kind !== 'text' ? '' : new TextDecoder().decode(await resolved.store.readPayload(root, block.content))
      const surface = decodeSurface(raw)
      if (surface === undefined) {
        return {
          status: 'read', legacy: true, ...(block?.kind === 'text' ? { content_ref: block.content } : {}), bytes: raw.length,
          hint: '这是旧原始 HTML 模块。用 surface_write_file 写 index.html 会自动包成工程；也可以先 surface_init。',
        }
      }
      const validation = validateSurface(surface)
      const requested = args.path === undefined ? undefined : normalizeSurfacePath(String(args.path))
      if (requested !== undefined && typeof requested !== 'string') throw new Error(`路径无效：${requested.error}`)
      const file = requested === undefined ? undefined : surface.files[requested]
      return {
        status: 'read',
        ...(block?.kind === 'text' ? { content_ref: block.content } : {}),
        entry: surface.entry,
        manifest: { ...surface.manifest },
        files: validation.files.map(file => ({ path: file.path, bytes: file.bytes })),
        state_version: surface.stateVersion ?? 0,
        state_bytes: validation.state_bytes,
        ...(args.include_state === true && surface.state !== undefined ? { state: surface.state } : {}),
        total_bytes: validation.total_bytes,
        validation: {
          ok: validation.ok,
          errors: [...validation.errors],
          unresolved: validation.unresolved.map(item => ({ from: item.from, spec: item.spec })),
        },
        ...(requested !== undefined
          ? file === undefined ? { missing: requested } : { path: requested, text: file }
          : {}),
      }
    },
  }))

  tools.register(defineTool({
    name: 'surface_validate',
    description: '静态校验一个自由界面工程：entry 是否存在、路径是否越界、单文件/总字节是否超限、相对 import 是否有着落。运行时错误（脚本抛错、画布报错）用 surface_diagnostics，不在这里。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '自由界面模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec): Promise<Record<string, JsonValue>> {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const target = locate(card, String(args.target_id))
      const module = flattenModules(target.modules).find(candidate => candidate.id === args.module_id)
      if (module === undefined) throw new Error('目标模块不存在或不属于当前卡片')
      if (module.widget?.type !== 'html') throw new Error('目标模块不是自由界面（html）类型')
      const block = module.blocks.find(candidate => candidate.kind === 'text')
      const raw = block === undefined || block.kind !== 'text' ? '' : new TextDecoder().decode(await resolved.store.readPayload(root, block.content))
      const surface = decodeSurface(raw)
      if (surface === undefined) return { status: 'read', legacy: true, ok: false, errors: ['不是工程格式：用 surface_init 迁移或 surface_write_file 写 index.html'] }
      const report = validateSurface(surface)
      return {
        status: 'read', ok: report.ok, ...(block?.kind === 'text' ? { content_ref: block.content } : {}), entry: report.entry,
        files: report.files.map(file => ({ path: file.path, bytes: file.bytes })), total_bytes: report.total_bytes,
        errors: [...report.errors],
        unresolved: report.unresolved.map(item => ({ from: item.from, spec: item.spec })),
      }
    },
  }))

  tools.register(defineTool({
    name: 'surface_diagnostics',
    description: '读取自由界面最近一次运行的控制台与报错（宿主在页面打开时上报，按模块环形保留）。写完/改完自由界面后用它确认有没有跑起来；没有日志通常意味着页面还没被打开过。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '自由界面模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec): Promise<Record<string, JsonValue>> {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const moduleId = String(args.module_id)
      const report = await readDiagnostics(resolved.projectRoot, root, moduleId)
      if (report === undefined) {
        return {
          status: 'read', entries: [],
          hint: '还没有运行日志。让用户打开这个模块（或点「运行日志」）后重试；宿主只在页面渲染时上报。',
        }
      }
      return {
        status: 'read',
        updated_at: new Date(report.updatedAt).toISOString(),
        dropped: report.dropped,
        entries: report.entries.map(entry => ({
          level: entry.level, text: entry.text,
          ...(entry.at === undefined ? {} : { at: new Date(entry.at).toISOString() }),
        })),
      }
    },
  }))

  tools.register(defineTool({
    name: 'read_card_image',
    description: '明确读取目标卡图片：返回图片文件的绝对路径，随后用平台 read_image 工具查看该路径。资源目录不等于已经看过图像。',
    parameters: {
      root_id: TARGET_PARAMS.root_id,
      target_id: TARGET_PARAMS.target_id,
      resource_id: { type: 'string', required: true, description: '本卡图片资源编号' },
      project: TARGET_PARAMS.project,
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const resolved = await resolveCard(sessionCwd(exec), exec.agent?.session?.id as SessionId | undefined, String(args.root_id), optionalId(args.project) ?? undefined)
      const target = locate(resolved.saved.document, String(args.target_id))
      const resource = target.resources.find(candidate => candidate.id === args.resource_id)
      if (resource === undefined) throw new Error('资源不属于目标卡')
      return { status: 'read', image_path: await resolved.store.payloadPath(String(args.root_id), resource.content), media_type: resource.mediaType, next: '用 read_image 读取 image_path' }
    },
  }))


  tools.register(defineTool({
    name: 'list_card_presets',
    description: '列出内置整卡模板（character/world 等）。需要标准角色卡或世界卡时先用它选模板，再用 create_card_from_preset 落卡；不要用 create_card_bulk 猜标准模块。',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render },
    async execute() {
      const presets = await listPresets()
      return {
        status: 'read',
        presets: presets.map(preset => ({
          id: preset.id, kind: preset.kind, title: preset.title, summary: preset.summary,
          ...(preset.defaultName === undefined ? {} : { default_name: preset.defaultName }),
          module_count: preset.modules.length,
          modules: preset.modules.map(module => module.name),
        })),
      }
    },
  }))

  tools.register(defineTool({
    name: 'list_module_presets',
    description: '列出模块库的内置模块预设（规则/语录/势力/种族/文化/能力/装备/图鉴/时间线/地图/自由界面 surface/自由 3D free3d，以及 surface.dashboard、surface.gallery、free3d.editor、free3d.viewer 模板），含 id、widget、字段、默认视图和呈现契约。先用它选 preset，再用 add_module_preset 落模块；可交互界面与 3D 优先走自由模块，不要手写同样的字段表。',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render },
    async execute() {
      return {
        status: 'read',
        presets: Object.entries(MODULE_PRESETS).map(([id, spec]) => ({
          id,
          widget: spec.widget ?? 'document',
          ...(spec.fields === undefined ? {} : { fields: spec.fields.map(field => ({ name: field.name, type: field.type })) }),
          ...(spec.view === undefined ? {} : { view: spec.view }),
          ...(spec.cardAspect === undefined ? {} : { card_aspect: spec.cardAspect }),
          ...(spec.timelineView === undefined ? {} : { timeline_view: spec.timelineView }),
          ...(spec.unit === undefined ? {} : { unit: spec.unit }),
          ...(spec.presentation === undefined ? {} : {
            contract: spec.presentation.contract, layout: spec.presentation.layout, links: [...spec.presentation.links],
          }),
          has_sample: spec.sample !== undefined,
        })),
      }
    },
  }))

  tools.register(defineTool({
    name: 'list_user_modules',
    description: '列出本项目用户模块库（.noven/modules）里的声明式模块定义。要复用“门派名册”这类自定义模块时，先读定义，再用 add_module_custom 落到卡上。',
    parameters: { project: TARGET_PARAMS.project },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const root = await resolveProjectRoot(sessionCwd(exec), args.project)
      return { status: 'read', project_root: root, modules: JSON.parse(JSON.stringify(await listCustomModules(root))) }
    },
  }))

  tools.register(defineTool({
    name: 'collection_describe',
    description: '读取集合模块的字段、条目、每格的值、默认视图、呈现契约和 source。改集合前先读；item_id 省略返回全部条目，给出时只返回该条目，values 也随之收窄。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '集合模块编号' },
      item_id: { type: 'string', description: '只读取这个条目；省略读全部' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const target = locate(card, String(args.target_id))
      const { module, raw } = await widgetPayload(resolved.store, root, target, String(args.module_id), 'collection')
      const data = decodeCollection(raw)
      const itemId = optionalId(args.item_id) ?? undefined
      const items = itemId === undefined ? data.items : data.items.filter(item => item.id === itemId)
      const values = itemId === undefined
        ? data.values
        : { [itemId]: data.values[itemId] ?? {} }
      return JSON.parse(JSON.stringify({
        status: 'read', module_id: module.id, version: data.version, view: data.view,
        fields: data.fields, items, values,
        ...(data.cardAspect === undefined ? {} : { card_aspect: data.cardAspect }),
        ...(data.artStyle === '' ? {} : { art_style: data.artStyle }),
        ...(data.presentation === undefined ? {} : { presentation: data.presentation }),
        ...(data.source === undefined ? {} : { source: data.source }),
      }))
    },
  }))

  tools.register(defineTool({
    name: 'timeline_describe',
    description: '读取时间线模块的历法、视图、事件、时代和刻度标记（含编号）。改事件/历法前先读；view=diary 表示纵向日记。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const target = locate(card, String(args.target_id))
      const { module, raw } = await widgetPayload(resolved.store, root, target, String(args.module_id), 'timeline')
      const data = decodeTimeline(raw)
      return JSON.parse(JSON.stringify({
        status: 'read', module_id: module.id, version: data.version,
        ...(data.view === undefined ? {} : { view: data.view }),
        ...(data.window === undefined ? {} : { window: data.window }),
        calendar: data.calendar, views: data.views, eras: data.eras, events: data.events, marks: data.marks,
      }))
    },
  }))

  tools.register(defineTool({
    name: 'relation_describe',
    description: '读取关系图模块的节点和连线（含编号、位置、标签）。改关系图前先读，再用 widget_set_data 整体写回。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: 'relation 模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const target = locate(card, String(args.target_id))
      const { module, raw } = await widgetPayload(resolved.store, root, target, String(args.module_id), 'relation')
      const data = decodeRelation(raw)
      return JSON.parse(JSON.stringify({ status: 'read', module_id: module.id, version: data.version, nodes: data.nodes, edges: data.edges }))
    },
  }))

  // ---------- 建 / 宏通道 ----------
  tools.register(defineTool({
    name: 'create_card',
    description: '新建一张空世界或角色并保存。只接受 kind（WORLD 世界／CHARACTER 角色）和 name。标准角色卡/世界卡不要用它，改用 create_card_from_preset（先 list_card_presets）。新建不代表正文完成。缺省建在本会话项目，project 可建到别的项目。',
    parameters: {
      kind: { type: 'string', required: true, description: 'WORLD 或 CHARACTER' },
      name: { type: 'string', required: true, description: '卡名' },
      project: TARGET_PARAMS.project,
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const kind = cardKind(args.kind)
      const name = mustName(args.name)
      const document: ContentDocument = emptyCard(kind, name)
      const cwd = sessionCwd(exec)
      const projectRoot = await resolveProjectRoot(cwd, args.project)
      const saved = await new CardStore(projectRoot).saveNew(document, 'AI')
      await bindManaged(cwd, exec, saved.cardId, projectRoot)
      return { ...savedResult(saved.cardId, saved, undefined, document), project_root: projectRoot }
    },
  }))

  tools.register(defineTool({
    name: 'create_card_from_preset',
    description: '按内置整卡模板建卡（标准角色卡/世界卡首选）：模板自带模块树、集合字段、时间线日记、多形态 source 和呈现契约。先用 list_card_presets 选 template；name 省略时用模板默认名。只建卡，不继续填内容。',
    parameters: {
      template: { type: 'string', required: true, description: '整卡模板 id（如 character/world）' },
      name: { type: 'string', description: '卡名；省略=模板默认名' },
      project: TARGET_PARAMS.project,
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const template = String(args.template)
      const preset = await loadPreset(template)
      if (preset === undefined) throw new Error(`整卡模板不存在：${template}（先 list_card_presets）`)
      const name = optionalId(args.name) ?? preset.defaultName ?? preset.title
      const cwd = sessionCwd(exec)
      const projectRoot = await resolveProjectRoot(cwd, args.project)
      const store = new CardStore(projectRoot)
      let focusModuleId: string | undefined
      const saved = await store.create(name, 'AI', async receive => {
        const built = await buildPresetDocument(preset, name, {
          writeText: text => receive(new TextEncoder().encode(text)),
          writePayload: bytes => receive(bytes),
        })
        focusModuleId = built.focusModuleId
        return built.document
      })
      await bindManaged(cwd, exec, saved.cardId, projectRoot)
      return {
        ...savedResult(saved.cardId, saved, undefined, saved.document),
        project_root: projectRoot,
        template,
        kind: preset.kind,
        ...(focusModuleId === undefined ? {} : { focus_module_id: focusModuleId }),
      }
    },
  }))

  tools.register(defineTool({
    name: 'create_card_bulk',
    description: '一次成型一张“文档树卡”：kind + name + modules_json（模块树 JSON 数组文本，每项 {name, text, routing, temporality, children}，name 必填，数组顺序即排序，最多四层）。先整包校验再一次性写入：任何节点不合法都不会写入半张卡，错误信息带 JSON 路径。只建文档树，不能建 collection/timeline/relation/map/html 等结构化模块；标准角色/世界卡先用 create_card_from_preset。成功返回全部新模块/块编号与 next_draft_version，后续微调用精确工具直接引用。',
    parameters: {
      kind: { type: 'string', required: true, description: 'WORLD 或 CHARACTER' },
      name: { type: 'string', required: true, description: '卡名' },
      modules_json: { type: 'string', required: true, description: '模块树 JSON 数组文本，例如 [{"name":"基础档案","children":[{"name":"身份","text":"..."}]}]' },
      project: TARGET_PARAMS.project,
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const kind = cardKind(args.kind)
      const name = mustName(args.name)
      const nodes = parseBulkTree(args.modules_json, 'modules')
      const cwd = sessionCwd(exec)
      const projectRoot = await resolveProjectRoot(cwd, args.project)
      const store = new CardStore(projectRoot)
      let createdModuleIds: string[] = []
      let createdBlockIds: string[] = []
      const saved = await store.create(name, 'AI', async receive => {
        const built = await buildBulkModules(nodes, text => receive(new TextEncoder().encode(text)))
        createdModuleIds = built.createdModuleIds
        createdBlockIds = built.createdBlockIds
        const document: ContentDocument = { ...emptyCard(kind, name), modules: built.modules }
        assertValid(document)
        return document
      })
      await bindManaged(cwd, exec, saved.cardId, projectRoot)
      return { ...savedResult(saved.cardId, saved, undefined, saved.document), project_root: projectRoot, created_module_ids: createdModuleIds, created_block_ids: createdBlockIds }
    },
  }))

  tools.register(defineTool({
    name: 'add_module_bulk',
    description: '一次向已有卡插入整棵“文档子树”（宏通道）：module_json 是与 create_card_bulk 相同的节点结构（含 children）；before_id 为空插到根模块末尾，否则插到该根级模块之前。整包校验失败不写入。只支持文档模块；集合/时间线/地图/HTML 用 add_module_preset、add_module_custom 或 add_child_module 的 widget。',
    parameters: {
      ...TARGET_PARAMS,
      module_json: { type: 'string', required: true, description: '单个节点（含 children）的 JSON 对象文本，例如 {"name":"章节","text":"...","children":[]}' },
      before_id: { type: 'string', description: '定位根级模块编号，插到它之前；空/省略表示末尾' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const root = String(args.root_id)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const store = resolved.store
      const nodes = parseBulkTree(typeof args.module_json === 'string' ? `[${args.module_json}]` : [args.module_json], 'module')
      const built = await buildBulkModules(nodes, text => store.receivePayload(root, new TextEncoder().encode(text)))
      const targetId = String(args.target_id)
      const buildNext = (base: ContentDocument): { document: ContentDocument, located: ContentDocument } => {
        const located = locate(base, targetId)
        const before = optionalId(args.before_id)
        const inserted = { ...located, modules: before === null ? [...located.modules, ...built.modules] : insertBefore(located.modules, built.modules, before) }
        const document = replaceInTree(base, located.id, organizeFolders(inserted))
        assertValid(document)
        return { document, located }
      }
      const { saved, nextDocument, target } = await store.exclusive(root, async () => {
        const draft = await store.ensureDraft(root, 'AI')
        const { document, located } = buildNext(draft.document)
        const updated = await store.updateDraft(root, undefined, document, 'AI')
        return { saved: await store.commit(root, updated.version), nextDocument: document, target: located }
      })
      await bindManaged(cwd, exec, root, resolved.projectRoot)
      return { ...savedResult(root, saved, target.id), project_root: resolved.projectRoot, created_module_ids: built.createdModuleIds, created_block_ids: built.createdBlockIds, ...cardTag(nextDocument, target.id) }
    },
  }))

  // ---------- 正文写入 ----------
  registerEditTool(tools, 'write_module_text',
    '新建或完整替换一个文字块并保存。新建时 block_id 传空（缺省或误填 new 等占位词也按新建处理）；不要把读到的一页当成全文覆盖，局部修改使用 replace_text_range。失败不得宣称完成。',
    {
      module_id: { type: 'string', required: true, description: '目标模块编号' },
      block_id: { type: 'string', description: '已有文字块编号；新建时留空或省略' },
      name: { type: 'string', description: '模块名称（省略=保持现名）' },
      text: { type: 'string', required: true, description: '完整的新文字块正文' },
      content_ref: { type: 'string', description: '替换已有文字块时可传读取时的正文引用：块在你读取之后被别人改过就拒绝，避免覆盖对方的修改' },
    },
    args => {
      const raw = typeof args.block_id === 'string' ? args.block_id.trim() : ''
      const blockId = raw.length > 0 && !NEW_BLOCK_HINTS.has(raw.toLowerCase()) ? raw : null
      const name = moduleNameOf(args)
      const expected = typeof args.content_ref === 'string' && args.content_ref.trim().length > 0 ? args.content_ref.trim() : undefined
      return { kind: 'write_text', moduleId: String(args.module_id), blockId, ...(name !== undefined ? { moduleName: name } : {}), text: String(args.text), ...(expected !== undefined ? { expectedContent: expected } : {}) }
    })

  // ---------- 自由界面工程：逐文件写，不整包重写 ----------
  const manifestArgs = (args: Record<string, unknown>): { name?: string, description?: string, cover?: string, fullscreen?: boolean, chrome?: 'none' | 'game' } => ({
    ...(args.name === undefined ? {} : { name: String(args.name) }),
    ...(args.description === undefined ? {} : { description: String(args.description) }),
    ...(args.cover === undefined ? {} : { cover: String(args.cover) }),
    ...(args.fullscreen === undefined ? {} : { fullscreen: args.fullscreen === true }),
    ...(args.chrome === 'none' || args.chrome === 'game' ? { chrome: args.chrome } : {}),
  })
  const manifestParams = {
    name: { type: 'string', description: '作品名（manifest.name）' },
    description: { type: 'string', description: '作品说明（manifest.description）' },
    cover: { type: 'string', description: '封面：卡图片资源编号、data URL 或普通 URL' },
    fullscreen: { type: 'boolean', description: '是否推荐全屏打开（仅提示，页面默认已整页）' },
    chrome: { type: 'string', description: "'game' 显示存档/暂停/导出，'none' 只留全屏" },
  } as const
  registerEditTool(tools, 'surface_init',
    '把旧原始 HTML 模块包成自由界面工程（index.html + manifest），或给已有工程补 manifest。之后用 surface_write_file 按文件改；不需要为了迁移手工重写整段 HTML。',
    { module_id: { type: 'string', required: true, description: '自由界面模块编号' }, ...manifestParams },
    args => ({ kind: 'surface_init', moduleId: String(args.module_id), ...(Object.keys(manifestArgs(args)).length === 0 ? {} : { manifest: manifestArgs(args) }) }))
  registerEditTool(tools, 'surface_write_file',
    '新建或覆盖自由界面的一个文件并保存（index.html/style.css/main.js，可带子目录）。按文件改，不要整包重写 JSON；相对 import 可以用 ./ 引用同工程文件。写入后 surface_validate 静态校验、surface_diagnostics 看运行日志。',
    {
      module_id: { type: 'string', required: true, description: '自由界面模块编号' },
      path: { type: 'string', required: true, description: '工程内路径，如 index.html、style.css、main.js' },
      text: { type: 'string', required: true, description: '完整文件正文' },
      content_ref: { type: 'string', description: 'surface_read 返回的 content_ref；别人改过就拒绝，避免覆盖' },
    },
    args => ({
      kind: 'surface_write_file', moduleId: String(args.module_id), path: String(args.path), text: String(args.text),
      ...(typeof args.content_ref === 'string' && args.content_ref !== '' ? { expected: args.content_ref } : {}),
    }))
  registerEditTool(tools, 'surface_delete_file',
    '删除自由界面工程里的一个文件并保存；入口文件被删时自动落到 index.html 或剩余第一个文件。至少保留一个文件。',
    {
      module_id: { type: 'string', required: true, description: '自由界面模块编号' },
      path: { type: 'string', required: true, description: '要删除的工程内路径' },
      content_ref: { type: 'string', description: 'surface_read 返回的 content_ref' },
    },
    args => ({
      kind: 'surface_delete_file', moduleId: String(args.module_id), path: String(args.path),
      ...(typeof args.content_ref === 'string' && args.content_ref !== '' ? { expected: args.content_ref } : {}),
    }))
  registerEditTool(tools, 'surface_rename_file',
    '重命名自由界面工程里的一个文件并保存；入口文件跟着改名。目标已存在时拒绝。',
    {
      module_id: { type: 'string', required: true, description: '自由界面模块编号' },
      from_path: { type: 'string', required: true, description: '原路径' },
      to_path: { type: 'string', required: true, description: '新路径' },
      content_ref: { type: 'string', description: 'surface_read 返回的 content_ref' },
    },
    args => ({
      kind: 'surface_rename_file', moduleId: String(args.module_id), from: String(args.from_path), to: String(args.to_path),
      ...(typeof args.content_ref === 'string' && args.content_ref !== '' ? { expected: args.content_ref } : {}),
    }))
  registerEditTool(tools, 'surface_set_manifest',
    '修改自由界面的 manifest：作品名、说明、封面、全屏偏好、宿主 chrome。不改文件正文。',
    { module_id: { type: 'string', required: true, description: '自由界面模块编号' }, ...manifestParams },
    args => ({ kind: 'surface_set_manifest', moduleId: String(args.module_id), manifest: manifestArgs(args) }))

  registerEditTool(tools, 'write_module_markdown',
    '完整替换一个模块的 Markdown 正文并保存；保留子模块、布局、编号和标签。已有图片用 ![说明](card-image:资源编号#图片块编号) 独占一行；只在掌握全部正文时使用，长文局部修改仍用 replace_text_range。',
    {
      module_id: { type: 'string', required: true, description: '目标模块编号' },
      name: { type: 'string', required: true, description: '模块名称' },
      text: { type: 'string', required: true, description: '完整 Markdown 正文' },
    },
    args => ({ kind: 'write_markdown', moduleId: String(args.module_id), name: String(args.name), text: String(args.text) }))

  registerEditTool(tools, 'replace_text_range',
    '局部替换已有文字块并保存，保留范围外的正文。先读取目标文字页，原样使用其 content_ref。范围按万国码码点计算，左闭右开；插入时 start 等于 end，删除时 text 为空。图片说明不适用。',
    {
      module_id: { type: 'string', required: true, description: '模块编号' },
      block_id: { type: 'string', required: true, description: '已有文字块编号' },
      content_ref: { type: 'string', required: true, description: '读取文字页返回的正文引用，原样传入' },
      start: { type: 'integer', required: true, description: '替换起点（包含）' },
      end: { type: 'integer', required: true, description: '替换终点（不包含）' },
      text: { type: 'string', required: true, description: '该范围的新文字' },
    },
    args => {
      const start = Math.trunc(Number(args.start)), end = Math.trunc(Number(args.end))
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) throw new Error('文字修改范围无效')
      return { kind: 'replace_text_range', moduleId: String(args.module_id), blockId: String(args.block_id), expectedContent: String(args.content_ref), start, end, text: String(args.text) }
    })

  registerEditTool(tools, 'write_image_caption',
    '修改图片块说明并保存，不替换图片。',
    {
      module_id: { type: 'string', required: true, description: '模块编号' },
      block_id: { type: 'string', required: true, description: '图片块编号' },
      name: { type: 'string', description: '模块名称（省略=保持现名）' },
      text: { type: 'string', required: true, description: '新图注；空字符串清除图注' },
    },
    args => {
      const name = moduleNameOf(args)
      return { kind: 'write_caption', moduleId: String(args.module_id), blockId: String(args.block_id), ...(name !== undefined ? { moduleName: name } : {}), text: String(args.text) }
    })

  // ---------- 结构 ----------
  registerEditTool(tools, 'add_module',
    '在目标卡根部新增模块并保存。想做可交互界面、游戏、图表或 3D，用 preset=surface（自由界面）或 preset=free3d（自由 3D），不要先落一个空模块再手写正文；文本类内容才建空文档模块（空模块尚无正文，不代表创作完成）。',
    {
      name: { type: 'string', required: true, description: '模块名称' },
      preset: { type: 'string', description: '模块预设 id（surface/free3d/html 等；先 list_module_presets）' },
      widget: { type: 'string', description: '特殊渲染器类型（html 等）；一般优先用 preset' },
      layout: { type: 'string', description: 'VERTICAL（竖向）或 HORIZONTAL（横向），缺省 VERTICAL' },
    },
    args => ({
      kind: 'add_module', name: String(args.name), layout: layoutOf(args.layout) ?? 'VERTICAL',
      ...(args.preset !== undefined ? { preset: String(args.preset) } : {}),
      ...(args.widget !== undefined ? { widget: String(args.widget) } : {}),
    }))

  registerEditTool(tools, 'add_child_module', '在指定父级末尾创建真实子模块并保存（可独立打开、移动和修改；不要用正文标题冒充子模块）。做自由界面/3D 优先用 add_module_preset 的 surface/free3d；HTML 模块可用 NOVEN_FRAME.openCard/openModule/navigate 做跳转，详见 widget 参数。',
    {
      name: { type: 'string', required: true, description: '模块名称' },
      parent_id: { type: 'string', description: '父模块编号；空/省略为卡根部' },
      layout: { type: 'string', description: 'VERTICAL（竖向）或 HORIZONTAL（横向），缺省 VERTICAL' },
      widget: {
        type: 'string',
        description: '特殊模块渲染器，缺省为普通文档模块。内置类型：' +
          'timeline=时间线、collection=合集条目（语义名 region/faction/race/quotes 等同用此 kind）——' +
          '这两类建好后**必须**用 timeline_*/collection_* 专用工具填数据，不要手写 JSON；' +
          'relation=人物关系图（用 widget_set_data 写 nodes/edges，节点带 x/y 摆位 0..1）；' +
          'map=地图模块（世界生成：widget_set_data 写 world 源；语义草稿：写 draft+palette 后把 heightmap 置 draft 重算）；' +
          'html=自由界面（沙箱渲染任意 HTML/CSS/JS；工程文件用 surface_write_file 按文件写，不要整包重写）；' +
          'HTML 里可调 NOVEN_FRAME.openCard(cardId)、NOVEN_FRAME.openModule(moduleId,itemId)、NOVEN_FRAME.navigate({cardId,moduleId,itemId}) 做跳转，' +
          'NOVEN_FRAME.asset(path)/assetAsync(path) 读卡内图片或项目文件（glb/纹理/音频/JSON），' +
          '目标编号从 read_card / collection_describe / timeline_describe 取；' +
          '例：<button onclick="NOVEN_FRAME.navigate({moduleId: \'模块编号\'})">打开</button>；' +
          'scene=旧的结构化 3D 摆件板（CSS 3D）；真正的自由 3D 用 add_module_preset 的 free3d（three.js）',
      },
    },
    args => ({ kind: 'add_module', name: String(args.name), parentId: optionalId(args.parent_id), layout: layoutOf(args.layout) ?? 'VERTICAL', ...(args.widget !== undefined ? { widget: String(args.widget) } : {}) }))

  registerEditTool(tools, 'add_module_preset',
    '按模块库内置预设新建模块（规则/语录/势力/种族/文化/能力/装备/图鉴/时间线/地图/自由界面 surface/自由 3D free3d 等）。preset 用 list_module_presets 的 id；name 是落卡后的模块名。预设会带字段、默认视图、呈现契约和样例，不要再用 collection_add_field 重造。可交互界面与 3D 优先走 surface/free3d，不要写 .html 文件。',
    {
      name: { type: 'string', required: true, description: '模块名称' },
      preset: { type: 'string', required: true, description: '模块预设 id（先 list_module_presets）' },
      parent_id: { type: 'string', description: '父模块编号；空/省略为卡根部' },
      layout: { type: 'string', description: 'VERTICAL（竖向）或 HORIZONTAL（横向），缺省 VERTICAL' },
    },
    args => ({
      kind: 'add_module', name: String(args.name), preset: String(args.preset),
      parentId: optionalId(args.parent_id), layout: layoutOf(args.layout) ?? 'VERTICAL',
    }))

  registerEditTool(tools, 'add_module_custom',
    '按声明式定义新建模块（可直接落 presentation 窗口契约、字段、视图和 labels；不必先存进用户模块库）。definition 为 list_user_modules/save_user_module 同款 JSON；name 可覆盖定义里的名称。要复用项目里已保存的模块，用 list_user_modules 读 definition 后传入。',
    {
      name: { type: 'string', required: true, description: '模块名称' },
      parent_id: { type: 'string', description: '父模块编号；空/省略为卡根部' },
      definition: { type: 'json', required: true, description: '完整模块定义 JSON（name/shape/fields/view/presentation 等）' },
    },
    args => {
      const definition = typeof args.definition === 'string' ? JSON.parse(String(args.definition)) : args.definition
      return {
        kind: 'add_module_custom', name: String(args.name),
        parentId: optionalId(args.parent_id), definition,
      }
    })

  registerEditTool(tools, 'add_module_ref',
    '新建引用模块：把另一张卡（或同卡）的一个模块只读挂到当前卡，可带 view/filter/overrides。用于“引用角色卡的力量体系”“挂载世界地图”这类关系；source_card_id/source_module_id 先用 read_card 取。',
    {
      name: { type: 'string', required: true, description: '引用模块的名称' },
      parent_id: { type: 'string', description: '父模块编号；空/省略为卡根部' },
      source_card_id: { type: 'string', required: true, description: '来源卡编号' },
      source_module_id: { type: 'string', required: true, description: '来源模块编号' },
      view: { type: 'string', description: '可选的视图覆盖（如 cards/list/timeline）' },
      filter_json: { type: 'json', description: '可选的条目过滤 JSON（如 {"characters":["..."]}）' },
      overrides_json: { type: 'json', description: '可选的模块数据覆写 JSON' },
    },
    args => {
      const filter = typeof args.filter_json === 'string' ? JSON.parse(String(args.filter_json)) : args.filter_json
      const overrides = typeof args.overrides_json === 'string' ? JSON.parse(String(args.overrides_json)) : args.overrides_json
      return {
        kind: 'add_module_ref', name: String(args.name), parentId: optionalId(args.parent_id),
        sourceCardId: String(args.source_card_id), sourceModuleId: String(args.source_module_id),
        ...(args.view === undefined ? {} : { view: String(args.view) }),
        ...(filter === undefined ? {} : { filter }),
        ...(overrides === undefined ? {} : { overrides }),
      }
    })

  registerEditTool(tools, 'rename_module', '只修改模块名称并保存，不改模块正文。',
    { module_id: { type: 'string', required: true, description: '模块编号' }, name: { type: 'string', required: true, description: '新名称' } },
    args => ({ kind: 'rename_module', moduleId: String(args.module_id), name: String(args.name) }))

  registerEditTool(tools, 'rename_card', '修改目标卡的名称。只有返回 saved 才已正式保存。',
    { name: { type: 'string', required: true, description: '新名称' } },
    args => ({ kind: 'rename_card', name: String(args.name) }))

  registerEditTool(tools, 'remove_module', '移除指定模块及其全部子模块、内容块并保存；保留卡片图片资源，不删除其他模块。',
    { module_id: { type: 'string', required: true, description: '要移除的模块编号' } },
    args => ({ kind: 'remove_module', moduleId: String(args.module_id) }))

  registerEditTool(tools, 'remove_content_block', '移除模块内一个文字或图片展示块并保存。图片资源、封面与头像保留。',
    { module_id: { type: 'string', required: true, description: '所属模块编号' }, block_id: { type: 'string', required: true, description: '要移除的块编号' } },
    args => ({ kind: 'remove_block', moduleId: String(args.module_id), blockId: String(args.block_id) }))

  registerEditTool(tools, 'move_module', '把一个模块移到同父级另一个模块之前或末尾；改变父级用 place_module。',
    { module_id: { type: 'string', required: true, description: '要移动的模块编号' }, before_id: { type: 'string', description: '同父级定位模块编号；空/省略表示末尾' } },
    args => ({ kind: 'move_module', moduleId: String(args.module_id), beforeId: optionalId(args.before_id) }))

  registerEditTool(tools, 'move_content_block', '在同一模块内调整文字块或图片块顺序，不重写正文或图片。',
    { module_id: { type: 'string', required: true, description: '所属模块编号' }, block_id: { type: 'string', required: true, description: '要移动的块编号' }, before_id: { type: 'string', description: '同模块定位块编号；空/省略表示末尾' } },
    args => ({ kind: 'move_block', moduleId: String(args.module_id), blockId: String(args.block_id), beforeBlockId: optionalId(args.before_id) }))

  registerEditTool(tools, 'place_module', '移动整个模块子树到新父级（空=卡根部）。保留全部后代与排列；禁止放入自己或后代。',
    { module_id: { type: 'string', required: true, description: '要移动的模块编号' }, parent_id: { type: 'string', description: '新父级模块编号；空/省略为卡根部' }, before_id: { type: 'string', description: '目标父级内定位模块；空/省略为末尾' } },
    args => ({ kind: 'place_module', moduleId: String(args.module_id), parentId: optionalId(args.parent_id), beforeId: optionalId(args.before_id) }))

  registerEditTool(tools, 'set_module_layout', '设置模块子项排列：VERTICAL（竖向）或 HORIZONTAL（横向）。',
    { module_id: { type: 'string', required: true, description: '模块编号' }, layout: { type: 'string', required: true, description: 'VERTICAL 或 HORIZONTAL' } },
    args => ({ kind: 'set_module_layout', moduleId: String(args.module_id), layout: layoutOf(args.layout) ?? 'VERTICAL' }))

  registerEditTool(tools, 'set_reading_layout', '设置整卡顶层模块排列：CONTINUOUS（连续）将顶层全部竖向展开；PAGED（翻页）保留横向分组。',
    { layout: { type: 'string', required: true, description: 'CONTINUOUS 或 PAGED' } },
    args => {
      const layout = String(args.layout).trim().toUpperCase()
      if (layout !== 'CONTINUOUS' && layout !== 'PAGED') throw new Error('layout 必须是 CONTINUOUS 或 PAGED')
      return { kind: 'set_reading_layout', layout }
    })

  registerEditTool(tools, 'set_module_options',
    '修改模块标签和默认携带规则并保存，不改正文。rule_json 的 kind：automatic（自动选择，即清除默认规则）、always（始终）、manual（手动）、keywords（条件，需 words 数组 + case_sensitive + require_all 布尔）。routing 决定模块去向（default=进开局资料包；per_turn=每轮注入；style=文风；standby=待命按规则触发），temporality 决定压缩后是否可重注入（constant=可；snapshot=不重注入）；两者省略=保持现值。',
    {
      module_id: { type: 'string', required: true, description: '目标模块编号' },
      tags: { type: 'array', items: { type: 'string' }, description: '完整的新标签列表' },
      rule_json: { type: 'string', description: '携带规则 JSON，如 {"kind":"always"} 或 {"kind":"keywords","words":["城门"],"case_sensitive":false,"require_all":true}；省略=清除规则' },
      routing: { type: 'string', description: 'default / per_turn / style / standby；省略=保持现值' },
      temporality: { type: 'string', description: 'constant / snapshot；省略=保持现值' },
    },
    args => {
      let use: ModuleUse | undefined
      if (typeof args.rule_json === 'string' && args.rule_json.trim().length > 0) {
        let raw: unknown
        try {
          raw = JSON.parse(args.rule_json)
        } catch {
          throw new Error('rule_json 不是合法 JSON')
        }
        const rule = raw as Record<string, unknown>
        if (rule.kind === 'always' || rule.kind === 'manual') use = { kind: rule.kind }
        else if (rule.kind === 'automatic') use = undefined
        else if (rule.kind === 'keywords' && Array.isArray(rule.words)) {
          use = { kind: 'keywords', words: rule.words.map(String), caseSensitive: rule.case_sensitive === true, requireAll: rule.require_all === true }
        }
        else throw new Error('rule_json 的 kind 无效（automatic/always/manual/keywords）')
      }
      return {
        kind: 'module_options', moduleId: String(args.module_id),
        tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        use,
        routing: args.routing === undefined ? undefined : routingOf(String(args.routing), 'routing'),
        temporality: args.temporality === undefined ? undefined : temporalityOf(String(args.temporality), 'temporality'),
      }
    })

  // ---------- 预制模块：时间线 ----------
  const numOrNull = (raw: unknown): number | null => {
    // null/undefined/'' 是「未放置」「开放端」的语义值——Number(null) 是 0，必须先挡。
    if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }
  const EVENT_ID = { module_id: { type: 'string' as const, required: true as const, description: '时间线模块编号' }, id: { type: 'string' as const, required: true as const, description: '事件/时代编号' } }
  const eventPatch = (args: Record<string, unknown>): { title?: string, description?: string, at?: number | null, until?: number | null, ongoing?: boolean, characters?: string[], color?: string | null } => {
    const patch: { title?: string, description?: string, at?: number | null, until?: number | null, ongoing?: boolean, characters?: string[], color?: string | null } = {}
    if (args.title !== undefined) patch.title = String(args.title)
    if (args.description !== undefined) patch.description = String(args.description)
    if (args.at !== undefined) patch.at = numOrNull(args.at)
    if (args.until !== undefined) patch.until = numOrNull(args.until)
    if (args.ongoing !== undefined) patch.ongoing = args.ongoing === true
    if (Array.isArray(args.characters)) patch.characters = args.characters.map(String)
    if (args.color !== undefined) patch.color = args.color === '' ? null : String(args.color)
    return patch
  }

  registerEditTool(tools, 'timeline_add_event',
    '往时间线模块加一条事件并保存（专用工具，不要手写 JSON）。at 是数值时间（单位由历法决定），省略/at=null 表示事件存在但尚未放到轴上；until 给出则事件是一段时期。',
    {
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
      title: { type: 'string', required: true, description: '事件标题' },
      at: { oneOf: [{ type: 'number' }, { type: 'null' }], description: '数值时间；null/省略=事件存在但未放到轴上' },
      until: { oneOf: [{ type: 'number' }, { type: 'null' }], description: '持续终点；null/省略=点事件' },
      description: { type: 'string', description: '事件描述' },
      characters: { type: 'array', items: { type: 'string' }, description: '相关角色卡编号' },
      color: { type: 'string', description: '事件颜色 purple/blue/pink/green/amber/gray；省略=跟随所属纪元' },
      ongoing: { type: 'boolean', description: 'true=开放事件（向未来延伸，与 until 互斥）' },
    },
    args => ({
      kind: 'timeline_add_event', moduleId: String(args.module_id),
      event: {
        title: String(args.title), at: numOrNull(args.at), until: numOrNull(args.until),
        ...(args.ongoing === true ? { ongoing: true } : {}),
        description: typeof args.description === 'string' ? args.description : undefined,
        characters: Array.isArray(args.characters) ? args.characters.map(String) : undefined,
        color: typeof args.color === 'string' && args.color !== '' ? args.color : undefined,
      },
    }))

  registerEditTool(tools, 'timeline_update_event',
    '修改时间线事件的标题、描述、位置、颜色或关联角色；只传要改的字段。color 传空字符串表示回到「跟随纪元」。',
    { ...EVENT_ID, title: { type: 'string', description: '新标题' }, at: { oneOf: [{ type: 'number' }, { type: 'null' }], description: 'null=从轴上取下' }, until: { oneOf: [{ type: 'number' }, { type: 'null' }], description: 'null=收敛成点事件' }, ongoing: { type: 'boolean', description: 'true=延伸到未来的开放事件' }, description: { type: 'string' }, characters: { type: 'array', items: { type: 'string' } }, color: { type: 'string', description: 'purple/blue/pink/green/amber/gray；空串=跟随纪元' } },
    args => ({ kind: 'timeline_update_event', moduleId: String(args.module_id), id: String(args.id), patch: eventPatch(args) }))

  registerEditTool(tools, 'timeline_move_event',
    '把事件挪到新时间（拖动手感的工具版）；until 省略=保持原持续，传 null 值由 at 单独决定。',
    { ...EVENT_ID, at: { type: 'number', required: true, description: '新的数值时间' }, until: { oneOf: [{ type: 'number' }, { type: 'null' }], description: 'null=收敛成点事件' } },
    args => ({ kind: 'timeline_move_event', moduleId: String(args.module_id), id: String(args.id), at: numOrNull(args.at), until: args.until === undefined ? undefined : numOrNull(args.until) }))

  registerEditTool(tools, 'timeline_remove_event',
    '从时间线删除一条事件（时代不受影响）。',
    EVENT_ID,
    args => ({ kind: 'timeline_remove_event', moduleId: String(args.module_id), id: String(args.id) }))

  registerEditTool(tools, 'timeline_add_era',
    '加一段时代色带。from/to 为数值范围，传 null 表示开放端（延伸到过去/未来，图上末端消散成粒子）；color 取 purple/blue/pink/green/amber/gray。',
    {
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
      name: { type: 'string', required: true, description: '时代名' },
      from: { oneOf: [{ type: 'number' }, { type: 'null' }], description: '起点；null=向过去开放' },
      to: { oneOf: [{ type: 'number' }, { type: 'null' }], description: '终点；null=向未来开放' },
      color: { type: 'string', description: '色带颜色' },
    },
    args => ({ kind: 'timeline_add_era', moduleId: String(args.module_id), era: { name: String(args.name), from: args.from === null ? null : (numOrNull(args.from) ?? 0), to: numOrNull(args.to), color: typeof args.color === 'string' ? args.color : 'gray' } }))

  registerEditTool(tools, 'timeline_update_era',
    '修改时代名、范围或颜色；只传要改的字段。from/to 传 null = 开放端（延伸到过去/未来）。',
    { ...EVENT_ID, name: { type: 'string' }, from: { oneOf: [{ type: 'number' }, { type: 'null' }], description: 'null=向过去开放' }, to: { oneOf: [{ type: 'number' }, { type: 'null' }], description: 'null=向未来开放' }, color: { type: 'string' } },
    args => {
      const patch: { name?: string, from?: number | null, to?: number | null, color?: string } = {}
      if (args.name !== undefined) patch.name = String(args.name)
      if (args.from !== undefined) patch.from = args.from === null ? null : (numOrNull(args.from) ?? 0)
      if (args.to !== undefined) patch.to = numOrNull(args.to)
      if (args.color !== undefined) patch.color = String(args.color)
      return { kind: 'timeline_update_era', moduleId: String(args.module_id), id: String(args.id), patch }
    })

  registerEditTool(tools, 'timeline_remove_era',
    '删除一段时代色带（事件不受影响）。',
    EVENT_ID,
    args => ({ kind: 'timeline_remove_era', moduleId: String(args.module_id), id: String(args.id) }))

  registerEditTool(tools, 'timeline_set_calendar',
    `设置时间线历法。轴上数值一律存「最小单位」的数，历法是数↔文字的格式化器，由三种原语组成：
- units：固定比单位链，粗→细，[{name,per}] per=折合最小单位数（如 [{name:"年",per:360},{name:"月",per:30},{name:"日",per:1}]；自定义单位随便起名，per 自定义）
- cycles：循环命名，[{unit,names,offset}]，把某单位的数值取模换成名字。干支纪年 = 年上 60 名循环：{"unit":"年","names":["甲子","乙丑",…,"癸亥"],"offset":3}；生肖、星期、月相同理
- epoch：纪元偏移（元年分界），format：显示模板 {n}=复合串或数值，formatBefore：纪元前模板（如 "前{n}年"）
切换显示视图（如公元纪年/干支）时：事件与纪元的位置存在最小单位里，units 的 per 换算必须保持原样（年仍是 360、月仍是 30），只改 format/formatBefore/cycles/epoch；把 units 改成 [{name:"年",per:1}] 会把日值当年值放大 360 倍。
多视图：给历法一个 "name"（如 "公元纪年"、"干支纪年"）就会存成命名视图并切换过去，同名覆盖；用户在工具栏历法菜单里可以来回切换视图。切换已存视图用 timeline_switch_view。
旧写法 {"unit":"日"} 兼容，等价于 units:[{name:"日",per:1}]。`,
    {
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
      calendar_json: {
        type: 'string', required: true,
        description: '历法 JSON。"name" 非空=存成命名视图（同名覆盖）。简单历：{"name":"神历","units":[{"name":"日","per":1}],"epoch":0,"step":1,"format":"神历第{n}日"}；复合历：{"name":"公元纪年","units":[{"name":"年","per":360},{"name":"月","per":30},{"name":"日","per":1}],"format":"公元{n}年","formatBefore":"公元前{n}年"}；干支：在 units 上加 cycles:[{"unit":"年","names":[60干支名],"offset":3}]',
      },
    },
    args => {
      const raw = JSON.parse(String(args.calendar_json)) as Record<string, unknown>
      if (raw === null || typeof raw !== 'object') throw new Error('calendar_json 不是对象')
      return { kind: 'timeline_set_calendar', moduleId: String(args.module_id), calendar: calendarOf(raw) }
    })

  registerEditTool(tools, 'timeline_switch_view',
    '切换时间线的历法视图（只换显示，位置数据不动）。name 是 timeline_set_calendar 存过的命名视图。',
    {
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
      name: { type: 'string', required: true, description: '要切换到的历法视图名' },
    },
    args => ({ kind: 'timeline_switch_view', moduleId: String(args.module_id), name: String(args.name) }))

  registerEditTool(tools, 'timeline_add_mark',
    '在时间线标尺上插一个刻度标记：某个有意义的时间点的小旗（如「现在」「转折点」）。at 是数值位置，label 可留空。',
    {
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
      at: { type: 'number', required: true, description: '轴上位置（数值）' },
      label: { type: 'string', description: '标记名' },
    },
    args => ({
      kind: 'timeline_add_mark', moduleId: String(args.module_id),
      mark: { at: numOrNull(args.at) ?? 0, ...(typeof args.label === 'string' ? { label: args.label } : {}) },
    }))

  registerEditTool(tools, 'timeline_update_mark',
    '改刻度标记的位置或名字；只传要改的字段。',
    {
      module_id: { type: 'string', required: true, description: '时间线模块编号' },
      id: { type: 'string', required: true, description: '标记编号' },
      at: { type: 'number' }, label: { type: 'string' },
    },
    args => {
      const patch: { at?: number, label?: string } = {}
      const at = numOrNull(args.at); if (at !== null) patch.at = at
      if (args.label !== undefined) patch.label = String(args.label)
      return { kind: 'timeline_update_mark', moduleId: String(args.module_id), id: String(args.id), patch }
    })

  registerEditTool(tools, 'timeline_remove_mark',
    '删除一个刻度标记（不影响任何事件）。',
    EVENT_ID,
    args => ({ kind: 'timeline_remove_mark', moduleId: String(args.module_id), id: String(args.id) }))

  // ---------- 预制模块：集合 ----------
  const ITEM_ID = { module_id: { type: 'string' as const, required: true as const, description: '集合模块编号' }, id: { type: 'string' as const, required: true as const, description: '条目/字段编号' } }

  registerEditTool(tools, 'collection_add_field',
    '给集合模块加一个自定义字段。type：text/longtext/date/person（引用角色卡，值是 {"cardId":"...","name":"..."}）/image（值为 {"resourceId":...}）/place（引用世界卡，同样是 cardId+name）/number（数值，供图表与体量排版）/time（时间点，数值，与时间线历法同轴，供长卷视图定位）。link 类型目前只是文本占位、不会生成跳转；要做可点击跳转请用 HTML 模块的 NOVEN_FRAME.navigate 或等待 link 字段落地。',
    {
      module_id: { type: 'string', required: true, description: '集合模块编号' },
      name: { type: 'string', required: true, description: '字段名' },
      type: { type: 'string', description: '字段类型（缺省 text）' },
    },
    args => ({ kind: 'collection_add_field', moduleId: String(args.module_id), field: { name: String(args.name), ...(typeof args.type === 'string' ? { type: args.type as 'text' | 'longtext' | 'date' | 'person' | 'image' | 'place' | 'link' | 'number' | 'time' } : {}) } }))

  registerEditTool(tools, 'collection_update_field',
    '改集合字段的名字或类型；只传要改的字段。',
    { ...ITEM_ID, name: { type: 'string' }, type: { type: 'string' } },
    args => {
      const patch: { name?: string, type?: 'text' | 'longtext' | 'date' | 'person' | 'image' | 'place' | 'link' | 'number' | 'time' } = {}
      if (args.name !== undefined) patch.name = String(args.name)
      if (args.type !== undefined) patch.type = String(args.type) as 'text' | 'longtext' | 'date' | 'person' | 'image' | 'place' | 'link' | 'number' | 'time'
      return { kind: 'collection_update_field', moduleId: String(args.module_id), id: String(args.id), patch }
    })

  registerEditTool(tools, 'collection_remove_field',
    '删除一个集合字段，各条目上该字段的值一并清除。',
    ITEM_ID,
    args => ({ kind: 'collection_remove_field', moduleId: String(args.module_id), id: String(args.id) }))

  registerEditTool(tools, 'collection_add_item',
    '往集合加一个条目并保存（专用工具，不要手写 JSON）。返回的 created_block_ids/条目编号可继续用。' +
    'values 一次把各字段值写齐（键用字段名），不用再逐格调 collection_set_value。',
    {
      module_id: { type: 'string', required: true, description: '集合模块编号' },
      name: { type: 'string', required: true, description: '条目名' },
      summary: { type: 'string', description: '摘要' },
      description: { type: 'string', description: '正文描述' },
      values: { type: 'json', description: '字段值表，键为字段名，如 {"时间":"1129","类别":"财政","岁入":660}；number/time 字段传数值' },
    },
    args => ({
      kind: 'collection_add_item', moduleId: String(args.module_id),
      item: { name: String(args.name), summary: typeof args.summary === 'string' ? args.summary : undefined, description: typeof args.description === 'string' ? args.description : undefined },
      ...(args.values !== undefined ? { values: (typeof args.values === 'string' ? JSON.parse(args.values) : args.values) as Record<string, string> } : {}),
    }))

  registerEditTool(tools, 'collection_update_item',
    '改条目的名字、摘要或正文；只传要改的字段。',
    { ...ITEM_ID, name: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' } },
    args => {
      const patch: { name?: string, summary?: string, description?: string } = {}
      if (args.name !== undefined) patch.name = String(args.name)
      if (args.summary !== undefined) patch.summary = String(args.summary)
      if (args.description !== undefined) patch.description = String(args.description)
      return { kind: 'collection_update_item', moduleId: String(args.module_id), id: String(args.id), patch }
    })

  registerEditTool(tools, 'collection_remove_item',
    '删除集合的一个条目，其自定义字段值一并清除。',
    ITEM_ID,
    args => ({ kind: 'collection_remove_item', moduleId: String(args.module_id), id: String(args.id) }))

  registerEditTool(tools, 'collection_set_value',
    '给某条目的某字段写值。value_json：文本字段传 "字符串"（含引号的 JSON），图片字段传 {"resourceId":"资源编号"}，person/place 引用字段传 {"cardId":"卡编号","name":"显示名"}（可带 itemId）。',
    {
      ...ITEM_ID,
      item_id: { type: 'string', required: true, description: '条目编号' },
      field_id: { type: 'string', required: true, description: '字段编号' },
      value_json: { type: 'string', required: true, description: 'JSON 值' },
    },
    args => {
      const value = JSON.parse(String(args.value_json)) as unknown
      return { kind: 'collection_set_value', moduleId: String(args.module_id), itemId: String(args.item_id), fieldId: String(args.field_id), value: value as string }
    })

  tools.register(defineTool({
    name: 'collection_set_item_image',
    description: '设置条目的主图（卡片/长卷视图的配图）。resource_id 用卡内已有图片资源；' +
      '或 image_path 给项目内图片路径（generate_image 的落盘路径），自动收进卡片再绑定。两参二选一。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '集合模块编号' },
      item_id: { type: 'string', required: true, description: '条目编号' },
      resource_id: { type: 'string', description: '本卡已有图片资源编号' },
      image_path: { type: 'string', description: '项目内图片相对路径（如 视觉/盐田.png）' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const resourceId = optionalId(args.resource_id) ?? undefined
      const imagePath = optionalId(args.image_path)
      if ((resourceId === undefined) === (imagePath === undefined)) throw new Error('resource_id 与 image_path 必须且只能给一个')
      if (resourceId !== undefined) {
        return editAndCommit(exec, String(args.root_id), String(args.target_id), {
          kind: 'collection_set_item_image', moduleId: String(args.module_id), itemId: String(args.item_id), resourceId,
        }, optionalId(args.project) ?? undefined)
      }
      const path = imagePath ?? ''
      const bytes = await readProjectFile(sessionCwd(exec), path)
      const mediaType = IMAGE_MEDIA[path.split('.').pop()?.toLowerCase() ?? '']
      if (mediaType === undefined) throw new Error(`不支持的图片类型：${path}`)
      return editAndCommit(exec, String(args.root_id), String(args.target_id), {
        kind: 'collection_set_item_image', moduleId: String(args.module_id), itemId: String(args.item_id), bytes, mediaType,
      }, optionalId(args.project) ?? undefined)
    },
  }))

  registerEditTool(tools, 'collection_set_style',
    '设置本模块条目配图的统一画风提示词（art_style）。生图时把它拼在每条配图描述前，保证整排卡同一系列。',
    {
      module_id: { type: 'string', required: true, description: '集合模块编号' },
      art_style: { type: 'string', required: true, description: '画风描述，如「柔和水墨插画，淡彩，宋代风物」' },
    },
    args => ({ kind: 'collection_set_style', moduleId: String(args.module_id), artStyle: String(args.art_style) }))

  registerEditTool(tools, 'collection_set_view',
    '设置集合的默认视图：list 表格 / cards 图鉴卡 / timeline 编年长卷 / map（预留）。',
    {
      module_id: { type: 'string', required: true, description: '集合模块编号' },
      view: { type: 'string', required: true, description: 'list / cards / timeline / map' },
    },
    args => {
      const view = String(args.view)
      if (!['list', 'cards', 'timeline', 'map'].includes(view)) throw new Error('view 必须是 list / cards / timeline / map')
      return { kind: 'collection_set_view', moduleId: String(args.module_id), view: view as 'list' | 'cards' | 'timeline' | 'map' }
    })

  registerEditTool(tools, 'widget_set_data',
    '整体改写 relation 模块的结构化数据：{"nodes":[{"name":"艾莉娅","note":"…","x":0.3,"y":0.5}],"edges":[{"from":"节点id","to":"节点id","label":"师徒"}]}。' +
    'timeline/collection 用各自的专用工具；地图由 FMG 编辑器生成，用 generate_map。',
    {
      module_id: { type: 'string', required: true, description: 'relation 模块编号' },
      widget: { type: 'string', required: true, description: '固定为 relation' },
      data: { type: 'json', required: true, description: 'relation 的整份数据对象' },
    },
    args => {
      const moduleId = String(args.module_id)
      const raw = typeof args.data === 'string' ? args.data : JSON.stringify(args.data)
      const widget = String(args.widget)
      if (widget !== 'relation') throw new Error('widget 必须是 relation（地图请用 generate_map）')
      return { kind: 'set_widget_data', moduleId, widget, data: raw }
    })


  tools.register(defineTool({
    name: 'generate_map',
    description: '在卡的地图模块上排队一次 Fantasy-Map-Generator 世界生成（模板/种子/尺寸/空白）。' +
      '这是浏览器编辑器的生成请求：地图页打开后才会真正生成并自动保存；不要把回执当成“地图已生成”。' +
      'template 常用：continents（大陆）、archipelago（群岛）、lowIsland（单岛）、peninsula（半岛）、blank（空白单岛，无国家/城邦）。' +
      'blank 会自动带 empty=true，只保留地形/一个中立文化，方便用户手动画。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
      template: { type: 'string', description: 'FMG 高度图模板 id；缺省 continents' },
      seed: { type: 'string', description: '世界种子；省略=由编辑器随机' },
      width: { type: 'integer', description: '地图宽度像素，默认 1280' },
      height: { type: 'integer', description: '地图高度像素，默认 800' },
      points: { type: 'integer', description: '网格点数，默认 10000；越大越细也越慢' },
      empty: { type: 'boolean', description: 'true=不生成国家/城邦（空白手绘）；blank 模板自动开启' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const root = String(args.root_id)
      const target = String(args.target_id)
      const moduleId = String(args.module_id)
      const template = typeof args.template === 'string' && args.template.trim() !== '' ? args.template.trim() : 'continents'
      const empty = args.empty === true || template === 'blank'
      const request: Record<string, unknown> = {
        template,
        ...(typeof args.seed === 'string' && args.seed.trim() !== '' ? { seed: args.seed.trim() } : {}),
        width: Number.isFinite(Number(args.width)) && Number(args.width) > 0 ? Math.trunc(Number(args.width)) : 1280,
        height: Number.isFinite(Number(args.height)) && Number(args.height) > 0 ? Math.trunc(Number(args.height)) : 800,
        points: Number.isFinite(Number(args.points)) && Number(args.points) > 0 ? Math.trunc(Number(args.points)) : 10000,
        ...(empty ? { empty: true } : {}),
      }
      await editAndCommit(exec, root, target, { kind: 'request_map_generation', moduleId, request }, optionalId(args.project) ?? undefined)
      return {
        status: 'requested',
        root_id: root,
        target_id: target,
        module_id: moduleId,
        ...request,
        hint: '地图页打开后由 FMG 编辑器生成，完成后自动保存到卡；如果地图页已经打开，会立即开始。',
      }
    },
  }))

  tools.register(defineTool({
    name: 'map_summary',
    description: '读取地图模块上次保存时留下的结构化摘要：国家/文化/城邦/标记的编号、名称和位置。' +
      '改图前先用它拿编号；摘要缺失时先让用户打开地图页并保存一次。只读，不会执行任何地图代码。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const resolved = await resolveCard(sessionCwd(exec), exec.agent?.session?.id as SessionId | undefined, String(args.root_id), optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, String(args.root_id))
      const target = locate(card, String(args.target_id))
      const module = flattenModules(target.modules).find(candidate => candidate.id === args.module_id)
      if (module === undefined) throw new Error('模块不在目标卡中')
      if (module.widget?.type !== 'map') throw new Error('目标模块不是 map 类型')
      const summary = module.widget.mapSummary
      if (summary === undefined) {
        return { status: 'empty', module_id: module.id, summary: null, hint: '还没有地图摘要：先打开地图页并保存一次，再让我改图。' }
      }
      return { status: 'read', module_id: module.id, summary: summary as JsonValue, hint: null }
    },
  }))

  tools.register(defineTool({
    name: 'map_edit',
    description: '在已定稿/已保存的地图上排队一组改图动作，地图页打开后由编辑器直接执行并保存。' +
      '只允许安全的编辑动作，不允许删除/合并/整张重生成，也不允许执行代码。' +
      '常用：States.rename(国家编号, 新名字)、States.recolor(编号, 颜色)、States.setPopulation(编号, 人口)、' +
      'Burgs.rename(城邦编号, 新名字)、Burgs.setPopulation(编号, 人口)、Burgs.setPort(编号, 港口编号或0)、' +
      'Cultures.rename(文化编号, 新名字)、Religions.rename(编号, 新名字)、Markers.rename(标记编号, 新名字)、' +
      'Markers.move(编号, x, y)。先用 map_summary 拿编号。小改直接执行，地图工具的「AI 改动」可撤销。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
      operations: {
        type: 'array',
        required: true,
        description: '动作数组，每项 { op: "States.rename", args: [3, "寒川"] }',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', required: true, description: '动作名' },
            args: { type: 'array', required: true, description: '按动作参数顺序排列的参数' },
          },
          additionalProperties: false,
        },
      },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const operations = Array.isArray(args.operations) ? args.operations : []
      if (operations.length === 0) throw new Error('operations 不能为空')
      for (const item of operations) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('每个 operation 必须是对象')
        const record = item as Record<string, unknown>
        if (typeof record.op !== 'string' || !Array.isArray(record.args)) throw new Error('operation 需要 op 字符串和 args 数组')
      }
      const root = String(args.root_id)
      const target = String(args.target_id)
      const moduleId = String(args.module_id)
      await editAndCommit(exec, root, target, { kind: 'request_map_edit', moduleId, operations }, optionalId(args.project) ?? undefined)
      return {
        status: 'requested',
        module_id: moduleId,
        operations,
        hint: '地图页打开后会立即执行并保存到卡；完成后可用 map_summary 复查。',
      }
    },
  }))

  tools.register(defineTool({
    name: 'map_compose',
    description: '在空白白膜上按归一化地形构图起稿。只在没有地图文档的白膜上使用；已有地图先让用户重开白膜。' +
      'spec 支持：seed、landRatio（0.02–0.9）、landmasses（shape=ellipse: center/radius/coast/height；shape=polygon: points/coast/height）、' +
      'ridges（path/height/width）、basins（center/radius/depth）、plateaus（center/radius/height）。所有坐标和半径都是 0–1 归一化值。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
      spec: { type: 'object', required: true, additionalProperties: true, description: '地形构图；至少包含 landmasses' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const spec = args.spec
      if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('spec 必须是对象')
      const root = String(args.root_id)
      const target = String(args.target_id)
      const moduleId = String(args.module_id)
      const resolved = await resolveCard(sessionCwd(exec), exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const module = flattenModules(locate(card, target).modules).find(candidate => candidate.id === moduleId)
      if (module === undefined) throw new Error('模块不在目标卡中')
      if (module.widget?.type !== 'map') throw new Error('目标模块不是 map 类型')
      if (module.blocks.some(block => block.kind === 'text')) throw new Error('当前地图已有内容；先重开白膜再起稿')
      await editAndCommit(exec, root, target, { kind: 'request_map_compose', moduleId, spec }, optionalId(args.project) ?? undefined)
      return { status: 'requested', module_id: moduleId, hint: '地图页打开后会先起一张白膜再落构图；完成后用 map_terrain_summary 看陆地比例和 ASCII 缩略图。' }
    },
  }))

  tools.register(defineTool({
    name: 'map_paint',
    description: '对当前白膜地形做增量修改。operations 每项为 { op, args }；op 只能是 add_landmass / add_ridge / carve_sea / add_lake / raise。' +
      'args 使用 0–1 坐标：add_landmass、raise、carve_sea、add_lake 用 center/radius（radius 可为数字或 [rx,ry]），add_landmass 可带 height，raise 可带 amount，carve_sea/add_lake 可带 depth；add_ridge 用 path/height/width。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
      operations: {
        type: 'array',
        required: true,
        description: '地形动作数组',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', required: true, description: '地形动作名' },
            args: { type: 'object', required: true, additionalProperties: true, description: '动作参数，0–1 坐标' },
          },
          additionalProperties: false,
        },
      },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const operations = Array.isArray(args.operations) ? args.operations : []
      if (operations.length === 0) throw new Error('operations 不能为空')
      for (const item of operations) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('每个 operation 必须是对象')
        const record = item as Record<string, unknown>
        if (typeof record.op !== 'string') throw new Error('operation 需要 op 字符串')
        if (record.args === null || typeof record.args !== 'object' || Array.isArray(record.args)) throw new Error('operation 需要 args 对象')
      }
      const root = String(args.root_id)
      const target = String(args.target_id)
      const moduleId = String(args.module_id)
      const resolved = await resolveCard(sessionCwd(exec), exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const module = flattenModules(locate(card, target).modules).find(candidate => candidate.id === moduleId)
      if (module === undefined) throw new Error('模块不在目标卡中')
      if (module.widget?.type !== 'map') throw new Error('目标模块不是 map 类型')
      if (module.blocks.some(block => block.kind === 'text')) throw new Error('当前地图已定稿；先重开白膜再改地形')
      await editAndCommit(exec, root, target, { kind: 'request_map_paint', moduleId, operations }, optionalId(args.project) ?? undefined)
      return { status: 'requested', module_id: moduleId, operations, hint: '地图页打开后会立即修改白膜并自动存草稿；完成后用 map_terrain_summary 复查。' }
    },
  }))

  tools.register(defineTool({
    name: 'map_terrain_summary',
    description: '读取上次 AI 地形起稿或调整后的结构化摘要：陆地比例、格子数、高度范围，以及 32×24 的 ASCII 陆地/水域缩略图（# 陆地、^ 高地、. 水域）。没有摘要时返回 empty。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const resolved = await resolveCard(sessionCwd(exec), exec.agent?.session?.id as SessionId | undefined, String(args.root_id), optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, String(args.root_id))
      const module = flattenModules(locate(card, String(args.target_id)).modules).find(candidate => candidate.id === args.module_id)
      if (module === undefined) throw new Error('模块不在目标卡中')
      if (module.widget?.type !== 'map') throw new Error('目标模块不是 map 类型')
      const summary = module.widget.mapTerrainSummary
      if (summary === undefined) return { status: 'empty', module_id: module.id, summary: null, hint: '还没有地形摘要：先让 AI 起稿或改地形，或打开地图页看一眼。' }
      return { status: 'read', module_id: module.id, summary: summary as JsonValue, hint: null }
    },
  }))

  tools.register(defineTool({
    name: 'generate_map_human',
    description: '给已经定稿的地形补人文层（国家、文化、城邦、宗教、道路）。只在地图阶段为 terrain 时使用；生成后会保存为 world 并带摘要。',
    parameters: {
      ...TARGET_PARAMS,
      module_id: { type: 'string', required: true, description: '地图模块编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const root = String(args.root_id)
      const target = String(args.target_id)
      const moduleId = String(args.module_id)
      const resolved = await resolveCard(sessionCwd(exec), exec.agent?.session?.id as SessionId | undefined, root, optionalId(args.project) ?? undefined)
      const card = await currentCard(resolved.store, root)
      const module = flattenModules(locate(card, target).modules).find(candidate => candidate.id === moduleId)
      if (module === undefined) throw new Error('模块不在目标卡中')
      if (module.widget?.type !== 'map') throw new Error('目标模块不是 map 类型')
      if (module.widget.mapStage !== 'terrain') throw new Error('地形还没有定稿；先让用户点「定稿地形」')
      await editAndCommit(exec, root, target, { kind: 'request_map_human', moduleId }, optionalId(args.project) ?? undefined)
      return { status: 'requested', module_id: moduleId, hint: '地图页会生成人文层并保存为完整世界；完成后用 map_summary 复查。' }
    },
  }))



  // ---------- 图片 ----------
  registerEditTool(tools, 'set_card_image', '将目标卡已持有的图片设为封面或头像。不会上传、生成或删除图片。',
    { resource_id: { type: 'string', required: true, description: '当前目标卡图片资源编号' }, purpose: { type: 'string', required: true, description: 'cover 封面 / avatar 头像' } },
    args => {
      if (args.purpose !== 'cover' && args.purpose !== 'avatar') throw new Error('purpose 必须是 cover 或 avatar')
      return { kind: 'appearance', resourceId: String(args.resource_id), cover: args.purpose === 'cover' }
    })

  registerEditTool(tools, 'clear_card_image', '清除头像或封面用途，不删除素材。',
    { purpose: { type: 'string', required: true, description: 'avatar 或 cover' } },
    args => {
      if (args.purpose !== 'cover' && args.purpose !== 'avatar') throw new Error('purpose 必须是 cover 或 avatar')
      return { kind: 'appearance', resourceId: null, cover: args.purpose === 'cover' }
    })

  registerEditTool(tools, 'insert_owned_image', '把本卡已有图片插入目标模块，生成新的图片展示块，复用资源不复制文件。保存后结果里带新块编号。',
    { module_id: { type: 'string', required: true, description: '目标模块编号' }, resource_id: { type: 'string', required: true, description: '本卡自有图片资源编号' }, after_id: { type: 'string', description: '同模块定位块编号，在它之后插入；空/省略为模块末尾' } },
    args => ({ kind: 'insert_owned_image', moduleId: String(args.module_id), resourceId: String(args.resource_id), afterBlockId: optionalId(args.after_id) }))

  registerEditTool(tools, 'replace_block_image', '将现有图片块改用本卡另一张已有图片，保留块编号、位置、图注和旧资源。',
    { module_id: { type: 'string', required: true, description: '模块编号' }, block_id: { type: 'string', required: true, description: '已有图片块编号' }, resource_id: { type: 'string', required: true, description: '要使用的图片资源编号' } },
    args => ({ kind: 'replace_block_image', moduleId: String(args.module_id), blockId: String(args.block_id), resourceId: String(args.resource_id) }))

  registerEditTool(tools, 'remove_card_resource', '移除当前卡的素材归属。remove_uses 为 true 时同时移除该图片所有展示和头像封面用途；false 遇仍在使用时拒绝。保留历史版本的原始文件。',
    { resource_id: { type: 'string', required: true, description: '资源编号' }, remove_uses: { type: 'boolean', description: '是否连同用途一并移除' } },
    args => ({ kind: 'remove_resource', resourceId: String(args.resource_id), removeUses: args.remove_uses === true }))

  registerEditTool(tools, 'module_embed_file',
    '把项目内文件嵌进模块展示：图片收进卡资源生成图片块；.html/.htm 成为活引用（模块按文件实时渲染，文件更新模块跟着变）；.md/.txt 把全文快照成文字块。module_id 省略时以文件名在卡根新建一个模块。',
    {
      module_id: { type: 'string', description: '目标模块编号；省略=以文件名新建模块' },
      path: { type: 'string', required: true, description: '项目内文件相对路径（如 视觉/盐场.png、研究素材/舆图.html）' },
    },
    args => ({ kind: 'embed_file', path: String(args.path), moduleId: optionalId(args.module_id) }))

  tools.register(defineTool({
    name: 'save_conversation_image',
    description: '把项目内一张图片复制进允许管理的卡片并保存（对话/生图产物入卡的正道）。image_path 为项目内相对路径；module_id 为空则仅存入素材（资源），after_id 为空则放模块末尾。',
    parameters: {
      ...TARGET_PARAMS,
      image_path: { type: 'string', required: true, description: '项目内图片相对路径（如 视觉/主角.png）' },
      module_id: { type: 'string', description: '模块编号或空（仅存素材）' },
      after_id: { type: 'string', description: '定位块编号或空（模块末尾）' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const bytes = await readProjectFile(cwd, String(args.image_path))
      const extension = String(args.image_path).split('.').pop()?.toLowerCase() ?? ''
      const mediaType = IMAGE_MEDIA[extension]
      if (mediaType === undefined) throw new Error(`不支持的图片类型：${extension}`)
      return editAndCommit(exec, String(args.root_id), String(args.target_id), {
        kind: 'adopt_image', bytes, mediaType, moduleId: optionalId(args.module_id), afterBlockId: optionalId(args.after_id),
      }, optionalId(args.project) ?? undefined)
    },
  }))

  // ---------- 世界内角色 ----------
  registerEditTool(tools, 'place_internal_character', '调整世界内部角色的展示位置。module_id 为目标模块，空/省略恢复独立角色列表。不修改角色正文或权限。',
    { character_id: { type: 'string', required: true, description: '本世界角色编号' }, module_id: { type: 'string', description: '目标模块编号；空/省略恢复独立列表' } },
    args => ({ kind: 'place_character', characterId: String(args.character_id), moduleId: optionalId(args.module_id) }))

  registerEditTool(tools, 'create_internal_character', '在允许管理的世界内新建独立角色并保存。结果里带新角色编号，成为当前可管理的新成果。',
    { name: { type: 'string', required: true, description: '新角色名称' } },
    args => ({ kind: 'add_character', name: String(args.name) }))

  tools.register(defineTool({
    name: 'copy_internal_character',
    description: '从允许读取的独立角色复制至允许管理的世界，模块、图片和扩展完整复制；副本独立。source_id 为来源角色根编号，可来自别的项目。',
    parameters: {
      ...TARGET_PARAMS,
      source_id: { type: 'string', required: true, description: '来源角色卡根编号' },
      source_project: { type: 'string', description: '来源角色所在项目（省略=自动全项目查找）' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const sessionId = exec.agent?.session?.id as SessionId | undefined
      const source = (await resolveCard(cwd, sessionId, String(args.source_id), optionalId(args.source_project) ?? undefined)).saved
      if (source.document.kind !== 'CHARACTER') throw new Error('只能复制角色卡')
      return editAndCommit(exec, String(args.root_id), String(args.target_id), { kind: 'copy_character', source: source.document }, optionalId(args.project) ?? undefined)
    },
  }))

  registerEditTool(tools, 'remove_internal_character', '从当前世界移除指定内部角色，历史内容保留；展示该角色的模块位置同步清空。',
    { character_id: { type: 'string', required: true, description: '内部角色编号' } },
    args => ({ kind: 'remove_character', characterId: String(args.character_id) }))

  // ---------- 搬家 / 交换 ----------
  tools.register(defineTool({
    name: 'move_card',
    description: '把一张卡整体转移到另一个项目（目录搬家：编号、内容、修订历史、草稿原样随行；挂载引用不失效）。省略 project 时自动在全项目里找这张卡。搬完后它就是目标项目的本地卡。',
    parameters: {
      card_id: { type: 'string', required: true, description: '要搬的卡编号' },
      to_project: { type: 'string', required: true, description: '目标项目：项目名/编号/绝对路径（本会话项目可传 this）' },
      project: { type: 'string', description: '来源项目（省略=自动查找）' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const sessionId = exec.agent?.session?.id as SessionId | undefined
      const cardId = String(args.card_id)
      const rawTarget = String(args.to_project)
      const resolved = await resolveCard(cwd, sessionId, cardId, optionalId(args.project) ?? undefined)
      const targetRoot = rawTarget.trim() === 'this' ? cwd : await resolveProjectRoot(cwd, rawTarget)
      await resolved.store.moveTo(cardId, targetRoot)
      // 本会话若挂着它的引用 → 搬到本项目就摘引用，搬到别处则跟随新根。
      if (sessionId !== undefined) {
        const bindings = new BindingStore(cwd)
        const current = (await bindings.all())[sessionId]
        const refs = current?.refs ?? []
        const entry = refs.find(ref => ref.cardId === cardId)
        if (current !== undefined && entry !== undefined) {
          const toLocal = normalizeRoot(targetRoot) === normalizeRoot(cwd)
          const next = toLocal
            ? refs.filter(ref => ref.cardId !== cardId)
            : refs.map(ref => ref.cardId === cardId ? { root: targetRoot, cardId } : ref)
          await bindings.set(sessionId, { ...current, refs: next })
        }
      }
      return { status: 'moved', card_id: cardId, name: resolved.saved.document.name, from: resolved.projectRoot, to: targetRoot }
    },
  }))

  tools.register(defineTool({
    name: 'export_card',
    description: '导出一张已保存的卡为交换包（.novex.zip：结构 + 载荷 + SHA-256 清单，完整还原含模块顺序/嵌套/图片/世界内角色）。未提交草稿存在时拒绝导出。',
    parameters: {
      root_id: { type: 'string', required: true, description: '根卡编号' },
      output_path: { type: 'string', description: '输出 zip 相对路径；缺省为 <卡名>.novex.zip' },
      project: TARGET_PARAMS.project,
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const resolved = await resolveCard(cwd, exec.agent?.session?.id as SessionId | undefined, String(args.root_id), optionalId(args.project) ?? undefined)
      const output = optionalId(args.output_path) ?? `${resolved.saved.document.name}.novex.zip`
      const result = await exportCard(resolved.store, String(args.root_id), `${cwd}/${output}`)
      return { status: 'exported', path: output, entries: result.entries }
    },
  }))

  tools.register(defineTool({
    name: 'import_card',
    description: '导入卡片文件：诺文交换包（.novex.zip）完整还原；SillyTavern PNG 卡或 UTF-8 纯文本整体原文进自由文本模块（不强行拆字段）。导入产生草稿——告诉用户内容后，用 commit_import 确认提交才归库。',
    parameters: { path: { type: 'string', required: true, description: '项目内文件相对路径' } },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const bytes = await readProjectFile(cwd, String(args.path))
      const store = storeOf(cwd)
      const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
      const result = isZip
        ? await importExchange(store, bytes)
        : await importForeignFile(store, bytes, String(args.path).split('/').pop() ?? '导入卡')
      return { status: 'imported_draft', ...result, next: '用户确认后用 commit_import 提交（带 card_id 与 draft_version）' }
    },
  }))

  tools.register(defineTool({
    name: 'commit_import',
    description: '把导入产生的草稿提交为正式卡（用户确认后调用）。',
    parameters: {
      card_id: { type: 'string', required: true, description: '导入返回的卡编号' },
      draft_version: { type: 'string', required: true, description: '导入返回的版本' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const store = storeOf(cwd)
      const saved = await store.commit(String(args.card_id), String(args.draft_version))
      await bindManaged(cwd, exec, saved.cardId, cwd)
      return savedResult(saved.cardId, saved, undefined, saved.document)
    },
  }))
}

// ---------- 注册与参数辅助 ----------

function registerEditTool(tools: Tools, name: string, description: string, extra: ParameterSchemaSpec, build: CommandBuilder): void {
  tools.register(defineTool({
    name,
    description,
    parameters: { ...TARGET_PARAMS, ...extra },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      return editAndCommit(exec, String(args.root_id), String(args.target_id), build(args), optionalId(args.project) ?? undefined)
    },
  }))
}

function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

/**
 * 本会话挂载的卡（回答身份/背景/管理对象/跨项目引用）——绑定表在 .noven/，
 * list_cards 的本项目清单不覆盖它们，单独列出让模型知道挂载存在。
 */
async function mountedRows(cwd: string, sessionId: SessionId | undefined): Promise<Record<string, JsonValue>[]> {
  if (sessionId === undefined) return []
  const bindings = new BindingStore(cwd)
  await bindings.pruneDeadLocalMounts(sessionId)
  const binding = (await bindings.all())[sessionId]
  if (binding === undefined) return []
  const rows: Record<string, JsonValue>[] = []
  const store = storeOf(cwd)
  const push = async (id: string, role: string, root?: string): Promise<void> => {
    const cardStore = root === undefined ? store : new CardStore(root)
    const head = await cardStore.open(id).catch(() => undefined)
    const dirName = await cardStore.dirName(id).catch(() => undefined)
    rows.push({
      role, id,
      name: head?.document.name ?? '（卡不存在）',
      kind: head?.document.kind ?? '?',
      ...(head === undefined ? { missing: true } : {}),
      ...(root !== undefined ? { project_root: root, reference: true } : {}),
      ...(dirName !== undefined ? { card_dir: join(cardsRoot(root ?? cwd), dirName) } : {}),
    })
  }
  if (binding.identityCardId !== undefined) await push(binding.identityCardId, '回答身份')
  for (const id of binding.backgroundCardIds) await push(id, '背景')
  if (binding.managed !== undefined) await push(binding.managed.cardId, `管理对象（${binding.managed.permission}）`)
  for (const ref of binding.refs ?? []) await push(ref.cardId, '引用', ref.root)
  return rows
}

/**
 * 保存成功后登记卡绑定：本项目卡记为管理对象（产出即管理对象，抽屉上半据此
 * 跟随；同卡保留权限档，换卡默认 free）；别的项目的卡记进引用清单——会话
 * 动过它就诚实可见。
 */
async function bindManaged(cwd: string, exec: { agent?: { session?: { id?: string } } }, cardId: string, cardRoot: string): Promise<void> {
  const sessionId = exec.agent?.session?.id as SessionId | undefined
  if (sessionId === undefined) return
  const bindings = new BindingStore(cwd)
  try {
    const current = (await bindings.all())[sessionId] ?? { backgroundCardIds: [] }
    if (normalizeRoot(cardRoot) !== normalizeRoot(cwd)) {
      const refs = current.refs ?? []
      if (!refs.some(ref => ref.cardId === cardId)) {
        await bindings.set(sessionId, { ...current, refs: [...refs, { root: cardRoot, cardId }] })
      }
      return
    }
    const permission = current.managed?.cardId === cardId ? current.managed.permission : 'free'
    await bindings.set(sessionId, { ...current, managed: { cardId, permission } })
  } catch {
    // The card commit already succeeded; a failed binding row must not flip the
    // tool result to error or the model retries and saves a duplicate.
  }
}

function storeOf(cwd: string): CardStore {
  return new CardStore(cwd)
}

/** 会话挂载的引用卡（跨项目）；找到返回其来源项目根。 */
async function refRootOf(cwd: string, sessionId: SessionId | undefined, cardId: string): Promise<string | undefined> {
  if (sessionId === undefined) return undefined
  const binding = (await new BindingStore(cwd).all())[sessionId]
  return binding?.refs?.find(ref => ref.cardId === cardId)?.root
}

/**
 * project 参数 → 项目根：项目名、项目编号、注册路径、或一个真实存在的目录
 * （未注册的目录也认——注册表是索引不是牢笼）。缺省=本会话项目。
 */
async function resolveProjectRoot(cwd: string, raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) return cwd
  const wanted = raw.trim()
  const projects = await loadRegistry()
  const byName = projects.find(candidate => candidate.title === wanted || candidate.id === wanted)
  if (byName !== undefined) return byName.root
  const normalized = normalizeRoot(wanted)
  if (await dirExists(normalized)) return normalized
  const known = projects.map(candidate => `${candidate.title ?? '?'}(${candidate.root})`).join('、')
  throw new Error(`项目 "${wanted}" 找不到：注册表没有这个名字/编号，目录也不存在。已注册：${known.length > 0 ? known : '（空）'}（list_projects 核对）`)
}

/**
 * 定位一张卡：显式 project → 那个项目；否则本会话项目 → 会话挂载的引用 →
 * 注册表全项目扫描（卡在别的项目照样找到，读写同一条路）。
 * 找不到时报可操作的错——分不清"不存在"和"在别的项目"曾让模型绕路 find。
 */
async function resolveCard(cwd: string, sessionId: SessionId | undefined, cardId: string, project?: string): Promise<{ store: CardStore, saved: SavedCard, projectRoot: string, via: 'local' | 'ref' | 'registry' }> {
  const explicit = typeof project === 'string' && project.trim().length > 0 ? await resolveProjectRoot(cwd, project) : undefined
  const candidates: { store: CardStore, root: string, via: 'local' | 'ref' | 'registry' }[] = []
  if (explicit !== undefined) candidates.push({ store: new CardStore(explicit), root: explicit, via: 'local' })
  else candidates.push({ store: storeOf(cwd), root: cwd, via: 'local' })
  const refRoot = await refRootOf(cwd, sessionId, cardId)
  if (refRoot !== undefined && !candidates.some(c => normalizeRoot(c.root) === normalizeRoot(refRoot))) {
    candidates.push({ store: new CardStore(refRoot), root: refRoot, via: 'ref' })
  }
  for (const row of await loadRegistry()) {
    if (candidates.some(c => normalizeRoot(c.root) === normalizeRoot(row.root))) continue
    candidates.push({ store: new CardStore(row.root), root: row.root, via: 'registry' })
  }
  const draftOnly: string[] = []
  for (const candidate of candidates) {
    const saved = await candidate.store.open(cardId).catch(() => undefined)
    if (saved !== undefined) return { store: candidate.store, saved, projectRoot: candidate.root, via: candidate.via }
    if (await candidate.store.draft(cardId).catch(() => undefined) !== undefined) draftOnly.push(candidate.root)
  }
  if (draftOnly.length > 0) throw new Error(`"${cardId}" 是未提交的导入草稿（${draftOnly[0]}）——用户确认后用 commit_import 提交，提交前不可读写`)
  throw new Error(explicit !== undefined
    ? `项目 "${String(project)}"（${explicit}）和已注册项目里都没有这张卡：${cardId}（list_projects / list_cards 核对）`
    : `全部已注册项目和挂载引用里都没有这张卡：${cardId}（list_cards 看本项目，list_projects 看全部项目）`)
}

/**
 * 编辑一条命令并直接提交。AI 写入不再经过提案确认：改完即生效，
 * 客户端用 tool/call 到 tool/result 之间的流光提示编辑正在进行。
 */
async function editAndCommit(exec: { agent?: { session: { id?: string, header: { cwd?: string } } } }, root: string, target: string, command: EditorCommand, project?: string): Promise<Record<string, JsonValue>> {
  const cwd = sessionCwd(exec)
  const sessionId = exec.agent?.session?.id as SessionId | undefined
  const resolved = await resolveCard(cwd, sessionId, root, project)
  await bindManaged(cwd, exec, root, resolved.projectRoot)
  const { outcome, saved } = await applyAndCommit(resolved.store, root, target, command, 'AI')
  return {
    status: 'saved', root_id: root, target_id: target, revision: saved.revision, next_draft_version: saved.version,
    project_root: resolved.projectRoot,
    created_module_ids: outcome.createdModuleIds, created_block_ids: outcome.createdBlockIds,
    ...cardTag(outcome.draft.document, target),
  }
}

const emptyCard = (kind: 'WORLD' | 'CHARACTER', name: string): ContentDocument => emptyCardDocument(kind, name)

function savedResult(cardId: string, saved: { revision: number, version: string }, targetId?: string, document?: ContentDocument): Record<string, JsonValue> {
  return {
    status: 'saved', root_id: cardId, target_id: targetId ?? cardId,
    revision: saved.revision, next_draft_version: saved.version,
    created_module_ids: [], created_block_ids: [],
    ...(document !== undefined ? { card_name: document.name, card_kind: document.kind } : {}),
  }
}

/** 目标卡的名称/卡类回执字段；目标不可定位时（已移除等）省略。 */
function cardTag(root: ContentDocument, targetId: string): Record<string, JsonValue> {
  try {
    const target = findTarget(root, targetId)
    return { card_name: target.name, card_kind: target.kind }
  } catch {
    return {}
  }
}

function insertBefore(modules: ContentModule[], additions: ContentModule[], beforeId: string): ContentModule[] {
  const index = modules.findIndex(candidate => candidate.id === beforeId)
  if (index < 0) throw new Error('定位模块不存在')
  return [...modules.slice(0, index), ...additions, ...modules.slice(index)]
}

function replaceInTree(document: ContentDocument, targetId: string, next: ContentDocument): ContentDocument {
  if (document.id === targetId) return next
  return { ...document, internalCharacters: document.internalCharacters.map(candidate => candidate.id === targetId ? next : candidate) }
}

function cardKind(raw: unknown): 'WORLD' | 'CHARACTER' {
  const kind = String(raw).trim().toUpperCase()
  if (kind !== 'WORLD' && kind !== 'CHARACTER') throw new Error('kind 必须是 WORLD（世界）或 CHARACTER（角色）')
  return kind
}

function mustName(raw: unknown): string {
  const name = String(raw).trim()
  if (name.length === 0) throw new Error('name 不能为空')
  return name
}

function optionalId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

function layoutOf(raw: unknown): 'VERTICAL' | 'HORIZONTAL' | undefined {
  if (raw === undefined) return undefined
  const layout = String(raw).trim().toUpperCase()
  if (layout !== 'VERTICAL' && layout !== 'HORIZONTAL') throw new Error('layout 必须是 VERTICAL 或 HORIZONTAL')
  return layout
}

function routingOf(raw: string, what: string): 'DEFAULT' | 'PER_TURN' | 'STYLE' | 'STANDBY' {
  const value = raw.trim().toUpperCase()
  const found = (['DEFAULT', 'PER_TURN', 'STYLE', 'STANDBY'] as const).find(candidate => candidate === value)
  if (found === undefined) throw new Error(`${what} 无效：${raw}`)
  return found
}

function temporalityOf(raw: string, what: string): 'CONSTANT' | 'SNAPSHOT' {
  const value = raw.trim().toUpperCase()
  const found = (['CONSTANT', 'SNAPSHOT'] as const).find(candidate => candidate === value)
  if (found === undefined) throw new Error(`${what} 无效：${raw}`)
  return found
}

function moduleNameOf(args: Record<string, unknown>): string | undefined {
  return typeof args.name === 'string' && args.name.trim().length > 0 ? args.name.trim() : undefined
}
