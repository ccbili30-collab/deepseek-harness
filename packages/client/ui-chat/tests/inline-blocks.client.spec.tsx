// @vitest-environment jsdom
/**
 * Inline blocks: the four rules that make the feature correct instead of patched.
 * A directive exists only when a whole line parses (no half-created blocks);
 * segments are keyed by source offset (a streaming append cannot remount a
 * block); activation is focus (nothing records which block is active); and every
 * state paints inside the declared ratio (a late body cannot move the
 * transcript). The last test pins the reuse rule: the same reference renders the
 * same markup in any container.
 */
import { act, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BlockSurface, UnknownBlock } from '../src/client/blocks/BlockSurface.tsx'
import { parseDirectiveLine, splitBlockSegments } from '../src/client/blocks/directive.ts'
import {
  BlockRegistryProvider, createBlockRegistry, type BlockRegistry, type BlockSpec, type DataBlockSpec,
} from '../src/client/blocks/registry.tsx'
import { BlockSegments, DEFAULT_BLOCK_RATIO } from '../src/client/blocks/Segments.tsx'

const DIRECTIVE = '::view{"block":"chart","src":"分析/访问量.json"}'

/** One scoped renderer: the same tree in every rendering test below. */
function scopedView(registry: BlockRegistry): (text: string) => ReactNode {
  return text => (
    <BlockRegistryProvider registry={registry}>
      <BlockSegments text={text} renderText={part => <p>{part}</p>} />
    </BlockRegistryProvider>
  )
}

/** Render one directive through a harness-free registry. */
function registryView(registry: BlockRegistry, text: string): ReactNode {
  return scopedView(registry)(text)
}

/** jsdom normalizes `aspect-ratio: 2` to `2 / 1`; compare the declared factor. */
function declaredRatio(element: HTMLElement | null): string | undefined {
  return element?.style.aspectRatio.replace(/\s*\/\s*1$/u, '')
}

/** One registry with a chart spec whose body reports the reference it received. */
function chartRegistry(ratio = 2): ReturnType<typeof createBlockRegistry> {
  const registry = createBlockRegistry()
  registry.register({
    id: 'chart',
    size: { ratio },
    render: ({ source }) => <div data-chart-src={source.src} />,
  })
  return registry
}

describe('directive grammar', () => {
  it('returns no segments for empty text and keeps prose byte for byte', () => {
    expect(splitBlockSegments('')).toEqual([])
    const prose = '第一段\n\n第二段'
    expect(splitBlockSegments(prose)).toEqual([{ kind: 'text', key: 0, text: prose }])
  })

  it('seals a directive only when a whole line parses', () => {
    const text = `先说结论：\n${DIRECTIVE}\n点柱子看细节。`
    const segments = splitBlockSegments(text)
    expect(segments.map(segment => segment.kind)).toEqual(['text', 'block', 'text'])
    expect(segments[1]).toEqual({
      kind: 'block',
      key: '先说结论：\n'.length,
      ref: { block: 'chart', src: '分析/访问量.json' },
    })
  })

  it('drops the directive line from the surrounding prose', () => {
    const segments = splitBlockSegments(`前\n${DIRECTIVE}\n后`)
    expect(segments[0]?.kind === 'text' ? segments[0].text : null).toBe('前\n')
    expect(segments[2]?.kind === 'text' ? segments[2].text : null).toBe('后')
  })

  it('leaves a partially streamed directive as prose', () => {
    const partial = DIRECTIVE.slice(0, -1)
    expect(parseDirectiveLine(partial)).toBeUndefined()
    expect(splitBlockSegments(`前\n${partial}`).map(segment => segment.kind)).toEqual(['text'])
  })

  it('keeps malformed payloads, missing fields and empty ids as prose', () => {
    expect(parseDirectiveLine('::view{"block":')).toBeUndefined()
    expect(parseDirectiveLine('::view{"block":"chart"}')).toBeUndefined()
    expect(parseDirectiveLine('::view{"block":"","src":"a.json"}')).toBeUndefined()
    expect(parseDirectiveLine('::view not json')).toBeUndefined()
    expect(parseDirectiveLine('普通文字 ::view{"block":"chart","src":"a.json"}')).toBeUndefined()
  })

  it('accepts indentation and optional titles', () => {
    expect(parseDirectiveLine('  ::view{"block":"chart","src":"a.json","title":"访问量"}  '))
      .toEqual({ block: 'chart', src: 'a.json', title: '访问量' })
  })

  it('keys segments by offset, so appending text never moves an earlier block', () => {
    const before = splitBlockSegments(`说明\n${DIRECTIVE}`)
    const after = splitBlockSegments(`说明\n${DIRECTIVE}\n更多说明`)
    expect(before.find(segment => segment.kind === 'block')?.key)
      .toBe(after.find(segment => segment.kind === 'block')?.key)
    expect(before[0]?.key).toBe(after[0]?.key)
  })
})

