// @vitest-environment jsdom
/** Contract coverage for every inline code component and choice serialization. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InlineCodeBlock } from '../lib/client/code/CodeBlock.js'
import { CODE_COMPONENT_IDS, validateCodeDocument } from '../lib/client/code/model.js'
import { CODE_CSS } from '../lib/client/code/code-style.js'
import { css } from '../lib/client/code/classes.js'
import {
  codeChoiceClipboardText, codeChoiceSerialize, codeChoiceText, commitCodeChoice,
} from '../lib/client/code/choices.js'
import type { CodeChoiceCommitRequest, CodeChoiceCommitter } from '../lib/client/code/choices.js'

const copy: Readonly<Record<string, string>> = {
  'code.choice.commit': '我选了《{group}》{label}。',
  'code.diff.commit': '我选了《{group}》{label}：{value}。',
}
const t = (key: string): string => copy[key] ?? key
const text = (value = '正文') => ({ component: 'text', text: value })
const fixtures: Readonly<Record<string, object>> = {
  text: { version: 1, ...text('**加粗**') },
  media: { version: 1, component: 'media', src: 'scene.png', alt: '钟楼', aspect: 2 },
  icon: { version: 1, component: 'icon', name: 'chat', text: '对话' },
  stack: { version: 1, component: 'stack', children: [text()] },
  split: { version: 1, component: 'split', children: [text('左'), text('右')] },
  frame: { version: 1, component: 'frame', title: '提示', children: [text()] },
  badge: { version: 1, component: 'badge', text: '修钟匠', tone: 'accent' },
  'media-grid': {
    version: 1, component: 'media-grid', group: '表情',
    items: [{ id: 'stern', src: 'aqi.png', alt: '阿七', label: '警惕' }],
  },
  palette: { version: 1, component: 'palette', group: '主色', colors: [{ id: 'mint', name: '灰薄荷', value: '#789486' }] },
  dialogue: {
    version: 1, component: 'dialogue',
    turns: [{ speaker: '阿七', role: '修钟匠', portrait: 'aqi.png', text: '别碰那根指针。' }],
  },
  narration: { version: 1, component: 'narration', context: '雨夜', text: '雨水落下。', thought: '不能忘记。' },
  'story-panel': { version: 1, component: 'story-panel', src: 'scene.png', alt: '钟楼', caption: '指针倒转', text: '火光变白。' },
  'canon-diff': { version: 1, component: 'canon-diff', subject: '阿七', before: '纪念物', after: '记忆容器', group: '耳坠设定' },
  choices: {
    version: 1, component: 'choices', group: '剧情分支',
    options: [{ id: 'trust', label: '相信阿七' }, { id: 'test', label: '要求证明' }],
  },
  'conflict-list': { version: 1, component: 'conflict-list', items: [{ text: '时间冲突', refs: ['钟楼规则'] }] },
  stat: { version: 1, component: 'stat', label: '共鸣', value: 72, unit: '/ 100' },
  meter: { version: 1, component: 'meter', label: '稳定度', value: 64 },
  'bar-chart': { version: 1, component: 'bar-chart', data: [{ label: '北塔', value: 68 }, { label: '旧港', value: 52 }] },
  'line-chart': { version: 1, component: 'line-chart', data: [{ label: '到场', value: 18 }, { label: '共识', value: 72 }] },
  'radar-chart': {
    version: 1, component: 'radar-chart',
    data: [{ label: '感知', value: 86 }, { label: '共情', value: 72 }, { label: '意志', value: 78 }],
  },
}

const mounted = new Set()
async function mount(element) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.add(root)
  await act(async () => { root.render(element) })
  return {
    container,
    unmount: () => {
      act(() => { root.unmount() })
      mounted.delete(root)
      container.remove()
    },
  }
}

function renderCode(data: object, commit?: CodeChoiceCommitter) {
  return mount(createElement(InlineCodeBlock, {
    data,
    blockId: 'turn:step:0',
    resolveMedia: (src: string) => `/media/${src}`,
    ...(commit === undefined ? {} : { commit }),
    t,
  }))
}

async function click(element: Element): Promise<void> {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

afterEach(() => {
  for (const root of mounted) act(() => { root.unmount() })
  mounted.clear()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('inline code component catalog', () => {
  it('validates and renders every catalogued component', async () => {
    expect(Object.keys(fixtures).sort()).toEqual([...CODE_COMPONENT_IDS].sort())
    for (const [id, fixture] of Object.entries(fixtures)) {
      expect(validateCodeDocument(fixture), id).toBeDefined()
      const view = await renderCode(fixture)
      expect(view.container.firstChild, id).not.toBeNull()
      view.unmount()
    }
  })

  it('resolves media through the workspace and sanitizes text HTML', async () => {
    const media = await renderCode(fixtures.media)
    expect(media.container.querySelector('img')?.getAttribute('src')).toBe('/media/scene.png')
    const unsafe = await renderCode({ version: 1, component: 'text', text: '<img src=x onerror=alert(1)>' })
    expect(unsafe.container.querySelector('img')).toBeNull()
    expect(unsafe.container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('shows a controlled notice for unsupported content without exposing its payload', async () => {
    const view = await renderCode({ version: 1, component: 'iframe', html: '<script>alert(1)</script>' })
    expect(view.container.textContent).toBe('code.invalid')
    expect(view.container.textContent).not.toContain('<script>')
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('rejects undeclared fields at the root, in components, and inside nested records', () => {
    expect(validateCodeDocument({ version: 1, component: 'text', text: 'safe', html: '<b>unsafe</b>' })).toBeUndefined()
    expect(validateCodeDocument({ version: 1, component: 'stack', style: 'display:none', children: [text()] })).toBeUndefined()
    expect(validateCodeDocument({
      version: 1, component: 'choices', group: 'branch',
      options: [{ id: 'a', label: 'A', css: 'position:fixed' }],
    })).toBeUndefined()
    expect(validateCodeDocument({
      version: 1, component: 'bar-chart', data: [{ label: 'A', value: 1, script: 'alert(1)' }],
    })).toBeUndefined()
  })

  it('rejects duplicate identities for selectable options instead of painting multiple selected states', () => {
    expect(validateCodeDocument({
      version: 1, component: 'choices', group: 'branch',
      options: [{ id: 'same', label: 'A' }, { id: 'same', label: 'B' }],
    })).toBeUndefined()
    expect(validateCodeDocument({
      version: 1, component: 'palette', group: 'colors',
      colors: [{ id: 'same', name: 'A', value: '#112233' }, { id: 'same', name: 'B', value: '#445566' }],
    })).toBeUndefined()
  })

  it('uses every emitted variant class name in the stylesheet', () => {
    for (const name of ['accent', 'warning', 'cover', 'contain', 'reverse'] as const) {
      expect(CODE_CSS, name).toContain(`.${css[name]}`)
    }
  })

  it('spaces radar grids by geometry when the value domain is not one hundred', async () => {
    const view = await renderCode({
      version: 1, component: 'radar-chart', max: 1,
      data: [{ label: 'A', value: 0.2 }, { label: 'B', value: 0.5 }, { label: 'C', value: 1 }],
    })
    const grids = [...view.container.querySelectorAll(`.${css.radarGrid}`)]
    expect(new Set(grids.map(grid => grid.getAttribute('points'))).size).toBe(4)
  })
})

describe('inline code choices', () => {
  it('commits one stable group and serializes the selected value as ordinary text', async () => {
    const commit = vi.fn((_request: CodeChoiceCommitRequest) => true)
    const view = await renderCode(fixtures.choices, commit)
    const buttons = view.container.querySelectorAll('button')
    await click(buttons[0]!)
    await click(buttons[1]!)
    expect(commit).toHaveBeenCalledTimes(2)
    const first = commit.mock.calls[0]?.[0]
    const second = commit.mock.calls[1]?.[0]
    expect(second.refPrefix).toBe(first.refPrefix)
    expect(second.refPrefix).toContain('turn:step:0')
    expect(second.insert.ref).not.toBe(first.insert.ref)
    expect(second.insert.clipboardText).toBe('我选了《剧情分支》要求证明。')
    expect(codeChoiceSerialize(second.insert.ref)).toBe(second.insert.clipboardText)
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true')
  })

  it('disables selection when the container has no composer commit capability', async () => {
    const view = await renderCode(fixtures.choices)
    expect(view.container.querySelector('button')?.disabled).toBe(true)
  })

  it('round-trips delimiters and rejects malformed codec references', () => {
    const commit = vi.fn((_request: CodeChoiceCommitRequest) => true)
    const text = '我选了《剧情|A》x:y。'
    expect(commitCodeChoice(commit, 'step:7', { group: '剧情|A', optionId: 'x:y', label: '相信', text })).toBe(true)
    const request = commit.mock.calls[0]?.[0]
    expect(codeChoiceText(request.insert.ref)).toBe(text)
    expect(codeChoiceClipboardText(request.insert.ref)).toBe(text)
    expect(() => codeChoiceSerialize('bad-ref')).toThrow(/invalid/)
  })

  it('uses the revised value only after the user accepts a canon diff', async () => {
    const commit = vi.fn((_request: CodeChoiceCommitRequest) => true)
    const view = await renderCode(fixtures['canon-diff'], commit)
    const accept = [...view.container.querySelectorAll('button')].find(button => button.textContent?.includes('code.diff.accept'))
    await click(accept!)
    expect(commit.mock.calls[0]?.[0].insert.clipboardText).toContain('记忆容器')
  })
})
