// @vitest-environment jsdom
/** Editor disposal, failed writes and workspace switches through mounted views. */
import { act, createElement } from '../node_modules/react/index.js'
import { createRoot } from '../node_modules/react-dom/client.js'
import { afterEach, expect, it, vi } from 'vitest'
import { PlainTextDocEditor } from '../lib/client/doc-editor.js'
import { TimelineWidget } from '../lib/client/widgets.js'
import { SettingPage } from '../lib/client/setting-page.js'
import { useRetainedCard } from '../lib/client/ui/retain.js'

const roots = new Set<ReturnType<typeof createRoot>>()
globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function mount(element) {
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

async function input(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(element) {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

afterEach(async () => {
  for (const root of roots) await act(async () => { root.unmount() })
  roots.clear()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('saves pending plain-text input when its view closes before debounce', async () => {
  vi.useFakeTimers()
  const save = vi.fn(async () => 'ok' as const)
  const view = await mount(createElement(PlainTextDocEditor, { text: 'opened', onChange: save }))
  await input(view.container.querySelector('textarea'), 'last input')
  expect(save).not.toHaveBeenCalled()
  await view.unmount()
  expect(save).toHaveBeenCalledWith('last input')
})

it('cancels manual drafts on close and never schedules an automatic write', async () => {
  vi.useFakeTimers()
  const save = vi.fn()
  const draft = vi.fn()
  const view = await mount(createElement(PlainTextDocEditor, { text: 'opened', onChange: save, onDraft: draft, autoSave: false }))
  await input(view.container.querySelector('textarea'), 'manual draft')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  await view.unmount()
  expect(draft).toHaveBeenCalledWith('manual draft')
  expect(save).not.toHaveBeenCalled()
})

it('retries refused editor text and retains input typed while a save is pending', async () => {
  vi.useFakeTimers()
  let accept!: (value: string) => void
  const save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { accept = resolve })).mockResolvedValueOnce('error').mockResolvedValueOnce('ok')
  const view = await mount(createElement(PlainTextDocEditor, { text: 'opened', onChange: save }))
  const field = view.container.querySelector('textarea')
  await input(field, 'submitted')
  await act(async () => { await vi.advanceTimersByTimeAsync(600) })
  await input(field, 'later')
  await act(async () => { await vi.advanceTimersByTimeAsync(600); accept('ok') })
  expect(save.mock.calls.map(([text]) => text)).toEqual(['submitted', 'later'])
  expect(field.value).toBe('later')
  await view.unmount()
  expect(save.mock.calls.map(([text]) => text)).toEqual(['submitted', 'later', 'later'])
})

it('ignores a previous workspace response after selection changes and after disposal', async () => {
  let resolveOld!: (value: undefined) => void
  const old = new Promise<undefined>(resolve => { resolveOld = resolve })
  const load = vi.fn(addr => addr.root === '/old-mounted' ? old : Promise.reject(new Error('new offline')))
  function Reader({ root }) {
    const retained = useRetainedCard({ root }, 'card', load)
    return createElement('div', null, retained.error?.message ?? (retained.state === 'loading' ? 'loading' : 'missing'))
  }
  const view = await mount(createElement(Reader, { root: '/old-mounted' }))
  await view.render(createElement(Reader, { root: '/new-mounted' }))
  expect(view.container.textContent).toBe('new offline')
  await act(async () => { resolveOld(undefined) })
  expect(view.container.textContent).toBe('new offline')
  await view.unmount()
})

it('retains a failed timeline entry and does not erase later typing on success', async () => {
  let accept!: (value: boolean) => void
  const send = vi.fn().mockResolvedValueOnce(false).mockImplementationOnce(() => new Promise(resolve => { accept = resolve }))
  const module = { id: 'diary', name: 'Diary', blocks: [], children: [], characterIds: [], layout: 'VERTICAL', tags: [], widget: { type: 'timeline', data: { view: 'diary', calendar: {}, events: [] } } }
  const view = await mount(createElement(TimelineWidget, { module, t: key => key, send }))
  const title = view.container.querySelector('.nv-tldiary-firsttitle')
  await input(title, 'submitted')
  await click(view.container.querySelector('.nv-tldiary-firstsave'))
  expect(title.value).toBe('submitted')
  await click(view.container.querySelector('.nv-tldiary-firstsave'))
  await input(title, 'later')
  await act(async () => { accept(true) })
  expect(title.value).toBe('later')
})

it('edits only card-owned tags and retains a refused tag draft', async () => {
  const tags = Array.from({ length: 12 }, (_, index) => `own-${index}`)
  const module = { id: 'text', name: 'Text', blocks: [], children: [], characterIds: [], layout: 'VERTICAL', tags: ['module-tag'] }
  const target = { id: 'card', kind: 'WORLD', name: 'Card', tags, modules: [module], characters: [], avatarResourceId: null, coverResourceId: null, logoResourceId: null, readingLayout: 'PAGED' }
  const save = vi.fn().mockResolvedValue(false)
  const noop = () => {}
  const view = await mount(createElement(SettingPage, {
    target, doc: target, t: key => key, imageUrl: () => '', renderModule: () => null,
    onEditModule: noop, onAddModule: noop, onOpenRole: noop, onSaveTags: save,
  }))
  await click(view.container.querySelector('.nv-set-tagadd'))
  const field = view.container.querySelector('.nv-set-taginput')
  await input(field, 'new tag')
  await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  expect(save).toHaveBeenCalledWith([...tags, 'new tag'])
  expect(view.container.querySelector('.nv-set-taginput').value).toBe('new tag')
  expect(save.mock.calls[0][0]).not.toContain('module-tag')
})

it('saves only a timeline range without rewriting calendar units and retains refused settings', async () => {
  // jsdom has no layout observer; this case exercises the settings form.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  const send = vi.fn().mockResolvedValue(false)
  const module = { id: 'timeline', name: 'Timeline', blocks: [], children: [], characterIds: [], layout: 'VERTICAL', tags: [], widget: { type: 'timeline', data: {
    calendar: { name: 'Calendar', unit: 'day', units: [{ name: 'day', per: 1 }, { name: 'month', per: 30 }], cycles: [{ unit: 'month', names: ['first', 'second'] }] },
    events: [], eras: [], marks: [],
  } } }
  const view = await mount(createElement(TimelineWidget, { module, t: key => key, send }))
  await click(view.container.querySelector('.nv-tlset-button'))
  const from = view.container.querySelector('.nv-tlset-range input')
  await input(from, '10')
  await click(view.container.querySelector('.nv-tlset-apply'))
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][0]).toEqual({ kind: 'timeline_set_window', moduleId: 'timeline', window: { from: 10 } })
  expect(view.container.querySelector('.nv-tlset-range input').value).toBe('10')
})
