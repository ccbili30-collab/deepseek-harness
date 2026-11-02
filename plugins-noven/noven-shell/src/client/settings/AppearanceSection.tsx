/**
 * One-task appearance editor: preview, view, background, effects, and presets.
 * Scoped resources stay in the Host document; the editor shows one scope at a time.
 * @module noven-shell/client/settings/AppearanceSection
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fmt, type ShellT } from '../pages/Home.tsx'
import type {
  AppearanceBackground, AppearanceFocus, AppearanceForeground, AppearanceMaterial, AppearanceView, AppearanceViewMode,
} from '../../appearance/model.ts'
import { defaultAppearanceVisual } from '../../appearance/model.ts'
import { appearanceAssetUrl, updateAppearance, uploadAppearanceImage, useAppearance, useFocusedCanvasFile } from '../appearance.tsx'

interface Props {
  readonly sessionId: SessionId
  readonly t: ShellT
  /** Which scopes to show: all global settings, or only the current Session. */
  readonly sections?: 'all' | 'session'
}

type Scope = 'workspace' | 'file' | 'session'
type Target = 'shell' | 'canvas' | 'conversation'
type BackgroundMode = 'default' | 'shared' | 'custom' | 'off'

interface Draft {
  readonly view: AppearanceViewMode
  readonly surface: AppearanceMaterial
  readonly foreground: AppearanceForeground
  readonly visibility: number
  readonly mode: BackgroundMode
  readonly imagePath: string
  readonly focus: AppearanceFocus
  readonly dim: number
  readonly blur: number
  readonly material: AppearanceMaterial
  readonly scopeForeground: AppearanceForeground
  readonly avatarPath: string
  readonly advanced: boolean
}

const FOCI: readonly AppearanceFocus[] = ['center', 'top', 'bottom', 'left', 'right']
const FOCUS_POSITION: Record<AppearanceFocus, string> = { center: 'center', top: 'center top', bottom: 'center bottom', left: 'center left', right: 'center right' }

function backgroundOf(view: AppearanceView, scope: Scope, target: Target): AppearanceBackground | undefined {
  if (scope === 'file') return view.file?.canvas
  if (scope === 'session') return view.session.conversation
  if (target === 'shell') return view.workspace.shell
  if (target === 'canvas') return view.workspace.canvas
  return view.workspace.conversation
}

function modeOf(background: AppearanceBackground | undefined): BackgroundMode {
  if (background === undefined) return 'default'
  if (background.kind === 'transparent') return 'off'
  if (background.kind === 'shared') return 'shared'
  return 'custom'
}

function draftOf(view: AppearanceView, scope: Scope, target: Target): Draft {
  const background = backgroundOf(view, scope, target)
  const visual = view.visual ?? defaultAppearanceVisual()
  const avatar = scope === 'session' ? view.session.assistantAvatar : view.workspace.assistantAvatar
  return {
    view: visual.view,
    surface: visual.surface,
    foreground: visual.foreground,
    visibility: Math.round(visual.backgroundVisibility * 100),
    mode: modeOf(background),
    imagePath: background?.kind === 'asset' ? background.path : view.workspace.shared?.path ?? '',
    focus: background !== undefined && background.kind !== 'transparent' ? background.focus ?? 'center' : 'center',
    dim: background !== undefined && background.kind !== 'transparent' ? Math.round((background.dim ?? 0) * 100) : 0,
    blur: background !== undefined && background.kind !== 'transparent' ? background.blur ?? 0 : 0,
    material: background?.material ?? 'auto',
    scopeForeground: background?.foreground ?? 'system',
    avatarPath: avatar?.path ?? '',
    advanced: false,
  }
}

function backgroundChoice(draft: Draft): Record<string, unknown> {
  const surface = {
    ...(draft.material === 'auto' ? {} : { material: draft.material }),
    ...(draft.scopeForeground === 'system' ? {} : { foreground: draft.scopeForeground }),
  }
  const treatment = {
    ...(draft.dim > 0 ? { dim: draft.dim / 100 } : {}),
    ...(draft.blur > 0 ? { blur: draft.blur } : {}),
    ...(draft.focus === 'center' ? {} : { focus: draft.focus }),
    ...surface,
  }
  if (draft.mode === 'default') return { kind: 'default' }
  if (draft.mode === 'off') return { kind: 'transparent', ...surface }
  if (draft.mode === 'shared') return { kind: 'shared', ...treatment }
  return { kind: 'image', imagePath: draft.imagePath.trim(), ...treatment }
}

