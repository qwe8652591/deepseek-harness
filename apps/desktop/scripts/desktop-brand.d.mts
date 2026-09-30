/** Passive artwork resolved from an installed brand theme. */
export interface DesktopBrandArtwork {
  brand: 'aiko' | 'yunyao'
  productName: string
  image: Buffer
}
/**
 * Resolve the selected theme's passive artwork.
 * @param env - Build settings.
 * @returns artwork, or undefined for upstream packaging.
 */
export function readDesktopBrand(env: NodeJS.ProcessEnv): DesktopBrandArtwork | undefined
/**
 * Locate generated artwork.
 * @param root - Target build directory.
 * @param brand - Selected brand.
 * @returns native artwork directory.
 */
export function desktopBrandDirectory(root: string, brand: 'aiko' | 'yunyao'): string
