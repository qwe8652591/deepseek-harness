/** Installed product composition; user homes never contain copies of bundled packages. */
import { readFile, writeFile, lstat, unlink, readlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { DesktopProduct } from '../scripts/desktop-product.mjs'

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read the product sealed inside this application's runtime and verify its selected packages.
 * @param runtime Immutable packaged dsh directory.
 * @param brand Brand embedded in the application manifest.
 * @returns Public product identity, or undefined for an upstream application.
 */
export async function readPackagedProduct(runtime: string, brand: unknown): Promise<DesktopProduct | undefined> {
  if (brand === undefined) return undefined
  const value: unknown = JSON.parse(await readFile(join(runtime, 'desktop-product.json'), 'utf8'))
  if (!record(value) || value.schemaVersion !== 1 || value.profile !== brand || brand !== 'aiko' && brand !== 'yunyao'
    || typeof value.appId !== 'string' || typeof value.productName !== 'string' || typeof value.repository !== 'string'
    || value.channel !== 'stable' && value.channel !== 'beta' || !Array.isArray(value.bundles) || !value.bundles.every(name => typeof name === 'string')
    || !Array.isArray(value.plugins)) throw new Error('desktop product: invalid packaged identity')
  const plugins = await Promise.all(value.plugins.map(async (plugin: unknown) => {
    if (!record(plugin) || typeof plugin.name !== 'string' || !/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(plugin.name)
      || typeof plugin.version !== 'string') throw new Error('desktop product: invalid plugin identity')
    const manifest: unknown = JSON.parse(await readFile(join(runtime, 'node_modules', plugin.name, 'package.json'), 'utf8'))
    if (!record(manifest) || manifest.name !== plugin.name || manifest.version !== plugin.version) throw new Error('desktop product: packaged plugin version mismatch: ' + plugin.name)
    return { name: plugin.name, version: plugin.version }
  }))
  const selectedTheme = brand === 'aiko' ? 'aiko-dsh-theme' : 'yunyao-dsh-theme'
  if (value.bundles.filter(name => name === 'aiko-dsh-theme' || name === 'yunyao-dsh-theme').join() !== selectedTheme
    || plugins.filter(plugin => plugin.name.endsWith('dsh-theme')).map(plugin => plugin.name).join() !== selectedTheme)
    throw new Error('desktop product: mixed-brand installation')
  return { schemaVersion: 1, profile: brand, appId: value.appId, productName: value.productName,
    repository: value.repository, channel: value.channel, bundles: value.bundles, plugins }
}

/**
 * Activate packaged bundles under the official profile lock while preserving account data and user patches.
 * @param product Verified product supplied by this installer.
 * @param profile Initialized account-owned profile, with its Host stopped.
 * @returns Resolves when the profile refers to the current installation without package-manager operations.
 */
export async function prepareProductProfile(product: DesktopProduct, profile: string): Promise<void> {
  const file = join(profile, 'package.json')
  const value: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!record(value) || !record(value.dsh) || !record(value.dsh.profile) || !Array.isArray(value.dsh.profile.bundles)
    || !value.dsh.profile.bundles.every(name => typeof name === 'string') || value.dependencies !== undefined && !record(value.dependencies))
    throw new Error('desktop product: invalid account profile')
  const marker = join(profile, '.desktop-product.json')
  let previous: { profile: string; bundles: string[] } | undefined
  try {
    const saved: unknown = JSON.parse(await readFile(marker, 'utf8'))
    if (!record(saved) || saved.profile !== product.profile || !Array.isArray(saved.bundles) || !saved.bundles.every(name => typeof name === 'string')) throw new Error('desktop product: account profile belongs to another product')
    previous = { profile: product.profile, bundles: saved.bundles }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  // Old development links are removable only when the deployment marker owns their exact targets.
  let oldRuntime: string | undefined
  try {
    const old: unknown = JSON.parse(await readFile(join(profile, '.aiko-desktop.json'), 'utf8'))
    if (!record(old) || typeof old.runtime !== 'string' || old.brand !== product.profile) throw new Error('desktop product: invalid legacy deployment marker')
    oldRuntime = old.runtime
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const links: string[] = []
  const owned = new Set(product.plugins.map(plugin => plugin.name))
  for (const name of owned) {
    const path = join(profile, 'node_modules', name)
    try {
      const info = await lstat(path)
      if (!info.isSymbolicLink() || oldRuntime === undefined || resolve(dirname(path), await readlink(path)) !== resolve(oldRuntime, 'node_modules', name))
        throw new Error('desktop product: unmanaged package requires migration: ' + name)
      links.push(path)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  for (const path of links) await unlink(path)
  value.dependencies = Object.fromEntries(Object.entries(value.dependencies ?? {}).filter(([name]) => !owned.has(name)))
  if (record(value.pnpm) && record(value.pnpm.overrides)) {
    value.pnpm.overrides = Object.fromEntries(Object.entries(value.pnpm.overrides).filter(([name]) => !owned.has(name)))
  }
  const added = previous === undefined ? product.bundles : product.bundles.filter(name => !previous.bundles.includes(name))
  value.dsh.profile.bundles = [...new Set([...value.dsh.profile.bundles, ...added])]
  await writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await writeFileAtomic(marker, JSON.stringify({ schemaVersion: 1, profile: product.profile, bundles: product.bundles, plugins: product.plugins }) + '\n', { mode: 0o600 })
}

/**
 * Write the final product policy consumed by the ordinary profile launcher.
 * @param runtime Prepared product runtime before integrity inventory.
 * @returns Resolves after the managed-install overlay is saved.
 */
export async function writeProductPolicy(runtime: string): Promise<void> {
  const rows = ['plugin-manager', 'tool-plugin-manager', 'ui-plugin-manager', 'ui-settings-plugin-inventory', 'dsh-market']
    .map(id => ({ id, disabled: true }))
  await writeFile(join(runtime, 'desktop-product.patch.yml'), JSON.stringify([...rows,
    { id: 'llm-claude', config: { pluginUpdates: false } },
  ], null, 2) + '\n')
}
