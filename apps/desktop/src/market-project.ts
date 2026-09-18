/** Native-confirmed Aiko plugin transactions over the external Desktop profile. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants, copyFileSync, existsSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { dump, JSON_SCHEMA, load } from 'js-yaml'
import { valid as validVersion } from 'semver'
import { readDesktopRuntime } from './runtime-tree.ts'
import { desktopNodeEnvironment } from './node-environment.ts'
import { assertPluginCompatibility } from './plugin-compatibility.ts'
import { migrateRetiredPlugin } from './retired-plugin-sources.ts'

const DESKTOP_PROJECT_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml'] as const
/** Desktop plugin record derived from the installed profile. */
export interface DesktopPluginRecord {
  readonly name: string
  readonly version: string
  /** Exact npm name/version or explicitly named HTTPS artifact used for reinstalls. */
  readonly spec: string
}

/** Installed desktop project manifest slice. */
interface DesktopProjectManifest {
  readonly name: string
  readonly private: true
  readonly version: string
  readonly dependencies: Record<string, string>
  readonly dsh: {
    readonly profile: {
      readonly bundles: string[]
    }
  }
}

/** Journaled activation step used for crash recovery. */
interface DesktopPendingTransaction {
  readonly schemaVersion: 1
  readonly id: string
  readonly stagingProfile: string
  readonly step: 'prepared' | 'active-moved' | 'staging-activated'
}

/** Exact executables the desktop shell bundles. */
export interface DesktopRuntimeExecutables {
  readonly node: string
  readonly pnpm: string
  readonly dsh: string
  readonly nodeBin: string
}

/** Hooks that bind project replacement to backend lifecycle and health. */
export interface DesktopProjectHooks {
  /** Prove the staged dependency graph while the active backend is stopped. */
  healthCheck(projectDir: string): Promise<void>
  /** Stop the active backend and await process exit before directory moves. */
  beforeActivate(): Promise<void>
  /** Start the selected active project after commit or rollback. */
  afterActivate(): Promise<void>
}

/** Supported dependency mutation. */
export type DesktopProjectMutation =
  | { readonly type: 'plugin-add'; readonly spec: string }
  | { readonly type: 'plugins-add'; readonly specs: readonly string[] }
  | { readonly type: 'plugin-remove'; readonly name: string }
  | { readonly type: 'plugin-update'; readonly name: string; readonly version: string }

const DESKTOP_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u
const MAX_PNPM_DIAGNOSTIC_BYTES = 64 * 1024
const DESKTOP_REGISTRY = 'https://registry.npmjs.org/'
function errorOf(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback)
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** pnpm matches the first rule for a package; combine existing exact approvals without widening them. */
function normalizeReleaseAgeExclusions(projectDir: string): void {
  const path = join(projectDir, 'pnpm-workspace.yaml')
  const workspace: unknown = load(readFileSync(path, 'utf8'), { schema: JSON_SCHEMA })
  if (!isRecord(workspace) || !Array.isArray(workspace.minimumReleaseAgeExclude)) return
  const versions = new Map<string, Set<string>>()
  for (const entry of workspace.minimumReleaseAgeExclude) {
    if (typeof entry !== 'string') throw new Error('desktop project: invalid pnpm release-age exclusions')
    const at = entry.lastIndexOf('@')
    const name = entry.slice(0, at)
    assertPackageName(name)
    const values = versions.get(name) ?? new Set<string>()
    for (const version of entry.slice(at + 1).split('||')) {
      const exact = version.trim()
      if (validVersion(exact) !== exact) throw new Error('desktop project: release-age approvals must be exact versions')
      values.add(exact)
    }
    versions.set(name, values)
  }
  const normalized = [...versions].map(([name, values]) => `${name}@${[...values].join(' || ')}`)
  if (isDeepStrictEqual(normalized, workspace.minimumReleaseAgeExclude)) return
  writeFileSync(path, dump({ ...workspace, minimumReleaseAgeExclude: normalized }, { lineWidth: -1, noRefs: true }), { mode: 0o600 })
}

