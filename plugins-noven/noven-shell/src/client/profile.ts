/**
 * Local creator profile — the identity shown on 我的 and the sidebar foot.
 * There is no account backend yet, so edits persist in localStorage and the
 * `noven-profile` event lets mounted consumers (Me, FootLauncher) stay in sync.
 *
 * The profile starts empty: this product has no seeded account name, bio, or
 * portrait. The first storage version carried such defaults; v2 ignores it so
 * that seeded identity does not outlive the feature that introduced it.
 * @module noven-shell/client/profile
 */
import { asset } from './data.ts'

const KEY = 'noven-shell:profile:v2'
const EVENT = 'noven-profile'

/** Longest edge of a locally stored portrait, in CSS pixels. */
const AVATAR_EDGE = 512

export interface Profile {
  readonly name: string
  readonly bio: string
  readonly avatar: string
}

/** The blank identity a first visit starts from. */
export const DEFAULT_PROFILE: Profile = {
  name: '',
  bio: '',
  avatar: '',
}

/** Read the stored profile, falling back to blank per field. */
export function getProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<Profile>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : DEFAULT_PROFILE.name,
      bio: typeof parsed.bio === 'string' ? parsed.bio : DEFAULT_PROFILE.bio,
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : DEFAULT_PROFILE.avatar,
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

/** Resolved avatar URL for the profile; an empty string means "no portrait". */
export const profileAvatarUrl = (p: Profile): string =>
  p.avatar === '' ? '' : /^(?:data:|blob:|https?:)/.test(p.avatar) ? p.avatar : asset(p.avatar)

/**
 * Read a picked image into the profile's stored portrait: decode it, fit it
 * inside {@link AVATAR_EDGE}, and re-encode as JPEG so localStorage keeps a
 * bounded value.
 * @param file - the user's chosen image file.
 * @returns a data URL ready to store in `Profile.avatar`.
 */
export async function readAvatarFile(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result : '') }
    reader.onerror = () => { reject(reader.error ?? new Error('avatar read failed')) }
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => { resolve(element) }
    element.onerror = () => { reject(new Error('avatar decode failed')) }
    element.src = source
  })
  const edge = Math.max(image.naturalWidth, image.naturalHeight)
  if (edge === 0) return source
  const scale = Math.min(1, AVATAR_EDGE / edge)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (context === null) return source
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}
