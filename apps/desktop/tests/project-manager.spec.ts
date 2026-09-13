import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { load } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDesktopPaths } from '../src/paths.ts'
import {
  createSeedMetadata,
  DesktopProjectManager,
  packageNameFromSpec,
  verifySeedIntegrity,
  type DesktopProjectHooks,
} from '../src/project-manager.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { DESKTOP_PACKAGES_DIR, DESKTOP_PACKAGE_SET_FILE } from '../src/core-package-set.ts'
import type { DesktopRelease } from '../src/release.ts'
import { archivePnpmStore } from '../src/seed-store.ts'

const roots: string[] = []
const releaseWorkers: Array<() => Promise<void>> = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-test-'))
  roots.push(root)
  return root
}

function writeIntegrity(seed: string): void {
  const paths: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name !== 'integrity.json') paths.push(path)
    }
  }
  visit(seed)
  const files = paths.sort().map((path) => {
    const body = readFileSync(path)
    return {
      path: relative(seed, path).split(sep).join('/'),
      bytes: statSync(path).size,
      sha256: createHash('sha256').update(body).digest('hex'),
    }
  })
  writeFileSync(join(seed, 'integrity.json'), `${JSON.stringify({ schemaVersion: 2, files })}\n`)
}

function archiveStore(seed: string): void {
  const store = join(seed, 'store')
  mkdirSync(store, { recursive: true })
  if (readdirSync(store).length === 0) writeFileSync(join(store, 'test-entry'), 'content')
  archivePnpmStore(seed, store)
}