describe('block registry', () => {
  it('resolves registered specs and removes only its own registration', () => {
    const registry = createBlockRegistry()
    const spec: BlockSpec = { id: 'chart', size: { ratio: 2 }, render: () => null }
    const dispose = registry.register(spec)
    expect(registry.resolve('chart')).toBe(spec)
    expect(registry.count()).toBe(1)
    const other = registry.register({ id: 'map', size: { ratio: 1 }, render: () => null })
    dispose()
    expect(registry.resolve('chart')).toBeUndefined()
    expect(registry.resolve('map')).toBeDefined()
    other()
    expect(registry.count()).toBe(0)
  })

  it('fails loud on an empty id, a non-positive ratio and a duplicate id', () => {
    const registry = createBlockRegistry()
    expect(() => registry.register({ id: '', size: { ratio: 1 }, render: () => null })).toThrow(/id/)
    expect(() => registry.register({ id: 'chart', size: { ratio: 0 }, render: () => null })).toThrow(/ratio/)
    registry.register({ id: 'chart', size: { ratio: 1 }, render: () => null })
    expect(() => registry.register({ id: 'chart', size: { ratio: 1 }, render: () => null })).toThrow(/already/)
  })
})

describe('block surface', () => {
  it('reserves the declared ratio before any content exists', () => {
    const { container } = render(
      <BlockSurface blockId="chart" blockRef={{ block: 'chart', src: 'a.json' }} ratio={1.5}>
        <span>body</span>
      </BlockSurface>,
    )
    const surface = container.querySelector<HTMLElement>('[data-inline-block]')
    expect(declaredRatio(surface)).toBe('1.5')
    expect(surface?.textContent).toBe('body')
  })

  it('takes activation from focus and releases it with Escape', () => {
    const { container } = render(
      <BlockSurface blockId="chart" blockRef={{ block: 'chart', src: 'a.json' }} ratio={2}>
        <button type="button">inside</button>
      </BlockSurface>,
    )
    const surface = container.querySelector<HTMLElement>('[data-inline-block]')
    if (surface === null) throw new Error('missing surface')
    act(() => { surface.focus() })
    expect(document.activeElement).toBe(surface)
    fireEvent.keyDown(surface, { key: 'Escape' })
    expect(document.activeElement).not.toBe(surface)
  })

  it('records no activation state and installs no document-level listener', () => {
    const spy = vi.spyOn(document, 'addEventListener')
    const { container } = render(
      <BlockSurface blockId="chart" blockRef={{ block: 'chart', src: 'a.json' }} ratio={2}>
        <span>body</span>
      </BlockSurface>,
    )
    const surface = container.querySelector<HTMLElement>('[data-inline-block]')
    expect(surface?.hasAttribute('data-active')).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('segments', () => {
  it('renders the whole text when no registry is scoped', () => {
    const renderText = vi.fn((text: string) => <p>{text}</p>)
    const { container } = render(<BlockSegments text={`前\n${DIRECTIVE}\n后`} renderText={renderText} />)
    expect(renderText).toHaveBeenCalledTimes(1)
    expect(renderText).toHaveBeenCalledWith(`前\n${DIRECTIVE}\n后`)
    expect(container.querySelector('[data-inline-block]')).toBeNull()
  })

  it('does not paint an unsealed directive while the message streams', () => {
    const renderText = vi.fn((text: string) => <p>{text}</p>)
    const registry = chartRegistry()
    const partial = `先说结论\n${DIRECTIVE.slice(0, -8)}`
    const { container, rerender } = render(
      <BlockRegistryProvider registry={registry}>
        <BlockSegments text={partial} streaming renderText={renderText} />
      </BlockRegistryProvider>,
    )
    expect(container.textContent).toContain('先说结论')
    expect(container.textContent).not.toContain('::view')
    expect(renderText).toHaveBeenCalledTimes(1)
    rerender(
      <BlockRegistryProvider registry={registry}>
        <BlockSegments text={partial} renderText={renderText} />
      </BlockRegistryProvider>,
    )
    expect(container.textContent).toContain('::view')
  })

  it('renders the whole text when the scoped registry has no block types', () => {
    const renderText = vi.fn((text: string) => <p>{text}</p>)
    const registry = createBlockRegistry()
    render(
      <BlockRegistryProvider registry={registry}>
        <BlockSegments text={DIRECTIVE} renderText={renderText} />
      </BlockRegistryProvider>,
    )
    expect(renderText).toHaveBeenCalledTimes(1)
  })

  it('renders a registered block from its reference only', () => {
    const renderer = vi.fn(({ source }: { source: { src: string } }) => <div data-chart-src={source.src} />)
    const registry = createBlockRegistry()
    registry.register({ id: 'chart', size: { ratio: 2 }, render: renderer })
    const { container } = render(
      <BlockRegistryProvider registry={registry}>
        <BlockSegments text={`前\n${DIRECTIVE}\n后`} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>,
    )
    expect(renderer.mock.calls[0]?.[0]).toEqual({ source: { block: 'chart', src: '分析/访问量.json' } })
    expect(container.querySelector('[data-chart-src]')?.getAttribute('data-chart-src')).toBe('分析/访问量.json')
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('lets the container resolve workspace sources and keeps renderers context-free', () => {
    const renderer = vi.fn(({ source }: { source: { src: string } }) => <div data-chart-src={source.src} />)
    const registry = createBlockRegistry()
    registry.register({ id: 'chart', size: { ratio: 2 }, source: 'workspace', render: renderer })
    const { container } = render(
      <BlockRegistryProvider registry={registry} resolveSource={(kind, src) => (kind === 'workspace' ? `/workspace/session-a/${src}` : undefined)}>
        <BlockSegments text={DIRECTIVE} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>,
    )
    expect(renderer.mock.calls[0]?.[0]).toEqual({ source: { block: 'chart', src: '/workspace/session-a/分析/访问量.json' } })
    expect(container.querySelector('[data-chart-src]')?.getAttribute('data-chart-src'))
      .toBe('/workspace/session-a/分析/访问量.json')
  })

  it('addresses a frame source through the registered resolver', () => {
    const registry = createBlockRegistry()
    const renderer = vi.fn(({ source }: { source: { src: string } }) => <div data-frame-src={source.src} />)
    registry.register({ id: 'code', size: { ratio: 1.6 }, source: 'frame', render: renderer })
    registry.registerSource('frame', (src, sessionId) => `/frame?session=${sessionId}&path=${src}`)
    expect(registry.resolveSource('frame', '分析/图.html', 'sess-1'))
      .toBe('/frame?session=sess-1&path=分析/图.html')
    const { container } = render(
      <BlockRegistryProvider
        registry={registry}
        resolveSource={(kind, src) => registry.resolveSource(kind as 'frame', src, 'sess-1')}
      >
        <BlockSegments text={'::view{"block":"code","src":"分析/图.html"}'} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>,
    )
    expect(container.querySelector('[data-frame-src]')?.getAttribute('data-frame-src'))
      .toBe('/frame?session=sess-1&path=分析/图.html')
  })

  it('passes the workspace root to card source resolvers', () => {
    const registry = createBlockRegistry()
    registry.registerSource('card', (src, sessionId, workspaceRoot) => `/cards/${workspaceRoot ?? ''}/${sessionId}/${src}`)
    expect(registry.resolveSource('card', 'card:card-1/module-1', 'sess-1', '/workspace'))
      .toBe('/cards//workspace/sess-1/card:card-1/module-1')
  })

  it('uses the size variant a directive selects and falls back to the default', () => {
    const registry = createBlockRegistry()
    registry.register({ id: 'code', size: { ratio: 1.6 }, variants: { wide: 16 / 9 }, render: () => null })
    const wide = render(registryView(registry, '::view{"block":"code","src":"a.html","size":"wide"}'))
    const plain = render(registryView(registry, '::view{"block":"code","src":"a.html"}'))
    const unknown = render(registryView(registry, '::view{"block":"code","src":"a.html","size":"tall"}'))
    const ratio = (host: HTMLElement): string | undefined =>
      host.querySelector<HTMLElement>('[data-inline-block]')?.style.aspectRatio.replace(/\s*\/\s*1$/u, '')
    expect(ratio(wide.container)).toBe(String(16 / 9))
    expect(ratio(plain.container)).toBe('1.6')
    expect(ratio(unknown.container)).toBe('1.6')
  })

  it('shows a controlled notice instead of invoking the renderer when source resolution fails', () => {
    const renderer = vi.fn(() => <div data-frame-src="resolved" />)
    const registry = createBlockRegistry()
    registry.register({ id: 'code', size: { ratio: 1.6 }, source: 'frame', render: renderer })
    const { container } = render(
      <BlockRegistryProvider registry={registry} resolveSource={() => undefined}>
        <BlockSegments text={'::view{"block":"code","src":"missing.html"}'} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>,
    )
    expect(renderer).not.toHaveBeenCalled()
    expect(container.querySelector('[data-unknown-block]')?.textContent).toContain('missing.html')
    expect(container.querySelector('[data-frame-src]')).toBeNull()
  })

  it('refreshes mounted prose and references after late registration and disposal', () => {
    const registry = createBlockRegistry()
    const mounted = render(registryView(registry, DIRECTIVE))
    expect(mounted.container.querySelector('[data-inline-block]')).toBeNull()
    expect(mounted.container.textContent).toContain(DIRECTIVE)
    let dispose: () => void = () => {}
    act(() => { dispose = registry.register({ id: 'chart', size: { ratio: 2 }, render: () => <div data-late-chart /> }) })
    expect(mounted.container.querySelector('[data-late-chart]')).not.toBeNull()
    expect(mounted.container.textContent).not.toContain(DIRECTIVE)
    act(() => { dispose() })
    expect(mounted.container.querySelector('[data-inline-block]')).toBeNull()
    expect(mounted.container.textContent).toContain(DIRECTIVE)
  })

  it('refreshes a mounted reference when its source resolver is replaced or removed', () => {
    const registry = chartRegistry()
    registry.register({ id: 'framed', size: { ratio: 2 }, source: 'frame', render: () => null })
    const view = (
      <BlockRegistryProvider registry={registry} resolveSource={(kind, src) => registry.resolveSource(kind, src, 'sess-1')}>
        <BlockSegments text={'::view{"block":"framed","src":"map.html"}'} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>
    )
    const mounted = render(view)
    expect(mounted.container.querySelector('[data-unknown-block]')).not.toBeNull()
    let dispose: () => void = () => {}
    act(() => { dispose = registry.registerSource('frame', src => `/frame/${src}`) })
    expect(mounted.container.querySelector('[data-unknown-block]')).toBeNull()
    act(() => { dispose() })
    expect(mounted.container.querySelector('[data-unknown-block]')).not.toBeNull()
  })

  it('fails loud when one source kind is registered twice', () => {
    const registry = createBlockRegistry()
    registry.registerSource('frame', src => src)
    expect(() => registry.registerSource('frame', src => src)).toThrow(/already/)
  })

  it('passes raw sources through even when the container can resolve', () => {
    const renderer = vi.fn(({ source }: { source: { src: string } }) => <div data-chart-src={source.src} />)
    const registry = createBlockRegistry()
    registry.register({ id: 'chart', size: { ratio: 2 }, render: renderer })
    render(
      <BlockRegistryProvider registry={registry} resolveSource={(kind, src) => (kind === 'workspace' ? `/workspace/session-a/${src}` : undefined)}>
        <BlockSegments text={DIRECTIVE} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>,
    )
    expect(renderer.mock.calls[0]?.[0]).toEqual({ source: { block: 'chart', src: '分析/访问量.json' } })
  })

  it('keeps the declared ratio for unclaimed ids and shows the reference', () => {
    const registry = createBlockRegistry()
    registry.register({ id: 'chart', size: { ratio: 2 }, render: () => null })
    const { container } = render(
      <BlockRegistryProvider registry={registry}>
        <BlockSegments text={'::view{"block":"map","src":"展区/平面图.json"}'} renderText={text => <p>{text}</p>} />
      </BlockRegistryProvider>,
    )
    const surface = container.querySelector<HTMLElement>('[data-inline-block]')
    expect(declaredRatio(surface)).toBe(String(DEFAULT_BLOCK_RATIO))
    expect(container.querySelector('[data-unknown-block]')?.textContent).toContain('展区/平面图.json')
  })

  it('keeps the block instance across a streaming append', () => {
    const view = scopedView(chartRegistry())
    const { container, rerender } = render(view(`前\n${DIRECTIVE}\n后`))
    const first = container.querySelector('[data-inline-block]')
    rerender(view(`前\n${DIRECTIVE}\n后\n追加的一段`))
    expect(container.querySelector('[data-inline-block]')).toBe(first)
  })

  it('renders the same markup in any container', () => {
    const view = scopedView(chartRegistry(1.5))
    const narrow = render(<div data-host="conversation">{view(DIRECTIVE)}</div>)
    const wide = render(<div data-host="canvas">{view(DIRECTIVE)}</div>)
    const markup = (host: HTMLElement): string | undefined =>
      host.querySelector<HTMLElement>('[data-inline-block]')?.outerHTML
    expect(markup(narrow.container)).toBe(markup(wide.container))
  })

  it('paints loading and ready bodies inside the same declared box', () => {
    const registry = createBlockRegistry()
    let ready = false
    registry.register({
      id: 'chart',
      size: { ratio: 2 },
      render: () => (ready ? <div data-state="ready" /> : <div data-state="pending" />),
    })
    const view = scopedView(registry)
    const { container, rerender } = render(view(DIRECTIVE))
    const box = container.querySelector<HTMLElement>('[data-inline-block]')?.getBoundingClientRect()
    ready = true
    rerender(view(DIRECTIVE))
    expect(container.querySelector('[data-state="ready"]')).not.toBeNull()
    expect(declaredRatio(container.querySelector<HTMLElement>('[data-inline-block]'))).toBe('2')
    expect(box).toBeDefined()
  })
})

describe('inline component data', () => {
  const DATA_DIRECTIVE = '::view{"block":"code","data":{"version":1,"component":"text","text":"阿七"}}'

  it('seals message-owned data and rejects missing or mixed content fields', () => {
    expect(parseDirectiveLine(DATA_DIRECTIVE)).toEqual({
      block: 'code',
      data: { version: 1, component: 'text', text: '阿七' },
    })
    expect(parseDirectiveLine('::view{"block":"code","data":{},"src":"a.html"}')).toBeUndefined()
    expect(parseDirectiveLine('::view{"block":"code","data":[]}')).toBeUndefined()
    expect(parseDirectiveLine('::view{"block":"code"}')).toBeUndefined()
  })

  it('renders intrinsic content with stable identity, media resolution, and commit', () => {
    const commit = vi.fn(() => true)
    const renderer = vi.fn<DataBlockSpec['render']>(({ data, blockId, resolveMedia }) => (
      <div data-component={data.component} data-block-id={blockId}>{resolveMedia('portrait.png')}</div>
    ))
    const registry = createBlockRegistry()
    registry.register({ id: 'code', content: 'data', render: renderer })
    const { container } = render(
      <BlockRegistryProvider
        registry={registry}
        commit={commit}
        resolveSource={(kind, src) => kind === 'workspace' ? `/session/${src}` : undefined}
      >
        <BlockSegments text={DATA_DIRECTIVE} scopeId="turn:step" renderText={part => <p>{part}</p>} />
      </BlockRegistryProvider>,
    )
    const surface = container.querySelector<HTMLElement>('[data-inline-block]')
    expect(surface?.style.aspectRatio).toBe('')
    expect(surface?.getAttribute('data-block-content')).toBe('data')
    expect(container.querySelector('[data-component]')?.getAttribute('data-block-id')).toBe('turn:step:0')
    expect(container.textContent).toContain('/session/portrait.png')
    expect(renderer.mock.calls[0]?.[0].commit).toBe(commit)
  })

  it('does not expose inline data when the content kind is unclaimed', () => {
    const registry = createBlockRegistry()
    registry.register({ id: 'chart', size: { ratio: 2 }, render: () => null })
    const { container } = render(
      <BlockRegistryProvider registry={registry}>
        <BlockSegments text={DATA_DIRECTIVE} renderText={part => <p>{part}</p>} />
      </BlockRegistryProvider>,
    )
    expect(container.querySelector('[data-unknown-block]')?.textContent).toBe('code')
    expect(container.textContent).not.toContain('阿七')
  })
})

describe('unknown block notice', () => {
  it('names the reference it could not resolve', () => {
    const { container } = render(<UnknownBlock blockRef={{ block: 'map', src: '展区/平面图.json' }} />)
    expect(container.textContent).toContain('map')
    expect(container.textContent).toContain('展区/平面图.json')
  })
})
