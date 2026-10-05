/**
 * Left-column occupants: `settings.launcher` carries the account row.
 * The session/project list is upstream WorkspaceBrowser's job——noven 不自研这一区。
 * @module noven-shell/client/sidebar
 */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'
import { getProfile, onProfileChange, profileAvatarUrl } from './profile.ts'

/** Footer-row inject face: open the 我的 panel from the avatar half. */
export interface FootLauncherInjected {
  readonly openMy: () => void
}

export type FootLauncherProps =
  PropsRuntime<'settings.launcher'> & InjectFace<FootLauncherInjected> & PropsLocale<'novenShell'>

/** Sidebar foot: avatar + user name on the left, settings gear on the right. */
export function FootLauncher({ wide, openSettings, openMy, t }: FootLauncherProps) {
  const [profile, setProfile] = useState(getProfile)
  useEffect(() => onProfileChange(() => { setProfile(getProfile()) }), [])
  if (!wide) {
    return (
      <button type="button" className="nv-foot-rail" onClick={openSettings} aria-label={t('side.settings')}>
        <FootAvatar src={profileAvatarUrl(profile)} name={profile.name} />
      </button>
    )
  }
  return (
    <div className="nv-foot">
      <button type="button" className="nv-foot-user" onClick={openMy}>
        <FootAvatar src={profileAvatarUrl(profile)} name={profile.name} />
        <span className="nv-foot-name">{profile.name}</span>
      </button>
      <button type="button" className="nv-iconbtn nv-foot-gear" aria-label={t('side.settings')} onClick={openSettings}>
        {glyph.gear(16)}
      </button>
    </div>
  )
}

/**
 * The foot avatar: a round image while it decodes, a mint letter circle when
 * it cannot — a failed asset never leaves a broken square on the rail.
 */
function FootAvatar({ src, name }: { readonly src: string; readonly name: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <span className="nv-foot-avatar nv-foot-avatar-fallback" aria-hidden>{name.slice(0, 1)}</span>
  return <img className="nv-foot-avatar" src={src} alt="" onError={() => { setBroken(true) }} />
}
