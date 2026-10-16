/** Build inputs and public metadata for a complete branded Desktop distribution. */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { valid } from 'semver'

const themes = { aiko: 'aiko-dsh-theme', yunyao: 'yunyao-dsh-theme' }
// Workbench embeds the knowledge foundation; Tender, Code and the knowledge apps install from its app center.
// The Markdown editor, Visio, draw.io, PPT and image generation plugins are first-party tools every product ships enabled.
const applications = ['aiko-dsh-workbench', 'aiko-dsh-market', 'aiko-dsh-md-editor', 'aiko-dsh-visio', 'aiko-dsh-drawio', 'aiko-dsh-ppt', 'aiko-dsh-image-generation']
const official = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-agent-team-profile']
const object = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a self-hosted release directory: an HTTPS URL without credentials, query or fragment, ending in `/`.
 * @param {unknown} value Candidate `releases` field.
 * @returns {string} The validated URL text.
 */
function releaseDirectory(value) {
  let url
  try { url = typeof value === 'string' ? new URL(value) : undefined } catch { url = undefined } // invalid URL text is reported below
  if (url === undefined || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.pathname.endsWith('/') || url.href !== value) throw new Error('desktop product: releases must be an HTTPS directory URL ending in /')
  return value
}

/**
 * Validate the suggested platform: an HTTPS origin without path, credentials, query or fragment.
 * @param {unknown} value Candidate `platform` field.
 * @returns {string} The validated origin.
 */
function platformOrigin(value) {
  let url
  try { url = typeof value === 'string' ? new URL(value) : undefined } catch { url = undefined } // invalid URL text is reported below
  if (url === undefined || url.protocol !== 'https:' || url.origin !== value) throw new Error('desktop product: platform must be an HTTPS origin without a path')
  return value
}

/**
 * Validate packaged public metadata without accepting build paths or credentials.
 * @param {unknown} value JSON read from the application resources.
 * @returns {import('./desktop-product.mjs').DesktopProduct} Public product configuration.
 */
export function parseDesktopProduct(value) {
  if (!object(value) || value.schemaVersion !== 1 || !Object.hasOwn(themes, value.profile)) throw new Error('desktop product: invalid profile')
  if (typeof value.appId !== 'string' || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/.test(value.appId)
    || !value.appId.split('.').includes(value.profile)) throw new Error('desktop product: appId must contain the brand as a separate component')
  if (typeof value.productName !== 'string' || !value.productName.trim() || /[\\/:*?"<>|\r\n]/.test(value.productName)) throw new Error('desktop product: invalid productName')
  if ((value.repository === undefined) === (value.releases === undefined)) throw new Error('desktop product: set exactly one of repository and releases')
  if (value.repository !== undefined && (typeof value.repository !== 'string' || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(value.repository))) throw new Error('desktop product: repository must be owner/repo')
  const location = value.repository !== undefined ? { repository: value.repository } : { releases: releaseDirectory(value.releases) }
  const suggested = value.platform === undefined ? {} : { platform: platformOrigin(value.platform) }
  if (value.channel !== 'stable' && value.channel !== 'beta') throw new Error('desktop product: channel must be stable or beta')
  const expectedBundles = [...official, ...applications, themes[value.profile]]
  if (!Array.isArray(value.bundles) || JSON.stringify(value.bundles) !== JSON.stringify(expectedBundles)) throw new Error('desktop product: bundles must match the selected product profile')
  const expected = [...applications, themes[value.profile], 'aiko-dsh-plugin-catalog'].sort()
  if (!Array.isArray(value.plugins) || value.plugins.some(plugin => !object(plugin) || typeof plugin.name !== 'string' || typeof plugin.version !== 'string' || valid(plugin.version) === null)
    || JSON.stringify(value.plugins.map(plugin => plugin.name).sort()) !== JSON.stringify(expected)) throw new Error('desktop product: incomplete or mixed-brand plugin set')
  return { schemaVersion: 1, profile: value.profile, appId: value.appId, productName: value.productName,
    ...location, ...suggested, channel: value.channel, bundles: [...value.bundles],
    plugins: value.plugins.map(({ name, version }) => ({ name, version })) }
}

/**
 * Resolve and verify all plugin archives selected by an explicit packaging manifest.
 * @param {NodeJS.ProcessEnv} env Packaging settings containing DSH_DESKTOP_PRODUCT.
 * @param {boolean} verifyArchives Whether to hash local archive bytes before installation.
 * @returns {import('./desktop-product.mjs').DesktopProductBuild | undefined} Validated inputs, or the upstream distribution.
 */
export function readDesktopProduct(env, verifyArchives = false) {
  const file = env.DSH_DESKTOP_PRODUCT
  if (file === undefined) return undefined
  if (!isAbsolute(file)) throw new Error('desktop product: DSH_DESKTOP_PRODUCT must be absolute')
  const value = JSON.parse(readFileSync(file, 'utf8'))
  const product = parseDesktopProduct(value)
  const allowed = new Set(['schemaVersion', 'profile', 'appId', 'productName', 'repository', 'releases', 'platform', 'channel', 'bundles', 'plugins', 'artwork'])
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('desktop product: unexpected field; platform credentials do not belong in release inputs')
  const artwork = value.artwork
  if (!object(artwork) || artwork.version !== 1 || artwork.theme !== themes[product.profile] || artwork.productName !== product.productName
    || typeof artwork.image !== 'string' || !/^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(artwork.image)) throw new Error('desktop product: missing selected theme artwork')
  const archives = value.plugins.map(plugin => {
    if (typeof plugin.file !== 'string' || !plugin.file.endsWith('.tgz') || typeof plugin.integrity !== 'string'
      || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(plugin.integrity)) throw new Error('desktop product: archives require file and SHA-512 integrity')
    const path = resolve(dirname(file), plugin.file)
    if (verifyArchives && 'sha512-' + createHash('sha512').update(readFileSync(path)).digest('base64') !== plugin.integrity) throw new Error('desktop product: archive integrity failed for ' + plugin.name)
    return { name: plugin.name, version: plugin.version, path, integrity: plugin.integrity }
  })
  return { ...product, archives, artwork }
}

/**
 * Select a generic feed stored in a brand-specific channel directory: a GitHub channel release, or
 * `<releases><profile>-<channel>/` on the product's own HTTPS release server.
 * @param {import('./desktop-product.mjs').DesktopProduct} product Public product metadata.
 * @param {string} target Validated desktop platform/architecture name.
 * @returns {{ publicUrl: string, channel: string, tag: string }} Feed identity.
 */
export function desktopProductFeed(product, target) {
  if (!['win-x64', 'mac-x64', 'mac-arm64'].includes(target)) throw new Error('desktop product: unsupported update target')
  const tag = `${product.profile}-${product.channel}`
  const base = product.releases ?? `https://github.com/${product.repository}/releases/download/`
  return { publicUrl: `${base}${tag}/`, channel: `${tag}-${target}`, tag }
}
