/** Reconcile the one audible owner with the current subject and focused canvas file. */
import { useEffect, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { NovenSubject } from './arrangement.ts'
import { useAppearance, useFocusedCanvasFile } from './appearance.tsx'
import { reconcileSoundtrack, stopSoundtrack } from './soundtrack.ts'

/** Inputs shared by the root appearance and playback effects. */
export interface SoundtrackEffectsInjected {
  readonly current: ObservableSnapshot<SessionId | undefined>
  readonly subject: ObservableSnapshot<NovenSubject>
}

/**
 * Move audio only when the current central binding actually changes.
 * @param props - Current Session and workbench subject observables.
 * @returns No DOM; the shared controller owns playback.
 */
export function SoundtrackEffects({ current, subject }: SoundtrackEffectsInjected) {
  const sessionId = useSyncExternalStore(current.subscribe, current.getSnapshot)
  const mode = useSyncExternalStore(subject.subscribe, subject.getSnapshot)
  const focusedFile = useFocusedCanvasFile()
  const filePath = mode === 'canvas' && focusedFile !== undefined && focusedFile.sessionId === sessionId ? focusedFile.path : undefined
  const appearance = useAppearance(sessionId, filePath)
  useEffect(() => {
    if (sessionId === undefined) {
      stopSoundtrack()
      return
    }
    if (appearance === undefined) return
    reconcileSoundtrack(
      { sessionId, filePath, workspaceRoot: appearance.workspaceRoot },
      mode === 'conversation' ? appearance.resolved.conversationTrack : appearance.resolved.canvasTrack,
      appearance.revision,
    )
  }, [sessionId, filePath, mode, appearance])
  useEffect(() => stopSoundtrack, [])
  return null
}
