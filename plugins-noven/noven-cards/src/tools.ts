/**
 * AI 管卡工具面——手机版 33 工具的同名移植（含四个久经实战的协议设计：
 * draft_version 乐观锁 + saved 新编号直链、宏通道优先、容错解析、失败不
 * 谎报），外加桌面补充：list_cards（无卡片界面时的发现入口）、export_card
 * / import_card / commit_import（交换与导入确认）。
 *
 * 授权模型：DSH 会话即授权面（用户在会话里让 AI 管卡）；权限三分开的
 * 注入侧（routing/use）保留在数据模型，注入通道后议。
 * @module noven-cards/tools
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'

/** 任何可落 JSON 的值（工具返回值契约）。 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
import { flattenModules, organizeFolders, assertValid, findTarget, type ContentDocument, type ContentModule, type ModuleUse } from './model.ts'
import { CardStore, DraftConflict, type SavedCard } from './store.ts'
import { applyEdit, type EditorCommand } from './editor.ts'
import { buildBulkModules, parseBulkTree } from './bulk.ts'
import { exportCard, importExchange, importForeignFile, readProjectFile } from './exchange.ts'

/** 模型给新建块惯用的伪编号——一律按"新建"处理而不是报错（实测高频翻车点）。 */
const NEW_BLOCK_HINTS = new Set(['new', 'create', 'new_block', 'newblock', 'new text block', 'auto', 'null', 'none', 'todo', '新建'])

/** 正文分页大小（码点）。 */
const PAGE_LIMIT = 4000

/** 图片扩展名 → mediaType。 */
const IMAGE_MEDIA: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
}

const RESULT_SCHEMA = { type: 'object' as const, additionalProperties: true as const }

function render(): { type: 'text', text: string }[] {
  return [{ type: 'text', text: 'done' }]
}

/** 写卡工具把 saved 结果原样投影进 tool/result.meta，供客户端渲染保存回执卡。 */
function presentSaved(_args: unknown, value: JsonValue): JsonValue {
  return value
}

/** 写卡工具的 output 声明：模型面仍只回 'done'，结构化结果走 meta。 */
const WRITE_OUTPUT = { schema: RESULT_SCHEMA, render, presentationMeta: presentSaved }

/** 目标定位三件套的参数说明。 */
const TARGET_PARAMS = {
  root_id: { type: 'string' as const, required: true as const, description: '根作品编号' },
  target_id: { type: 'string' as const, required: true as const, description: '实际目标卡编号（世界内角色用其编号，否则同 root_id）' },
  draft_version: { type: 'string' as const, required: true as const, description: '读取时的草稿版本（read_card 返回值，或上次保存返回的 next_draft_version）' },
}

type Tools = Context['tools']
type CommandBuilder = (args: Record<string, unknown>) => EditorCommand

