/** macOS desktop detection for hiddenInset-titlebar layout variants. */

/**
 * Whether the client runs in the macOS desktop shell: the Electron preload
 * marks `<html>` with `data-platform="darwin"`; plain web never sets it.
 * Read at render time — the mark may arrive as late as DOMContentLoaded.
 * @returns true only inside the macOS Electron shell.
 */
export function isDarwinDesktop(): boolean {
  return document.documentElement.dataset.platform === 'darwin'
}

/**
 * Whether to use the macOS window presentation, including an explicit Web mirror.
 * Native bridges and keyboard runtime must use `isDarwinDesktop()` instead.
 * @returns true for real macOS Desktop or `data-chrome-platform="darwin"`.
 */
export function isDarwinChrome(): boolean {
  return isDarwinDesktop() || document.documentElement.dataset.chromePlatform === 'darwin'
}
