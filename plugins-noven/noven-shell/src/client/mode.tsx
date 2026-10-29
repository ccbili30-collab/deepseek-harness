/** The fixed Agent / Handcraft switch; no navigation or content operation lives here. */
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createNovenModeStore } from './arrangement.ts'
import { glyph } from './icons.tsx'

/** Props supplied by the sidebar footer seat and the application-wide mode store. */
export type NovenModeSwitchProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'novenShell'>
  & PropsStore<ReturnType<typeof createNovenModeStore>>
  & { readonly side?: 'right' | 'bottom'; readonly onMode: (mode: import('./arrangement.ts').NovenMode) => void }

/**
 * Toggle the only product-owned page mode without changing Session or Canvas content.
 * @param props - Sidebar width, locale and the global mode store.
 * @returns One fixed Agent / Handcraft button.
 */
export function NovenModeSwitch({ wide, useStore, onMode, t, side = 'right' }: NovenModeSwitchProps) {
  const mode = useStore(state => state.mode)
  const label = t(mode === 'agent' ? 'mode.toIde' : 'mode.toAgent')
  return (
    <Tooltip label={label} side={side} delayMs={400}>
      <button type="button" className={`nv-mode-switch${wide ? '' : ' nv-mode-switch-rail'}`}
        aria-label={label} aria-pressed={mode === 'ide'}
        onClick={() => { onMode(mode === 'agent' ? 'ide' : 'agent') }}>
        <span className="nv-mode-switch-icon" aria-hidden="true">{mode === 'agent' ? glyph.layers(16) : glyph.sparkle(16)}</span>
        {wide && <span className="nv-mode-switch-label">{label}</span>}
      </button>
    </Tooltip>
  )
}

/** Props for the macOS hidden-sidebar recovery seat. */
export type NovenLeadingModeSwitchProps =
  PropsRuntime<'shell.leading.action'>
  & PropsLocale<'novenShell'>
  & PropsStore<ReturnType<typeof createNovenModeStore>>
  & { readonly onMode: (mode: import('./arrangement.ts').NovenMode) => void }

/**
 * Keep the mode switch reachable when macOS hides the whole sidebar.
 * @param props - Leading-seat runtime, locale and the same global mode store.
 * @returns The compact titlebar mode switch.
 */
export function NovenLeadingModeSwitch(props: NovenLeadingModeSwitchProps) {
  return <span className="nv-leading-mode"><NovenModeSwitch {...props} wide={false} side="bottom" /></span>
}
