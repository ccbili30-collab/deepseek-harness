/**
 * The sidebar's 工作台 entry glyph; the sidebar owns the button, label, and
 * selected state around it, mirroring the original desktop's BookOpenText
 * launcher rows.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the open-book glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns the icon element.
 */
export function WorkbenchPanelIcon({ size, active }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active === true ? 2.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6.5C10.4 4.9 8.2 4.2 5 4.2c-.6 0-1 .4-1 1v11.3c0 .6.4 1 1 1 3.2 0 5.4.7 7 2.3 1.6-1.6 3.8-2.3 7-2.3.6 0 1-.4 1-1V5.2c0-.6-.4-1-1-1-3.2 0-5.4.7-7 2.3Z" />
      <path d="M12 6.5v13.3" />
    </svg>
  )
}
