/**
 * Noven application mark, shared with the packaged desktop icon.
 */
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Render the packaged Noven application icon at the host-requested size. */
export function NovenMark({ size }: SidebarBrandMarkOwnerProps) {
  return <img src="/api/noven-assets?name=noven-icon.png" width={size} height={size} alt="Noven" style={{ display: 'block' }} />
}
