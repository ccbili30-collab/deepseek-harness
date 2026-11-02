// @vitest-environment jsdom
import type { GlobalStandardProps, RenderOpts } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { DirectoryFlowOwnerProps, WorkspaceNavigatorProps } from '../src/client/contract/slots.ts'
import { createWorkspaceViewStore } from '../src/client/stores.ts'
import { WorkspaceNavigator } from '../src/client/rows/WorkspaceNavigator.tsx'
import { zh } from '../src/client/locales.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const t: WorkspaceNavigatorProps['t'] = makeTranslate(zh, commonZh)
const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId
const noPendingInteraction: SessionStatusSnapshot = new Map()

function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

function summary(id: string, updatedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: sid(id), displayTitle: id, running: false, blank: false, updatedAt, ...overrides,
    retainedBy: overrides.retainedBy ?? {},
  }
}

function sessionState(
  items: readonly SessionSummary[],
  main?: SessionId,
): SessionListState {
  const state: SessionListState = {
    ids: items.map(item => item.id),
    byId: Object.fromEntries(items.map(item => [item.id, item])),
    phase: 'ready',
    projectionsBySession: {},
  }
  const row = main === undefined ? undefined : state.byId[main]
  if (row === undefined) return state
  return {
    ...state,
    byId: { ...state.byId, [row.id]: { ...row, retainedBy: { ...row.retainedBy, mainView: 1 } } },
  }
}

function workspace(
  id: string,
  sessionIds: readonly string[],
  title = id,
  path = `/projects/${id}`,
): WorkspaceView {
  return {
    workspaceId: wid(id), path, title,
    sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function workspaceState(
  items: readonly WorkspaceView[],
  archivedSessionIds: readonly SessionId[] = [],
  pinnedSessionIds: readonly SessionId[] = [],
): WorkspaceSnapshot {
  return { items, archivedSessionIds, pinnedSessionIds, state: 'idle', phase: 'ready', error: null }
}

const renderFallbackOnly: (
  name: string,
  owner: object,
  options: RenderOpts | undefined,
) => ReturnType<WorkspaceNavigatorProps['renderSlot']> = (name, _owner, options) =>
  name === 'sidebar.workspaces.content' ? options?.fallback ?? null : null

function mount(overrides: Partial<WorkspaceNavigatorProps> = {}) {
  const store = createWorkspaceViewStore().create()
  const props: WorkspaceNavigatorProps = {
    wide: true,
    expandSidebar: vi.fn(),
    useSessions: hook(sessionState([])),
    useSessionStatus: hook(noPendingInteraction),
    useSessionRetainInfo: () => undefined,
    usePanelInfo,
    useResource,
    useWorkspaces: hook(workspaceState([])),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    open: vi.fn(),
    switchWorkspace: vi.fn(),
    requestSessionRename: vi.fn(),
    createWorkspace: vi.fn(async () => workspace('created', [])),
    useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => true, subscribe: () => () => {} }),
    renderSlot: renderFallbackOnly,
    SessionProvider: ({ children }) => children,
    t,
    ...overrides,
  }
  const view = render(<WorkspaceNavigator {...props} />)
  return { view, props, store }
}

function rowTitles(): string[] {
  return screen.getAllByRole('treeitem').map(row => row.querySelector('[class*="title"]')?.textContent ?? '')
}

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