type PreviewStyle = CSSProperties & Record<'--nv-ap-image' | '--nv-ap-blur' | '--nv-ap-focus' | '--nv-ap-alpha', string>

function Preview({ sessionId, draft, revision, sharedPath, t }: {
  readonly sessionId: SessionId
  readonly draft: Draft
  readonly revision: number
  readonly sharedPath?: string
  readonly t: ShellT
}): ReactNode {
  const path = draft.mode === 'custom' ? draft.imagePath : draft.mode === 'shared' ? sharedPath : undefined
  const style: PreviewStyle = {
    '--nv-ap-image': path === undefined || path.trim() === '' ? 'none' : `url(${JSON.stringify(appearanceAssetUrl(sessionId, path, revision))})`,
    '--nv-ap-blur': `${draft.blur}px`,
    '--nv-ap-focus': FOCUS_POSITION[draft.focus],
    '--nv-ap-alpha': String(Math.max(0.1, 0.52 - draft.visibility / 220)),
  }
  return (
    <div className="nv-ap-preview" data-view={draft.view} data-mode={draft.mode} style={style} aria-label={t('appearance.preview')}>
      <div className="nv-ap-preview-top"><span>{t('appearance.preview.project')}</span><span>···</span></div>
      <div className="nv-ap-preview-body">
        <div className="nv-ap-preview-nav"><span>{t('appearance.preview.create')}</span><span>{t('appearance.preview.world')}</span><span>{t('appearance.preview.character')}</span></div>
        <div className="nv-ap-preview-main">
          <div className="nv-ap-preview-card"><strong>{t('appearance.preview.continue')}</strong><span>{t('appearance.preview.text')}</span></div>
          <div className="nv-ap-preview-card"><strong>Noven</strong><span>{t('appearance.preview.reply')}</span></div>
          <div className="nv-ap-preview-input"><span>{t('appearance.preview.input')}</span><b>↑</b></div>
        </div>
      </div>
    </div>
  )
}

const INITIAL_DRAFT: Draft = {
  view: 'light', surface: 'auto', foreground: 'system', visibility: 75,
  mode: 'default', imagePath: '', focus: 'center', dim: 0, blur: 0,
  material: 'auto', scopeForeground: 'system', avatarPath: '', advanced: false,
}

interface RowProps {
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly className?: string
  readonly live?: boolean
}

function Row({ title, description, children, className = '', live = false }: RowProps): ReactNode {
  return (
    <div className={`nv-ap-row ${className}`}>
      <div className="nv-ap-row-text">
        <div className="nv-ap-title">{title}</div>
        {description !== undefined && <div className="nv-ap-description" aria-live={live ? 'polite' : undefined}>{description}</div>}
      </div>
      <div className="nv-ap-control">{children}</div>
    </div>
  )
}

function Select({ label, value, onChange, children, className = '', disabled = false }: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly children: ReactNode
  readonly className?: string
  readonly disabled?: boolean
}): ReactNode {
  return <select className={`nv-ap-select ${className}`} aria-label={label} value={value} disabled={disabled} onChange={event => { onChange(event.target.value) }}>{children}</select>
}

/**
 * Render one scope's appearance editor with immediate, serialized persistence.
 * @param props - Current Session and shell translator.
 * @returns The appearance settings section.
 */
