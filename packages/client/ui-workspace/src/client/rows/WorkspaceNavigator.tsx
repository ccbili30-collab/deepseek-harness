/**
 * Current-Workspace navigation for the sidebar. The Workspace selector stays
 * outside the product content seat, so Agent Session navigation and IDE content
 * navigation share the same fixed control in wide and rail presentations.
 */
import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconChevronDownOutlineRegular, IconClockOutlineRegular, IconFolderCloseRegular,
  IconQueueOutlineRegular, Menu, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { WorkspaceNavigatorProps } from '../contract/slots.ts'
import {
  deriveFlat, derivePinned, orderByRecency, pinCurrentBlank, reconcileManualOrder,
  type SessionNode, type SessionRowState,
} from '../tree.ts'
import { WorkspacePickFlow } from '../WorkspacePicker.tsx'
import { SessionNodeItem } from './Rows.tsx'
import css from './WorkspaceNavigator.module.css'

type AgentFallbackProps = Pick<
  WorkspaceNavigatorProps,
  'wide' | 'open' | 'requestSessionRename' | 'renderSlot' | 't'
> & {
  /** Current-Workspace rows in their established pin and account order. */
  rows: readonly SessionNode[]
  /** Main Session identity, when one is retained. */
  currentId: SessionId | undefined
}

/** Agent fallback: full Session rows when wide, a Session menu on the rail. */
function AgentSessionFallback({ wide, rows, currentId, open, requestSessionRename, renderSlot, t }: AgentFallbackProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  if (!wide) {
    return (
      <div className={css.railSessions}>
        <Menu
          open={menuOpen && rows.length > 0}
          onClose={() => { setMenuOpen(false) }}
          items={rows.map(row => ({
            id: row.id,
            label: row.blank ? t('session.new') : row.title,
            icon: <IconQueueOutlineRegular size={16} />,
          }))}
          selectedId={currentId}
          onSelect={(id) => {
            open(id as SessionId)
            setMenuOpen(false)
          }}
          side="right"
          portal
          dense
          listClassName={css.sessionMenu}
          anchor={(
            <Tooltip label={t('section.sessions')} side="right" delayMs={500}>
              <button
                type="button"
                className={css.railSessionButton}
                data-session-trigger
                aria-label={t('section.sessions')}
                aria-expanded={menuOpen}
                disabled={rows.length === 0}
                onClick={() => { setMenuOpen(value => !value) }}
              >
                <IconClockOutlineRegular size={18} />
              </button>
            </Tooltip>
          )}
        />
      </div>
    )
  }
  const now = Date.now()
  return (
    <div className={css.sessionList} role="tree" aria-label={t('section.sessions')}>
      {rows.length === 0 && <div className={css.empty}>{t('empty.none')}</div>}
      {rows.map(node => (
        <SessionNodeItem
          key={node.id}
          node={node}
          currentId={currentId}
          now={now}
          onOpen={open}
          onRenameRequest={requestSessionRename}
          renderSlot={renderSlot}
          t={t}
        />
      ))}
    </div>
  )
}

/**
 * Render the fixed Workspace selector and the current content navigation.
 * @param props - composed slot props narrowed to this navigator's needs.
 * @returns the sidebar navigation region.
 */