/** 注册全部工具。 */
export function registerCardTools(ctx: Context): void {
  const tools = ctx.tools

  /** 打开卡；不存在抛错。 */
  async function mustOpen(store: CardStore, cardId: string): Promise<SavedCard> {
    const saved = await store.open(cardId)
    if (saved === undefined) throw new Error('卡不存在或已删除（先 list_cards）')
    return saved
  }

  /** 按版本定位卡内容：草稿存在用草稿（版本必须匹配），否则用 head。 */
  async function cardAtVersion(store: CardStore, cardId: string, version: string): Promise<ContentDocument> {
    const saved = await mustOpen(store, cardId)
    const draft = await store.draft(cardId)
    if (draft === undefined) {
      if (saved.version !== version) throw new DraftConflict(saved.version)
      return saved.document
    }
    if (draft.version !== version) throw new DraftConflict(draft.version)
    return draft.document
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

  // ---------- 读 ----------
  tools.register(defineTool({
    name: 'list_cards',
    description: '列出项目卡库的全部卡：编号、卡类（WORLD 世界 / CHARACTER 角色）、名称、修订号、是否有未提交草稿。',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render },
    async execute(_args, exec) {
      const store = storeOf(sessionCwd(exec))
      const rows: Record<string, JsonValue>[] = []
      for (const id of await store.list()) {
        const saved = await store.open(id)
        if (saved === undefined) continue
        const draft = await store.draft(id)
        rows.push({ id, kind: saved.document.kind, name: saved.document.name, revision: saved.revision, has_draft: draft !== undefined })
      }
      return { status: 'read', cards: rows, ...(rows.length === 0 ? { hint: '还没有卡。用 create_card_bulk 一次成型整张卡。' } : {}) }
    },
  }))

  tools.register(defineTool({
    name: 'read_card',
    description: '读取目标卡最新模块结构、编辑版本和修改来源，不读取全部正文，也不新建草稿。修改前先读取。',
    parameters: {
      root_id: TARGET_PARAMS.root_id,
      target_id: { type: 'string', required: true, description: '目标卡编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const store = storeOf(sessionCwd(exec))
      const saved = await mustOpen(store, String(args.root_id))
      const draft = await store.draft(String(args.root_id))
      const card = draft?.document ?? saved.document
      return {
        status: 'read',
        draft_version: draft?.version ?? saved.version,
        has_unsaved_draft: draft !== undefined,
        source: draft?.source ?? saved.source,
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
      const root = String(args.root_id)
      const store = storeOf(sessionCwd(exec))
      const card = await cardAtVersion(store, root, String(args.draft_version))
      const target = locate(card, String(args.target_id))
      const module = flattenModules(target.modules).find(candidate => candidate.id === args.module_id)
      if (module === undefined) throw new Error('目标模块不存在或不属于当前卡片')
      const block = module.blocks.find(candidate => candidate.id === args.block_id)
      if (block === undefined) throw new Error('内容块不存在')
      const ref = block.kind === 'text' ? block.content : block.caption
      if (ref === undefined) throw new Error('这个块没有可读文字')
      const text = new TextDecoder().decode(await store.readPayload(root, ref))
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
    name: 'read_card_image',
    description: '明确读取目标卡图片：返回图片文件的绝对路径，随后用平台 read_image 工具查看该路径。资源目录不等于已经看过图像。',
    parameters: {
      root_id: TARGET_PARAMS.root_id,
      target_id: TARGET_PARAMS.target_id,
      resource_id: { type: 'string', required: true, description: '本卡图片资源编号' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const store = storeOf(sessionCwd(exec))
      const saved = await mustOpen(store, String(args.root_id))
      const target = locate(saved.document, String(args.target_id))
      const resource = target.resources.find(candidate => candidate.id === args.resource_id)
      if (resource === undefined) throw new Error('资源不属于目标卡')
      return { status: 'read', image_path: store.payloadPath(String(args.root_id), resource.content), media_type: resource.mediaType, next: '用 read_image 读取 image_path' }
    },
  }))

  // ---------- 建 / 宏通道 ----------
  tools.register(defineTool({
    name: 'create_card',
    description: '新建一张空世界或角色并保存。只接受 kind（WORLD 世界／CHARACTER 角色）和 name。新建不代表正文完成。',
    parameters: {
      kind: { type: 'string', required: true, description: 'WORLD 或 CHARACTER' },
      name: { type: 'string', required: true, description: '卡名' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const kind = cardKind(args.kind)
      const name = mustName(args.name)
      const document: ContentDocument = emptyCard(kind, name)
      const saved = await storeOf(sessionCwd(exec)).saveNew(document, 'AI')
      return savedResult(saved.cardId, saved, undefined, document)
    },
  }))

  tools.register(defineTool({
    name: 'create_card_bulk',
    description: '一次成型整张卡（宏通道，建卡首选）：kind + name + modules_json（模块树的 JSON 数组文本，每项 {name, text, routing, temporality, children}，name 必填，数组顺序即排序，最多四层）。先整包校验再一次性写入：任何节点不合法都不会写入半张卡，错误信息带 JSON 路径。成功返回全部新模块/块编号与 next_draft_version，后续微调用精确工具直接引用。建整卡或大批量内容必须用它，不要逐个 add_module。',
    parameters: {
      kind: { type: 'string', required: true, description: 'WORLD 或 CHARACTER' },
      name: { type: 'string', required: true, description: '卡名' },
      modules_json: { type: 'string', required: true, description: '模块树 JSON 数组文本，例如 [{"name":"基础档案","children":[{"name":"身份","text":"..."}]}]' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const kind = cardKind(args.kind)
      const name = mustName(args.name)
      const nodes = parseBulkTree(args.modules_json, 'modules')
      const store = storeOf(sessionCwd(exec))
      const cardId = emptyCard(kind, name).id
      const { modules, createdModuleIds, createdBlockIds } = await buildBulkModules(nodes, text => store.receivePayload(cardId, new TextEncoder().encode(text)))
      const document: ContentDocument = { ...emptyCard(kind, name), id: cardId, modules }
      assertValid(document)
      const saved = await store.saveNew(document, 'AI')
      return { ...savedResult(cardId, saved, undefined, document), created_module_ids: createdModuleIds, created_block_ids: createdBlockIds }
    },
  }))

  tools.register(defineTool({
    name: 'add_module_bulk',
    description: '一次向已有卡插入整棵模块子树（宏通道）：module_json 是与 create_card_bulk 相同的节点结构（含 children）；before_id 为空插到根模块末尾，否则插到该根级模块之前。整包校验失败不写入。批量补充内容必须用它。',
    parameters: {
      ...TARGET_PARAMS,
      module_json: { type: 'string', required: true, description: '单个节点（含 children）的 JSON 对象文本，例如 {"name":"章节","text":"...","children":[]}' },
      before_id: { type: 'string', description: '定位根级模块编号，插到它之前；空/省略表示末尾' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const root = String(args.root_id)
      const store = storeOf(sessionCwd(exec))
      const draft = await store.ensureDraft(root, 'AI')
      if (draft.version !== args.draft_version) throw new DraftConflict(draft.version)
      const target = locate(draft.document, String(args.target_id))
      const nodes = parseBulkTree(`[${String(args.module_json)}]`, 'module')
      const { modules, createdModuleIds, createdBlockIds } = await buildBulkModules(nodes, text => store.receivePayload(root, new TextEncoder().encode(text)))
      const before = optionalId(args.before_id)
      const inserted = { ...target, modules: before === null ? [...target.modules, ...modules] : insertBefore(target.modules, modules, before) }
      const nextDocument = replaceInTree(draft.document, target.id, organizeFolders(inserted))
      assertValid(nextDocument)
      const updated = await store.updateDraft(root, draft.version, nextDocument, 'AI')
      const saved = await store.commit(root, updated.version)
      return { ...savedResult(root, saved, target.id), created_module_ids: createdModuleIds, created_block_ids: createdBlockIds, ...cardTag(nextDocument, target.id) }
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
    },
    args => {
      const raw = typeof args.block_id === 'string' ? args.block_id.trim() : ''
      const blockId = raw.length > 0 && !NEW_BLOCK_HINTS.has(raw.toLowerCase()) ? raw : null
      const name = moduleNameOf(args)
      return { kind: 'write_text', moduleId: String(args.module_id), blockId, moduleName: name ?? '', text: String(args.text) }
    })

  registerEditTool(tools, 'write_module_markdown',
    '完整替换一个模块的 Markdown 正文并保存；保留子模块、布局、编号和标签。已有图片用 ![说明](card-image:资源编号#图片块编号) 独占一行；只在掌握全部正文时使用，长文局部修改仍用 replace_text_range。',
    {
      module_id: { type: 'string', required: true, description: '目标模块编号' },
      name: { type: 'string', required: true, description: '模块名称' },
      text: { type: 'string', required: true, description: '完整 Markdown 正文' },
    },
    args => ({ kind: 'write_markdown', moduleId: String(args.module_id), name: String(args.name), text: String(args.text) }))

  registerEditTool(tools, 'replace_text_range',
    '局部替换已有文字块并保存，保留范围外的正文。先读取目标文字页，原样使用其 content_ref 与版本。范围按万国码码点计算，左闭右开；插入时 start 等于 end，删除时 text 为空。图片说明不适用。',
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
    args => ({ kind: 'write_caption', moduleId: String(args.module_id), blockId: String(args.block_id), moduleName: moduleNameOf(args) ?? '', text: String(args.text) }))

  // ---------- 结构 ----------
  registerEditTool(tools, 'add_module', '在目标卡根部新增空模块并保存。空模块尚无正文，不代表内容创作完成。',
    { name: { type: 'string', required: true, description: '模块名称' } },
    args => ({ kind: 'add_module', name: String(args.name) }))

  registerEditTool(tools, 'add_child_module', '在指定父级末尾创建真实子模块并保存（可独立打开、移动和修改；不要用正文标题冒充子模块）。',
    {
      name: { type: 'string', required: true, description: '模块名称' },
      parent_id: { type: 'string', description: '父模块编号；空/省略为卡根部' },
      layout: { type: 'string', description: 'VERTICAL（竖向）或 HORIZONTAL（横向），缺省 VERTICAL' },
    },
    args => ({ kind: 'add_module', name: String(args.name), parentId: optionalId(args.parent_id), layout: layoutOf(args.layout) ?? 'VERTICAL' }))

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
      return editAndCommit(cwd, String(args.root_id), String(args.target_id), String(args.draft_version), {
        kind: 'adopt_image', bytes, mediaType, moduleId: optionalId(args.module_id), afterBlockId: optionalId(args.after_id),
      })
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
    description: '从允许读取的独立角色复制至允许管理的世界，模块、图片和扩展完整复制；副本独立。source_id 为来源角色根编号。',
    parameters: {
      ...TARGET_PARAMS,
      source_id: { type: 'string', required: true, description: '来源角色卡根编号' },
    },
    output: WRITE_OUTPUT,
    async execute(args, exec) {
      const store = storeOf(sessionCwd(exec))
      const source = await mustOpen(store, String(args.source_id))
      if (source.document.kind !== 'CHARACTER') throw new Error('只能复制角色卡')
      return editAndCommit(sessionCwd(exec), String(args.root_id), String(args.target_id), String(args.draft_version), { kind: 'copy_character', source: source.document })
    },
  }))

  registerEditTool(tools, 'remove_internal_character', '从当前世界移除指定内部角色，历史内容保留；展示该角色的模块位置同步清空。',
    { character_id: { type: 'string', required: true, description: '内部角色编号' } },
    args => ({ kind: 'remove_character', characterId: String(args.character_id) }))

  // ---------- 交换 ----------
  tools.register(defineTool({
    name: 'export_card',
    description: '导出一张已保存的卡为交换包（.novex.zip：结构 + 载荷 + SHA-256 清单，完整还原含模块顺序/嵌套/图片/世界内角色）。未提交草稿存在时拒绝导出。',
    parameters: {
      root_id: { type: 'string', required: true, description: '根卡编号' },
      output_path: { type: 'string', description: '输出 zip 相对路径；缺省为 <卡名>.novex.zip' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const cwd = sessionCwd(exec)
      const store = storeOf(cwd)
      const saved = await mustOpen(store, String(args.root_id))
      const output = optionalId(args.output_path) ?? `${saved.document.name}.novex.zip`
      const result = await exportCard(store, String(args.root_id), `${cwd}/${output}`)
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
      const store = storeOf(sessionCwd(exec))
      const saved = await store.commit(String(args.card_id), String(args.draft_version))
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
      return editAndCommit(sessionCwd(exec), String(args.root_id), String(args.target_id), String(args.draft_version), build(args))
    },
  }))
}

function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

function storeOf(cwd: string): CardStore {
  return new CardStore(cwd)
}

/** 编辑 + 提交一条命令；返回 saved 结果。 */
async function editAndCommit(cwd: string, root: string, target: string, version: string, command: EditorCommand): Promise<Record<string, JsonValue>> {
  const store = storeOf(cwd)
  const outcome = await applyEdit(store, root, target, version, command, 'AI')
  const saved = await store.commit(root, outcome.draft.version)
  return {
    status: 'saved', root_id: root, target_id: target, revision: saved.revision, next_draft_version: saved.version,
    created_module_ids: outcome.createdModuleIds, created_block_ids: outcome.createdBlockIds,
    ...cardTag(outcome.draft.document, target),
  }
}

function emptyCard(kind: 'WORLD' | 'CHARACTER', name: string): ContentDocument {
  return {
    id: `card-${randomUUID()}`, kind, name, modules: [], resources: [], internalCharacters: [], extensions: {},
    appearance: { readingLayout: 'PAGED' },
  }
}

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
