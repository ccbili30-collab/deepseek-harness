/** One application-wide audio owner for Session and file-bound soundtracks. */
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** A resolved audio asset with independent playback preferences. */
export interface ResolvedSoundtrack {
  readonly kind: 'asset'
  readonly path: string
  readonly source?: 'global'
  readonly volume?: number
  readonly loop?: boolean
}

/** The central object that owns a resolved soundtrack. */
export interface SoundtrackOwner {
  readonly sessionId: SessionId
  readonly filePath?: string
}

/** Transient playback state; never persisted into an appearance or Session document. */
export interface SoundtrackPlayback {
  readonly status: 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  readonly owner?: SoundtrackOwner
  readonly track?: ResolvedSoundtrack
  readonly revision: number
  readonly error?: string
}

interface ActiveAudio {
  readonly element: HTMLAudioElement
  readonly generation: number
}

function sameOwner(left: SoundtrackOwner | undefined, right: SoundtrackOwner): boolean {
  return left?.sessionId === right.sessionId && left.filePath === right.filePath
}

function sameTrack(left: ResolvedSoundtrack | undefined, leftRevision: number, right: ResolvedSoundtrack, rightRevision: number): boolean {
  return left?.path === right.path && left.source === right.source && leftRevision === rightRevision
}

/** Authenticated URL for one project or application audio asset. */
export function soundtrackAssetUrl(sessionId: SessionId, track: ResolvedSoundtrack, revision: number): string {
  const query = new URLSearchParams(track.source === 'global'
    ? { session: sessionId, id: track.path, revision: String(revision) }
    : { session: sessionId, path: track.path, revision: String(revision) })
  return `api/noven-appearance/${track.source === 'global' ? 'global-audio-asset' : 'audio-asset'}?${query.toString()}`
}

class SoundtrackController {
  private snapshot: SoundtrackPlayback = { status: 'idle', revision: 0 }
  private readonly listeners = new Set<() => void>()
  private active: ActiveAudio | undefined
  private generation = 0
  private hasStarted = false
  private userPaused = false

  readonly getSnapshot = (): SoundtrackPlayback => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(snapshot: SoundtrackPlayback): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }

  private stopAudio(): void {
    const active = this.active
    this.active = undefined
    if (active === undefined) return
    const { element } = active
    const initialVolume = element.volume
    let step = 0
    const fade = (): void => {
      step += 1
      element.volume = initialVolume * Math.max(0, 1 - step / 4)
      if (step < 4) {
        window.setTimeout(fade, 25)
        return
      }
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
    fade()
  }

  stop(status: 'idle' | 'paused', owner?: SoundtrackOwner, track?: ResolvedSoundtrack, revision = 0): void {
    this.generation += 1
    this.stopAudio()
    this.publish(status === 'paused' ? { status, owner, track, revision } : { status, revision })
  }

  private async play(owner: SoundtrackOwner, track: ResolvedSoundtrack, revision: number): Promise<void> {
    const generation = ++this.generation
    this.stopAudio()
    this.publish({ status: 'loading', owner, track, revision })
    const element = new Audio(soundtrackAssetUrl(owner.sessionId, track, revision))
    element.loop = track.loop ?? true
    element.volume = track.volume ?? 0.4
    element.preload = 'auto'
    this.active = { element, generation }
    element.onended = () => {
      if (this.generation === generation && !element.loop) this.stop('paused', owner, track, revision)
    }
    try {
      await element.play()
      if (this.generation !== generation) {
        element.pause()
        return
      }
      this.publish({ status: 'playing', owner, track, revision })
    } catch (error: unknown) {
      if (this.generation !== generation) return
      this.userPaused = true
      this.publish({
        status: 'error',
        owner,
        track,
        revision,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Toggle a soundtrack from an explicit user action on a title. */
  toggle(owner: SoundtrackOwner, track: ResolvedSoundtrack, revision: number): void {
    if (this.snapshot.status === 'playing' && sameOwner(this.snapshot.owner, owner)
      && sameTrack(this.snapshot.track, this.snapshot.revision, track, revision)) {
      this.userPaused = true
      this.stop('paused', owner, track, revision)
      return
    }
    this.userPaused = false
    this.hasStarted = true
    void this.play(owner, track, revision)
  }

  /** Reconcile the current central object without allowing overlapping audio. */
  reconcile(owner: SoundtrackOwner, track: ResolvedSoundtrack | null, revision: number): void {
    if (this.snapshot.owner === undefined) return
    if (track !== null && this.snapshot.status !== 'idle' && this.snapshot.status !== 'paused'
      && sameTrack(this.snapshot.track, this.snapshot.revision, track, revision)) {
      if (!sameOwner(this.snapshot.owner, owner)) this.publish({ ...this.snapshot, owner, revision })
      return
    }
    this.stop('idle')
    if (track !== null && this.hasStarted && !this.userPaused) void this.play(owner, track, revision)
  }

  /** Reset playback and user intent when the owning plugin is disposed. */
  dispose(): void {
    this.generation += 1
    this.stopAudio()
    this.hasStarted = false
    this.userPaused = false
    this.snapshot = { status: 'idle', revision: 0 }
    for (const listener of [...this.listeners]) listener()
  }
}

const controller = new SoundtrackController()

/** Access the single application playback snapshot. */
export function useSoundtrackPlayback(): SoundtrackPlayback {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}

/** Toggle one title's bound soundtrack from a user gesture. */
export function toggleSoundtrack(owner: SoundtrackOwner, track: ResolvedSoundtrack, revision: number): void {
  controller.toggle(owner, track, revision)
}

/** Move the audible owner to the current Session or focused canvas file. */
export function reconcileSoundtrack(owner: SoundtrackOwner, track: ResolvedSoundtrack | null, revision: number): void {
  controller.reconcile(owner, track, revision)
}

/** Stop the current audio when its owning Session or plugin disappears. */
export function stopSoundtrack(): void {
  controller.stop('idle')
}

/** Reset all playback state on plugin teardown or an isolated test reset. */
export function disposeSoundtrack(): void {
  controller.dispose()
}

/** Compare title state with the actual audible owner and asset revision. */
export function isSoundtrackPlaying(snapshot: SoundtrackPlayback, owner: SoundtrackOwner, track: ResolvedSoundtrack, revision: number): boolean {
  return snapshot.status === 'playing' && sameOwner(snapshot.owner, owner) && sameTrack(snapshot.track, snapshot.revision, track, revision)
}
