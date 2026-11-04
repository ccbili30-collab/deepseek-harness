// @vitest-environment jsdom
/** Creation panel host identity, workspace changes, and composer eligibility. */
import assert from 'node:assert/strict'
import { act, createElement } from '../node_modules/react/index.js'
import { createRoot } from '../node_modules/react-dom/client.js'
import { afterEach, describe, test, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { RenderFactorySlot } from '@deepseek-ai/dsh-client-ui-slots'
import { Create } from '../lib/client/pages/Create.js'
import { en } from '../lib/client/locales.js'
import type { ShellT } from '../lib/client/pages/Home.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const t: ShellT = key => en[key]
const mounted = new Set<{ unmount: () => void }>()

afterEach(() => {
  for (const root of mounted) act(() => { root.unmount() })
  mounted.clear()
  document.body.replaceChildren()
})

function workspace(path: string): WorkspaceView {
  return { workspaceId: path as WorkspaceView['workspaceId'], path, title: path, sessionIds: [] } as WorkspaceView
}

const workspaceState = {
  state: 'ready',
  items: [workspace('/a'), workspace('/b')],
} as WorkspaceSnapshot

interface RowOptions {
  readonly blank: boolean
  readonly cwd: string
  readonly main?: boolean
  readonly preset?: string
}

function sessions(rows: Record<string, RowOptions>): SessionListState {
  const byId = Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, {
    id: id as SessionId,
    blank: row.blank,
    cwd: row.cwd,
    displayTitle: id,
    updatedAt: 1,
    retainedBy: { mainView: row.main === false ? 0 : 1 },
    projectionValues: { agentPreset: row.preset ?? 'create' },
  }]))
  return { ids: Object.keys(byId), byId } as SessionListState
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((accept) => { resolve = () => { accept() } })
  return { promise, resolve }
}

async function mount(state: SessionListState, ensureBlankHost: (workspaceId: WorkspaceId | undefined) => Promise<void>, revealSession = vi.fn(), factory: RenderFactorySlot = () => null, revealAuxiliary = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.add(root)
  const props = {
    t,
    revealAuxiliary,
    useWorkspaces: <T,>(selector: (value: WorkspaceSnapshot) => T): T => selector(workspaceState),
    useSessions: <T,>(selector: (value: SessionListState) => T): T => selector(state),
    renderFactorySlot: factory,
    ensureBlankHost,
    revealSession,
    onStartHandcraft: vi.fn(),
    onImportCard: vi.fn(),
  }
  await act(async () => { root.render(createElement(Create, props)) })
  return {
    revealAuxiliary,
    update: async (next: SessionListState) => {
      await act(async () => { root.render(createElement(Create, { ...props, useSessions: <T,>(selector: (value: SessionListState) => T): T => selector(next) })) })
    },
    unmount: () => {
      act(() => { root.unmount() })
      mounted.delete(root)
      container.remove()
    },
  }
}

describe('creation panel host lifecycle', () => {
  test('reveals only the hosted Session after it engages, never the automatic successor', async () => {
    const revealSession = vi.fn()
    const view = await mount(sessions({ host: { blank: true, cwd: '/a' } }), vi.fn(), revealSession)
    assert.equal(revealSession.mock.calls.length, 0)
    await view.update(sessions({
      host: { blank: false, cwd: '/a', main: false },
      successor: { blank: true, cwd: '/a' },
    }))
    assert.deepEqual(revealSession.mock.calls.map(([id]) => id), ['host'])
    view.unmount()
  })

  test('starts a new blank-host request when the workspace changes during an earlier request', async () => {
    const first = deferred()
    const second = deferred()
    const ensureBlankHost = vi.fn((workspaceId: WorkspaceId | undefined) => workspaceId === '/b' ? second.promise : first.promise)
    const view = await mount(sessions({ ordinary: { blank: false, cwd: '/a' } }), ensureBlankHost)
    assert.deepEqual(ensureBlankHost.mock.calls.map(([id]) => id), ['/a'])
    await view.update(sessions({ other: { blank: false, cwd: '/b' } }))
    assert.deepEqual(ensureBlankHost.mock.calls.map(([id]) => id), ['/a', '/b'])
    first.resolve()
    second.resolve()
    view.unmount()
  })

  test('does not mount the composer for a blank host with another preset', async () => {
    const factory = vi.fn(() => null)
    const view = await mount(sessions({ legacy: { blank: true, cwd: '/a', preset: 'standard' } }), vi.fn(async () => {}), vi.fn(), factory)
    assert.equal(factory.mock.calls.length, 0)
    view.unmount()
  })

  test('uses the shared auxiliary recovery command instead of Session navigation', async () => {
    const revealAuxiliary = vi.fn()
    await mount(sessions({ host: { blank: true, cwd: '/a' } }), vi.fn(), vi.fn(), () => null, revealAuxiliary)
    const button = document.querySelector<HTMLButtonElement>('[data-chrome-command="reveal-auxiliary"]')
    assert.ok(button)
    assert.equal(document.querySelector('[data-side-session-menu]'), null)
    await act(async () => { button.click() })
    assert.equal(revealAuxiliary.mock.calls.length, 1)
  })
})
