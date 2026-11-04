// @vitest-environment jsdom
/** Reading permissions and authored protocols through real module and rich-text entrances. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MarkdownDelegateProvider } from '@deepseek-ai/dsh-client-ui-primitives'
import { BlockNoteDocEditor, CardMarkdownEditor } from '../src/client/doc-editor.tsx'
import { ModuleBox } from '../src/client/card-page.tsx'
import { documentImageUrl, documentLinkAllowed, novenLink } from '../src/client/document-protocols.ts'
import { en } from '../src/client/locales.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots = new Set<ReturnType<typeof createRoot>>()
const t = key => en[key]
const noop = () => {}

async function mount(element) {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: noop, removeEventListener: noop }))
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  await act(async () => { root.render(element) })
  return {
    container,
    render: async next => { await act(async () => { root.render(next) }) },
    unmount: async () => { await act(async () => { root.unmount() }); roots.delete(root) },
  }
}

afterEach(async () => {
  for (const root of roots) await act(async () => { root.unmount() })
  roots.clear()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it('rejects unsafe or malformed links and resolves image bytes without rewriting authored identifiers', () => {
  expect(novenLink('noven://card/one/module/two')).toEqual({ kind: 'card', cardId: 'one', moduleId: 'two' })
  expect(novenLink('noven://file/%E6%AD%A3%E6%96%87.md')).toEqual({ kind: 'file', path: '正文.md' })
  for (const link of ['noven://card', 'noven://card/one/module', 'noven://card/%zz', 'https://card/one']) {
    expect(novenLink(link)).toBeUndefined()
  }
  for (const link of ['javascript:alert(1)', 'data:text/html,hello', 'noven://card/%zz']) {
    expect(documentLinkAllowed(link)).toBe(false)
  }
  expect(documentLinkAllowed('https://example.com')).toBe(true)
  expect(documentImageUrl('card-image:art#block', id => `/resources/${id}`)).toBe('/resources/art')
  expect(documentImageUrl('card-image:art#block', undefined)).toBe('')
  expect(documentImageUrl('https://example.com/art.png', undefined)).toBe('https://example.com/art.png')
})

it('renders real card images and routes deep links in reading mode without saving on open or close', async () => {
  const save = vi.fn()
  const open = vi.fn()
  const view = await mount(createElement(MarkdownDelegateProvider, { linkProtocols: ['noven:'], openLink: open },
    createElement(CardMarkdownEditor, {
      markdown: '![art](card-image:art#block "w=50%")\n\n[story](noven://card/target/module/story)',
      imageUrl: id => `/resources/${id}`, onSave: save, readOnly: true,
    }),
  ))
  await vi.waitFor(() => expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/resources/art'))
  const anchor = view.container.querySelector('a[href="noven://card/target/module/story"]')!
  await act(async () => { anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(open).toHaveBeenCalledWith('noven://card/target/module/story')
  expect(view.container.querySelector('[contenteditable]')?.getAttribute('contenteditable')).toBe('false')
  await view.unmount()
  expect(save).not.toHaveBeenCalled()
})

it('routes the same authored link from the real document editor and does not save its initial parse', async () => {
  const save = vi.fn()
  const open = vi.fn()
  const view = await mount(createElement(MarkdownDelegateProvider, { linkProtocols: ['noven:'], openLink: open },
    createElement(BlockNoteDocEditor, {
      markdown: '[file](noven://file/%E6%AD%A3%E6%96%87.md)', onChange: save, autoSave: false,
      zoom: 1, onZoom: noop, onWordCount: noop, onOutline: noop, onActive: noop, onMarks: noop,
    }),
  ))
  const anchor = view.container.querySelector('a[href]')!
  await act(async () => { anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(open).toHaveBeenCalledWith('noven://file/%E6%AD%A3%E6%96%87.md')
  await view.unmount()
  expect(save).not.toHaveBeenCalled()
})

it('cuts a supplied timeline writer at ModuleBox while retaining current preview restrictions', async () => {
  const send = vi.fn(async () => true)
  const current = {
    id: 'timeline', name: 'Timeline', blocks: [], children: [], characterIds: [], tags: [], layout: 'VERTICAL',
    widget: { type: 'timeline', data: {} },
  }
  const props = {
    module: current, t, card: { id: 'card', name: 'Card', kind: 'WORLD' },
    addr: { root: '/project' }, loadCard: async () => undefined,
    imageUrl: () => '', imageResources: [], send, readOnly: true,
  }
  const view = await mount(createElement(ModuleBox, props))
  await act(async () => { view.container.querySelector<HTMLButtonElement>('.nv-tlset-button')!.click() })
  const input = view.container.querySelector('.nv-tlset-pop input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'event')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { view.container.querySelector<HTMLButtonElement>('.nv-tlset-apply')!.click() })
  expect(send).not.toHaveBeenCalled()
  expect(view.container.querySelector('.nv-modbox-body')?.hasAttribute('inert')).toBe(true)
  await view.unmount()
  const editable = await mount(createElement(ModuleBox, { ...props, readOnly: false }))
  await act(async () => { editable.container.querySelector<HTMLButtonElement>('.nv-tlset-button')!.click() })
  const editableInput = editable.container.querySelector('.nv-tlset-pop input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(editableInput, 'event')
    editableInput.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { editable.container.querySelector<HTMLButtonElement>('.nv-tlset-apply')!.click() })
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'timeline_set_calendar', moduleId: 'timeline' }))
  await editable.unmount()
})
