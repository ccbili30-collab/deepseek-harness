// @vitest-environment node
/** Scoped appearance document, resolver, persistence, and resource-fence contracts. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, test } from 'vitest'

const root = await mkdtemp(join(tmpdir(), 'noven-appearance-'))
process.env.NOVEN_HOME = join(root, 'home')
await mkdir(join(root, 'project', '图片'), { recursive: true })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
await writeFile(join(root, 'project', '图片', '纸面.png'), png)
await writeFile(join(root, 'project', '正文.md'), '# 正文\n')
await writeFile(join(root, 'project', '不是图片.png'), 'not an image')

const { emptyAppearanceDocument, parseAppearanceDocument, resolveAppearance } = await import('../lib/appearance/model.js')
const { ledgerDir } = await import('noven-ledger')
const {
  readAppearance, updateAppearance, AppearanceConflictError, AppearanceStoreError,
} = await import('../lib/appearance/store.js')
const {
  applyAppearancePreset, readAppearanceAsset, resetAppearance, saveAppearanceAsset, saveAppearancePreset, setCanvasAppearance, setConversationAppearance, setSharedAppearance, setShellAppearance, setVisualAppearance,
} = await import('../lib/appearance/service.js')
const { createAppearanceTools } = await import('../lib/appearance/tools.js')

const project = join(root, 'project')

afterAll(async () => { await rm(root, { recursive: true, force: true }) })

describe('appearance document', () => {
  test('resolves built-in, workspace, file, and session layers independently', () => {
    const document = {
      version: 1 as const,
      revision: 4,
      workspace: {
        shell: { kind: 'asset' as const, path: '壳.webp' },
        canvas: { kind: 'asset' as const, path: '默认画布.webp' },
        conversation: { kind: 'transparent' as const },
        assistantAvatar: { kind: 'asset' as const, path: '默认头像.png' },
      },
      files: { '正文.md': { canvas: { kind: 'asset' as const, path: '文件画布.webp' } } },
      sessions: { 'sess-a': { assistantAvatar: { kind: 'asset' as const, path: '会话头像.png' } } },
    }
    assert.ok(parseAppearanceDocument(document) !== undefined)
    assert.deepEqual(resolveAppearance(document, 'sess-a', '正文.md').resolved, {
      shell: { kind: 'asset', path: '壳.webp' },
      canvas: { kind: 'asset', path: '文件画布.webp' },
      conversation: { kind: 'transparent' },
      assistantAvatar: { kind: 'asset', path: '会话头像.png' },
    })
    assert.deepEqual(resolveAppearance(document, 'sess-b', '另一.md').resolved, {
      shell: { kind: 'asset', path: '壳.webp' },
      canvas: { kind: 'asset', path: '默认画布.webp' },
      conversation: { kind: 'transparent' },
      assistantAvatar: { kind: 'asset', path: '默认头像.png' },
    })
  })

  test('rejects unknown fields and malformed backgrounds instead of accepting a partial document', () => {
    assert.equal(parseAppearanceDocument({ ...emptyAppearanceDocument(), extra: true }), undefined)
    assert.equal(parseAppearanceDocument({
      ...emptyAppearanceDocument(),
      workspace: { canvas: { kind: 'asset', path: 'a.png', css: 'url(x)' } },
    }), undefined)
    assert.equal(parseAppearanceDocument({ ...emptyAppearanceDocument(), revision: -1 }), undefined)
  })

  test('resolves shared references with independent treatment and rejects orphaned or invalid values', () => {
    const shared = { path: '共用.webp' }
    const document = {
      ...emptyAppearanceDocument(),
      workspace: {
        shared,
        canvas: { kind: 'shared' as const, dim: 0.3, blur: 8, focus: 'top' as const, material: 'frosted' as const, foreground: 'light' as const },
        conversation: { kind: 'shared' as const },
      },
      files: { '正文.md': { canvas: { kind: 'shared' as const, blur: 4, material: 'clear' as const, foreground: 'dark' as const } } },
    }
    assert.ok(parseAppearanceDocument(document) !== undefined)
    assert.deepEqual(resolveAppearance(document, 'sess-a').resolved.canvas, {
      kind: 'asset', path: '共用.webp', dim: 0.3, blur: 8, focus: 'top', material: 'frosted', foreground: 'light',
    })
    assert.deepEqual(resolveAppearance(document, 'sess-a').resolved.conversation, { kind: 'asset', path: '共用.webp' })
    assert.deepEqual(resolveAppearance(document, 'sess-a', '正文.md').resolved.canvas, {
      kind: 'asset', path: '共用.webp', blur: 4, material: 'clear', foreground: 'dark',
    })
    assert.equal(parseAppearanceDocument({ ...document, workspace: { canvas: { kind: 'shared' } } }), undefined)
    assert.equal(parseAppearanceDocument({
      ...emptyAppearanceDocument(),
      workspace: { shared, canvas: { kind: 'shared', dim: 0.7 } },
    }), undefined)
    assert.equal(parseAppearanceDocument({
      ...emptyAppearanceDocument(),
      workspace: { shared, canvas: { kind: 'asset', path: 'a.png', blur: 21 } },
    }), undefined)
    assert.equal(parseAppearanceDocument({
      ...emptyAppearanceDocument(),
      workspace: { shared, canvas: { kind: 'shared', material: 'glass' } },
    }), undefined)
    const legacy = parseAppearanceDocument({
      ...emptyAppearanceDocument(),
      workspace: { canvas: { kind: 'asset' as const, path: 'a.png', surface: 'panel', surfaceOpacity: 0.92 } },
    })
    assert.ok(legacy !== undefined)
    assert.deepEqual(resolveAppearance(legacy, 'sess-a').resolved.canvas, { kind: 'asset', path: 'a.png' })
  })
})

describe('appearance persistence', () => {
  test('writes sparse defaults and overrides, removes them, and isolates sessions', async () => {
    const initial = await readAppearance(project, 'sess-a', '正文.md')
    assert.equal(initial.revision, 0)
    assert.equal(initial.resolved.canvas, null)

    const workspace = await setCanvasAppearance(project, 'sess-a', {
      scope: 'workspace', background: { kind: 'image', imagePath: '图片/纸面.png' },
    })
    assert.equal(workspace.revision, 1)
    assert.deepEqual(workspace.resolved.canvas, { kind: 'asset', path: '图片/纸面.png' })
    const generated = await setCanvasAppearance(project, 'sess-a', {
      scope: 'workspace', background: { kind: 'image', imagePath: join(project, '图片', '纸面.png') },
    })
    assert.equal(generated.revision, 1)
    assert.deepEqual(generated.resolved.canvas, { kind: 'asset', path: '图片/纸面.png' })

    const file = await setCanvasAppearance(project, 'sess-a', {
      scope: 'file', filePath: '正文.md', background: { kind: 'transparent' },
    })
    assert.equal(file.revision, 2)
    assert.deepEqual(file.resolved.canvas, { kind: 'transparent' })

    const session = await setConversationAppearance(project, 'sess-a', {
      scope: 'session',
      background: { kind: 'image', imagePath: '图片/纸面.png' },
      avatar: { kind: 'image', imagePath: '图片/纸面.png' },
    })
    assert.deepEqual(session.resolved.conversation, { kind: 'asset', path: '图片/纸面.png' })
    assert.deepEqual(session.resolved.assistantAvatar, { kind: 'asset', path: '图片/纸面.png' })
    assert.equal((await readAppearance(project, 'sess-b', '正文.md')).resolved.conversation, null)

    const removedFile = await setCanvasAppearance(project, 'sess-a', {
      scope: 'file', filePath: '正文.md', background: { kind: 'default' },
    })
    assert.deepEqual(removedFile.resolved.canvas, { kind: 'asset', path: '图片/纸面.png' })
    const removedSession = await setConversationAppearance(project, 'sess-a', {
      scope: 'session', background: { kind: 'default' }, avatar: { kind: 'default' },
    })
    assert.equal(removedSession.resolved.conversation, null)
    assert.equal(removedSession.resolved.assistantAvatar, null)
    const shell = await setShellAppearance(project, 'sess-a', { kind: 'transparent' })
    assert.deepEqual(shell.resolved.shell, { kind: 'transparent' })
  })

  test('shares one image explicitly while canvas and conversation keep independent switches', async () => {
    await assert.rejects(setCanvasAppearance(project, 'sess-a', {
      scope: 'workspace', background: { kind: 'shared' },
    }), /set the shared background image first/u)
    const shared = await setSharedAppearance(project, 'sess-a', { kind: 'image', imagePath: '图片/纸面.png' })
    assert.deepEqual(shared.workspace.shared, { path: '图片/纸面.png' })

    const canvas = await setCanvasAppearance(project, 'sess-a', {
      scope: 'workspace',
      background: { kind: 'shared', dim: 0.25, blur: 8, focus: 'top', material: 'frosted', foreground: 'light' },
    })
    assert.deepEqual(canvas.resolved.canvas, {
      kind: 'asset', path: '图片/纸面.png', dim: 0.25, blur: 8, focus: 'top', material: 'frosted', foreground: 'light',
    })
    const conversation = await setConversationAppearance(project, 'sess-a', {
      scope: 'workspace', background: { kind: 'shared' },
    })
    assert.deepEqual(conversation.resolved.conversation, { kind: 'asset', path: '图片/纸面.png' })

    const file = await setCanvasAppearance(project, 'sess-a', {
      scope: 'file', filePath: '正文.md', background: { kind: 'shared', blur: 4 },
    })
    assert.deepEqual(file.resolved.canvas, { kind: 'asset', path: '图片/纸面.png', blur: 4 })
    const closed = await setConversationAppearance(project, 'sess-a', {
      scope: 'workspace', background: { kind: 'transparent' },
    })
    assert.deepEqual(closed.resolved.conversation, { kind: 'transparent' })
    assert.equal(closed.resolved.canvas?.kind, 'asset')

    await assert.rejects(setSharedAppearance(project, 'sess-a', { kind: 'default' }), /still used/u)
    await setCanvasAppearance(project, 'sess-a', { scope: 'file', filePath: '正文.md', background: { kind: 'default' } })
    await setCanvasAppearance(project, 'sess-a', { scope: 'workspace', background: { kind: 'default' } })
    await setConversationAppearance(project, 'sess-a', { scope: 'workspace', background: { kind: 'default' } })
    const cleared = await setSharedAppearance(project, 'sess-a', { kind: 'default' })
    assert.equal(cleared.workspace.shared, undefined)

    for (const background of [
      { kind: 'image', imagePath: '图片/纸面.png', dim: 0.61 },
      { kind: 'image', imagePath: '图片/纸面.png', blur: 21 },
      { kind: 'transparent', dim: 0.2 },
      { kind: 'default', focus: 'top' },
    ] as const) {
      await assert.rejects(setCanvasAppearance(project, 'sess-a', { scope: 'workspace', background }))
    }
  })

  test('stores one global visual state independently of background scopes', async () => {
    const before = await readAppearance(project, 'sess-a')
    const changed = await setVisualAppearance(project, 'sess-a', {
      view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.85,
    })
    assert.deepEqual(changed.visual, { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.85 })
    assert.equal(changed.resolved.canvas, before.resolved.canvas)
    const visibility = await setVisualAppearance(project, 'sess-a', { backgroundVisibility: 0.2 })
    assert.deepEqual(visibility.visual, { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.2 })
    await assert.rejects(setVisualAppearance(project, 'sess-a', { view: 'sepia' as never }))
    await assert.rejects(setVisualAppearance(project, 'sess-a', { backgroundVisibility: 1.2 }))
    await setVisualAppearance(project, 'sess-a', { view: 'light', surface: 'auto', foreground: 'system', backgroundVisibility: 0.75 })
  })

  test('switches between built-in defaults and complete workspace presets without deleting resources', async () => {
    await setSharedAppearance(project, 'sess-a', { kind: 'image', imagePath: '图片/纸面.png' })
    await setShellAppearance(project, 'sess-a', { kind: 'shared' })
    await setCanvasAppearance(project, 'sess-a', { scope: 'workspace', background: { kind: 'shared' } })
    await setConversationAppearance(project, 'sess-a', {
      scope: 'workspace', background: { kind: 'shared' }, avatar: { kind: 'image', imagePath: '图片/纸面.png' },
    })
    await setVisualAppearance(project, 'sess-a', { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.8 })
    const saved = await saveAppearancePreset(project, 'sess-a', '月夜创作')
    const presetId = Object.keys(saved.presets ?? {}).find(id => saved.presets?.[id]?.name === '月夜创作')
    assert.ok(presetId !== undefined)

    const reset = await resetAppearance(project, 'sess-a')
    assert.deepEqual(reset.visual, { view: 'light', surface: 'auto', foreground: 'system', backgroundVisibility: 0.75 })
    assert.equal(reset.resolved.shell, null)
    assert.equal(reset.resolved.canvas, null)
    assert.equal(reset.resolved.conversation, null)
    assert.equal(reset.resolved.assistantAvatar, null)
    assert.deepEqual(reset.workspace.shared, { path: '图片/纸面.png' })
    assert.ok(reset.presets?.[presetId] !== undefined)
    await setCanvasAppearance(project, 'sess-a', { scope: 'file', filePath: '正文.md', background: { kind: 'transparent' } })
    await setConversationAppearance(project, 'sess-a', { scope: 'session', background: { kind: 'transparent' } })

    const applied = await applyAppearancePreset(project, 'sess-a', presetId)
    assert.deepEqual(applied.visual, { view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.8 })
    assert.deepEqual(applied.resolved.canvas, { kind: 'asset', path: '图片/纸面.png' })
    assert.deepEqual(applied.resolved.conversation, { kind: 'asset', path: '图片/纸面.png' })
    assert.deepEqual(applied.resolved.assistantAvatar, { kind: 'asset', path: '图片/纸面.png' })
    const fileView = await readAppearance(project, 'sess-a', '正文.md')
    assert.deepEqual(fileView.resolved.canvas, { kind: 'asset', path: '图片/纸面.png' })
    await assert.rejects(setSharedAppearance(project, 'sess-a', { kind: 'default' }), /still used/u)
    await assert.rejects(applyAppearancePreset(project, 'sess-a', 'missing-preset'), /does not exist/u)
    await resetAppearance(project, 'sess-a')
  })

  test('rejects stale revisions and paths outside the project or not backed by an image', async () => {
    const current = await readAppearance(project, 'sess-a', '正文.md')
    await assert.rejects(setCanvasAppearance(project, 'sess-a', {
      scope: 'workspace', expectedRevision: current.revision - 1, background: { kind: 'transparent' },
    }), AppearanceConflictError)
    for (const imagePath of ['../outside.png', '/not-there.png', '不是图片.png', '正文.md']) {
      await assert.rejects(setCanvasAppearance(project, 'sess-a', {
        scope: 'workspace', background: { kind: 'image', imagePath },
      }))
    }
    await assert.rejects(setCanvasAppearance(project, 'sess-a', {
      scope: 'file', filePath: '../正文.md', background: { kind: 'transparent' },
    }))
  })

  test('keeps a corrupt document in place instead of overwriting it with a fresh one', async () => {
    const path = join(await ledgerDir(project), 'appearance.json')
    await mkdir(join(await ledgerDir(project)), { recursive: true })
    await writeFile(path, '{"version":1,"revision":0,"workspace":{},"files":{},"sessions":{},"extra":true}\n')
    await assert.rejects(readAppearance(project, 'sess-a'), AppearanceStoreError)
    assert.match(await readFile(path, 'utf8'), /extra/)
    await rm(path)
  })

  test('exposes only the two appearance domains and binds tools to the executing Session', async () => {
    const tools = createAppearanceTools()
    assert.deepEqual(tools.map(tool => tool.name), ['set_canvas_appearance', 'set_conversation_appearance'])
    const exec = {
      agent: { session: { id: 'sess-tool', header: { cwd: project } } },
      signal: new AbortController().signal,
    }
    const canvas = await Reflect.apply(tools[0]!.execute, undefined, [{
      scope: 'workspace', background_kind: 'image', image_path: join(project, '图片', '纸面.png'),
      material: 'frosted', foreground: 'light',
    }, exec]) as Record<string, unknown>
    assert.equal(canvas.background_kind, 'asset')
    assert.equal(canvas.image_path, '图片/纸面.png')
    assert.equal(canvas.material, 'frosted')
    assert.equal(canvas.foreground, 'light')
    const conversation = await Reflect.apply(tools[1]!.execute, undefined, [{
      scope: 'session', background_kind: 'transparent', material: 'clear', foreground: 'dark',
      avatar_kind: 'image', avatar_path: '图片/纸面.png',
    }, exec]) as Record<string, unknown>
    assert.equal(conversation.conversation_kind, 'transparent')
    assert.equal(conversation.material, 'clear')
    assert.equal(conversation.foreground, 'dark')
    assert.equal(conversation.avatar_path, '图片/纸面.png')
    assert.equal((await readAppearance(project, 'sess-tool')).resolved.assistantAvatar?.path, '图片/纸面.png')
    assert.equal((await readAppearance(project, 'other-session')).resolved.assistantAvatar, null)
    await assert.rejects(Reflect.apply(tools[0]!.execute, undefined, [{
      scope: 'workspace', background_kind: 'shared',
    }, exec]), /background_kind/u)
    assert.equal((await readAppearance(project, 'sess-tool')).workspace.shared, undefined)
  })

  test('stores uploaded raster bytes as workspace-relative assets', async () => {
    const path = await saveAppearanceAsset(project, png)
    assert.match(path, /^\.noven\/appearance\/[a-f0-9-]+\.png$/u)
    const image = await readAppearanceAsset(project, path)
    assert.equal(image.type, 'image/png')
    assert.deepEqual(image.bytes, png)
    await assert.rejects(saveAppearanceAsset(project, Buffer.from('not an image')))
  })
})
