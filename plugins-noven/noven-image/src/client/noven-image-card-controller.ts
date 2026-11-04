/**
 * The Noven image page's staged form over the `noven-image` settings
 * namespace, mirroring the DeepSeek web-search card controller: text fields
 * stage in the form; the key is written through the credentials domain so its
 * literal never rides a settings response.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: merges the `credentials` Remote namespace this controller calls.
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope,
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
  /** Model identifiers accepted for the current staged connection. */
  models: readonly string[] | undefined
  /** Whether that connection's model request is pending. */
  fetching: boolean
  /** Transport or provider failure for that connection. */
  fetchError: string | undefined
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
  /** Probe the staged endpoint and credential without saving either. */
  fetchModels: () => Promise<void>
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
  private credentialGeneration = 0
  private disposed = false
  private submittedKeyRef: string | undefined
  private probe: AbortController | undefined
  private models: readonly string[] | undefined
  private fetching = false
  private fetchError: string | undefined

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
    this.unsubscribe = scope.subscribe(() => { this.cancelProbe(); void this.readCredential() })
    void this.readCredential()
  }

  private projection(): NovenImageCardState {
    return {
      ...this.form.shell(),
      models: this.models,
      fetching: this.fetching,
      fetchError: this.fetchError,
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
    if (this.disposed) return
    const ref = this.reference()
    const generation = ++this.credentialGeneration
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    let response: Awaited<ReturnType<typeof this.ctx.remote.credentials.describe>>
    try {
      response = await this.ctx.remote.credentials.describe([ref])
    } catch (_error) {
      // A disconnected Host leaves the last accepted credential description intact.
      return
    }
    if (!response.ok || this.disposed || generation !== this.credentialGeneration || ref !== this.reference()) return
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
    const actions = this.form.actions()
    return {
      hooks: { novenImageCard: this.store }, ...actions,
      edit: (field, text) => {
        if (this.disposed) return
        if (['baseURL', 'apiKeyEnv', API_KEY_FIELD].includes(field)) this.cancelProbe()
        actions.edit(field, text)
        if (field === 'apiKeyEnv') void this.readCredential()
      },
      resetField: field => {
        if (this.disposed) return
        this.cancelProbe()
        actions.resetField(field)
        if (field === 'apiKeyEnv') void this.readCredential()
      },
      discard: () => {
        if (this.disposed) return
        this.cancelProbe()
        actions.discard()
        void this.readCredential()
      },
      save: () => {
        if (this.disposed || this.form.shell().saving) return
        this.submittedKeyRef = this.reference()
        void this.form.save().finally(() => { this.submittedKeyRef = undefined })
      },
      fetchModels: () => this.fetchModels(),
    }
  }

  private reference(): string {
    return this.form.field('apiKeyEnv').text.trim() || DEFAULT_API_KEY_REF
  }

  private cancelProbe(): void {
    this.probe?.abort()
    this.probe = undefined
    this.models = undefined
    this.fetching = false
    this.fetchError = undefined
    if (!this.disposed) this.store.set(this.projection())
  }

  private async fetchModels(): Promise<void> {
    if (this.disposed) return
    this.cancelProbe()
    const probe = new AbortController()
    this.probe = probe
    this.fetching = true
    this.store.set(this.projection())
    try {
      const response = await fetch('/api/noven-image-models', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: probe.signal,
        body: JSON.stringify({ base: this.form.field('baseURL').text, apiKey: this.form.field(API_KEY_FIELD).text, apiKeyEnv: this.reference() }),
      })
      const payload: unknown = await response.json()
      if (this.disposed || this.probe !== probe) return
      if (typeof payload !== 'object' || payload === null) throw new Error('Invalid model response')
      const value = payload as { models?: unknown, error?: unknown }
      if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : `Provider status ${response.status}`)
      if (!Array.isArray(value.models) || value.models.some(id => typeof id !== 'string')) throw new Error('Invalid model response')
      this.models = value.models
    } catch (error) {
      if (this.disposed || this.probe !== probe) return
      this.fetchError = error instanceof Error ? error.message : 'Model request failed'
    }
    if (this.disposed || this.probe !== probe) return
    this.probe = undefined
    this.fetching = false
    this.store.set(this.projection())
  }

  /**
   * Write the staged key, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    const ref = this.submittedKeyRef ?? this.reference()
    const response = await this.ctx.remote.credentials.set(ref, value)
    if (!response.ok) return false
    const accepted = await this.ctx.remote.credentials.describe([ref])
    await this.readCredential()
    return accepted.ok && accepted.value[ref]?.configured === true
  }

  /** Release configuration subscriptions. */
  dispose(): void {
    this.disposed = true
    this.credentialGeneration += 1
    this.cancelProbe()
    this.unsubscribe()
    this.form.dispose()
  }
}
