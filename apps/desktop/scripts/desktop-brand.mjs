/** Resolve passive theme artwork for native desktop packaging without loading a plugin. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { readDesktopProduct } from './desktop-product.mjs'

/**
 * Resolve one installed theme's native artwork; neither option means upstream artwork.
 * @param {NodeJS.ProcessEnv} env Build settings.
 * @returns {{ brand: 'orange' | 'blue', productName: string, image: Buffer } | undefined} Selected artwork.
 */
export function readDesktopBrand(env) {
  const product = readDesktopProduct(env)
  if (product !== undefined) return { brand: product.profile, productName: product.productName,
    image: Buffer.from(product.artwork.image.split(',')[1], 'base64') }
  const brand = env.DSH_DESKTOP_BRAND
  const runtime = env.DSH_DESKTOP_BRAND_RUNTIME
  if (brand === undefined && runtime === undefined) return undefined
  if (brand !== 'orange' && brand !== 'blue') throw new Error('desktop brand: select orange or blue')
  if (!runtime || !isAbsolute(runtime)) throw new Error('desktop brand: DSH_DESKTOP_BRAND_RUNTIME must be absolute')
  const theme = brand === 'orange' ? 'workbench-theme-orange' : 'workbench-theme-blue'
  const require = createRequire(join(runtime, 'package.json'))
  const asset = JSON.parse(readFileSync(require.resolve(theme + '/desktop-icon'), 'utf8'))
  if (asset.version !== 1 || asset.theme !== theme || typeof asset.productName !== 'string' || !asset.productName.trim())
    throw new Error('desktop brand: invalid theme icon manifest')
  const image = typeof asset.image === 'string' && /^data:image\/(?:png|svg\+xml);base64,([A-Za-z0-9+/=]+)$/u.exec(asset.image)
  if (!image) throw new Error('desktop brand: expected embedded PNG or SVG artwork')
  return { brand, productName: asset.productName, image: Buffer.from(image[1], 'base64') }
}

/**
 * Keep generated artwork separate for each build target and brand.
 * @param {string} root Target build directory.
 * @param {'orange' | 'blue'} brand Selected brand.
 * @returns {string} Native artwork directory.
 */
export function desktopBrandDirectory(root, brand) {
  return join(root, 'branding', brand)
}
