/**
 * The workbench image viewer — an editor-pane occupant claiming the image
 * extensions above the sidebar's built-in one, adding the ported annotation
 * overlay and canvas color picker on top of plain viewing. Coordinates ride
 * the sidecar contract (fractions of the image), so annotations survive
 * resize and re-open.
 * @module noven-workbench/client/NovenImageViewer
 */
import type { ReactNode } from 'react'
import type { FileViewerProps } from 'dsh-better-sidebar/client/service'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ImageStage } from './ImageStage.tsx'
import type { ImageStageTranslate } from './ImageStage.tsx'
import type { WorkbenchApi } from './api.ts'

/** What the viewer component binds beyond the sidebar's own props. */
export interface NovenImageViewerProps extends FileViewerProps {
  readonly api: WorkbenchApi
  readonly t: ImageStageTranslate
}

/**
 * Render the staged image with its three modes.
 * @param props - the viewer's props (path, mediaUrl, scope), plus this plugin's API face and copy.
 * @returns the viewer, or a fallback note when the session context is missing.
 */
export function NovenImageViewer(props: NovenImageViewerProps): ReactNode {
  const { t, api, scope, path, mediaUrl } = props
  if (mediaUrl === undefined || scope.cwd === undefined) {
    return <div className="noven-wb-stage"><span className="noven-wb-note">{t('viewer.unavailable')}</span></div>
  }
  const root = scope.cwd.replace(/\/+$/, '')
  const rel = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
  return (
    <ImageStage
      t={t}
      sessionId={scope.sessionId as SessionId}
      imageRel={rel}
      url={mediaUrl}
      api={api}
      onClose={() => {}}
    />
  )
}
