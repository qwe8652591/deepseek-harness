/** Render selected theme artwork into native assets before Electron starts or packages. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { desktopBrandDirectory, readDesktopBrand } from './desktop-brand.mjs'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { packIco } from './render-tray-icon.ts'

/**
 * Render app and tray artwork with transparent padding and retained aspect ratio.
 * @param environment - Explicit brand and installed theme runtime.
 * @param root - Target or development build directory.
 * @returns generated directory, or undefined for upstream artwork.
 */
export async function prepareDesktopBrand(environment: NodeJS.ProcessEnv, root: string): Promise<string | undefined> {
  const artwork = readDesktopBrand(environment)
  if (artwork === undefined) return undefined
  const directory = desktopBrandDirectory(root, artwork.brand)
  const render = async (size: number): Promise<Buffer> => {
    const inner = Math.round(size * 0.875)
    const mark = await sharp(artwork.image, { density: 600 }).resize(inner, inner, { fit: 'inside' }).png().toBuffer()
    return sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
      .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer()
  }
  const icon = await render(1024)
  const entries = await Promise.all([16, 20, 24, 32, 40, 48, 64, 128, 256]
    .map(async size => ({ size, png: await sharp(icon).resize(size, size).png().toBuffer() })))
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'icon.png'), icon)
  await writeFile(join(directory, 'icon.ico'), packIco(entries))
  await writeFile(join(directory, 'brand.json'), JSON.stringify({
    version: 1, brand: artwork.brand, productName: artwork.productName,
  }, null, 2) + '\n')
  return directory
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  await prepareDesktopBrand(process.env, desktopTargetBuildPaths(resolveDesktopBuildTarget()).root)
}
