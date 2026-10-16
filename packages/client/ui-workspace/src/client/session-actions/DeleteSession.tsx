/**
 * The permanent-deletion action: a `sidebar.workspaces.session.menu.item`
 * row offered only on archived Sessions, plus the `shell.overlay` dialog
 * that confirms one deletion request — single or bulk — before the Host
 * calls run. The requesting surface learns the outcome through the request
 * settlement (failed identities stay requested there) and the shared notice;
 * this entry owns no deletion behavior of its own.
 */
import { useState } from 'react'
import {
  Button, IconTrashOutlineRegular, MenuItemButton, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  DeleteSessionMenuInjected, SessionDeleteInjected, SessionDeleteProps, SessionMenuItemProps,
} from '../contract/slots.ts'
import browserCss from '../rows/WorkspaceBrowser.module.css'

/**
 * Menu row (order 500, own group): permanently delete an archived Session.
 * Absent on live rows — only the archive can be deleted, and only after the
 * shared confirmation.
 * @param props - owner share, the archived membership hook, and the shared request callback.
 * @returns the row, or null for an unarchived Session.
 */
export function DeleteSessionMenuItem({
  sessionId, useArchived, useMenuOpenState, requestDeleteSessions, t,
}: SessionMenuItemProps<DeleteSessionMenuInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const archived = useArchived(set => set.has(sessionId))
  if (!archived) return null
  return (
    <MenuItemButton
      danger
      separatorBefore
      icon={<IconTrashOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        void requestDeleteSessions([sessionId])
      }}
    >
      {t('delete.session')}
    </MenuItemButton>
  )
}

/**
 * The `shell.overlay` entry: nothing while no deletion is requested,
 * otherwise one dialog per request. Confirming runs the deletions through
 * the injected hop and settles the request once they settle; cancelling
 * settles it without deleting anything.
 * @param props - the request hook, its settlement, the deletion hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteDialog({
  useDeleteRequest, settleSessionDelete, deleteSessions, t,
}: SessionDeleteProps) {
  const request = useDeleteRequest(ids => ids)
  if (request === null) return null
  return (
    <DeleteConfirmForm
      key={request.map(String).join('\u0000')}
      request={request}
      settleSessionDelete={settleSessionDelete}
      deleteSessions={deleteSessions}
      t={t}
    />
  )
}

/** One request's dialog: in-flight state dies with it. */
function DeleteConfirmForm({ request, settleSessionDelete, deleteSessions, t }: {
  request: readonly SessionId[]
  settleSessionDelete: SessionDeleteInjected['settleSessionDelete']
  deleteSessions: SessionDeleteInjected['deleteSessions']
  t: SessionDeleteProps['t']
}) {
  const [deleting, setDeleting] = useState(false)
  const close = () => {
    if (deleting) return
    settleSessionDelete()
  }
  const confirm = () => {
    if (deleting) return
    setDeleting(true)
    // The hop settles the requesting surface with the failures; this dialog
    // consumes the request itself, which unmounts the form.
    void deleteSessions().then(() => {
      setDeleting(false)
      settleSessionDelete()
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('delete.session.title')}
      description={t('delete.session.desc', { n: request.length })}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={close}>{t('cancel')}</Button>
          <Button
            variant="outline"
            className={browserCss.deleteAction}
            disabled={deleting}
            onClick={confirm}
          >
            {t('delete.session')}
          </Button>
        </>
      )}
    >
      {deleting && <div className={browserCss.deleteStatus} role="status">{t('delete.session.pending')}</div>}
    </Modal>
  )
}
