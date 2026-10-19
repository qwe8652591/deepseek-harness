/** Startup-selected private deployment; the platform credential stays in Electron main. */
import { createRequire } from 'node:module'
import { access, readFile, mkdir, writeFile, realpath, lstat, symlink, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { dump, load } from 'js-yaml'
import { resolveWorkbenchAccountLocale } from './workbench-account-locale.ts'

/** Paths to an operator-prepared plugin installation and identity configuration. */
export interface WorkbenchDeployment {
  readonly brand: 'orange' | 'blue'
  readonly profile?: 'orange' | 'blue'
  readonly identityConfig: string
  readonly pluginRuntime: string
  readonly profilePatch?: string
}
const themes = { orange: 'workbench-theme-orange', blue: 'workbench-theme-blue' } as const
const plugins = ['workbench', 'workbench-tender', '@workbench/dsh-knowledge', 'workbench-code', 'workbench-market']
const releaseAgeExempt = ['@workbench/*', 'workbench-*', 'blue-dsh-*']
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read the startup brand and absolute deployment paths before opening login.
 * @param path - deployment JSON selected by the operator.
 * @returns validated brand and installation paths.
 */
export async function readWorkbenchDeployment(path: string): Promise<WorkbenchDeployment> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!record(value)) throw new Error('Desktop deployment must be an object')
  const brand = value.profile === undefined ? value.brand : value.profile
  if (brand !== 'orange' && brand !== 'blue') throw new Error('Desktop deployment profile must be orange or blue')
  if (value.brand !== undefined && value.brand !== brand) throw new Error('Desktop deployment profile and brand must match')
  if (typeof value.identityConfig !== 'string' || !isAbsolute(value.identityConfig)
    || typeof value.pluginRuntime !== 'string' || !isAbsolute(value.pluginRuntime)) throw new Error('Desktop deployment paths must be absolute')
  if (value.profilePatch !== undefined && (typeof value.profilePatch !== 'string' || !isAbsolute(value.profilePatch))) throw new Error('Desktop profilePatch must be absolute')
  return { brand, ...(value.profile !== undefined ? { profile: brand } : {}),
    identityConfig: value.identityConfig, pluginRuntime: value.pluginRuntime,
    ...(typeof value.profilePatch === 'string' ? { profilePatch: value.profilePatch } : {}) }
}

/**
 * Load only the selected installed theme's passive welcome assets and public text.
 * @param deployment - validated startup configuration.
 * @param language - operating-system locale.
 * @returns localized welcome copy and its passive asset directory.
 */