/** Record exact registry versions selected for this profile without weakening pnpm's release-age policy. */
function approveExactReleaseAgeExclusions(projectDir: string, specs: readonly string[]): void {
  const approvals = specs.flatMap((spec) => {
    const name = packageNameFromSpec(spec)
    if (name === undefined) return []
    const version = spec.slice(name.length + 1)
    return validVersion(version) === version ? [`${name}@${version}`] : []
  })
  if (approvals.length === 0) return
  const path = join(projectDir, 'pnpm-workspace.yaml')
  const workspace: unknown = load(readFileSync(path, 'utf8'), { schema: JSON_SCHEMA })
  if (!isRecord(workspace)) throw new Error('desktop project: invalid pnpm workspace settings')
  const existing = workspace.minimumReleaseAgeExclude
  if (existing !== undefined && (!Array.isArray(existing) || !existing.every((entry): entry is string => typeof entry === 'string'))) {
    throw new Error('desktop project: invalid pnpm release-age exclusions')
  }
  writeFileSync(path, dump({
    ...workspace,
    minimumReleaseAgeExclude: [...(existing ?? []), ...approvals],
  }, { lineWidth: -1, noRefs: true }), { mode: 0o600 })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDescendant(root: string, target: string): boolean {
  const child = relative(root, target)
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

function assertPackageName(name: string): void {
  if (!PACKAGE_NAME_PATTERN.test(name)) throw new Error(`desktop project: invalid npm package name ${JSON.stringify(name)}`)
}

function assertVersion(version: string): void {
  if (!VERSION_PATTERN.test(version)) throw new Error(`desktop project: invalid exact version ${JSON.stringify(version)}`)
}

/**
 * Validate a registry package or an explicitly named HTTPS tarball.
 * @param spec - npm name with an optional version, tag, or HTTPS tarball URL.
 * @returns package name, or undefined when the spec's final name is registry-resolved.
 */
export function packageNameFromSpec(spec: string): string | undefined {
  const sourceAt = spec.indexOf('@https://', 1)
  if (sourceAt !== -1) {
    const name = spec.slice(0, sourceAt)
    assertPackageName(name)
    const source = spec.slice(sourceAt + 1)
    const url = new URL(source)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
      || url.search !== '' || url.hash !== '' || !url.pathname.endsWith('.tgz')
      || /[\s\\]/u.test(source)) {
      throw new Error('desktop project: expected an HTTPS tarball URL without credentials, query, or fragment')
    }
    return name
  }
  if (spec === '' || spec.startsWith('-') || /[\s\\]/u.test(spec) || spec.includes('://') || spec.startsWith('file:')) {
    throw new Error(`desktop project: unsupported npm package spec ${JSON.stringify(spec)}`)
  }
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/')
    if (slash === -1) throw new Error(`desktop project: invalid scoped package spec ${JSON.stringify(spec)}`)
    const versionAt = spec.indexOf('@', slash)
    const name = versionAt === -1 ? spec : spec.slice(0, versionAt)
    assertPackageName(name)
    if (versionAt !== -1) assertVersion(spec.slice(versionAt + 1))
    return name
  }
  const versionAt = spec.indexOf('@')
  const name = versionAt === -1 ? spec : spec.slice(0, versionAt)
  assertPackageName(name)
  if (versionAt !== -1) assertVersion(spec.slice(versionAt + 1))
  return name
}

function removeOwnedDirectory(path: string): void {
  if (!existsSync(path)) return
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) {
    unlinkSync(path)
    return
  }
  if (!stat.isDirectory()) throw new Error(`desktop project: owned directory path is not a directory: ${path}`)
  rmSync(path, { recursive: true })
}

function copyMetadata(source: string, target: string): void {
  mkdirSync(target, { recursive: true, mode: 0o700 })
  for (const filename of DESKTOP_PROJECT_FILES) {
    const from = join(source, filename)
    if (existsSync(from)) copyFileSync(from, join(target, filename), constants.COPYFILE_EXCL)
  }
}

function projectManifest(projectDir: string): DesktopProjectManifest {
  const value = readJson(join(projectDir, 'package.json'))
  const dsh = isRecord(value) && isRecord(value.dsh) ? value.dsh : undefined
  const profile = isRecord(dsh?.profile) ? dsh.profile : undefined
  if (!isRecord(value) || !isRecord(value.dependencies) || !Array.isArray(profile?.bundles)
    || !profile.bundles.every(bundle => typeof bundle === 'string')) {
    throw new Error('desktop market: invalid external plugin profile')
  }
  return value as unknown as DesktopProjectManifest
}