describe('WorkspaceNavigator', () => {
  it('derives the current Workspace from main-Session membership and lists only its Sessions in helper order', () => {
    mount({
      useSessions: hook(sessionState([
        summary('alpha-old', 10, { cwd: '/projects/beta' }),
        summary('alpha-new', 30, { cwd: '/projects/alpha' }),
        summary('alpha-pinned', 20, { cwd: '/projects/alpha' }),
        summary('beta-new', 40, { cwd: '/projects/beta' }),
        summary('beta-pinned', 50, { cwd: '/projects/beta' }),
      ], sid('alpha-old'))),
      useWorkspaces: hook(workspaceState(
        [
          workspace('alpha', ['alpha-old', 'alpha-new', 'alpha-pinned'], 'Project A'),
          workspace('beta', ['beta-new', 'beta-pinned'], 'Project B'),
        ],
        [],
        [sid('alpha-pinned'), sid('beta-pinned')],
      )),
    })

    expect(screen.getByRole('button', { name: 'Project A' })).not.toBeNull()
    expect(rowTitles()).toEqual(['alpha-pinned', 'alpha-new', 'alpha-old'])
    expect(screen.queryByText('beta-new')).toBeNull()
    expect(screen.queryByText('beta-pinned')).toBeNull()
    expect(screen.getByText('alpha-old').closest('[role="treeitem"]')?.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('button', { name: '视图选项' })).toBeNull()
  })

  it('falls back to the main Session cwd and includes Workspace members plus matching-cwd Sessions only', () => {
    mount({
      useSessions: hook(sessionState([
        summary('member', 20, { cwd: '/elsewhere' }),
        summary('stray', 30, { cwd: '/projects/alpha' }),
        summary('loose', 40, { cwd: '/projects/alpha' }),
        summary('unassigned', 50),
        summary('beta-session', 60, { cwd: '/projects/beta' }),
      ], sid('stray'))),
      useWorkspaces: hook(workspaceState([
        workspace('alpha', ['member'], 'Project A'),
        workspace('beta', ['beta-session'], 'Project B'),
      ])),
    })

    expect(screen.getByRole('button', { name: 'Project A' })).not.toBeNull()
    expect(rowTitles()).toEqual(['loose', 'stray', 'member'])
    expect(screen.queryByText('unassigned')).toBeNull()
    expect(screen.queryByText('beta-session')).toBeNull()
  })

  it('uses the saved manual order and keeps the selected blank with its Workspace', () => {
    const store = createWorkspaceViewStore().create()
    store.actions.setOrderBy('manual', {})
    store.actions.setSessionOrder('alpha', ['alpha-old', 'alpha-new', 'blank'], {})
    mount({
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      useSessions: hook(sessionState([
        summary('blank', 100, { blank: true, cwd: '/projects/alpha' }),
        summary('alpha-new', 30, { cwd: '/projects/alpha' }),
        summary('alpha-old', 10, { cwd: '/projects/alpha' }),
      ], sid('blank'))),
      useWorkspaces: hook(workspaceState([
        workspace('alpha', ['alpha-new', 'alpha-old', 'blank'], 'Project A'),
      ])),
    })

    expect(rowTitles()).toEqual(['新会话', 'alpha-old', 'alpha-new'])
  })

  it('opens and renames through expanded Session rows while rendering their action seats', () => {
    const renderSlot: WorkspaceNavigatorProps['renderSlot'] = vi.fn(renderFallbackOnly)
    const open = vi.fn()
    const requestSessionRename = vi.fn()
    mount({
      open,
      requestSessionRename,
      renderSlot,
      useSessions: hook(sessionState([summary('session-a', 1)], sid('session-a'))),
      useWorkspaces: hook(workspaceState([workspace('alpha', ['session-a'], 'Project A')])),
    })
    const owner = { sessionId: sid('session-a'), displayTitle: 'session-a' }
    expect(renderSlot).toHaveBeenCalledWith(
      'sidebar.workspaces.session.menu.item', owner, expect.objectContaining({ hookContext: expect.anything() }),
    )
    expect(renderSlot).toHaveBeenCalledWith('sidebar.workspaces.session.row.action', owner)

    fireEvent.click(screen.getByText('session-a'))
    expect(open).toHaveBeenCalledWith(sid('session-a'))
    fireEvent.doubleClick(screen.getByText('session-a'))
    expect(requestSessionRename).toHaveBeenCalledWith(sid('session-a'), 'session-a')
  })

  it('opens a rail Session from a Menu, closes it, and never expands the sidebar', () => {
    const open = vi.fn()
    const expandSidebar = vi.fn()
    mount({
      wide: false,
      open,
      expandSidebar,
      useSessions: hook(sessionState([
        summary('alpha-old', 10), summary('alpha-new', 20), summary('beta-session', 30),
      ], sid('alpha-old'))),
      useWorkspaces: hook(workspaceState([
        workspace('alpha', ['alpha-old', 'alpha-new'], 'Project A'),
        workspace('beta', ['beta-session'], 'Project B'),
      ])),
    })
    expect(screen.getByRole('button', { name: '工作区' })).not.toBeNull()
    expect(screen.queryByRole('treeitem')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '会话' }))
    expect(screen.queryByRole('menuitem', { name: 'beta-session' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'alpha-new' }))
    expect(open).toHaveBeenCalledWith(sid('alpha-new'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(expandSidebar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '会话' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(expandSidebar).not.toHaveBeenCalled()
  })

  it('switches Workspaces through the fixed selector without opening a Session directly', () => {
    const switchWorkspace = vi.fn()
    const open = vi.fn()
    mount({
      switchWorkspace,
      open,
      useSessions: hook(sessionState([summary('alpha-session', 1)], sid('alpha-session'))),
      useWorkspaces: hook(workspaceState([
        workspace('alpha', ['alpha-session'], 'Project A'),
        workspace('beta', [], 'Project B'),
      ])),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Project A' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Project B' }))
    expect(switchWorkspace).toHaveBeenCalledWith(wid('beta'))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('adopts a picked directory through createWorkspace before switching to the created Workspace', async () => {
    const createWorkspace = vi.fn(async () => workspace('created', [], 'Created'))
    const switchWorkspace = vi.fn()
    const renderSlot: WorkspaceNavigatorProps['renderSlot'] = (name: string, owner: object, options: RenderOpts | undefined) => {
      if (name === 'sidebar.workspaces.directoryFlow') {
        const flow = owner as DirectoryFlowOwnerProps
        return flow.open ? <button type="button" onClick={() => { flow.onPicked('/picked/project') }}>Pick directory</button> : null
      }
      return renderFallbackOnly(name, owner, options)
    }
    mount({
      createWorkspace,
      switchWorkspace,
      renderSlot,
      useSessions: hook(sessionState([summary('alpha-session', 1)], sid('alpha-session'))),
      useWorkspaces: hook(workspaceState([workspace('alpha', ['alpha-session'], 'Project A')])),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Project A' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '添加工作区…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick directory' }))
    await waitFor(() => { expect(createWorkspace).toHaveBeenCalledWith({ path: '/picked/project' }) })
    await waitFor(() => { expect(switchWorkspace).toHaveBeenCalledWith(wid('created')) })
  })

  it.each([true, false])('keeps the fixed selector before occupied IDE content (wide: %s)', (wide) => {
    const expandSidebar = vi.fn()
    const renderSlot: WorkspaceNavigatorProps['renderSlot'] = vi.fn((name: string, owner: object, options: RenderOpts | undefined) =>
      name === 'sidebar.workspaces.content'
        ? <div data-testid="ide-tree">IDE directory tree</div>
        : renderFallbackOnly(name, owner, options))
    mount({
      wide,
      expandSidebar,
      renderSlot,
      useSessions: hook(sessionState([summary('alpha-session', 1)], sid('alpha-session'))),
      useWorkspaces: hook(workspaceState([workspace('alpha', ['alpha-session'], 'Project A')])),
    })

    const selector = screen.getByRole('button', { name: wide ? 'Project A' : '工作区' })
    const tree = screen.getByTestId('ide-tree')
    expect(selector.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(screen.queryByRole('treeitem')).toBeNull()
    expect(renderSlot).toHaveBeenCalledWith(
      'sidebar.workspaces.content', { wide, expandSidebar }, expect.objectContaining({ fallback: expect.anything() }),
    )
  })

  it('keeps the selector and an empty Agent fallback when no main Session resolves a Workspace', () => {
    const renderSlot = vi.fn(renderFallbackOnly)
    mount({ wide: true, renderSlot })
    expect(screen.getByRole('button', { name: '工作区' })).not.toBeNull()
    expect(screen.getByText('暂无会话')).not.toBeNull()
    expect(renderSlot).not.toHaveBeenCalledWith('sidebar.workspaces.content', expect.anything(), expect.anything())
    cleanup()

    mount({ wide: false, renderSlot })
    expect(screen.getByRole('button', { name: '工作区' })).not.toBeNull()
    expect((screen.getByRole('button', { name: '会话' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
