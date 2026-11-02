/** Global appearance settings page hosted by the shared settings modal. */
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ShellT } from '../pages/Home.tsx'
import { AppearanceSection } from './AppearanceSection.tsx'

interface Props {
  readonly t: ShellT
  readonly current: ObservableSnapshot<SessionId | undefined>
}

/**
 * Render global appearance controls for the current Session's workspace.
 * @param props - Localized translator and current Session observable.
 * @returns The global appearance page, or null while no Session is active.
 */
export function AppearanceSettingsSection({ t, current }: Props) {
  const sessionId = useSyncExternalStore(current.subscribe, current.getSnapshot, current.getSnapshot)
  return sessionId === undefined ? null : <AppearanceSection sessionId={sessionId} t={t} />
}