function profilePluginNames(projectDir: string): readonly string[] {
  return Object.keys(projectManifest(projectDir).dependencies).filter(name => !DESKTOP_PROFILE_BUNDLES.some(bundle => bundle === name))
}

function pluginRecords(projectDir: string): readonly DesktopPluginRecord[] {
  const manifest = projectManifest(projectDir)
  return profilePluginNames(projectDir).map((name) => {
    const installed = inspectPlugin(projectDir, name)
    const source = manifest.dependencies[name]
    return source?.startsWith('https:') === true ? { ...installed, spec: `${name}@${source}` } : installed
  })
}

function writeProfilePlugins(projectDir: string, plugins: readonly DesktopPluginRecord[], enable: readonly string[] = []): void {
  const manifest = projectManifest(projectDir)
  const available = new Set([...DESKTOP_PROFILE_BUNDLES, ...plugins.map(plugin => plugin.name)])
  const retained = manifest.dsh.profile.bundles.filter(name => available.has(name))
  writeJson(join(projectDir, 'package.json'), { ...manifest,
    dsh: { ...manifest.dsh, profile: { ...manifest.dsh.profile, bundles: [...new Set([...retained, ...enable])] } },
  })
}

function inspectPlugin(projectDir: string, requestedName: string): DesktopPluginRecord {
  const manifestPath = join(projectDir, 'node_modules', ...requestedName.split('/'), 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`desktop project: installed package ${JSON.stringify(requestedName)} has no manifest`)
  }
  const manifest = readJson(manifestPath)
  if (!isRecord(manifest) || manifest.name !== requestedName || typeof manifest.version !== 'string') {
    throw new Error(`desktop project: installed package ${JSON.stringify(requestedName)} has inconsistent name or version`)
  }
  const dsh = manifest.dsh
  const bundle = isRecord(dsh) ? dsh.bundle : undefined
  const patch = isRecord(bundle) ? bundle.patch : undefined
  if (typeof patch !== 'string' || patch === '') {
    throw new Error(`desktop project: ${requestedName}@${manifest.version} does not declare dsh.bundle.patch`)
  }
  const packageDir = dirname(manifestPath)
  const patchPath = resolve(packageDir, patch)
  if ((patchPath !== packageDir && !patchPath.startsWith(packageDir + sep)) || !existsSync(patchPath)) {
    throw new Error(`desktop project: ${requestedName}@${manifest.version} declares an invalid bundle patch`)
  }
  return { name: requestedName, version: manifest.version, spec: `${requestedName}@${manifest.version}` }
}

/** Stages only third-party packages; callers stop the Host before invoking a mutation. */
export class DesktopMarketProject {
  private lockDescriptor: number | undefined
  readonly paths: ReturnType<typeof marketPaths>

  /** @param profile External plugin profile. @param runtime Immutable application runtime and package tools. */
  constructor(profile: string, readonly runtime: DesktopRuntimeExecutables) { this.paths = marketPaths(profile) }

  /** @returns Exact runtime version used for plugin compatibility checks. */
  dshVersion(): string { return readDesktopRuntime(this.runtime.dsh).release.version }

  /** Recover an interrupted directory replacement before reading the active project. */
  recover(): void {
    if (!existsSync(this.paths.pending)) return
    const value = readJson(this.paths.pending)
    if (!isRecord(value) || value.schemaVersion !== 1
      || typeof value.id !== 'string' || typeof value.stagingProfile !== 'string'
      || !isDescendant(this.paths.staging, value.stagingProfile)
      || (value.step !== 'prepared' && value.step !== 'active-moved' && value.step !== 'staging-activated')) {
      throw new Error(`desktop project: invalid activation journal ${this.paths.pending}`)
    }
    const pending: DesktopPendingTransaction = {
      schemaVersion: 1,
      id: value.id,
      stagingProfile: value.stagingProfile,
      step: value.step,
    }
    if (!existsSync(this.paths.profile) && existsSync(this.paths.rollback)) {
      mkdirSync(dirname(this.paths.profile), { recursive: true })
      renameSync(this.paths.rollback, this.paths.profile)
    }
    removeOwnedDirectory(pending.stagingProfile)
    unlinkSync(this.paths.pending)
  }

  /** Read the active desktop plugin inventory. */
  listPlugins(): readonly DesktopPluginRecord[] {
    if (!existsSync(this.paths.profile)) return []
    return pluginRecords(this.paths.profile)
  }

