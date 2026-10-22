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
        <FootAvatar src={profileAvatarUrl(profile)} />
      </button>
    )
  }
  return (
    <div className="nv-foot">
      <button type="button" className="nv-foot-user" onClick={openMy}>
        <FootAvatar src={profileAvatarUrl(profile)} />
        <span className="nv-foot-name">{profile.name}</span>
      </button>
      <button type="button" className="nv-iconbtn nv-foot-gear" aria-label={t('side.settings')} onClick={openSettings}>
        {glyph.gear(16)}
      </button>
    </div>
  )
}

/**
 * The foot avatar: a round image while it decodes, an empty circle when the
 * profile has no portrait — no invented initial stands in for identity.
 */
function FootAvatar({ src }: { readonly src: string }) {
  const [broken, setBroken] = useState(false)
  if (src === '' || broken) return <span className="nv-foot-avatar nv-foot-avatar-empty" aria-hidden />
  return <img className="nv-foot-avatar" src={src} alt="" onError={() => { setBroken(true) }} />
}
