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
  /** Canonical root from the appearance response, never inferred from a UI pane. */
  readonly workspaceRoot?: string
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
  timer?: number
}

function sameOwner(left: SoundtrackOwner | undefined, right: SoundtrackOwner): boolean {
  return left?.sessionId === right.sessionId && left.filePath === right.filePath
}

function sameTrack(leftOwner: SoundtrackOwner | undefined, left: ResolvedSoundtrack | undefined, rightOwner: SoundtrackOwner, right: ResolvedSoundtrack): boolean {
  if (left?.path !== right.path || left.source !== right.source) return false
  if (right.source === 'global') return true
  if (leftOwner?.workspaceRoot !== undefined && rightOwner.workspaceRoot !== undefined) {
    return leftOwner.workspaceRoot === rightOwner.workspaceRoot
  }
  return leftOwner?.sessionId === rightOwner.sessionId
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
  private readonly retiring = new Set<ActiveAudio>()
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

  private fade(active: ActiveAudio, finish: () => void): void {
    if (active.timer !== undefined) window.clearTimeout(active.timer)
    const { element } = active
    const initialVolume = element.volume
    let step = 0
    const fade = (): void => {
      step += 1
      element.volume = initialVolume * Math.max(0, 1 - step / 4)
      if (step < 4) {
        active.timer = window.setTimeout(fade, 25)
        return
      }
      active.timer = undefined
      finish()
    }
    fade()
  }

  private release(active: ActiveAudio): void {
    if (active.timer !== undefined) window.clearTimeout(active.timer)
    active.element.onended = null
    active.element.pause()
    active.element.removeAttribute('src')
    active.element.load()
    this.retiring.delete(active)
  }

  private stopAudio(): void {
    const active = this.active
    this.active = undefined
    if (active === undefined) return
    this.retiring.add(active)
    this.fade(active, () => { this.release(active) })
  }

  private preferences(active: ActiveAudio, track: ResolvedSoundtrack): void {
    active.element.loop = track.loop ?? true
    active.element.volume = track.volume ?? 0.4
  }

  stop(status: 'idle' | 'paused', owner?: SoundtrackOwner, track?: ResolvedSoundtrack, revision = 0): void {
    this.generation += 1
    if (status === 'paused' && this.active !== undefined) {
      const active = this.active
      this.fade(active, () => { active.element.pause() })
    } else this.stopAudio()
    this.publish(status === 'paused' ? { status, owner, track, revision } : { status, revision })
  }

  private async play(owner: SoundtrackOwner, track: ResolvedSoundtrack, revision: number): Promise<void> {
    const generation = ++this.generation
    if (!sameTrack(this.snapshot.owner, this.snapshot.track, owner, track)) this.stopAudio()
    const active = this.active ?? { element: new Audio(soundtrackAssetUrl(owner.sessionId, track, revision)) }
    if (active.timer !== undefined) {
      window.clearTimeout(active.timer)
      active.timer = undefined
    }
    this.preferences(active, track)
    this.active = active
    this.publish({ status: 'loading', owner, track, revision })
    const { element } = active
    element.preload = 'auto'
    element.onended = () => {
      if (this.active === active && !element.loop) {
        this.userPaused = true
        this.stop('paused', this.snapshot.owner, this.snapshot.track, this.snapshot.revision)
      }
    }
    try {
      await element.play()
      if (this.generation !== generation) {
        if (this.active !== active) element.pause()
        return
      }
      this.publish({ ...this.snapshot, status: 'playing' })
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
      && sameTrack(this.snapshot.owner, this.snapshot.track, owner, track)) {
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
    if (track !== null && this.snapshot.status !== 'idle'
      && sameTrack(this.snapshot.owner, this.snapshot.track, owner, track)) {
      if (this.active !== undefined && this.active.timer === undefined) this.preferences(this.active, track)
      this.publish({ ...this.snapshot, owner, track, revision })
      return
    }
    this.stop('idle')
    if (track !== null && this.hasStarted && !this.userPaused) void this.play(owner, track, revision)
  }

  /** Reset playback and user intent when the owning plugin is disposed. */
  dispose(): void {
    this.generation += 1
    if (this.active !== undefined) this.release(this.active)
    this.active = undefined
    for (const active of this.retiring) this.release(active)
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

/** Compare title state with the audible object and resource; revision only versions the fetch URL. */
export function isSoundtrackPlaying(snapshot: SoundtrackPlayback, owner: SoundtrackOwner, track: ResolvedSoundtrack, _revision: number): boolean {
  return snapshot.status === 'playing' && sameOwner(snapshot.owner, owner) && sameTrack(snapshot.owner, snapshot.track, owner, track)
}
