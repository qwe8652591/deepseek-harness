/** Startup-selected private deployment; the platform credential stays in Electron main. */
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile, realpath, lstat, symlink, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { resolveAikoAccountLocale } from './aiko-account-locale.ts'

/** Paths to an operator-prepared plugin installation and identity configuration. */
export interface AikoDeployment {
  readonly brand: 'aiko' | 'yunyao'
  readonly identityConfig: string
  readonly pluginRuntime: string
  readonly profilePatch?: string
}
const themes = { aiko: 'aiko-dsh-theme', yunyao: 'yunyao-dsh-theme' } as const
const plugins = ['aiko-dsh-workbench-kit', 'aiko-dsh-workbench', 'aiko-dsh-tender', '@aiko-dsh-plugins/dsh-knowledge', 'aiko-dsh-code']
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read the startup brand and absolute deployment paths before opening login.
 * @param path - deployment JSON selected by the operator.
 * @returns validated brand and installation paths.
 */
export async function readAikoDeployment(path: string): Promise<AikoDeployment> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!record(value) || (value.brand !== 'aiko' && value.brand !== 'yunyao')) throw new Error('Desktop deployment brand must be aiko or yunyao')
  if (typeof value.identityConfig !== 'string' || !isAbsolute(value.identityConfig)
    || typeof value.pluginRuntime !== 'string' || !isAbsolute(value.pluginRuntime)) throw new Error('Desktop deployment paths must be absolute')
  if (value.profilePatch !== undefined && (typeof value.profilePatch !== 'string' || !isAbsolute(value.profilePatch))) throw new Error('Desktop profilePatch must be absolute')
  return { brand: value.brand, identityConfig: value.identityConfig, pluginRuntime: value.pluginRuntime,
    ...(typeof value.profilePatch === 'string' ? { profilePatch: value.profilePatch } : {}) }
}

/**
 * Load only the selected installed theme's passive welcome assets and public text.
 * @param deployment - validated startup configuration.
 * @param language - operating-system locale.
 * @returns localized welcome copy and its passive asset directory.
 */
export async function readAikoWelcome(deployment: AikoDeployment, language: string) {
  const require = createRequire(join(deployment.pluginRuntime, 'package.json'))
  const file = require.resolve(themes[deployment.brand] + '/welcome')
  const value: unknown = JSON.parse(await readFile(file, 'utf8'))
  const base = resolveAikoAccountLocale(language)
  if (!record(value) || value.version !== 1 || value.theme !== themes[deployment.brand] || !record(value.messages)) throw new Error('Unsupported desktop welcome theme')
  const copy = value.messages[base.id]
  if (!record(copy) || Object.values(copy).some(text => typeof text !== 'string')) throw new Error('Invalid desktop welcome messages')
  const messages = { ...base.messages }
  for (const key of Object.keys(messages) as (keyof typeof messages)[]) {
    const text = copy[key]
    if (typeof text === 'string') messages[key] = text
  }
  return { locale: { id: base.id, messages }, directory: dirname(file) }
}

/**
 * Compose a verified account's Desktop profile from preinstalled peer plugins without an installer.
 * @param deployment - validated startup configuration.
 * @param profile - initialized profile; the caller holds its official write lock and has stopped the Host.
 */
export async function prepareAikoDesktopProfile(deployment: AikoDeployment, profile: string): Promise<void> {
  const selected = [...plugins, themes[deployment.brand]]
  const runtimeFile = join(deployment.pluginRuntime, 'package.json')
  const runtime: unknown = JSON.parse(await readFile(runtimeFile, 'utf8'))
  if (!record(runtime) || !record(runtime.dependencies)) throw new Error('Desktop plugin runtime has no dependency map')
  const dependencies = runtime.dependencies
  const paths = await Promise.all(selected.map(async (name) => {
    const spec = dependencies[name]
    if (typeof spec !== 'string' || spec === '') throw new Error('Desktop plugin is missing from deployment: ' + name)
    return { name, spec, target: await realpath(join(deployment.pluginRuntime, 'node_modules', name)) }
  }))
  const manifestPath = join(profile, 'package.json')
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!record(manifest) || !record(manifest.dsh) || !record(manifest.dsh.profile)
    || !Array.isArray(manifest.dsh.profile.bundles) || !manifest.dsh.profile.bundles.every(item => typeof item === 'string')
    || manifest.dependencies !== undefined && (!record(manifest.dependencies)
      || !Object.values(manifest.dependencies).every(spec => typeof spec === 'string')))
    throw new Error('Desktop profile manifest has invalid dependencies or bundles')
  const marker = join(profile, '.aiko-desktop.json')
  let previous: { runtime: string } | undefined
  try {
    const saved: unknown = JSON.parse(await readFile(marker, 'utf8'))
    if (!record(saved) || typeof saved.runtime !== 'string') throw new Error('Invalid Desktop deployment marker')
    previous = { runtime: saved.runtime }
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (previous && previous.runtime !== deployment.pluginRuntime) throw new Error('Desktop plugin runtime changed; prepare a new deployment profile first')
  let initialPatch: string | undefined
  if (!previous && deployment.profilePatch !== undefined) {
    const patch = (await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).split('\n').filter(line => !line.trim().startsWith('#')).join('\n').trim()
    if (patch !== '' && patch !== '[]') throw new Error('Desktop profile already has a user patch; merge the deployment patch explicitly')
    initialPatch = await readFile(deployment.profilePatch, 'utf8')
  }
  for (const { name, target } of paths) {
    const link = join(profile, 'node_modules', name)
    try {
      if (await realpath(link) !== target) throw new Error('Desktop profile contains an unmanaged plugin: ' + name)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const other = deployment.brand === 'aiko' ? themes.yunyao : themes.aiko
  const otherPath = join(profile, 'node_modules', other)
  try {
    const stat = await lstat(otherPath)
    if (!previous || !stat.isSymbolicLink() || await realpath(otherPath) !== await realpath(join(deployment.pluginRuntime, 'node_modules', other)))
      throw new Error('Desktop profile contains an unmanaged theme')
    await unlink(otherPath)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const { name, target } of paths) {
    const link = join(profile, 'node_modules', name)
    await mkdir(dirname(link), { recursive: true })
    try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  manifest.dependencies = { ...Object.fromEntries(Object.entries(manifest.dependencies ?? {}).filter(([name]) => name !== other)),
    ...Object.fromEntries(paths.map(({ name, spec }) => [name, spec])) }
  const bundles = manifest.dsh.profile.bundles.map(name => name === other ? themes[deployment.brand] : name)
  manifest.dsh.profile.bundles = [...new Set(previous ? bundles : [...bundles, '@deepseek-ai/dsh-experimental-agent-team-profile', ...selected])]
  if (initialPatch !== undefined) await writeFile(join(profile, 'cordis.patch.yml'), initialPatch)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(marker, JSON.stringify({ runtime: deployment.pluginRuntime, brand: deployment.brand }) + '\n')
}
