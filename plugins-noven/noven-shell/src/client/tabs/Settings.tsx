/**
 * 会话设置右栏页签（设计理念 §16 / 契约 C9）。
 *
 * 手机端「对话设置」的 PC 对齐面：身份与回答（回答/我的身份、对话提示词）、
 * 使用的设定（背景资料、每轮注入、文字文风）、内容与工具（设定助手对本会话的
 * 自动整理开关）。设置随会话走：`.noven/session/<id>.json`，切回先见旧值。
 * 模拟器会话的每轮注入/文风在发送时即时生效；其余字段的普通会话注入在后续
 * 批次接线（字段先持久，避免设置孤岛）。
 * @module noven-shell/client/tabs/Settings
 */
import type { ReactElement } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellT } from '../pages/Home.tsx'
import type { SidecarState } from './Sidecar.tsx'
import type { SidecarOp } from '../sidecar-api.ts'
import type { DocsHook } from '../canvas.tsx'
import { useSessionSettings, type SessionSettings } from '../session-settings.tsx'

type FieldKey = keyof SessionSettings
type FieldLabel =
  | 'session.set.answer'
  | 'session.set.mine'
  | 'session.set.prompt'
  | 'session.set.background'
  | 'session.set.perTurn'
  | 'session.set.style'
type FieldPlaceholder =
  | 'session.set.answer.ph'
  | 'session.set.mine.ph'
  | 'session.set.prompt.ph'
  | 'session.set.background.ph'
  | 'session.set.perTurn.ph'
  | 'session.set.style.ph'

interface FieldDef {
  readonly key: FieldKey
  readonly label: FieldLabel
  readonly placeholder: FieldPlaceholder
  readonly rows: number
}

const IDENTITY_FIELDS: readonly FieldDef[] = [
  { key: 'answerIdentity', label: 'session.set.answer', placeholder: 'session.set.answer.ph', rows: 2 },
  { key: 'myIdentity', label: 'session.set.mine', placeholder: 'session.set.mine.ph', rows: 2 },
  { key: 'prompt', label: 'session.set.prompt', placeholder: 'session.set.prompt.ph', rows: 3 },
]

const SETTING_FIELDS: readonly FieldDef[] = [
  { key: 'background', label: 'session.set.background', placeholder: 'session.set.background.ph', rows: 3 },
  { key: 'perTurn', label: 'session.set.perTurn', placeholder: 'session.set.perTurn.ph', rows: 2 },
  { key: 'style', label: 'session.set.style', placeholder: 'session.set.style.ph', rows: 2 },
]

interface Props {
  readonly t: ShellT
  readonly useTabInfo: UseSidebarRightTabInfo
  readonly sessionId: SessionId
  readonly useSidecar: SnapshotSelectorHook<SidecarState>
  readonly run: (op: SidecarOp) => Promise<void>
  readonly useDocs: DocsHook
  readonly ensureDoc: (sessionId: SessionId, path: string) => void
  readonly saveDoc: (sessionId: SessionId, path: string, content: string, base: string | null) => Promise<'ok' | 'conflict' | 'error'>
}

export function SettingsTab({ t, useTabInfo, sessionId, useSidecar, run, useDocs, ensureDoc, saveDoc }: Props) {
  useTabInfo()
  const sidecar = useSidecar(s => s)
  const paused = sidecar.payload?.paused === true
  const { settings, save } = useSessionSettings(sessionId, useDocs, ensureDoc, saveDoc)

  const edit = (key: FieldKey, text: string): void => save({ ...settings, [key]: text })
  const fieldRow = (def: FieldDef): ReactElement => (
    <label className="nv-sesset-field" key={def.key}>
      <span>{t(def.label)}</span>
      <textarea rows={def.rows} value={settings[def.key]}
        placeholder={t(def.placeholder)}
        onChange={e => edit(def.key, e.target.value)} />
    </label>
  )

  return (
    <div className="nv-sesset">
      <section className="nv-sesset-group">
        <h4>{t('session.set.group.identity')}</h4>
        {IDENTITY_FIELDS.map(fieldRow)}
      </section>
      <section className="nv-sesset-group">
        <h4>{t('session.set.group.settings')}</h4>
        {SETTING_FIELDS.map(fieldRow)}
      </section>
      <section className="nv-sesset-group">
        <h4>{t('session.set.group.tools')}</h4>
        <div className="nv-sesset-row">
          <div className="nv-sesset-rowtext">
            <span className="nv-sesset-rowtitle">{t('session.set.autodigest')}</span>
            <span className="nv-sesset-rowhint">{t('session.set.autodigest.hint')}</span>
          </div>
          <Switch
            checked={!paused}
            label={t('session.set.autodigest')}
            onChange={next => { void run({ op: 'paused', paused: !next }) }}
          />
        </div>
      </section>
      <div className="nv-sesset-foot">{t('session.set.foot')}</div>
    </div>
  )
}
