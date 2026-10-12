/** Browser plugin owning Session export download state and its shared modal. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-message-feedback/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionLogDownloadController } from './controller.ts'
import { SessionLogDownloadHeaderAction, type SessionLogDownloadHeaderInjected } from './HeaderAction.tsx'
import { en, NS, zh, type SessionLogDownloadKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLogDownload: SessionLogDownloadController
  }
}

/** Open-state pair the header "more" menu hands each contributed row as hookContext. */
export type HeaderMoreMenuOpenState = readonly [open: boolean, setOpen: (open: boolean) => void]

/** Hook a contributed row calls to read and set that open state. */
export type UseHeaderMoreMenuOpenState = () => HeaderMoreMenuOpenState

/**
 * Bind the render occurrence's open-state pair into the rows' `useMenuOpenState` hook.
 * @param _standard - framework standard props (unused).
 * @param state - the menu's open-state pair from the render occurrence.
 * @returns the hook the entry calls.
 */
export const headerMoreMenuOpenStateFactory: SlotHookFactory<'conversation.session.header.more.item', UseHeaderMoreMenuOpenState> =
  (_standard, state) => () => state

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-log-download': SessionLogDownloadKey
  }
  interface SlotMap {
    /**
     * Rows appended after the Session header "..." menu's shipped items, in
     * ascending `order`. Each entry renders one `role="menuitem"` `<button>`
     * (ui-primitives' `MenuItemButton` carries the host styling) and dismisses
     * the menu through the injected `useMenuOpenState` hook after acting.
     */
    'conversation.session.header.more.item': {
      kind: 'list'
      scope: 'session'
      hookContext: HeaderMoreMenuOpenState
      inject: { hooks: {
        menuOpenState: SlotHookFactory<'conversation.session.header.more.item', UseHeaderMoreMenuOpenState>
      } }
    }
  }
}

export type { SessionLogDownloadEntry, SessionLogDownloadState } from './controller.ts'

export const inject = ['slots', 'locale']

/**
 * Provide the download controller and mount its modal into the Session Header.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new SessionLogDownloadController()
  ctx.provide('sessionLogDownload', controller)
  ctx.effect(() => async () => { await controller.dispose() }, 'session-log-download: browser download lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-log-download: browser dictionaries')
  const feedbackAvailable = createSnapshotStore(false)
  ctx.inject(['feedbackUi'], (scope: ClientContext) => {
    scope.effect(() => {
      feedbackAvailable.set(true)
      return () => { feedbackAvailable.set(false) }
    }, 'session-log-download: feedback availability')
  })
  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (commandName === 'export' && result.kind === 'success') void controller.download(sessionId)
  })
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'session-log-download',
    locale: NS,
    // Contributed rows bind the menu's open state from the render occurrence
    // (the header action passes the state pair as hookContext).
    children: {
      'conversation.session.header.more.item': {
        kind: 'list', scope: 'session',
        inject: { hooks: { menuOpenState: headerMoreMenuOpenStateFactory } },
      },
    },
    inject: (): SessionLogDownloadHeaderInjected => ({
      hooks: { sessionLogDownload: controller.store, feedbackAvailable },
      request: (sessionId: SessionId) => controller.download(sessionId),
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
      // The feedback plugin can unload between the menu render and this click.
      openFeedback: (sessionId: SessionId) => { ctx.get('feedbackUi')?.openSession(sessionId) },
    }),
  }, SessionLogDownloadHeaderAction))
}

export type { SessionLogDownloadDialogInjected, SessionLogDownloadDialogProps } from './Dialog.tsx'
