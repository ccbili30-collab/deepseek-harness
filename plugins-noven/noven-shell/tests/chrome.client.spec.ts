// @vitest-environment jsdom
/** Conversation auxiliary-command visibility and shared button behavior. */
import assert from 'node:assert/strict'
import { act, createElement } from '../node_modules/react/index.js'
import { createRoot } from '../node_modules/react-dom/client.js'
import { afterEach, describe, test, vi } from 'vitest'
import { ConversationAuxiliaryChrome } from '../lib/client/chrome.js'
import { en } from '../lib/client/locales.js'
import type { NovenSubject } from '../lib/client/arrangement.js'
import type { FrameFoldState } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ShellT } from '../lib/client/pages/Home.js'

const mounted = new Set<{ unmount: () => void }>()
const t: ShellT = key => en[key]
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  for (const root of mounted) act(() => { root.unmount() })
  mounted.clear()
  document.body.replaceChildren()
})

async function mount(subject: NovenSubject, collapsed: boolean, revealAuxiliary = vi.fn(), setAuxiliaryCollapsed = vi.fn(), claim?: boolean) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.add(root)
  const props = {
    t,
    subject: {
      getSnapshot: () => subject,
      subscribe: () => () => {},
    },
    useFrameFoldState: <T,>(selector: (value: FrameFoldState) => T): T => selector({ centerCollapsed: false, auxiliaryCollapsed: collapsed }),
    revealAuxiliary,
    setAuxiliaryCollapsed,
    ...(claim === undefined ? {} : {
      sessionId: 'session' as SessionId,
      claims: {
        claim: () => claim ? 'right' as const : null,
        subscribe: () => () => {},
      },
    }),
  }
  await act(async () => { root.render(createElement(ConversationAuxiliaryChrome, props)) })
  return { revealAuxiliary, setAuxiliaryCollapsed }
}

describe('Conversation auxiliary Chrome', () => {
  test('shows the shared recovery command to Agent only while Canvas is folded', async () => {
    const view = await mount('conversation', true)
    const button = document.querySelector<HTMLButtonElement>('[data-chrome-command="reveal-auxiliary"]')
    assert.ok(button)
    await act(async () => { button.click() })
    assert.equal(view.revealAuxiliary.mock.calls.length, 1)
    assert.equal(view.setAuxiliaryCollapsed.mock.calls.length, 0)
  })

  test('shows the same button as a fold command beside the handcraft Conversation', async () => {
    const view = await mount('canvas', false)
    const button = document.querySelector<HTMLButtonElement>('[data-chrome-command="fold-auxiliary"]')
    assert.ok(button)
    assert.equal(button.className, 'nv-chrome-icon-button')
    await act(async () => { button.click() })
    assert.deepEqual(view.setAuxiliaryCollapsed.mock.calls, [[true]])
    assert.equal(view.revealAuxiliary.mock.calls.length, 0)
  })

  test('renders no command when the arrangement does not need one', async () => {
    await mount('conversation', false)
    assert.equal(document.querySelector('[data-side-fold]'), null)
    await mount('canvas', true)
    assert.equal(document.querySelector('[data-side-fold]'), null)
  })

  test('hides Agent recovery when the Session has no Canvas claim', async () => {
    await mount('conversation', true, vi.fn(), vi.fn(), false)
    assert.equal(document.querySelector('[data-side-fold]'), null)
  })
})
