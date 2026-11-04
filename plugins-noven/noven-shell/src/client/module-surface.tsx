/**
 * A module's display-only surface. The card page supplies editing and navigation
 * to ModuleBox itself; conversation and other embedders supply only this data
 * face, so page commands cannot leak into an inline module.
 * @module noven-shell/client/module-surface
 */
import type { ReactNode } from 'react'
import { ModuleBox, type ModuleBoxProps, type ModuleWriteCapabilities } from './card-page.tsx'

/** Everything needed to display a module, without any card-page command. */
export type ModuleSurfaceProps = Omit<ModuleBoxProps,
  keyof ModuleWriteCapabilities | 'locked' | 'readOnly' | 'fill' | 'onOpenCard' | 'onOpenModule' | 'onOpenFile'>

/**
 * Render the same module body used by the card page in display-only mode.
 * @param props - Module data and read-only resource loaders.
 * @returns The module without child-page links, editing chrome, or navigation commands.
 */
export function ModuleSurface(props: ModuleSurfaceProps): ReactNode {
  return (
    <div className="nv-module-surface" data-module-surface={props.module.widget?.type ?? 'document'}>
      <ModuleBox {...props} readOnly fill />
    </div>
  )
}
