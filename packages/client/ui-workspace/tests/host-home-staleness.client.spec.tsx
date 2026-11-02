// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
/** The fixed Workspace selector must not depend on the retired hover-path card. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-workspace/client'

usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

type FrameProps = PropsRenderSlots<'sidebar.workspaces'>
function SidebarFrame({ renderSlot }: FrameProps) {
  return <>{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}</>
}

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('shortcuts', { register: () => () => {}, catalog: createSnapshotStore([]) })
  runtime.ctx.provide('uiConversation', {})
  runtime.ctx.provide('layout', { selectPanel: vi.fn(), beginNavigation: () => new AbortController().signal })
  runtime.releaseWorkspaceSource()
  const directoryPicker = {}
  const { remote } = runtime
  remote.provideNamespaces({ directoryPicker })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.workspaces.update((draft) => {
    draft.items = [{
      workspaceId: 'w1' as WorkspaceId, title: 'Project', path: '/home/u/Documents/project',
      sessionIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }] as never
  })
  await runtime.root.declare(
    { 'sidebar.workspaces': { kind: 'single', scope: 'root' } } as never,
    SidebarFrame as never,
  )
  await runtime.mount({ inject: [...inject], apply })
  return { runtime, remote }
}

function openPicker(): void {
  fireEvent.click(screen.getByRole('button', { name: '工作区' }))
}

describe('Host home in the assembled browsing region', () => {
  it('keeps the fixed Workspace menu correct when Host home arrives late', async () => {
    const { runtime, remote } = await bench()
    remote.$host = { home: undefined, isLoopback: true }
    runtime.renderRoot()
    openPicker()
    expect(screen.getByRole('menuitem', { name: 'Project' })).toBeTruthy()
    expect(screen.queryByText('/home/u/Documents/project')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })

    remote.$host = { home: '/home/u', isLoopback: true }
    act(() => { runtime.ctx.emit('connection/reset') })
    openPicker()
    expect(screen.getByRole('menuitem', { name: 'Project' })).toBeTruthy()
    expect(screen.queryByText('~/Documents/project')).toBeNull()
  })
})
