/**
 * The Noven image page's staged form over the `noven-image` settings
 * namespace, mirroring the DeepSeek web-search card controller: text fields
 * stage in the form; the key is written through the credentials domain so its
 * literal never rides a settings response.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope, type SettingsFormScopeSnapshot,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Settings namespace of the Noven image plugin (its package name). */
export const NOVEN_IMAGE_NS = 'noven-image'

/** Credential reference the provider resolves when the section names none. */
const DEFAULT_API_KEY_REF = 'NOVEN_IMAGE_API_KEY'

/** Form field the credential control stages under. */
const API_KEY_FIELD = 'apiKey'

/** The image-provider fields this page edits. */
export interface NovenImageSettings {
  /** OpenAI-compatible images API base URL. */
  baseURL?: string
  /** Image model name. */
  model?: string
  /** Project folder generated images land in. */
  outputDir?: string
  /** Credential reference naming the environment key. */
  apiKeyEnv?: string
}

/** What the credentials domain last reported, and for which reference. */
interface CredentialState {
  /** Reference this answer describes; a stale response for another one is dropped. */
  ref: string
  /** Whether any layer supplies a value for it. */
  configured: boolean
  /** Whether `credentials/set` can affect it; false disables the control. */
  writable: boolean
}

/** What the image page renders. */
export interface NovenImageCardState extends SettingsFormShell {
  baseURL: SettingsFieldState
  model: SettingsFieldState
  outputDir: SettingsFieldState
  apiKeyEnv: SettingsFieldState
  /** The staged credential, which starts blank on every load. */
  apiKey: SettingsFieldState
  /** Whether the Host reports a credential configured for the referenced key. */
  apiKeyConfigured: boolean
  /** Whether the credentials domain accepts a write for it; false disables the control. */
  apiKeyWritable: boolean
}

/** The registration-side face the page's slot entry injects. */
export interface NovenImageCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useNovenImageCard. */
    novenImageCard: SnapshotStore<NovenImageCardState>
  }
}

/** Bridges the `noven-image` scope and the credentials domain onto the page. */
export class NovenImageCardController {
  private readonly form: SettingsFormModel<NovenImageSettings>
  private readonly store: SnapshotStore<NovenImageCardState>
  private readonly unsubscribe: () => void
  private credential: CredentialState = { ref: '', configured: false, writable: true }

  /**
   * @param scope - the bound settings scope for the `noven-image` namespace.
   * @param ctx - the page plugin's context, whose `remote.credentials` namespace
   * answers for the credential the section references.
   */
  constructor(
    private readonly scope: SettingsFormScope<NovenImageSettings>,
    private readonly ctx: ClientContext,
  ) {
    this.form = new SettingsFormModel(
      scope,
      [settingsTextField('baseURL'), settingsTextField('model'), settingsTextField('outputDir'), settingsTextField('apiKeyEnv')],
      [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): NovenImageCardState {
    return {
      ...this.form.shell(),
      baseURL: this.form.field('baseURL'),
      model: this.form.field('model'),
      outputDir: this.form.field('outputDir'),
      apiKeyEnv: this.form.field('apiKeyEnv'),
      apiKey: this.form.field(API_KEY_FIELD),
      apiKeyConfigured: this.credential.configured,
      apiKeyWritable: this.credential.writable,
    }
  }

  /**
   * Ask the credentials domain about the reference the section currently names.
   * The answer is stored with the reference it describes, so out-of-order
   * responses for a changed `apiKeyEnv` never publish.
   */
  private async readCredential(): Promise<void> {
    const ref = refOf(this.scope.getSnapshot())
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    const response = await this.ctx.remote.credentials.describe([ref])
    if (!response.ok || ref !== refOf(this.scope.getSnapshot())) return
    const view = response.value[ref]
    const next: CredentialState = {
      ref,
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    }
    if (next.configured === this.credential.configured && next.writable === this.credential.writable) return
    this.credential = next
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to the reference this page watches.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (ref !== this.credential.ref) return
    void this.readCredential()
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its form actions.
   */
  inject(): NovenImageCardFace {
    return { hooks: { novenImageCard: this.store }, ...this.form.actions() }
  }

  /**
   * Write the staged key, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    await this.ctx.remote.credentials.set(refOf(this.scope.getSnapshot()), value)
    await this.readCredential()
    return this.credential.configured
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.unsubscribe(); this.form.dispose() }
}

/**
 * The credential reference the section names, or the plugin's default.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function refOf(snapshot: SettingsFormScopeSnapshot<NovenImageSettings>): string {
  const declared = snapshot.value?.apiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : DEFAULT_API_KEY_REF
}
