/** Icon source paths selected for one Noven channel. */
export interface NovenIconAssetPaths {
  readonly macIcon: string
  readonly windowsIcon: string
  readonly trayIcon: string
}

/** Resolve formal assets or build-owned color-inverted test assets. */
export function novenIconAssetPaths(channel: 'release' | 'test', variantRoot: string): NovenIconAssetPaths

/** Generate color-inverted test assets without modifying the formal resources. */
export function prepareNovenIconAssets(channel: 'release' | 'test', variantRoot: string): Promise<NovenIconAssetPaths>