export async function readWorkbenchWelcome(deployment: WorkbenchDeployment, language: string) {
  const require = createRequire(join(deployment.pluginRuntime, 'package.json'))
  const file = require.resolve(themes[deployment.brand] + '/welcome')
  const value: unknown = JSON.parse(await readFile(file, 'utf8'))
  const base = resolveWorkbenchAccountLocale(language)
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
export async function prepareWorkbenchDesktopProfile(deployment: WorkbenchDeployment, profile: string): Promise<void> {
  let selected = [...plugins, themes[deployment.brand]]
  let official = ['@deepseek-ai/dsh-experimental-agent-team-profile']
  if (deployment.profile !== undefined) {
    const require = createRequire(join(deployment.pluginRuntime, 'package.json'))
    const file = require.resolve('workbench/profiles/' + deployment.profile)
    const template: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!record(template) || !record(template.dsh) || !record(template.dsh.profile)
      || !Array.isArray(template.dsh.profile.bundles) || !template.dsh.profile.bundles.every((name): name is string => typeof name === 'string'))
      throw new Error('Invalid product profile template')
    const bundles = template.dsh.profile.bundles
    if (bundles.filter(name => name === themes.orange || name === themes.blue).join() !== themes[deployment.brand])
      throw new Error('Product profile must contain only its selected theme')
    selected = bundles.filter(name => !name.startsWith('@deepseek-ai/'))
    // The signed Desktop runtime supplies its own base and Web bundles.
    official = bundles.filter(name => name.startsWith('@deepseek-ai/') && name !== '@deepseek-ai/dsh-base' && name !== '@deepseek-ai/dsh-web-app')
  }
  const installed = [...new Set([...selected, 'workbench-plugin-catalog'])]
  const runtimeFile = join(deployment.pluginRuntime, 'package.json')
  const runtime: unknown = JSON.parse(await readFile(runtimeFile, 'utf8'))
  if (!record(runtime) || !record(runtime.dependencies)) throw new Error('Desktop plugin runtime has no dependency map')
  const dependencies = runtime.dependencies
  const paths = await Promise.all(installed.map(async (name) => {
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
  const marker = join(profile, '.workbench-desktop.json')
  let previous: { runtime: string; profile?: unknown } | undefined
  try {
    const saved: unknown = JSON.parse(await readFile(marker, 'utf8'))
    if (!record(saved) || typeof saved.runtime !== 'string') throw new Error('Invalid Desktop deployment marker')
    previous = { runtime: saved.runtime, profile: saved.profile }
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
  const workspacePath = join(profile, 'pnpm-workspace.yaml')
  const workspace: unknown = load(await readFile(workspacePath, 'utf8'))
  if (!record(workspace) || workspace.overrides !== undefined && !record(workspace.overrides))
    throw new Error('Desktop profile package-manager settings are invalid')
  const other = deployment.brand === 'orange' ? themes.blue : themes.orange
  const migrateKit = deployment.profile !== undefined && previous?.profile === undefined
  const patchPath = join(profile, 'cordis.patch.yml')
  const patchText = initialPatch ?? await readFile(patchPath, 'utf8')
  const patch: unknown = load(patchText) ?? []
  if (!Array.isArray(patch)) throw new Error('Desktop profile patches must be a YAML sequence')
  const brandIds = { 'orange-theme': themes.orange, 'blue-theme': themes.blue }
  let splitWorkbench = true
  try { await access(join(deployment.pluginRuntime, 'node_modules/workbench/node_modules/workdsh-plugin-platform/package.json')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    splitWorkbench = false
  }
  let patchChanged = false
  const nextPatch: unknown[] = []
  for (const entry of patch) {
    if (!record(entry)) { nextPatch.push(entry); continue }
    if (splitWorkbench && entry.id === 'workdsh' && entry.name === 'workbench') {
      entry.name = 'workdsh-plugin-platform'
      patchChanged = true
    }
    const theme = typeof entry.id === 'string' ? brandIds[entry.id as keyof typeof brandIds] : undefined
    if (theme === other || entry.name === other || migrateKit && (entry.id === 'workbench-kit' || entry.name === 'workbench-kit')) {
      patchChanged = true
      continue
    }
    if ((theme === themes[deployment.brand] || entry.name === themes[deployment.brand]) && 'disabled' in entry) {
      delete entry.disabled
      patchChanged = true
    }
    nextPatch.push(entry)
  }
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
  const bundles = manifest.dsh.profile.bundles
    .filter(name => !migrateKit || name !== 'workbench-kit')
    .map(name => name === other ? themes[deployment.brand] : name)
  manifest.dsh.profile.bundles = [...new Set(previous ? bundles : [...bundles, ...official, ...selected])]
  // Package operations retain deployment-owned links and the unpublished passive directory.
  workspace.overrides = { ...Object.fromEntries(Object.entries(workspace.overrides ?? {}).filter(([name]) => name !== other)),
    ...Object.fromEntries(paths.map(({ name, target }) => [name, 'link:' + target.replaceAll('\\', '/')])) }
  // App-center plugins are pinned by the platform registration. pnpm 11.7.0 honors only the first exclusion naming a
  // package while appending one exact-version entry per added package, so these names lead the list.
  const previousExclusions: unknown[] = Array.isArray(workspace.minimumReleaseAgeExclude) ? workspace.minimumReleaseAgeExclude : []
  const excluded = previousExclusions.filter(item => typeof item !== 'string' || !releaseAgeExempt.includes(item))
  workspace.minimumReleaseAgeExclude = [...releaseAgeExempt, ...excluded]
  if (patchChanged) await writeFile(patchPath, dump(nextPatch))
  else if (initialPatch !== undefined) await writeFile(patchPath, initialPatch)
  await writeFile(workspacePath, dump(workspace))
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(marker, JSON.stringify({ runtime: deployment.pluginRuntime, brand: deployment.brand, profile: deployment.profile }) + '\n')
}
