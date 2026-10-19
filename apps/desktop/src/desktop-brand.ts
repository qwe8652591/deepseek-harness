/** Native artwork is fixed by the package; development may use prepared theme assets. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Resolved native brand assets; private build paths never enter packaged metadata. */
export interface DesktopBrand {
  readonly brand: 'orange' | 'blue'
  readonly productName: string
  readonly icon: string
  readonly tray: string
}

/**
 * Read fixed packaged artwork or the development launcher's prepared resources.
 * @param packaged - Whether Electron is running an installed application.
 * @param resources - Packaged resource directory.
 * @param developmentResources - Prepared source-launch directory, ignored by installed apps.
 * @param selectedBrand - Deployment theme; must agree with native artwork.
 * @param packagedBrand - Brand declared by the packaged application manifest.
 * @returns native brand, or undefined for ordinary upstream Desktop.
 */
export function readNativeDesktopBrand(
  packaged: boolean, resources: string, developmentResources: string | undefined, selectedBrand: string | undefined,
  packagedBrand?: unknown,
): DesktopBrand | undefined {
  if (packaged && packagedBrand !== undefined && packagedBrand !== 'orange' && packagedBrand !== 'blue')
    throw new Error('desktop brand: invalid packaged brand')
  const directory = packaged ? join(resources, 'branding') : developmentResources
  if (directory === undefined || !existsSync(join(directory, 'brand.json'))) {
    if (selectedBrand !== undefined || packaged && packagedBrand !== undefined || developmentResources !== undefined && !packaged)
      throw new Error('desktop brand: native artwork is missing; prepare the selected theme before launch')
    return undefined
  }
  const data = JSON.parse(readFileSync(join(directory, 'brand.json'), 'utf8')) as Record<string, unknown>
  if (data.version !== 1 || (data.brand !== 'orange' && data.brand !== 'blue')
    || typeof data.productName !== 'string' || !data.productName.trim())
    throw new Error('desktop brand: invalid native artwork manifest')
  if (selectedBrand !== undefined && selectedBrand !== data.brand)
    throw new Error('desktop brand: deployment theme differs from the packaged brand')
  if (packaged && packagedBrand !== data.brand)
    throw new Error('desktop brand: artwork differs from the application manifest')
  const icon = join(directory, 'icon.png')
  const tray = join(directory, 'icon.ico')
  if (!existsSync(icon) || !existsSync(tray)) throw new Error('desktop brand: incomplete native artwork')
  return { brand: data.brand, productName: data.productName, icon, tray }
}
