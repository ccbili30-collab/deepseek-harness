/** Global workbench preferences hosted by the existing settings modal. */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createNovenWorkbenchStore } from '../workbench.ts'

/** Props supplied by the settings section and the shared workbench store. */
export type WorkbenchSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<'novenShell'>
  & PropsStore<ReturnType<typeof createNovenWorkbenchStore>>

/**
 * Edit the same preferences consumed by editors and canvas restoration.
 * @param props - Locale and the application-wide workbench store.
 * @returns The workbench settings section.
 */
export function WorkbenchSection({ useStore, actions, t }: WorkbenchSectionProps) {
  const autoSave = useStore(state => state.autoSave)
  const restoreCanvas = useStore(state => state.restoreCanvas)
  const lineNumbers = useStore(state => state.lineNumbers)
  return (
    <div className="nv-sesset">
      <section className="nv-sesset-group">
        <h4>{t('workbench.settings.group')}</h4>
        <div className="nv-sesset-row">
          <div className="nv-sesset-rowtext">
            <span className="nv-sesset-rowtitle">{t('workbench.settings.autoSave')}</span>
            <span className="nv-sesset-rowhint">{t('workbench.settings.autoSave.hint')}</span>
          </div>
          <Switch checked={autoSave} label={t('workbench.settings.autoSave')} onChange={actions.setAutoSave} />
        </div>
        <div className="nv-sesset-row">
          <div className="nv-sesset-rowtext">
            <span className="nv-sesset-rowtitle">{t('workbench.settings.restoreCanvas')}</span>
            <span className="nv-sesset-rowhint">{t('workbench.settings.restoreCanvas.hint')}</span>
          </div>
          <Switch checked={restoreCanvas} label={t('workbench.settings.restoreCanvas')} onChange={actions.setRestoreCanvas} />
        </div>
        <div className="nv-sesset-row">
          <div className="nv-sesset-rowtext">
            <span className="nv-sesset-rowtitle">{t('workbench.settings.lineNumbers')}</span>
            <span className="nv-sesset-rowhint">{t('workbench.settings.lineNumbers.hint')}</span>
          </div>
          <Switch checked={lineNumbers} label={t('workbench.settings.lineNumbers')} onChange={actions.setLineNumbers} />
        </div>
      </section>
    </div>
  )
}
