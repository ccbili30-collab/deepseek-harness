/** Select the fixed product navigator or the complete Session browser from one navigation state. */
import type { WorkspaceBrowserProps, WorkspaceNavigatorProps } from '../contract/slots.ts'
import { WorkspaceBrowser } from './WorkspaceBrowser.tsx'
import { WorkspaceNavigator } from './WorkspaceNavigator.tsx'

/** Composed navigation props; the complete browser is the action superset. */
export type WorkspaceNavigationProps = WorkspaceBrowserProps & WorkspaceNavigatorProps

/**
 * Render the fixed Workspace navigator for an active Session, or the complete
 * browser when no main Session exists or temporary Session navigation is open.
 * @param props - Shared browser and navigator hooks, actions, store, and locale.
 * @returns The single active navigation surface.
 */
export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  const hasMainSession = props.useSessions(state =>
    Object.values(state.byId).some(session => (session.retainedBy.mainView ?? 0) > 0))
  const temporaryBrowser = props.useSessionBrowser(state => state)
  return hasMainSession && !temporaryBrowser
    ? <WorkspaceNavigator {...props} />
    : <WorkspaceBrowser {...props} />
}
