/**
 * Global sidebar-panel activation registry.
 *
 * Panel rows select their matching main panel by default. Feature plugins may
 * temporarily override one row's activation (for example, an unavailable
 * destination that should explain itself without navigating). Registrations
 * ride the caller's Cordis effect and disappear with that plugin.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** A custom reaction to one global panel-row activation. */
export type SidebarPanelActivation = (target: HTMLElement) => void

/** Public sidebar-panel activation face. */
export interface ISidebarPanels {
  /**
   * Override one panel row's default navigation while this registration lives.
   * @param id - panel row id.
   * @param activate - reaction receiving the actual row button.
   * @returns disposer removing this override.
   */
  registerActivation(id: MainPanelId, activate: SidebarPanelActivation): () => void
  /**
   * Dispatch one row activation to its override or normal panel selection.
   * @param id - activated row id.
   * @param target - actual row button.
   */
  activate(id: MainPanelId, target: HTMLElement): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Global sidebar-panel activation overrides. */
    sidebarPanels: ISidebarPanels
  }
}

/** Sidebar-owned activation dispatcher and extension registry. */
export class SidebarPanelService extends Service implements ISidebarPanels {
  static inject = ['layout']

  private readonly activations = new Map<MainPanelId, SidebarPanelActivation>()

  /** @param ctx - owning client context. */
  constructor(ctx: Context) {
    super(ctx, 'sidebarPanels')
  }

  /** @inheritdoc */
  registerActivation(id: MainPanelId, activate: SidebarPanelActivation): () => void {
    const dispose = this.ctx.effect(() => {
      if (this.activations.has(id)) throw new Error(`ui-sidebar: activation for "${id}" is already registered`)
      this.activations.set(id, activate)
      return () => { this.activations.delete(id) }
    }, 'ui-sidebar: panel activation')
    return () => { void dispose() }
  }

  /**
   * Dispatch a row activation to its override or the layout's normal selection.
   * @param id - activated row id.
   * @param target - the row button that received the activation.
   */
  activate(id: MainPanelId, target: HTMLElement): void {
    const override = this.activations.get(id)
    if (override !== undefined) {
      override(target)
      return
    }
    this.ctx.layout.selectPanel(id)
  }
}