export function WorkspaceNavigator({
  wide,
  expandSidebar,
  useSessions,
  useSessionStatus,
  useWorkspaces,
  useStore,
  open,
  switchWorkspace,
  requestSessionRename,
  createWorkspace,
  useDirectoryFlow,
  renderSlot,
  t,
}: WorkspaceNavigatorProps) {
  const list = useSessions(state => state)
  const statuses = useSessionStatus(state => state)
  const storedWorkspaces = useWorkspaces(state => state.items)
  const archivedSessionIds = useWorkspaces(state => state.archivedSessionIds)
  const pinnedSessionIds = useWorkspaces(state => state.pinnedSessionIds)
  const orderBy = useStore(state => state.orderBy)
  const sessionOrderByAccount = useStore(state => state.sessionOrderByAccount)
  const defaultWorkspaceName = t('workspace.defaultName')
  const workspaces = useMemo(
    () => storedWorkspaces.map(workspace => ({
      ...workspace,
      title: workspaceDisplayTitle(workspace.title, defaultWorkspaceName),
    })),
    [storedWorkspaces, defaultWorkspaceName],
  )
  const mainSession = useMemo(
    () => Object.values(list.byId).find(session => (session.retainedBy.mainView ?? 0) > 0),
    [list.byId],
  )
  const currentWorkspace = useMemo(() => {
    if (mainSession === undefined) return undefined
    return workspaces.find(workspace => workspace.sessionIds.includes(mainSession.id))
      ?? workspaces.find(workspace => mainSession.cwd !== undefined && workspace.path === mainSession.cwd)
  }, [mainSession, workspaces])
  const rowState = useMemo<SessionRowState>(() => ({
    pinnedSessionIds,
    archivedSessionIds,
    archivedFilter: 'default',
  }), [archivedSessionIds, pinnedSessionIds])
  const memberIds = useMemo(() => {
    if (currentWorkspace === undefined) return []
    const members = new Set(currentWorkspace.sessionIds)
    return list.ids.filter((id) => {
      const session = list.byId[id]
      return session !== undefined
        && (members.has(id) || (session.cwd !== undefined && session.cwd === currentWorkspace.path))
    })
  }, [currentWorkspace, list.byId, list.ids])
  const orderedIds = useMemo(() => {
    if (currentWorkspace === undefined) return []
    const baseOrder = orderBy === 'updated'
      ? orderByRecency(memberIds, list.byId)
      : reconcileManualOrder(
        memberIds,
        sessionOrderByAccount[currentWorkspace.workspaceId],
        list.byId,
        rowState,
      )
    return pinCurrentBlank(baseOrder, mainSession?.blank === true ? mainSession.id : undefined)
  }, [currentWorkspace, list.byId, mainSession, memberIds, orderBy, rowState, sessionOrderByAccount])
  const rows = useMemo(() => {
    const members = new Set(orderedIds)
    const pinned = derivePinned(list, rowState, statuses).filter(row => members.has(row.id))
    return [...pinned, ...deriveFlat(list, orderedIds, rowState, statuses)]
  }, [list, orderedIds, rowState, statuses])

  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerAnchor = useRef<HTMLButtonElement>(null)
  const pickerButton = (
    <button
      ref={pickerAnchor}
      type="button"
      className={css.workspaceTrigger}
      data-workspace-trigger
      aria-label={wide ? undefined : t('section.workspaces')}
      aria-expanded={pickerOpen}
      aria-haspopup="menu"
      onClick={() => { setPickerOpen(value => !value) }}
    >
      <IconFolderCloseRegular size={wide ? 16 : 18} />
      {wide && <span className={css.workspaceTitle}>{currentWorkspace?.title ?? t('section.workspaces')}</span>}
      {wide && <IconChevronDownOutlineRegular size={14} />}
    </button>
  )
  const fallback = (
    <AgentSessionFallback
      key={wide ? 'wide' : 'rail'}
      wide={wide}
      rows={rows}
      currentId={mainSession?.id}
      open={open}
      requestSessionRename={requestSessionRename}
      renderSlot={renderSlot}
      t={t}
    />
  )
  return (
    <div className={clsx(css.root, !wide && css.rail)}>
      <div className={css.workspacePicker}>
        {wide
          ? pickerButton
          : <Tooltip label={t('section.workspaces')} side="right" delayMs={500}>{pickerButton}</Tooltip>}
        <WorkspacePickFlow
          t={t}
          open={pickerOpen}
          anchorRef={pickerAnchor}
          useWorkspaces={useWorkspaces}
          createWorkspace={createWorkspace}
          useDirectoryFlow={useDirectoryFlow}
          renderDirectoryFlow={owner => renderSlot('sidebar.workspaces.directoryFlow', owner)}
          selectedId={currentWorkspace?.workspaceId}
          onPick={(workspaceId) => {
            setPickerOpen(false)
            switchWorkspace(workspaceId)
          }}
          onClose={() => { setPickerOpen(false) }}
          side={wide ? 'bottom' : 'right'}
        />
      </div>
      <div className={css.content} data-workspace-content>
        {mainSession === undefined ? fallback : renderSlot('sidebar.workspaces.content', { wide, expandSidebar }, { fallback })}
      </div>
    </div>
  )
}
