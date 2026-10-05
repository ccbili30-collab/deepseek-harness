/**
 * 会话顶栏卡片标签 — the 项目 / 背景 / 管理 chips on the conversation header
 * (design 01b). They read the session's mounted card context from
 * `/api/noven-bindings`; clicking opens the 本会话 rail tab where the context
 * is managed. A session with nothing mounted shows just its project chip.
 * @module noven-shell/client/tabs/HeaderChips
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { BindingState } from '../bindings-api.ts'
import type { NovenShellLocaleKey } from '../locales.ts'

/** Injected face: the current session's binding plus the rail-tab opener. */
export interface HeaderChipsInjected {
  readonly hooks: { readonly binding: ObservableSnapshot<BindingState | undefined> }
  readonly openContext: () => void
}

type Props = PropsRuntime<'conversation.session.header.actions'>
  & InjectFace<HeaderChipsInjected>
  & PropsLocale<'novenShell'>

export function HeaderChips({ useSession, useSessions, useBinding, openContext, t }: Props) {
  const sessionId = useSession(s => s.sessionId)
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const binding = useBinding(s => s)
  const project = cwd === undefined ? undefined : cwd.split('/').filter(Boolean).pop()
  const cards = binding?.cards ?? {}
  const b = binding?.binding
  const chip = (label: string) => (
    <button key={label} type="button" className="nv-hchip" onClick={openContext}>{label}</button>
  )
  const chips: React.ReactNode[] = []
  if (project !== undefined) chips.push(chip(`${t('chip.project')} · ${project}`))
  const background = b?.backgroundCardIds.map(id => cards[id]?.name).find(n => n !== undefined)
  if (background !== undefined) chips.push(chip(`${t('chip.background')} · ${background}`))
  const managed = b?.managed === undefined ? undefined : cards[b.managed.cardId]?.name ?? b.managed.cardId
  if (managed !== undefined) chips.push(chip(`${t('chip.managed')} · ${managed}`))
  if (chips.length === 0) return null
  return <>{chips}</>
}
