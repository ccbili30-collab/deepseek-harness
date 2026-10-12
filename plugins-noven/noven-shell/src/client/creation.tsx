/**
 * 新建流程：左列「＋ 新建」与起点页动作共用的对象创建面板
 * （设计稿 J01/J06）。世界与角色先给名字再选起手方式；角色的「放进
 * 哪个世界」从内容树的 WORLD 卡里挑；文稿只问名字，落在 `文稿/`。
 * @module noven-shell/client/creation
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CardAddr } from './card-api.ts'
import type { ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'

/** 起手方式：blank 建空壳，interview 让 AI 开口问，template 占位（后端 501）。 */
export type Starter = 'blank' | 'interview' | `template:${string}`

/** 面板要求的对象种类。group = 用户命名的顶层分组（树的「大项目」）；
    card = 对话框内再选世界/角色；comic = 漫画/ 下的 html 作品；studio 由宿主直接处理（不进面板）。 */
export type CreateKind = 'world' | 'character' | 'doc' | 'import' | 'group' | 'card' | 'comic' | 'studio'

export interface CreateRequest {
  readonly kind: CreateKind
  readonly name: string
  readonly starter: Starter
  /** 角色要住进的世界卡；undefined = 不属于任何世界。 */
  readonly worldCardId?: string
  /** 文稿落在哪个分组目录；undefined = 文稿/。 */
  readonly dir?: string
}

/** 面板注入面：提交与取消由宿主（画布 store 动作）驱动。 */
export interface CreateDialogProps {
  readonly kind: CreateKind
  readonly t: ShellT
  /** 文稿的目标分组目录（分组行「＋」开面板时带上）；undefined = 文稿/。 */
  readonly dir?: string
  /** 世界候选：当前项目里的 WORLD 卡（id + 名字）。 */
  readonly worlds: readonly { readonly cardId: string; readonly name: string }[]
  readonly onSubmit: (request: CreateRequest) => void
  readonly onCancel: () => void
}

/** 起手三选（J01）：图标横排卡片——空白 / 让 AI 问几个问题 / 选模板（模板库未建，置灰）。 */
function StarterPick({ t, value, onChange }: { t: CreateDialogProps['t']; value: 'blank' | 'interview'; onChange: (v: 'blank' | 'interview') => void }) {
  const rows: readonly { id: 'blank' | 'interview'; label: string; hint: string; icon: ReactNode }[] = [
    { id: 'blank', label: t('create.starter.blank'), hint: t('create.starter.blank.hint'), icon: glyph.file(20) },
    { id: 'interview', label: t('create.starter.interview'), hint: t('create.starter.interview.hint'), icon: glyph.sparkle(20) },
  ]
  return (
    <div className="nv-create-starters" role="radiogroup">
      {rows.map(row => (
        <button key={row.id} type="button" role="radio" aria-checked={value === row.id} title={row.hint}
          className={`nv-create-starter${value === row.id ? ' nv-create-starter-on' : ''}`}
          onClick={() => onChange(row.id)}>
          {value === row.id && <span className="nv-create-check" aria-hidden="true">{glyph.check(11)}</span>}
          <span className="nv-create-starter-icon">{row.icon}</span>
          <span className="nv-create-starter-label">{row.label}</span>
        </button>
      ))}
      <button type="button" className="nv-create-starter" disabled
        title={t('create.starter.template.disabled')}>
        <span className="nv-create-starter-icon">{glyph.grid(20)}</span>
        <span className="nv-create-starter-label">{t('create.starter.template')}</span>
      </button>
    </div>
  )
}

/**
 * 新建面板：固定在画布上的居中卡片。Esc/遮罩点击取消，Enter 提交。
 * @param props - 种类、文案、世界候选与提交回调。
 * @returns 面板节点。
 */
export function CreateDialog({ kind, t, dir, worlds, onSubmit, onCancel }: CreateDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [starter, setStarter] = useState<'blank' | 'interview'>('blank')
  const [worldCardId, setWorldCardId] = useState('')
  // 「卡」面板内部再选种类——世界/角色本质都是卡（cardOp.create 的 kind）。
  const [cardKind, setCardKind] = useState<'world' | 'character'>('world')
  const resolved = kind === 'card' ? cardKind : kind
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onCancel])
  const titleKey = kind === 'world' ? 'create.world.title' : kind === 'character' ? 'create.character.title'
    : kind === 'group' ? 'create.group.title' : kind === 'card' ? 'create.card.title'
    : kind === 'comic' ? 'create.comic.title' : 'create.doc.title'
  const submit = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    onSubmit({
      kind: resolved,
      name: trimmed,
      starter,
      worldCardId: resolved === 'character' && worldCardId !== '' ? worldCardId : undefined,
      dir: resolved === 'doc' ? dir : undefined,
    })
  }
  return (
    <div className="nv-create-veil" onClick={onCancel}>
      <div className="nv-create" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') submit() }}>
        <div className="nv-create-title">{t(titleKey)}</div>
        {kind === 'card' && (
          <>
            <div className="nv-create-label">{t('create.card.kind')}</div>
            <div className="nv-create-starters" role="radiogroup">
              {(['world', 'character'] as const).map(k => (
                <button key={k} type="button" role="radio" aria-checked={cardKind === k}
                  className={`nv-create-starter${cardKind === k ? ' nv-create-starter-on' : ''}`}
                  onClick={() => setCardKind(k)}>
                  {cardKind === k && <span className="nv-create-check" aria-hidden="true">{glyph.check(11)}</span>}
                  <span className="nv-create-starter-icon">{k === 'world' ? glyph.globe(20) : glyph.user(20)}</span>
                  <span className="nv-create-starter-label">{t(k === 'world' ? 'create.card.kind.world' : 'create.card.kind.character')}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="nv-create-label">{t('create.field.name')}</div>
        <input ref={inputRef} className="nv-create-name" value={name}
          placeholder={t('create.name.placeholder')} onChange={e => setName(e.target.value)} />
        {resolved === 'character' && (
          <select className="nv-create-world" value={worldCardId} onChange={e => setWorldCardId(e.target.value)}>
            <option value="">{t('create.character.noWorld')}</option>
            {worlds.map(world => <option key={world.cardId} value={world.cardId}>{world.name}</option>)}
          </select>
        )}
        {kind === 'group' && (
          <div className="nv-create-egs">
            <span className="nv-create-eglabel">{t('create.group.eg')}</span>
            <button type="button" className="nv-create-eg" onClick={() => setName(t('create.group.eg.1'))}>{t('create.group.eg.1')}</button>
            <button type="button" className="nv-create-eg" onClick={() => setName(t('create.group.eg.2'))}>{t('create.group.eg.2')}</button>
          </div>
        )}
        {(resolved === 'world' || resolved === 'character') && (
          <>
            <div className="nv-create-label">{t('create.starter.label')}</div>
            <StarterPick t={t} value={starter} onChange={setStarter} />
          </>
        )}
        <div className="nv-create-actions">
          <button type="button" className="nv-create-cancel" onClick={onCancel}>{t('create.cancel')}</button>
          <button type="button" className="nv-create-ok" disabled={name.trim() === ''} onClick={submit}>{t('create.ok')}</button>
        </div>
      </div>
    </div>
  )
}
