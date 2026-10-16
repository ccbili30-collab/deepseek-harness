/** Opens workspace directories through the Host's default path opener. */

/** Dependencies for opening a folder and reporting a refused or failed request. */
export interface WorkspaceFolderActions {
  /** Open a directory on the Host; an unsuccessful response leaves the UI unchanged. */
  readonly open: (request: { readonly path: string }) => Promise<{ readonly ok: boolean }>
  /** Show a localized failure receipt outside the dismissed menu. */
  readonly failed: () => void
}

/**
 * Open the workspace directory without navigating or changing its contents.
 * @param path - workspace root on the Host filesystem.
 * @param actions - Host opener and failure feedback.
 * @returns completion after the opener responds or the failure is reported.
 */
export async function openWorkspaceFolder(path: string, actions: WorkspaceFolderActions): Promise<void> {
  let opened = false
  try {
    opened = (await actions.open({ path })).ok
  } catch (error: unknown) {
    console.warn('noven-shell: workspace folder open failed:', error)
  }
  if (!opened) actions.failed()
}
