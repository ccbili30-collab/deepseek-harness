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
await mkdir(join(root, 'project', '音频'), { recursive: true })
await writeFile(join(root, 'project', '音频', '雨声.mp3'), Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
await writeFile(join(root, 'project', '音频', '风声.wav'), Buffer.from('RIFF\0\0\0\0WAVEfmt '))
await writeFile(join(root, 'project', '音频', '伪装.mp3'), 'not audio')

const { emptyAppearanceDocument, emptyGlobalAppearanceDocument, parseAppearanceDocument, parseGlobalAppearanceDocument, resolveAppearance } = await import('../lib/appearance/model.js')
const { ledgerDir } = await import('noven-ledger')
const {
  readAppearance, updateAppearance, AppearanceConflictError, AppearanceStoreError,
} = await import('../lib/appearance/store.js')
const {
  applyAppearancePreset, readAppearanceAsset, readAppearanceAudioAsset, readGlobalAppearanceAsset, resetAppearance, saveAppearanceAsset, saveAppearanceAudioAsset, saveAppearancePreset, saveGlobalAppearanceAsset, setCanvasAppearance, setConversationAppearance, setGlobalUnifiedAppearance, setSharedAppearance, setShellAppearance, setTrackAppearance, setUnifiedAppearance, setVisualAppearance,
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
      conversationTrack: null,
      canvasTrack: null,
      conversationForeground: 'system',
      canvasForeground: 'system',
    })
    assert.deepEqual(resolveAppearance(document, 'sess-b', '另一.md').resolved, {
      shell: { kind: 'asset', path: '壳.webp' },
      canvas: { kind: 'asset', path: '默认画布.webp' },
      conversation: { kind: 'transparent' },
      assistantAvatar: { kind: 'asset', path: '默认头像.png' },
      conversationTrack: null,
      canvasTrack: null,
      conversationForeground: 'system',
      canvasForeground: 'system',
    })
  })

  test('resolves soundtracks and independent foregrounds with sparse File and Session overrides', () => {
    const document = {
      ...emptyAppearanceDocument(),
      workspace: { canvasTrack: { kind: 'asset' as const, path: '默认.mp3', volume: 0, loop: false } },
      files: {
        '音轨.md': { track: { kind: 'asset' as const, path: '页签.wav' }, foreground: 'invert' as const },
        '反色.md': { foreground: 'dark' as const },
      },
      sessions: { 'sess-a': { track: { kind: 'asset' as const, path: '会话.mp3' }, foreground: 'light' as const } },
    }
    assert.ok(parseAppearanceDocument(document) !== undefined)
    const file = resolveAppearance(document, 'sess-a', '音轨.md')
    assert.deepEqual(file.resolved.conversationTrack, { kind: 'asset', path: '会话.mp3' })
    assert.deepEqual(file.resolved.canvasTrack, { kind: 'asset', path: '页签.wav' })
    assert.equal(file.resolved.conversationForeground, 'light')
    assert.equal(file.resolved.canvasForeground, 'invert')
    const fallback = resolveAppearance(document, 'sess-b', '反色.md')
    assert.deepEqual(fallback.resolved.canvasTrack, { kind: 'asset', path: '默认.mp3', volume: 0, loop: false })
    assert.equal(fallback.resolved.canvasForeground, 'dark')
    assert.equal(fallback.resolved.conversationTrack, null)
    assert.equal(fallback.resolved.conversationForeground, 'system')
    assert.equal(parseAppearanceDocument({
      ...document,
      workspace: { canvasTrack: { kind: 'asset', path: 'bad.mp3', volume: 2 } },
    }), undefined)
    assert.equal(parseAppearanceDocument({
      ...document,
      files: { 'bad.md': { track: { kind: 'asset', path: 'bad.mp3', loop: 'yes' } } },
    }), undefined)
    assert.equal(parseAppearanceDocument({
      ...document,
      sessions: { 'sess-a': { foreground: 'system' } },
    }), undefined)
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

  test('resolves global defaults, explicit workspace white, and local exceptions without sharing revisions', () => {
    const global = { version: 1 as const, revision: 9, unified: { kind: 'asset' as const, path: 'global.png', blur: 4 } }
    const document = { ...emptyAppearanceDocument(), revision: 2 }
    const inherited = resolveAppearance(document, 'sess-a', undefined, global)
    assert.equal(inherited.revision, 2)
    assert.equal(inherited.globalRevision, 9)
    assert.deepEqual(inherited.resolved.shell, { kind: 'asset', path: 'global.png', blur: 4, source: 'global' })
    assert.deepEqual(inherited.resolved.canvas, { kind: 'asset', path: 'global.png', blur: 4, source: 'global' })
    assert.deepEqual(inherited.resolved.conversation, { kind: 'asset', path: 'global.png', blur: 4, source: 'global' })

    const white = resolveAppearance({ ...document, workspace: { unified: { kind: 'builtin' } } }, 'sess-a', undefined, global)
    assert.deepEqual(white.resolved, {
      shell: null,
      canvas: null,
      conversation: null,
      assistantAvatar: null,
      conversationTrack: null,
      canvasTrack: null,
      conversationForeground: 'system',
      canvasForeground: 'system',
    })
    assert.deepEqual(white.global.unified, global.unified)
    const local = resolveAppearance({ ...document, workspace: { unified: { kind: 'asset', path: 'local.png' } } }, 'sess-a', undefined, global)
    assert.deepEqual(local.resolved.canvas, { kind: 'asset', path: 'local.png' })
    const exception = resolveAppearance({
      ...document,
      workspace: { canvas: { kind: 'transparent' } },
      files: { '正文.md': { canvas: { kind: 'asset', path: 'file.png' } } },
      sessions: { 'sess-a': { conversation: { kind: 'transparent' } } },
    }, 'sess-a', '正文.md', global)
    assert.deepEqual(exception.resolved.canvas, { kind: 'asset', path: 'file.png' })
    assert.deepEqual(exception.resolved.conversation, { kind: 'transparent' })
    assert.deepEqual(exception.resolved.shell, { kind: 'asset', path: 'global.png', blur: 4, source: 'global' })

    assert.deepEqual(parseGlobalAppearanceDocument(global), global)
    assert.equal(parseGlobalAppearanceDocument({ ...global, unified: { kind: 'shared' } }), undefined)
    assert.equal(parseGlobalAppearanceDocument({ ...global, extra: true }), undefined)
    assert.deepEqual(emptyGlobalAppearanceDocument(), { version: 1, revision: 0 })
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

  test('writes and clears soundtracks and independent foregrounds without deleting other appearance fields', async () => {
    const initial = await readAppearance(project, 'sess-a', '正文.md')
    const workspace = await setTrackAppearance(project, 'sess-a', {
      scope: 'workspace',
      track: { kind: 'audio', audioPath: '音频/雨声.mp3', volume: 0, loop: false },
      expectedRevision: initial.revision,
    })
    assert.deepEqual(workspace.resolved.canvasTrack, { kind: 'asset', path: '音频/雨声.mp3', volume: 0, loop: false })
    const session = await setTrackAppearance(project, 'sess-a', {
      scope: 'session',
      track: { kind: 'audio', audioPath: '音频/雨声.mp3' },
      foreground: 'invert',
    })
    assert.deepEqual(session.resolved.conversationTrack, { kind: 'asset', path: '音频/雨声.mp3' })
    assert.equal(session.resolved.conversationForeground, 'invert')
    const file = await setTrackAppearance(project, 'sess-a', {
      scope: 'file', filePath: '正文.md',
      track: { kind: 'audio', audioPath: '音频/风声.wav' },
      foreground: 'dark',
    })
    assert.deepEqual(file.resolved.canvasTrack, { kind: 'asset', path: '音频/风声.wav' })
    assert.equal(file.resolved.canvasForeground, 'dark')
    const clearedForeground = await setTrackAppearance(project, 'sess-a', {
      scope: 'file', filePath: '正文.md', foreground: 'default',
    })
    assert.equal(clearedForeground.resolved.canvasForeground, 'invert')
    assert.deepEqual(clearedForeground.resolved.canvasTrack, { kind: 'asset', path: '音频/风声.wav' })
    const clearedSessionTrack = await setTrackAppearance(project, 'sess-a', {
      scope: 'session', track: { kind: 'default' },
    })
    assert.equal(clearedSessionTrack.resolved.conversationTrack, null)
    assert.equal(clearedSessionTrack.resolved.conversationForeground, 'invert')
    await assert.rejects(() => setTrackAppearance(project, 'sess-a', {
      scope: 'workspace', track: { kind: 'audio', audioPath: '音频/伪装.mp3' },
    }), /bytes are not supported audio/u)
    await assert.rejects(() => setTrackAppearance(project, 'sess-a', {
      scope: 'workspace', foreground: 'dark',
    }), /no independent foreground/u)
    const uploaded = await saveAppearanceAudioAsset(project, new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]))
    const audio = await readAppearanceAudioAsset(project, uploaded)
    assert.equal(audio.type, 'audio/mpeg')
    assert.deepEqual([...audio.bytes], [0x49, 0x44, 0x33, 0x04, 0x00])
    await assert.rejects(() => saveAppearanceAudioAsset(project, new Uint8Array([1, 2, 3])), /not MP3, WAV, or Ogg/u)
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

  test('switches every following scope while preserving explicit overrides', async () => {
    await setSharedAppearance(project, 'sess-a', { kind: 'image', imagePath: '图片/纸面.png' })
    await setShellAppearance(project, 'sess-a', { kind: 'default' })
    const unified = await setUnifiedAppearance(project, 'sess-a', { kind: 'shared', dim: 0.2 })
    assert.deepEqual(unified.resolved.shell, { kind: 'asset', path: '图片/纸面.png', dim: 0.2 })
    assert.deepEqual(unified.resolved.canvas, { kind: 'asset', path: '图片/纸面.png', dim: 0.2 })
    assert.deepEqual(unified.resolved.conversation, { kind: 'asset', path: '图片/纸面.png', dim: 0.2 })
    await assert.rejects(setSharedAppearance(project, 'sess-a', { kind: 'default' }), /still used/u)

    await setCanvasAppearance(project, 'sess-a', { scope: 'workspace', background: { kind: 'transparent' } })
    await setConversationAppearance(project, 'sess-a', { scope: 'session', background: { kind: 'transparent' } })
    const changed = await setUnifiedAppearance(project, 'sess-a', { kind: 'transparent' })
    assert.deepEqual(changed.resolved.shell, { kind: 'transparent' })
    assert.deepEqual(changed.resolved.canvas, { kind: 'transparent' })
    assert.deepEqual(changed.resolved.conversation, { kind: 'transparent' })
    assert.deepEqual(changed.workspace.canvas, { kind: 'transparent' })

    await setCanvasAppearance(project, 'sess-a', { scope: 'workspace', background: { kind: 'default' } })
    await setConversationAppearance(project, 'sess-a', { scope: 'session', background: { kind: 'default' } })
    const following = await readAppearance(project, 'sess-a')
    assert.deepEqual(following.resolved.canvas, { kind: 'transparent' })
    assert.deepEqual(following.resolved.conversation, { kind: 'transparent' })
    await resetAppearance(project, 'sess-a')
    await setSharedAppearance(project, 'sess-a', { kind: 'default' })
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
    await setUnifiedAppearance(project, 'sess-a', { kind: 'shared' })
    await setConversationAppearance(project, 'sess-a', {
      scope: 'workspace', avatar: { kind: 'image', imagePath: '图片/纸面.png' },
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

  test('exposes only the four appearance domains and binds tools to the executing Session', async () => {
    const tools = createAppearanceTools()
    assert.deepEqual(tools.map(tool => tool.name), [
      'set_canvas_appearance', 'set_conversation_appearance', 'list_soundtracks', 'set_soundtrack',
    ])
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

  test('lets the model inspect and arrange soundtracks only on its own Session, workspace, and existing files', async () => {
    await resetAppearance(project, 'sess-tool')
    const tools = createAppearanceTools()
    const exec = {
      agent: { session: { id: 'sess-tool', header: { cwd: project } } },
      signal: new AbortController().signal,
    }
    const run = async (index: number, args: Record<string, unknown>): Promise<Record<string, unknown>> =>
      await Reflect.apply(tools[index]!.execute, undefined, [args, exec]) as Record<string, unknown>

    const listed = await run(2, { path: '正文.md' })
    assert.equal(listed.file_path, '正文.md')
    assert.equal(listed.file_track, null)
    const audioFiles = listed.audio_files as string[]
    assert.ok(audioFiles.includes('音频/雨声.mp3'))
    assert.ok(audioFiles.includes('音频/风声.wav'))
    assert.ok(!audioFiles.includes('音频/伪装.mp3'))
    assert.equal(listed.audio_files_truncated, false)
    assert.equal(listed.audio_files_total, audioFiles.length)

    const workspace = await run(3, {
      scope: 'workspace', track_kind: 'audio', audio_path: '音频/雨声.mp3', volume: 0, loop: false,
    })
    assert.deepEqual(workspace.workspace_canvas_track, { path: '音频/雨声.mp3', volume: 0, loop: false })
    assert.deepEqual(workspace.resolved_canvas_track, { path: '音频/雨声.mp3', volume: 0, loop: false })

    const session = await run(3, {
      scope: 'session', track_kind: 'audio', audio_path: '音频/风声.wav', foreground: 'invert',
    })
    assert.deepEqual(session.session_track, { path: '音频/风声.wav', volume: null, loop: null })
    assert.equal(session.session_foreground, 'invert')
    assert.equal(session.resolved_conversation_foreground, 'invert')
    assert.deepEqual(session.resolved_conversation_track, { path: '音频/风声.wav', volume: null, loop: null })
    assert.equal((await readAppearance(project, 'other-tool')).resolved.conversationTrack, null)

    const file = await run(3, {
      scope: 'file', path: '正文.md', track_kind: 'audio', audio_path: '音频/雨声.mp3', foreground: 'dark',
    })
    assert.equal(file.file_path, '正文.md')
    assert.deepEqual(file.file_track, { path: '音频/雨声.mp3', volume: null, loop: null })
    assert.equal(file.file_foreground, 'dark')
    assert.equal(file.resolved_canvas_foreground, 'dark')
    const clearedFile = await run(3, { scope: 'file', path: '正文.md', track_kind: 'default' })
    assert.equal(clearedFile.file_track, null)
    assert.deepEqual(clearedFile.resolved_canvas_track, { path: '音频/风声.wav', volume: null, loop: null })
    const inheritedForeground = await run(3, { scope: 'file', path: '正文.md', foreground: 'default' })
    assert.equal(inheritedForeground.file_foreground, null)
    assert.equal(inheritedForeground.resolved_canvas_foreground, 'invert')

    const clearedSession = await run(3, { scope: 'session', track_kind: 'default' })
    assert.equal(clearedSession.session_track, null)
    assert.equal(clearedSession.resolved_conversation_track, null)
    assert.equal(clearedSession.resolved_conversation_foreground, 'invert')

    const current = await readAppearance(project, 'sess-tool')
    const rejected: readonly [Record<string, unknown>, RegExp][] = [
      [{ scope: 'workspace', foreground: 'dark' }, /no independent foreground/u],
      [{ scope: 'session', volume: 0.5 }, /require track_kind=audio/u],
      [{ scope: 'session', track_kind: 'default', audio_path: '音频/雨声.mp3' }, /require track_kind=audio/u],
      [{ scope: 'session', track_kind: 'audio', audio_path: '音频/伪装.mp3' }, /bytes are not supported audio/u],
      [{ scope: 'file', path: '../正文.md', track_kind: 'audio', audio_path: '音频/雨声.mp3' }, /inside the workspace/u],
      [{ scope: 'file', path: '不存在.md', track_kind: 'audio', audio_path: '音频/雨声.mp3' }, /does not exist/u],
      [{ scope: 'session', track_kind: 'audio', audio_path: '音频/雨声.mp3', expected_revision: current.revision - 1 }, AppearanceConflictError],
    ]
    for (const [args, error] of rejected) await assert.rejects(run(3, args), error)
    assert.deepEqual((await readAppearance(project, 'sess-tool')).resolved.conversationTrack, null)
  })

  test('stores uploaded raster bytes as workspace-relative assets', async () => {
    const path = await saveAppearanceAsset(project, png)
    assert.match(path, /^\.noven\/appearance\/[a-f0-9-]+\.png$/u)
    const image = await readAppearanceAsset(project, path)
    assert.equal(image.type, 'image/png')
    assert.deepEqual(image.bytes, png)
    await assert.rejects(saveAppearanceAsset(project, Buffer.from('not an image')))
  })

  test('persists one global default and asset library with independent revisions and fences', async () => {
    const other = join(root, 'other-project')
    await mkdir(other, { recursive: true })
    const initial = await readAppearance(other, 'sess-b')
    assert.equal(initial.revision, 0)
    assert.equal(initial.globalRevision, 0)
    assert.equal(initial.resolved.canvas, null)

    const assetId = await saveGlobalAppearanceAsset(png)
    assert.match(assetId, /^[a-f0-9-]+\.png$/u)
    assert.deepEqual((await readGlobalAppearanceAsset(assetId)).bytes, png)
    await assert.rejects(readGlobalAppearanceAsset('../outside.png'))
    await assert.rejects(readGlobalAppearanceAsset(join(project, '图片', '纸面.png')))

    const inherited = await setGlobalUnifiedAppearance(other, 'sess-b', { kind: 'image', imagePath: assetId, blur: 3 }, 0)
    assert.equal(inherited.revision, 0)
    assert.equal(inherited.globalRevision, 1)
    assert.deepEqual(inherited.resolved.shell, { kind: 'asset', path: assetId, blur: 3, source: 'global' })
    assert.deepEqual(inherited.resolved.canvas, { kind: 'asset', path: assetId, blur: 3, source: 'global' })
    await assert.rejects(setGlobalUnifiedAppearance(other, 'sess-b', { kind: 'default' }, 0), AppearanceConflictError)
    await assert.rejects(setGlobalUnifiedAppearance(other, 'sess-b', { kind: 'shared' }, 1))
    await assert.rejects(setGlobalUnifiedAppearance(other, 'sess-b', { kind: 'image', imagePath: '图片/纸面.png' }, 1))

    const white = await setUnifiedAppearance(other, 'sess-b', { kind: 'builtin' }, 0)
    assert.equal(white.revision, 1)
    assert.equal(white.globalRevision, 1)
    assert.equal(white.resolved.canvas, null)
    assert.deepEqual(white.global.unified, { kind: 'asset', path: assetId, blur: 3 })
    const reset = await resetAppearance(other, 'sess-b', 1)
    assert.deepEqual(reset.workspace.unified, { kind: 'builtin' })
    assert.equal(reset.globalRevision, 1)
    const following = await setUnifiedAppearance(other, 'sess-b', { kind: 'default' }, reset.revision)
    assert.equal(following.revision, 2)
    assert.deepEqual(following.resolved.canvas, { kind: 'asset', path: assetId, blur: 3, source: 'global' })
    const exception = await setCanvasAppearance(other, 'sess-b', {
      scope: 'workspace', background: { kind: 'transparent' }, expectedRevision: following.revision,
    })
    assert.equal(exception.revision, 3)
    assert.equal(exception.globalRevision, 1)
    assert.deepEqual(exception.resolved.canvas, { kind: 'transparent' })
    assert.deepEqual(exception.resolved.shell, { kind: 'asset', path: assetId, blur: 3, source: 'global' })

    const cleared = await setGlobalUnifiedAppearance(other, 'sess-b', { kind: 'default' }, 1)
    assert.equal(cleared.revision, 3)
    assert.equal(cleared.globalRevision, 2)
    assert.equal(cleared.resolved.shell, null)
    assert.deepEqual(cleared.resolved.canvas, { kind: 'transparent' })
    const noop = await setGlobalUnifiedAppearance(other, 'sess-b', { kind: 'builtin' }, 2)
    assert.equal(noop.globalRevision, 2)

    const globalPath = join(root, 'home', 'appearance', 'global.json')
    await writeFile(globalPath, '{"version":1,"revision":2,"extra":true}\n')
    await assert.rejects(readAppearance(other, 'sess-b'), AppearanceStoreError)
    assert.match(await readFile(globalPath, 'utf8'), /extra/)
    await rm(globalPath)
  })
})