  /** Apply one exact dependency mutation through a staging project. */
  async mutate(mutation: DesktopProjectMutation, hooks: DesktopProjectHooks): Promise<void> {
    await this.withLock(async () => {
      this.recover()
      if (!existsSync(this.paths.profile)) throw new Error('desktop project: active profile is not installed')
      const stagingProfile = this.newStagingProfile()
      try {
        copyMetadata(this.paths.profile, stagingProfile)
        const plugins = pluginRecords(this.paths.profile)
        this.migratePluginSources(stagingProfile, plugins)
        let normalized = mutation
        if (mutation.type === 'plugin-remove' || mutation.type === 'plugin-update') {
          const previous = plugins.find(plugin => plugin.name === mutation.name)
          if (previous !== undefined) normalized = { ...mutation, name: migrateRetiredPlugin(previous).name }
        }
        await this.applyMutation(stagingProfile, normalized)
        assertPluginCompatibility(stagingProfile, this.dshVersion(), pluginRecords(stagingProfile))
        await hooks.healthCheck(stagingProfile)
        await this.activate(stagingProfile, hooks)
      } catch (error) {
        removeOwnedDirectory(stagingProfile)
        throw error
      }
    })
  }

  private newStagingProfile(): string {
    const path = join(this.paths.staging, randomUUID(), 'profile')
    mkdirSync(path, { recursive: true, mode: 0o700 })
    return path
  }

  private migratePluginSources(projectDir: string, plugins: readonly DesktopPluginRecord[]): void {
    const manifest = projectManifest(projectDir)
    const dependencies = new Map(Object.entries(manifest.dependencies))
    const migrations = plugins.map(plugin => ({ plugin, migrated: migrateRetiredPlugin(plugin) }))
    for (const { plugin, migrated } of migrations) {
      if (migrated !== plugin) {
        if (migrated.name !== plugin.name && dependencies.has(migrated.name)) {
          throw new Error(`desktop project: migration conflicts with installed ${migrated.name}`)
        }
        dependencies.delete(plugin.name)
        dependencies.set(migrated.name, migrated.version)
      }
    }
    writeJson(join(projectDir, 'package.json'), { ...manifest, dependencies: Object.fromEntries(dependencies) })
    const selected = manifest.dsh.profile.bundles.map(name => migrations.find(item => item.plugin.name === name)?.migrated.name ?? name)
    const staged = projectManifest(projectDir)
    writeJson(join(projectDir, 'package.json'), { ...staged, dsh: { ...staged.dsh, profile: { ...staged.dsh.profile, bundles: selected } } })
    approveExactReleaseAgeExclusions(projectDir, migrations.map(({ migrated }) => migrated.spec))
  }