function writeCorePackageSet(seed: string, version: string): void {
  const packages = [
    { name: '@deepseek-ai/dsh', file: `deepseek-ai-dsh-${version}.tgz`, body: Buffer.from(`dsh-${version}`) },
    {
      name: '@deepseek-ai/dsh-desktop-host',
      file: `deepseek-ai-dsh-desktop-host-${version}.tgz`,
      body: Buffer.from(`desktop-host-${version}`),
    },
  ]
  mkdirSync(join(seed, DESKTOP_PACKAGES_DIR), { recursive: true })
  for (const entry of packages) writeFileSync(join(seed, DESKTOP_PACKAGES_DIR, entry.file), entry.body)
  writeFileSync(join(seed, DESKTOP_PACKAGE_SET_FILE), `${JSON.stringify({
    schemaVersion: 1,
    packages: packages.map(({ name, file, body }) => ({
      name,
      version,
      file,
      bytes: body.byteLength,
      integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`,
    })),
  })}\n`)
}

function createTestSeedMetadata(seed: string, desktopRelease: DesktopRelease, plugins: unknown = {}): void {
  writeCorePackageSet(seed, desktopRelease.version)
  createSeedMetadata(seed, desktopRelease, plugins)
}

function writeFakePnpm(root: string): string {
  const path = join(root, 'pnpm.mjs')
  writeFileSync(path, String.raw`
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const args = process.argv.slice(2)
const project = process.cwd()
const command = args.find(value => value === 'install' || value === 'add' || value === 'remove')
const manifestPath = join(project, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const packageName = spec => spec.startsWith('@')
  ? spec.slice(0, spec.indexOf('@', spec.indexOf('/') + 1) === -1 ? undefined : spec.indexOf('@', spec.indexOf('/') + 1))
  : spec.split('@')[0]
const packageVersion = spec => {
  const index = spec.startsWith('@') ? spec.indexOf('@', spec.indexOf('/') + 1) : spec.indexOf('@')
  return index === -1 ? '1.0.0' : spec.slice(index + 1)
}

if (command === 'add') {
  for (const spec of args.slice(args.indexOf('add') + 1)) {
    if (spec.startsWith('--')) break
    manifest.dependencies[packageName(spec)] = packageVersion(spec)
  }
}
if (command === 'remove') {
  for (const name of args.slice(args.indexOf('remove') + 1)) {
    if (name.startsWith('--')) break
    delete manifest.dependencies[name]
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest))
rmSync(join(project, 'node_modules'), { recursive: true, force: true })
for (const [name, version] of Object.entries(manifest.dependencies)) {
  const packageRoot = join(project, 'node_modules', ...name.split('/'))
  mkdirSync(packageRoot, { recursive: true })
  const core = name === '@deepseek-ai/dsh' || name === '@deepseek-ai/dsh-desktop-host'
  const plugin = !core
  const installedVersion = plugin
    ? (version.startsWith('https:') ? '1.2.3' : version)
    : JSON.parse(readFileSync(join(project, 'desktop-release.json'), 'utf8')).version
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
    name, version: installedVersion,
    ...(plugin ? { dsh: { bundle: { patch: './bundle.yml' } } } : {}),
  }))
  if (plugin) writeFileSync(join(packageRoot, 'bundle.yml'), '[]\n')
  else if (name === '@deepseek-ai/dsh-desktop-host') {
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'lib', 'index.js'), '')
  }
}
writeFileSync(join(project, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
if (process.env.TEST_PNPM_LOG) writeFileSync(process.env.TEST_PNPM_LOG, JSON.stringify({ args, env: process.env }))
`)
  return path
}

function writeBlockingFakePnpm(root: string, ready: string, release: string): string {
  const path = join(root, 'blocking-pnpm.mjs')
  const delegate = writeFakePnpm(root)
  writeFileSync(path, `
import { existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
writeFileSync(${JSON.stringify(ready)}, String(process.pid))
while (!existsSync(${JSON.stringify(release)})) await sleep(10)
await import(${JSON.stringify(pathToFileURL(delegate).href)})
`)
  return path
}

function writeWorkspaceChangingPnpm(root: string, search: string, replacement: string): string {
  const delegate = writeFakePnpm(root)
  const path = join(root, 'workspace-pnpm.mjs')
  writeFileSync(path, `
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
await import(${JSON.stringify(pathToFileURL(delegate).href)})
if (process.argv.includes('add')) {
  const workspace = join(process.cwd(), 'pnpm-workspace.yaml')
  writeFileSync(workspace, readFileSync(workspace, 'utf8').replace(${JSON.stringify(search)}, ${JSON.stringify(replacement)}))
}
`)
  return path
}

function hooks(overrides: Partial<DesktopProjectHooks> = {}): DesktopProjectHooks {
  return {
    healthCheck: async () => {},
    beforeActivate: async () => {},
    afterActivate: async () => {},
    ...overrides,
  }
}

function release(version = '1.0.0'): DesktopRelease {
  return {
    schemaVersion: 1,
    version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: '24.17.0',
    pnpmVersion: '11.7.0',
  }
}

afterEach(async () => {
  const cleanups = releaseWorkers.splice(0)
  const directories = roots.splice(0)
  const results = await Promise.allSettled(cleanups.map(cleanup => cleanup()))
  for (const root of directories) rmSync(root, { recursive: true, force: true })
  const failures: unknown[] = results.flatMap((result): unknown[] => result.status === 'rejected' ? [result.reason] : [])
  if (failures.length > 0) throw new AggregateError(failures, 'desktop worker cleanup failed')
})

describe('desktop package policy', () => {
  it.each(['add', 'remove', 'update'] as const)('migrates retired Aiko sources together before pnpm %s', async (operation) => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, 'home'))
    const delegate = writeFakePnpm(root)
    const original = new DesktopProjectManager(paths, { node: process.execPath, pnpm: delegate })
    await original.applyRelease(seed, '1.0.0', hooks())
    await original.mutate({ type: 'plugins-add', specs: [
      'dshmarket@https://github.com/aiko-dsh-plugins/dsh-market/releases/download/v1.37.0-aiko.3/market.tgz',
      'aiko-dsh-office@https://github.com/aiko-dsh-plugins/dsh-office/releases/download/v0.2.0/aiko-dsh-office-0.2.0.tgz',
      'aiko-dsh-ontology-kernel@https://github.com/aiko-dsh-plugins/dsh-ontology-kernel/releases/download/v0.1.2/aiko-dsh-ontology-kernel-0.1.2.tgz',
    ] }, hooks())
    const pnpm = join(root, 'retired-source-pnpm.mjs')
    writeFileSync(pnpm, `
await import(${JSON.stringify(pathToFileURL(delegate).href)})
const { readFileSync } = await import('node:fs')
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
if (Object.values(manifest.dependencies).some(spec => String(spec).includes('github.com/aiko-dsh-plugins/'))) {
  throw new Error('ERR_PNPM_FETCH_404: retired GitHub plugin release')
}
`)
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm })
    await manager.mutate(operation === 'add' ? { type: 'plugin-add', spec: 'aiko-dsh-market@1.39.0' }
      : operation === 'remove' ? { type: 'plugin-remove', name: 'aiko-dsh-office' }
        : { type: 'plugin-update', name: 'dshmarket', version: '1.39.0' }, hooks())
    expect(manager.listPlugins().map(plugin => plugin.spec)).toEqual(([
      'aiko-dsh-market@1.39.0', 'aiko-dsh-office@0.3.1', 'aiko-dsh-ontology-kernel@0.1.5',
    ]).filter(spec => operation !== 'remove' || !spec.startsWith('aiko-dsh-office@')))
  })

  it('repairs a retired market on same-version application startup and preserves the profile if validation fails', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, 'home'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    const old = 'dshmarket@https://github.com/aiko-dsh-plugins/dsh-market/releases/download/v1.37.0-aiko.3/market.tgz'
    await manager.mutate({ type:'plugin-add', spec:old }, hooks())
    const before = readFileSync(join(paths.profile, 'package.json'), 'utf8')
    await expect(manager.applyRelease(seed, '1.0.0', hooks({ healthCheck: async () => { throw new Error('cannot boot') } }))).rejects.toThrow('cannot boot')
    expect(readFileSync(join(paths.profile, 'package.json'), 'utf8')).toBe(before)
    expect(await manager.applyRelease(seed, '1.0.0', hooks())).toBe(true)
    expect(manager.listPlugins().map(plugin => plugin.spec)).toEqual(['aiko-dsh-market@1.39.0'])
    expect(await manager.applyRelease(seed, '1.0.0', hooks())).toBe(false)
  })

  it.each([
    null, [], 'plugin', { plugin: 12 }, { plugin: 'latest' }, { plugin: '^1.2.3' },
    { plugin: 'file:../plugin' }, { plugin: 'http://example.test/plugin.tgz' },
    { plugin: 'https://example.test/plugin.tgz?token=secret' },
    { '@deepseek-ai/dsh': '9.0.0' }, { '@deepseek-ai/dsh-base': '9.0.0' },
  ])('rejects invalid or core-replacing preinstalled plugin configuration: %j', (plugins) => {
    const seed = join(temporaryRoot(), 'seed')
    expect(() => { createTestSeedMetadata(seed, release(), plugins) }).toThrow()
  })

  it('preinstalls the Aiko market and leaves Office for user installation', () => {
    const seed = join(temporaryRoot(), 'seed')
    const plugins: unknown = JSON.parse(readFileSync(new URL('../preinstalled-plugins.json', import.meta.url), 'utf8'))
    createTestSeedMetadata(seed, release(), plugins)
    const manifest = JSON.parse(readFileSync(join(seed, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'aiko-dsh-market',
    ])
    expect(manifest.dependencies['aiko-dsh-market']).toBe('1.39.0')
    expect(manifest.dependencies.dshmarket).toBeUndefined()
    expect(manifest.dependencies['aiko-dsh-office']).toBeUndefined()
  })

  it('accepts registry package specs but rejects alternate sources and flags', () => {
    expect(packageNameFromSpec('@scope/plugin@1.2.3')).toBe('@scope/plugin')
    expect(packageNameFromSpec('plugin@next')).toBe('plugin')
    expect(() => packageNameFromSpec('file:../plugin')).toThrow(/unsupported npm package spec/u)
    expect(() => packageNameFromSpec('--registry=evil')).toThrow(/unsupported npm package spec/u)
    expect(() => packageNameFromSpec('https://example.test/plugin.tgz')).toThrow(/unsupported npm package spec/u)
  })

  it('rejects any seed content changed after release inventory generation', () => {
    const seed = join(temporaryRoot(), 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    writeIntegrity(seed)
    expect(() => { verifySeedIntegrity(seed) }).not.toThrow()
    writeFileSync(join(seed, 'package.json'), '{}\n')
    expect(() => { verifySeedIntegrity(seed) }).toThrow(/integrity verification failed/u)
  })
})

describe('desktop project transactions', () => {
  it.each([false, true])('preserves installed plugins when release defaults change and respects removals with business plugins: %s', async (withBusiness) => {
    const root = temporaryRoot()
    const source = 'https://github.com/org/market/releases/download/v1.2.3/market.tgz'
    const defaults = { market: source, optional: '1.0.0' }
    const prepare = (version: string, plugins: Record<string, string> = defaults): string => {
      const seed = join(root, version)
      createTestSeedMetadata(seed, release(version), plugins)
      writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
      archiveStore(seed)
      writeIntegrity(seed)
      return seed
    }
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(prepare('1.0.0'), '1.0.0', hooks())
    expect(manager.listPlugins()).toEqual([
      { name: 'market', version: '1.2.3', spec: `market@${source}` },
      { name: 'optional', version: '1.0.0', spec: 'optional@1.0.0' },
    ])
    const updated = 'https://github.com/org/market/releases/download/v1.2.4/market.tgz'
    await manager.mutate({ type: 'plugins-add', specs: [`market@${updated}`, ...(withBusiness ? ['business@2.0.0'] : [])] }, hooks())
    await manager.applyRelease(prepare('2.0.0', { market: source }), '2.0.0', hooks())
    expect(manager.listPlugins()[0]?.spec).toBe(`market@${updated}`)
    expect(manager.listPlugins()).toContainEqual({ name: 'optional', version: '1.0.0', spec: 'optional@1.0.0' })
    await manager.mutate({ type: 'plugin-remove', name: 'market' }, hooks())
    await manager.mutate({ type: 'plugin-remove', name: 'optional' }, hooks())
    expect(await manager.applyRelease(join(root, '2.0.0'), '2.0.0', hooks())).toBe(false)
    await manager.applyRelease(prepare('3.0.0'), '3.0.0', hooks())
    expect(manager.listPlugins()).toEqual(withBusiness ? [{ name: 'business', version: '2.0.0', spec: 'business@2.0.0' }] : [])
    const manifest = JSON.parse(readFileSync(join(paths.profile, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies.market).toBeUndefined()
    expect(manifest.dependencies.optional).toBeUndefined()
    expect(existsSync(join(paths.profile, 'node_modules', 'market'))).toBe(false)
  })

  it('activates catalog dependencies together and keeps artifact sources across release upgrades', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    const source = 'https://github.com/org/kernel/releases/download/v1.2.3/kernel.tgz'
    await manager.mutate({ type: 'plugins-add', specs: [`ontology@${source}`, 'bid@1.0.0'] }, hooks())
    expect(manager.listPlugins()).toEqual([
      { name: 'ontology', version: '1.2.3', spec: `ontology@${source}` },
      { name: 'bid', version: '1.0.0', spec: 'bid@1.0.0' },
    ])
    const next = join(root, 'next')
    createTestSeedMetadata(next, release('2.0.0'))
    writeFileSync(join(next, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(next)
    writeIntegrity(next)
    await manager.applyRelease(next, '2.0.0', hooks())
    expect(manager.listPlugins()[0]).toEqual({ name: 'ontology', version: '1.2.3', spec: `ontology@${source}` })
    const bidManifest = join(paths.profile, 'node_modules', 'bid', 'package.json')
    const bid = JSON.parse(readFileSync(bidManifest, 'utf8')) as object
    writeFileSync(bidManifest, JSON.stringify({ ...bid, peerDependencies: { ontology: '^1.2.3' } }))
    await expect(manager.mutate({ type: 'plugin-remove', name: 'ontology' }, hooks())).rejects.toThrow('required by bid')
    await expect(manager.mutate({ type: 'plugins-add', specs: ['@deepseek-ai/dsh@99'] }, hooks())).rejects.toThrow('managed by the desktop release')
    await expect(manager.mutate({ type: 'plugins-add', specs: ['other@1', 'last@1'] }, hooks({
      healthCheck: async () => { throw new Error('dependency cannot boot') },
    }))).rejects.toThrow('dependency cannot boot')
    expect(manager.listPlugins().map(plugin => plugin.name)).toEqual(['ontology', 'bid'])
  })

  it('installs the offline seed and reconciles a mismatched private Host', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    const log = join(root, 'pnpm-log.json')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    mkdirSync(join(seed, 'store'), { recursive: true })
    writeFileSync(join(seed, 'store', 'seed-entry'), 'content')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    const previousLog = process.env.TEST_PNPM_LOG
    const previousRegistry = process.env.npm_config_registry
    process.env.TEST_PNPM_LOG = log
    process.env.npm_config_registry = 'https://user-registry.invalid'
    try {
      await expect(manager.applyRelease(seed, '2.0.0', hooks())).rejects.toThrow(/does not match Electron/u)
      await manager.applyRelease(seed, '1.0.0', hooks())
      writeFileSync(
        join(paths.profile, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'package.json'),
        '{"name":"@deepseek-ai/dsh-desktop-host","version":"0.9.0"}\n',
      )
      await expect(manager.applyRelease(seed, '1.0.0', hooks())).resolves.toBe(true)
    } finally {
      if (previousLog === undefined) delete process.env.TEST_PNPM_LOG
      else process.env.TEST_PNPM_LOG = previousLog
      if (previousRegistry === undefined) delete process.env.npm_config_registry
      else process.env.npm_config_registry = previousRegistry
    }
    expect(manager.dshVersion()).toBe('1.0.0')
    expect(manager.releaseVersion()).toBe('1.0.0')
    expect(paths.profile).toBe(join(root, '.dsh', 'profiles', 'desktop'))
    expect(existsSync(join(paths.profile, 'node_modules', '@deepseek-ai', 'dsh'))).toBe(true)
    const installedHost = JSON.parse(readFileSync(
      join(paths.profile, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'package.json'),
      'utf8',
    )) as { version: string }
    expect(installedHost.version).toBe('1.0.0')
    expect(existsSync(join(paths.profile, 'desktop-plugins.json'))).toBe(false)
    expect(readFileSync(join(paths.pnpm.store, 'seed-entry'), 'utf8')).toBe('content')
    const invocation = JSON.parse(readFileSync(log, 'utf8')) as { args: string[]; env: Record<string, string> }
    expect(invocation.args).toContain('--offline')
    expect(invocation.args).toContain('--trust-lockfile')
    expect(invocation.args).toContain(`--config.store-dir=${paths.pnpm.store}`)
    expect(invocation.args).toContain('--config.enable-global-virtual-store=false')
    expect(invocation.args).toContain('--config.registry=https://registry.npmjs.org/')
    expect(invocation.env.NPM_CONFIG_REGISTRY).toBe('https://registry.npmjs.org/')
    expect(invocation.env.NPM_CONFIG_STORE_DIR).toBe(paths.pnpm.store)
    expect(invocation.env.NPM_CONFIG_USERCONFIG).toBe(join(paths.pnpm.config, 'npmrc'))
    expect(invocation.env.npm_config_registry).toBeUndefined()
  })

  it('restores the active project when the replacement backend cannot start', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    let starts = 0
    await expect(manager.mutate({ type: 'plugin-add', spec: '@scope/plugin@2.0.0' }, hooks({
      afterActivate: async () => {
        starts += 1
        if (starts === 1) throw new Error('backend rejected staged graph')
      },
    }))).rejects.toThrow(/backend rejected staged graph/u)
    expect(manager.listPlugins()).toEqual([])
    expect(manager.dshVersion()).toBe('1.0.0')
    expect(starts).toBe(2)
  })

  it('restores rollback when the active move completed before its journal update', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    await manager.mutate({ type: 'plugin-add', spec: '@scope/plugin@2.0.0' }, hooks())
    const stagingProfile = join(paths.staging, 'interrupted', 'profile')
    mkdirSync(stagingProfile, { recursive: true })
    writeFileSync(join(stagingProfile, 'marker'), 'staging')
    rmSync(paths.rollback, { recursive: true, force: true })
    mkdirSync(dirname(paths.rollback), { recursive: true })
    renameSync(paths.profile, paths.rollback)
    writeFileSync(paths.pending, `${JSON.stringify({
      schemaVersion: 1,
      id: 'interrupted',
      stagingProfile,
      step: 'prepared',
    })}\n`)

    manager.recover()

    expect(manager.listPlugins()).toEqual([{ name: '@scope/plugin', version: '2.0.0', spec: '@scope/plugin@2.0.0' }])
    expect(existsSync(stagingProfile)).toBe(false)
    expect(existsSync(paths.pending)).toBe(false)
  })

  it('records the live pnpm worker as transaction owner until it exits', async ({ task, signal }) => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    const ready = join(root, 'pnpm-ready')
    const releaseWorker = join(root, 'pnpm-release')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const runtime = { node: process.execPath, pnpm: writeBlockingFakePnpm(root, ready, releaseWorker) }
    const manager = new DesktopProjectManager(paths, runtime)
    const installing = manager.applyRelease(seed, '1.0.0', hooks())
    // Teardown observes failures even if the runner has abandoned the test body.
    const completed = installing.then(value => ({ value }), (error: unknown) => ({ error }))
    releaseWorkers.push(async () => {
      writeFileSync(releaseWorker, 'continue')
      const outcome = await completed
      if ('error' in outcome) throw outcome.error
    })
    // Child startup shares the test budget; an aborted poll must not resume ownership assertions.
    await expect.poll(() => {
      signal.throwIfAborted()
      return existsSync(ready)
    }, { timeout: task.timeout }).toBe(true)
    signal.throwIfAborted()
    const workerPid = Number.parseInt(readFileSync(ready, 'utf8'), 10)
    expect(readFileSync(paths.lock, 'utf8')).toBe(`${String(workerPid)}\n`)
    const competing = new DesktopProjectManager(paths, runtime)
    await expect(competing.applyRelease(seed, '1.0.0', hooks())).rejects.toThrow(/another package transaction is active/u)
    writeFileSync(releaseWorker, 'continue')
    await expect(installing).resolves.toBe(true)
    expect(existsSync(paths.lock)).toBe(false)
  })

  it('keeps core packages local while installing plugins from the desktop registry', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    const log = join(root, 'pnpm-log.json')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    const previousLog = process.env.TEST_PNPM_LOG
    process.env.TEST_PNPM_LOG = log
    try {
      await manager.mutate({ type: 'plugin-add', spec: '@scope/plugin@2.0.0' }, hooks())
    } finally {
      if (previousLog === undefined) delete process.env.TEST_PNPM_LOG
      else process.env.TEST_PNPM_LOG = previousLog
    }

    const manifest = JSON.parse(readFileSync(join(paths.profile, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    const coreSpec = manifest.dependencies['@deepseek-ai/dsh']
    expect(coreSpec).toMatch(/^file:\.\/desktop-packages\//u)
    const workspace = load(readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8')) as {
      overrides: Record<string, string>
    }
    expect(workspace.overrides['@deepseek-ai/dsh']).toBe(coreSpec)
    expect(manifest.dependencies['@scope/plugin']).toBe('2.0.0')
    expect(manager.listPlugins()).toEqual([
      { name: '@scope/plugin', version: '2.0.0', spec: '@scope/plugin@2.0.0' },
    ])
    const invocation = JSON.parse(readFileSync(log, 'utf8')) as { args: string[]; env: Record<string, string> }
    expect(invocation.args).toContain('add')
    expect(invocation.args).toContain('@scope/plugin@2.0.0')
    expect(invocation.args).toContain('--config.registry=https://registry.npmjs.org/')
    expect(invocation.env.NPM_CONFIG_REGISTRY).toBe('https://registry.npmjs.org/')
    expect(readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8'))
      .toContain('@scope/plugin@2.0.0')
  })

  it.each(['@scope/plugin', 'plugin'])('accepts pnpm exact release-age exclusions through install and removal: %s', async (name) => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    writeFileSync(
      join(paths.profile, 'pnpm-workspace.yaml'),
      readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8')
        + `minimumReleaseAgeExclude:\n  - ${JSON.stringify(`${name}@1.0.0`)}\n`,
    )
    await manager.mutate({ type: 'plugin-add', spec: `${name}@2.0.0` }, hooks())
    expect(manager.listPlugins()).toEqual([{ name, version: '2.0.0', spec: `${name}@2.0.0` }])
    await manager.mutate({ type: 'plugin-remove', name }, hooks())
    expect(manager.listPlugins()).toEqual([])
    expect(readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8'))
      .toContain(`${name}@1.0.0 || 2.0.0`)
  })

  it('does not exempt registry tags or HTTPS artifacts from release age', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    await manager.mutate({
      type: 'plugins-add',
      specs: ['tagged-plugin@latest', 'remote-plugin@https://example.test/remote-plugin.tgz'],
    }, hooks())
    expect(readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8'))
      .not.toContain('minimumReleaseAgeExclude')
  })

  it('combines exact approvals for successive versions before resolving an update', async () => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, 'home'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    await manager.applyRelease(seed, '1.0.0', hooks())
    const workspace = join(paths.profile, 'pnpm-workspace.yaml')
    writeFileSync(workspace, readFileSync(workspace, 'utf8') + 'minimumReleaseAgeExclude:\n  - plugin@1.0.0\n  - plugin@2.0.0\n')
    await manager.mutate({ type: 'plugin-add', spec: 'plugin@2.0.0' }, hooks())
    expect(readFileSync(workspace, 'utf8')).toContain('plugin@1.0.0 || 2.0.0')
    await manager.mutate({ type: 'plugin-remove', name: 'plugin' }, hooks())
    expect(manager.listPlugins()).toEqual([])
  })

  it.each([
    ['wildcard exclusion', 'strictDepBuilds: true', 'strictDepBuilds: true\nminimumReleaseAgeExclude: ["@scope/*"]'],
    ['range in union', 'strictDepBuilds: true', 'strictDepBuilds: true\nminimumReleaseAgeExclude: ["plugin@1.0.0 || ^2.0.0"]'],
    ['range exclusion', 'strictDepBuilds: true', 'strictDepBuilds: true\nminimumReleaseAgeExclude: ["plugin@^2.0.0"]'],
    ['core exclusion', 'strictDepBuilds: true', 'strictDepBuilds: true\nminimumReleaseAgeExclude: ["@deepseek-ai/dsh@1.0.0"]'],
    ['malformed exclusion', 'strictDepBuilds: true', 'strictDepBuilds: true\nminimumReleaseAgeExclude: 123'],
    ['core override', 'file:./desktop-packages/deepseek-ai-dsh-1.0.0.tgz', 'https://example.test/core.tgz'],
    ['build permission', 'strictDepBuilds: true', 'strictDepBuilds: false'],
    ['global age bypass', 'strictDepBuilds: true', 'strictDepBuilds: true\nminimumReleaseAge: 0'],
  ])('rolls back an unapproved workspace change: %s', async (_label, search, replacement) => {
    const root = temporaryRoot()
    const seed = join(root, 'seed')
    createTestSeedMetadata(seed, release())
    writeFileSync(join(seed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    archiveStore(seed)
    writeIntegrity(seed)
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, {
      node: process.execPath, pnpm: writeWorkspaceChangingPnpm(root, search, replacement),
    })
    await manager.applyRelease(seed, '1.0.0', hooks())
    const workspace = readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8')
    await expect(manager.mutate({ type: 'plugin-add', spec: 'plugin@latest' }, hooks()))
      .rejects.toThrow(/core package mapping/u)
    expect(manager.listPlugins()).toEqual([])
    expect(readFileSync(join(paths.profile, 'pnpm-workspace.yaml'), 'utf8')).toBe(workspace)
  })

  it('reconciles dsh to the packaged release without removing desktop plugins', async () => {
    const root = temporaryRoot()
    const paths = resolveDesktopPaths(join(root, '.dsh'))
    const manager = new DesktopProjectManager(paths, { node: process.execPath, pnpm: writeFakePnpm(root) })
    const firstSeed = join(root, 'seed-1')
    createTestSeedMetadata(firstSeed, release('1.0.0'))
    writeFileSync(join(firstSeed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    mkdirSync(join(firstSeed, 'store'), { recursive: true })
    writeFileSync(join(firstSeed, 'store', 'release-1'), 'one')
    archiveStore(firstSeed)
    writeIntegrity(firstSeed)
    await manager.applyRelease(firstSeed, '1.0.0', hooks())
    await manager.mutate({ type: 'plugin-add', spec: '@scope/plugin@2.0.0' }, hooks())

    const nextSeed = join(root, 'seed-2')
    createTestSeedMetadata(nextSeed, release('1.1.0'))
    writeFileSync(join(nextSeed, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    mkdirSync(join(nextSeed, 'store'), { recursive: true })
    writeFileSync(join(nextSeed, 'store', 'release-2'), 'two')
    archiveStore(nextSeed)
    writeIntegrity(nextSeed)

    await expect(manager.applyRelease(nextSeed, '1.1.0', hooks())).resolves.toBe(true)
    expect(manager.releaseVersion()).toBe('1.1.0')
    expect(manager.dshVersion()).toBe('1.1.0')
    expect(manager.listPlugins()).toEqual([{ name: '@scope/plugin', version: '2.0.0', spec: '@scope/plugin@2.0.0' }])
    const profile = JSON.parse(readFileSync(join(paths.profile, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } }
    }
    expect(profile.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@scope/plugin',
    ])
    expect(readFileSync(join(paths.pnpm.store, 'release-1'), 'utf8')).toBe('one')
    expect(readFileSync(join(paths.pnpm.store, 'release-2'), 'utf8')).toBe('two')
    await expect(manager.applyRelease(nextSeed, '1.1.0', hooks())).resolves.toBe(false)
  })
})
