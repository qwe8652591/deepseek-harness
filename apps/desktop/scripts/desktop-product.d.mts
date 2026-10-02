/** Public configuration carried by a branded installer. */
export interface DesktopProduct {
  readonly schemaVersion: 1
  readonly profile: 'aiko' | 'yunyao'
  readonly appId: string
  readonly productName: string
  readonly repository: string
  readonly channel: 'stable' | 'beta'
  readonly bundles: readonly string[]
  readonly plugins: readonly { readonly name: string; readonly version: string }[]
}
/** Build-only local inputs; never embedded as deployment configuration. */
export interface DesktopProductBuild extends DesktopProduct {
  readonly archives: readonly { readonly name: string; readonly version: string; readonly path: string; readonly integrity: string }[]
  readonly artwork: { readonly version: 1; readonly theme: string; readonly productName: string; readonly image: string }
}
/**
 * Validate packaged public metadata.
 * @param value Parsed public product JSON.
 * @returns Brand identity and its complete plugin set.
 */
export function parseDesktopProduct(value: unknown): DesktopProduct
/**
 * Read explicit build inputs and optionally verify every archive.
 * @param env Packaging settings containing an absolute DSH_DESKTOP_PRODUCT path.
 * @param verifyArchives Whether to compare each archive with its pinned SHA-512.
 * @returns Verified inputs, or undefined for the upstream distribution.
 */
export function readDesktopProduct(env: NodeJS.ProcessEnv, verifyArchives?: boolean): DesktopProductBuild | undefined
/**
 * Resolve a brand, channel and target-specific GitHub feed.
 * @param product Validated public product identity.
 * @param target Desktop platform and architecture name.
 * @returns Public feed directory, channel filename prefix and release tag.
 */
export function desktopProductFeed(product: DesktopProduct, target: string): { publicUrl: string; channel: string; tag: string }