  private async applyMutation(projectDir: string, mutation: DesktopProjectMutation): Promise<void> {
    const protectedNames = new Set(readDesktopRuntime(this.runtime.dsh).sharedPackages.map(entry => entry.name))
    const assertPlugin = (name: string): void => {
      if (protectedNames.has(name) || DESKTOP_PROFILE_BUNDLES.some(bundle => bundle === name)) {
        throw new Error(`desktop project: ${name} is managed by the desktop release`)
      }
    }
    switch (mutation.type) {
      case 'plugin-add':
      case 'plugins-add': {
        const specs = mutation.type === 'plugin-add' ? [mutation.spec] : mutation.specs
        if (specs.length === 0) throw new Error('desktop project: plugin packages are required')
        const names = specs.map((spec) => {
          const name = packageNameFromSpec(spec)
          if (name === undefined) throw new Error('desktop project: plugin package name is required')
          assertPlugin(name)
          return name
        })
        if (new Set(names).size !== names.length) throw new Error('desktop project: duplicate plugin packages')
        const previous = pluginRecords(this.paths.profile).map(migrateRetiredPlugin)
        approveExactReleaseAgeExclusions(projectDir, specs)
        await this.runPnpm(projectDir, ['add', ...specs, '--save-exact'])
        const installed = names.map(name => inspectPlugin(projectDir, name))
        const current = previous.filter(plugin => !names.includes(plugin.name))
        const firstReplaced = previous.findIndex(plugin => names.includes(plugin.name))
        const insertAt = firstReplaced === -1 ? current.length : firstReplaced
        current.splice(insertAt, 0, ...installed)
        writeProfilePlugins(projectDir, current, names)
        return
      }
      case 'plugin-remove': {
        assertPackageName(mutation.name)
        assertPlugin(mutation.name)
        if (!profilePluginNames(projectDir).includes(mutation.name)) {
          throw new Error(`desktop project: plugin ${JSON.stringify(mutation.name)} is not installed`)
        }
        const remaining = pluginRecords(this.paths.profile).filter(plugin => migrateRetiredPlugin(plugin).name !== mutation.name)
        for (const plugin of remaining) {
          const manifest = readJson(join(this.paths.profile, 'node_modules', ...plugin.name.split('/'), 'package.json'))
          if (!isRecord(manifest)) throw new Error(`desktop project: invalid plugin manifest ${plugin.name}`)
          for (const dependencies of [manifest.dependencies, manifest.peerDependencies]) {
            if (isRecord(dependencies) && Object.hasOwn(dependencies, mutation.name)) {
              throw new Error(`desktop project: ${mutation.name} is required by ${plugin.name}`)
            }
          }
        }
        await this.runPnpm(projectDir, ['remove', mutation.name])
        writeProfilePlugins(projectDir, remaining.map(migrateRetiredPlugin))
        return
      }
      case 'plugin-update':
        assertPackageName(mutation.name)
        assertPlugin(mutation.name)
        assertVersion(mutation.version)
        if (!profilePluginNames(projectDir).includes(mutation.name)) {
          throw new Error(`desktop project: plugin ${JSON.stringify(mutation.name)} is not installed`)
        }
        approveExactReleaseAgeExclusions(projectDir, [`${mutation.name}@${mutation.version}`])
        await this.runPnpm(projectDir, ['add', `${mutation.name}@${mutation.version}`, '--save-exact'])
        {
          const installed = inspectPlugin(projectDir, mutation.name)
          writeProfilePlugins(
            projectDir,
            pluginRecords(projectDir).map(plugin => plugin.name === installed.name ? installed : plugin),
          )
        }
        return
      default:
        mutation satisfies never
    }
  }

  private async activate(stagingProfile: string, hooks: DesktopProjectHooks): Promise<void> {
    const pending: DesktopPendingTransaction = {
      schemaVersion: 1,
      id: basename(dirname(stagingProfile)),
      stagingProfile,
      step: 'prepared',
    }
    writeJson(this.paths.pending, pending)
    await hooks.beforeActivate()
    let activeMoved = false
    let stagingActivated = false
    try {
      removeOwnedDirectory(this.paths.rollback)
      mkdirSync(dirname(this.paths.rollback), { recursive: true, mode: 0o700 })
      writeJson(this.paths.pending, { ...pending, step: 'active-moved' } satisfies DesktopPendingTransaction)
      if (existsSync(this.paths.profile)) {
        renameSync(this.paths.profile, this.paths.rollback)
        activeMoved = true
      }
      mkdirSync(dirname(this.paths.profile), { recursive: true, mode: 0o700 })
      writeJson(this.paths.pending, { ...pending, step: 'staging-activated' } satisfies DesktopPendingTransaction)
      renameSync(stagingProfile, this.paths.profile)
      stagingActivated = true
      await hooks.afterActivate()
      unlinkSync(this.paths.pending)
    } catch (error) {
      if (stagingActivated) removeOwnedDirectory(this.paths.profile)
      if (activeMoved && existsSync(this.paths.rollback)) renameSync(this.paths.rollback, this.paths.profile)
      if (existsSync(this.paths.pending)) unlinkSync(this.paths.pending)
      // Preserve the activation failure; the caller also owns a final Host restart attempt.
      await hooks.afterActivate().catch(() => undefined)
      throw error
    }
  }

