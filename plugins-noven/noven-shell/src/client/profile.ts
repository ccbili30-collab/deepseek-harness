/**
 * Local creator profile — the identity shown on 我的 and the sidebar foot.
 * There is no account backend yet, so edits persist in localStorage and the
 * `noven-profile` event lets mounted consumers (Me, FootLauncher) stay in sync.
 * @module noven-shell/client/profile
 */
import { asset } from './data.ts'

const KEY = 'noven-shell:profile'
const EVENT = 'noven-profile'

export interface Profile {
  readonly name: string
  readonly bio: string
  readonly avatar: string
}

/** Preset avatars the profile picture cycles through on click. */
export const AVATARS: readonly string[] = ['avatar-shenyan.webp', 'avatar-yunhe.webp', 'cover-achi.webp']

export const DEFAULT_PROFILE: Profile = {
  name: '山也',
  bio: '',
  avatar: 'avatar-shenyan.webp',
}

/** Read the stored profile, falling back to defaults per field. */
export function getProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<Profile>
    return {
      name: typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : DEFAULT_PROFILE.name,
      bio: typeof parsed.bio === 'string' ? parsed.bio : DEFAULT_PROFILE.bio,
      avatar: typeof parsed.avatar === 'string' && AVATARS.includes(parsed.avatar) ? parsed.avatar : DEFAULT_PROFILE.avatar,
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

/** Persist a profile patch and notify mounted consumers. */
export function setProfile(patch: Partial<Profile>): void {
  const next = { ...getProfile(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* storage unavailable — profile stays session-local */ }
  window.dispatchEvent(new Event(EVENT))
}

/** Subscribe to profile changes; returns the unsubscribe. */
export function onProfileChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => { window.removeEventListener(EVENT, listener) }
}

/** Resolved avatar URL for the profile. */
export const profileAvatarUrl = (p: Profile): string => asset(p.avatar)