export function AppearanceSection({ sessionId, t, sections = 'all' }: Props): ReactNode {
  const focused = useFocusedCanvasFile()
  const filePath = focused?.sessionId === sessionId ? focused.path : undefined
  const view = useAppearance(sessionId, filePath)
  const viewRef = useRef(view)
  viewRef.current = view
  const acceptedRevision = useRef<number | undefined>(undefined)
  if (view !== undefined && (acceptedRevision.current === undefined || view.revision >= acceptedRevision.current)) {
    acceptedRevision.current = view.revision
  }
  useEffect(() => { acceptedRevision.current = undefined }, [sessionId])
  const [scope, setScope] = useState<Scope>(sections === 'session' ? 'session' : 'workspace')
  const [target, setTarget] = useState<Target>('shell')
  const [draft, setDraft] = useState<Draft>(() => view === undefined ? INITIAL_DRAFT : draftOf(view, scope, target))
  const draftRef = useRef(draft)
  const updateDraft = (next: Draft): void => {
    draftRef.current = next
    setDraft(next)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>()
  const chain = useRef<Promise<AppearanceView | undefined>>(Promise.resolve(undefined))
  const pending = useRef(0)
  const upload = useRef<HTMLInputElement | null>(null)
  const avatarUpload = useRef<HTMLInputElement | null>(null)
  const selectionKey = `${sessionId}\0${scope}\0${target}\0${filePath ?? ''}`
  const previousSelection = useRef(selectionKey)

  useEffect(() => {
    if (view === undefined) return
    const selectionChanged = previousSelection.current !== selectionKey
    previousSelection.current = selectionKey
    if (!selectionChanged && (pending.current > 0 || (acceptedRevision.current !== undefined && view.revision < acceptedRevision.current))) return
    updateDraft({ ...draftOf(view, scope, target), advanced: draftRef.current.advanced })
  }, [view, scope, target, selectionKey, saving])

  if (view === undefined) return <div className="nv-appearance"><p className="nv-ap-note">{t('appearance.loading')}</p></div>

  const save = (action: Record<string, unknown>, _immediate = true): Promise<AppearanceView | undefined> => {
    pending.current += 1
    setSaving(true)
    setError(false)
    const run = async (): Promise<AppearanceView | undefined> => {
      try {
        const current = viewRef.current
        if (current === undefined) return undefined
        const accepted = await updateAppearance(sessionId, { ...action, expectedRevision: acceptedRevision.current ?? current.revision })
        if (accepted !== undefined) acceptedRevision.current = accepted.revision
        if (accepted === undefined) setError(true)
        return accepted
      } catch {
        setError(true)
        return undefined
      } finally {
        pending.current -= 1
        if (pending.current === 0) setSaving(false)
      }
    }
    chain.current = chain.current.then(run, run)
    return chain.current
  }

  const visualAction = (next: Draft): Record<string, unknown> => ({
    action: 'visual', view: next.view, surface: next.surface, foreground: next.foreground, backgroundVisibility: next.visibility / 100,
  })
  const backgroundAction = (next: Draft): Record<string, unknown> => {
    const background = backgroundChoice(next)
    if (scope === 'file') return { action: 'canvas', scope: 'file', filePath, background }
    if (scope === 'session') return { action: 'conversation', scope: 'session', background }
    if (target === 'shell') return { action: 'shell', background }
    if (target === 'canvas') return { action: 'canvas', scope: 'workspace', background }
    return { action: 'conversation', scope: 'workspace', background }
  }
  const edit = (patch: Partial<Draft>, action: (next: Draft) => Record<string, unknown>, immediate = false): void => {
    const next = { ...draftRef.current, ...patch }
    updateDraft(next)
    setSelectedPreset(undefined)
    if (action === backgroundAction && next.mode === 'custom' && next.imagePath.trim() === '') {
      setError(true)
      return
    }
    void save(action(next), immediate)
  }
  const selectScope = (next: Scope): void => {
    setScope(next)
    setTarget(next === 'workspace' ? 'shell' : next === 'file' ? 'canvas' : 'conversation')
    setSelectedPreset(undefined)
  }
  const selectBackground = (mode: BackgroundMode): void => {
    const current = draftRef.current
    if (mode === 'shared' && view.workspace.shared === undefined) {
      if (current.imagePath.trim() === '') {
        setError(true)
        return
      }
      const next = { ...current, mode }
      updateDraft(next)
      void save({ action: 'shared', background: { kind: 'image', imagePath: current.imagePath.trim() } }, true)
      void save(backgroundAction(next), true)
      return
    }
    edit({ mode }, backgroundAction)
  }
  const uploadImage = (file: File | undefined): void => {
    if (file === undefined) return
    void uploadAppearanceImage(sessionId, file).then(path => {
      if (path === undefined) {
        setError(true)
        return
      }
      const mode: BackgroundMode = draftRef.current.mode === 'shared' ? 'shared' : 'custom'
      const next = { ...draftRef.current, mode, imagePath: path }
      updateDraft(next)
      if (mode === 'shared') void save({ action: 'shared', background: { kind: 'image', imagePath: path } }, true)
      void save(backgroundAction(next), true)
    })
  }
  const avatarAction = (path: string): Record<string, unknown> => ({
    action: 'conversation', scope: scope === 'session' ? 'session' : 'workspace', avatar: path === '' ? { kind: 'default' } : { kind: 'image', imagePath: path },
  })
  const restore = (): void => {
    if (sections === 'all' && scope === 'workspace') {
      setSelectedPreset('default')
      void save({ action: 'reset' }, true)
      return
    }
    if (scope === 'file') {
      void save({ action: 'canvas', scope: 'file', filePath, background: { kind: 'default' } }, true)
      return
    }
    void save({ action: 'conversation', scope: 'session', background: { kind: 'default' }, avatar: { kind: 'default' } }, true)
  }
  const savePreset = async (): Promise<void> => {
    const name = fmt(t, 'appearance.presetName', { count: Object.keys(view.presets ?? {}).length + 1 })
    const accepted = await save({ action: 'preset_save', name }, true)
    const id = Object.keys(accepted?.presets ?? {}).find(key => !Object.keys(view.presets ?? {}).includes(key))
    if (id !== undefined) setSelectedPreset(id)
  }
  const applyPreset = (presetId: string): void => {
    setSelectedPreset(presetId)
    void save({ action: 'preset_apply', presetId }, true)
  }
  const presets = Object.entries(view.presets ?? {})
  const scopeName = scope === 'workspace' ? t(`appearance.${target}`) : scope === 'file' ? filePath ?? t('appearance.noFile') : t('appearance.session')

  return (
    <div className="nv-appearance" data-saving={saving || undefined}>
      <Row title={scopeName} description={saving ? t('appearance.saving') : t('appearance.autosave')} className="nv-ap-head" live>
        <button type="button" className="nv-ap-quiet" onClick={restore}>{sections === 'all' && scope === 'workspace' ? t('appearance.restoreDefault') : t('appearance.default')}</button>
      </Row>
      <div className="nv-ap-preview-row"><Preview sessionId={sessionId} draft={draft} revision={view.revision} sharedPath={view.workspace.shared?.path} t={t} /></div>

      {sections === 'all' && (
        <Row title={t('appearance.applyTo')} description={t('appearance.applyTo.desc')}>
          <div className="nv-ap-scope-controls">
            <Select label={t('appearance.applyTo')} value={scope} onChange={value => { selectScope(value as Scope) }}>
              <option value="workspace">{t('appearance.workspace')}</option>
              <option value="file" disabled={filePath === undefined}>{t('appearance.scopeFile')}</option>
              <option value="session">{t('appearance.session')}</option>
            </Select>
            {scope === 'workspace' && (
              <Select label={t('appearance.target')} className="nv-ap-target" value={target} onChange={value => { setTarget(value as Target); setSelectedPreset(undefined) }}>
                {(['shell', 'canvas', 'conversation'] as const).map(item => <option key={item} value={item}>{t(`appearance.${item}`)}</option>)}
              </Select>
            )}
          </div>
        </Row>
      )}

      <Row title={t('appearance.view')} description={t('appearance.view.desc')}>
        <Select label={t('appearance.view')} className="nv-ap-view" value={draft.view} onChange={value => { edit({ view: value as AppearanceViewMode }, visualAction) }}>
          {(['light', 'dark'] as const).map(item => <option key={item} value={item}>{t(`appearance.view.${item}`)}</option>)}
        </Select>
      </Row>

      <Row title={t('appearance.background')} description={t('appearance.background.desc')}>
        <div className="nv-ap-background-control">
          <Select label={t('appearance.background')} value={draft.mode} onChange={value => { selectBackground(value as BackgroundMode) }}>
            {(['default', 'shared', 'custom', 'off'] as const).map(item => <option key={item} value={item}>{item === 'default' ? t('appearance.defaultImage') : item === 'shared' ? t('appearance.sharedImage') : item === 'custom' ? t('appearance.customImage') : t('appearance.off')}</option>)}
          </Select>
          <button type="button" className="nv-ap-quiet" onClick={() => { upload.current?.click() }}>{t('appearance.changeImage')}</button>
          <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; uploadImage(file) }} />
        </div>
      </Row>

      <Row title={t('appearance.visibility')} description={t('appearance.visibility.desc')}>
        <div className="nv-ap-range-control">
          <input className="nv-ap-light-range" type="range" min="0" max="100" value={draft.visibility} aria-label={t('appearance.visibility')} onChange={event => { edit({ visibility: Number(event.target.value) }, visualAction) }} />
          <output>{draft.visibility}%</output>
        </div>
      </Row>

      <div className="nv-ap-advanced-section">
        <Row title={t('appearance.advanced')} description={t('appearance.advanced.desc')}>
          <button type="button" className="nv-ap-quiet" aria-expanded={draft.advanced} onClick={() => { updateDraft({ ...draftRef.current, advanced: !draftRef.current.advanced }) }}>{draft.advanced ? t('appearance.hideAdvanced') : t('appearance.advanced')}</button>
        </Row>
        {draft.advanced && (
          <div className="nv-ap-advanced">
            <Row title={t('appearance.customImage')}><input className="nv-ap-input" aria-label={t('appearance.customImage')} value={draft.imagePath} placeholder={t('appearance.path.ph')} onChange={event => { updateDraft({ ...draftRef.current, imagePath: event.target.value }) }} onBlur={() => { if (draftRef.current.mode === 'custom') edit({}, backgroundAction) }} /></Row>
            <Row title={t('appearance.focus')}><Select label={t('appearance.focus')} value={draft.focus} onChange={value => { edit({ focus: value as AppearanceFocus }, backgroundAction) }}>{FOCI.map(item => <option key={item} value={item}>{t(`appearance.focus.${item}`)}</option>)}</Select></Row>
            <Row title={t('appearance.dim')}><div className="nv-ap-range-control"><input className="nv-ap-light-range" type="range" min="0" max="60" value={draft.dim} aria-label={t('appearance.dim')} onChange={event => { edit({ dim: Number(event.target.value) }, backgroundAction) }} /><output>{draft.dim}%</output></div></Row>
            <Row title={t('appearance.blur')}><div className="nv-ap-range-control"><input className="nv-ap-light-range" type="range" min="0" max="20" value={draft.blur} aria-label={t('appearance.blur')} onChange={event => { edit({ blur: Number(event.target.value) }, backgroundAction) }} /><output>{draft.blur}px</output></div></Row>
            <Row title={t('appearance.scopeMaterial')}><Select label={t('appearance.scopeMaterial')} value={draft.material} onChange={value => { edit({ material: value as AppearanceMaterial }, backgroundAction) }}>{(['auto', 'frosted', 'clear'] as const).map(item => <option key={item} value={item}>{t(`appearance.material.${item}`)}</option>)}</Select></Row>
            <Row title={t('appearance.scopeForeground')}><Select label={t('appearance.scopeForeground')} value={draft.scopeForeground} onChange={value => { edit({ scopeForeground: value as AppearanceForeground }, backgroundAction) }}>{(['system', 'light', 'dark'] as const).map(item => <option key={item} value={item}>{t(`appearance.foreground.${item}`)}</option>)}</Select></Row>
            <Row title={t('appearance.globalMaterial')}><Select label={t('appearance.globalMaterial')} value={draft.surface} onChange={value => { edit({ surface: value as AppearanceMaterial }, visualAction) }}>{(['auto', 'frosted', 'clear'] as const).map(item => <option key={item} value={item}>{t(`appearance.material.${item}`)}</option>)}</Select></Row>
            <Row title={t('appearance.globalForeground')}><Select label={t('appearance.globalForeground')} value={draft.foreground} onChange={value => { edit({ foreground: value as AppearanceForeground }, visualAction) }}>{(['system', 'light', 'dark'] as const).map(item => <option key={item} value={item}>{t(`appearance.foreground.${item}`)}</option>)}</Select></Row>
            {scope !== 'file' && target === 'conversation' && (
              <div className="nv-ap-avatar">
                <Row title={t('appearance.avatar')}>
                  <div className="nv-ap-avatar-controls">
                    <input className="nv-ap-input" aria-label={t('appearance.avatar')} value={draft.avatarPath} placeholder={t('appearance.path.ph')} onChange={event => { updateDraft({ ...draftRef.current, avatarPath: event.target.value }) }} onBlur={() => { void save(avatarAction(draftRef.current.avatarPath.trim())) }} />
                    <div className="nv-ap-inline-actions"><button type="button" className="nv-ap-quiet" onClick={() => { avatarUpload.current?.click() }}>{t('appearance.upload')}</button><button type="button" className="nv-ap-quiet" onClick={() => { updateDraft({ ...draftRef.current, avatarPath: '' }); void save(avatarAction('')) }}>{t('appearance.default')}</button></div>
                    <input ref={avatarUpload} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file === undefined) return
                      void uploadAppearanceImage(sessionId, file).then(path => {
                        if (path === undefined) { setError(true); return }
                        updateDraft({ ...draftRef.current, avatarPath: path })
                        void save(avatarAction(path), true)
                      })
                    }} />
                  </div>
                </Row>
              </div>
            )}
          </div>
        )}
      </div>

      {sections === 'all' && scope === 'workspace' && (
        <div className="nv-ap-presets">
          <Row title={t('appearance.presets')} description={presets.length === 0 ? t('appearance.noPresets') : t('appearance.presets.desc')}>
            <button type="button" className="nv-ap-quiet" onClick={() => { void savePreset() }}>{t('appearance.savePreset')}</button>
          </Row>
          <div className="nv-ap-preset-list">
            {presets.map(([id, preset]) => <button key={id} type="button" aria-pressed={selectedPreset === id} onClick={() => { applyPreset(id) }}>{preset.name}</button>)}
          </div>
        </div>
      )}
      {error && <p className="nv-ap-error" role="alert">{t('appearance.error')}</p>}
    </div>
  )
}