  private async runPnpm(projectDir: string, args: readonly string[]): Promise<void> {
    const [command, ...commandArgs] = args
    if (command === undefined) throw new Error('desktop project: pnpm command is required')
    normalizeReleaseAgeExclusions(projectDir)
    for (const path of [this.paths.root, this.paths.pnpm.store, this.paths.pnpm.cache,
      this.paths.pnpm.state, this.paths.pnpm.config, this.paths.pnpm.home]) {
      mkdirSync(path, { recursive: true, mode: 0o700 })
    }
    const npmrc = join(this.paths.pnpm.config, 'npmrc')
    if (!existsSync(npmrc)) writeFileSync(npmrc, '', { mode: 0o600 })
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
      !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name)
    )))
    await new Promise<void>((settle, reject) => {
      const child = spawn(this.runtime.node, [
        this.runtime.pnpm,
        `--config.registry=${DESKTOP_REGISTRY}`,
        `--config.store-dir=${this.paths.pnpm.store}`,
        '--config.enable-global-virtual-store=false',
        `--config.userconfig=${npmrc}`,
        command,
        ...commandArgs,
      ], {
        cwd: projectDir,
        env: {
          ...desktopNodeEnvironment(this.runtime.node, this.runtime.nodeBin, inherited),
          COREPACK_HOME: this.paths.pnpm.home,
          NPM_CONFIG_REGISTRY: DESKTOP_REGISTRY,
          NPM_CONFIG_STORE_DIR: this.paths.pnpm.store,
          NPM_CONFIG_USERCONFIG: npmrc,
          PNPM_HOME: this.paths.pnpm.home,
          XDG_CACHE_HOME: this.paths.pnpm.cache,
          XDG_CONFIG_HOME: this.paths.pnpm.config,
          XDG_STATE_HOME: this.paths.pnpm.state,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let diagnostics = ''
      let failure: Error | undefined
      const appendDiagnostics = (chunk: string): void => {
        diagnostics = (diagnostics + chunk).slice(-MAX_PNPM_DIAGNOSTIC_BYTES)
      }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', appendDiagnostics)
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', appendDiagnostics)
      child.once('error', (error) => { failure = error })
      child.once('close', (code, signal) => {
        try {
          this.writeLockOwner(process.pid)
        } catch (error) {
          reject(errorOf(error, 'desktop project: failed to return the package transaction lock to Electron'))
          return
        }
        if (failure !== undefined) { reject(failure); return }
        if (code === 0) {
          settle()
          return
        }
        reject(new Error(
          `desktop project: pnpm exited with ${String(code ?? signal)}${diagnostics.trim() === '' ? '' : `: ${diagnostics.trim()}`}`,
        ))
      })
      if (child.pid !== undefined) {
        try {
          this.writeLockOwner(child.pid)
        } catch (error) {
          failure = errorOf(error, 'desktop project: failed to assign the package transaction lock to pnpm')
          child.kill('SIGKILL')
        }
      }
    })
  }

  private writeLockOwner(pid: number): void {
    const descriptor = this.lockDescriptor
    if (descriptor === undefined) throw new Error('desktop project: package transaction lost its lock')
    const content = Buffer.from(`${String(pid)}\n`)
    ftruncateSync(descriptor, 0)
    writeSync(descriptor, content, 0, content.byteLength, 0)
    fsyncSync(descriptor)
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    mkdirSync(this.paths.root, { recursive: true, mode: 0o700 })
    let descriptor: number
    try {
      descriptor = openSync(this.paths.lock, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const lock = lstatSync(this.paths.lock)
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error('desktop project: package transaction lock is not a regular file')
        }
        const owner = Number.parseInt(readFileSync(this.paths.lock, 'utf8').trim(), 10)
        let active = !Number.isSafeInteger(owner) || owner <= 0
        if (!active) {
          try {
            process.kill(owner, 0)
            active = true
          } catch (signalError) {
            active = (signalError as NodeJS.ErrnoException).code !== 'ESRCH'
          }
        }
        if (active) throw new Error('desktop project: another package transaction is active')
        unlinkSync(this.paths.lock)
        descriptor = openSync(this.paths.lock, 'wx', 0o600)
      } else {
        throw error
      }
    }
    try {
      this.lockDescriptor = descriptor
      this.writeLockOwner(process.pid)
      return await operation()
    } finally {
      this.lockDescriptor = undefined
      closeSync(descriptor)
      unlinkSync(this.paths.lock)
    }
  }
}

function marketPaths(profile: string) {
  const root = join(dirname(dirname(profile)), 'desktop', 'aiko-market')
  const pnpm = join(root, 'pnpm')
  return { root, profile, staging: join(root, 'staging'), rollback: join(root, 'rollback', 'profile'),
    pending: join(root, 'pending.json'), lock: join(root, 'lock'),
    pnpm: { root: pnpm, store: join(pnpm, 'store'), cache: join(pnpm, 'cache'), state: join(pnpm, 'state'), config: join(pnpm, 'config'), home: join(pnpm, 'home') },
  }
}
