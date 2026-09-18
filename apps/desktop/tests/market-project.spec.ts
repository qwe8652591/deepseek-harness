import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { load } from 'js-yaml'
import { createPluginProfile } from '../src/project-manager.ts'
import { DesktopMarketProject, type DesktopProjectHooks } from '../src/market-project.ts'
import { runtimeFixture } from './runtime-fixture.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-market-'))
  roots.push(root)
  const dsh = join(root, 'runtime')
  runtimeFixture(dsh, '0.1.6-alpha.2')
  const profile = join(root, 'home', 'profiles', 'desktop')
  createPluginProfile(profile)
  const pnpm = join(root, 'pnpm.mjs')
  // Only registry resolution is replaced; the transaction owns a real child and real profile files.
  writeFileSync(pnpm, `
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const file = join(process.cwd(), 'package.json')
const manifest = JSON.parse(readFileSync(file, 'utf8'))
const command = args.find(value => value === 'add' || value === 'remove')
for (const spec of args.slice(args.indexOf(command) + 1).filter(value => !value.startsWith('--'))) {
  if (command === 'remove') delete manifest.dependencies[spec]
  else { const at = spec.lastIndexOf('@'); manifest.dependencies[spec.slice(0, at)] = spec.slice(at + 1) }
}
writeFileSync(file, JSON.stringify(manifest))
for (const [name, version] of Object.entries(manifest.dependencies)) {
  const dir = join(process.cwd(), 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version,
    dsh: { bundle: { patch: 'bundle.yml' }, compatibility: { host: name === 'incompatible' ? '0.1.5-alpha.2' : '0.1.6-alpha.2' } },
  }))
  writeFileSync(join(dir, 'bundle.yml'), '[]\\n')
}
`)
  const manager = new DesktopMarketProject(profile, { dsh, pnpm, node: process.execPath, nodeBin: join(root, 'bin') })
  const hooks = {
    healthCheck: vi.fn(async () => {}), beforeActivate: vi.fn(async () => {}), afterActivate: vi.fn(async () => {}),
  } satisfies DesktopProjectHooks
  return { manager, hooks, profile, dsh }
}

it('preserves patches, disabled bundles and immutable runtime while recording exact approvals', async () => {
  const { manager, hooks, profile, dsh } = setup()
  const runtimeBefore = readFileSync(join(dsh, 'desktop-runtime.json'), 'utf8')
  writeFileSync(join(profile, 'cordis.patch.yml'), '- id: custom\n  disabled: true\n')
  await manager.mutate({ type: 'plugins-add', specs: ['plugin@1.0.0'] }, hooks)
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((name: string) => name !== 'plugin')
  writeFileSync(manifestPath, JSON.stringify(manifest))
  await manager.mutate({ type: 'plugins-add', specs: ['other@2.0.0'] }, hooks)
  const disabled = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
  expect(disabled.dsh.profile.bundles).not.toContain('plugin')
  await manager.mutate({ type: 'plugins-add', specs: ['plugin@1.1.0'] }, hooks)
  expect(load(readFileSync(join(profile, 'pnpm-workspace.yaml'), 'utf8'))).toMatchObject({
    minimumReleaseAgeExclude: ['plugin@1.0.0 || 1.1.0', 'other@2.0.0'],
  })
  expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toBe('- id: custom\n  disabled: true\n')
  expect(readFileSync(join(dsh, 'desktop-runtime.json'), 'utf8')).toBe(runtimeBefore)
  expect(manager.listPlugins().map(plugin => plugin.name)).toEqual(['plugin', 'other'])
  expect(existsSync(manager.paths.lock)).toBe(false)
})

it('rejects incompatible packages before activation and leaves the active profile intact', async () => {
  const { manager, hooks, profile } = setup()
  const before = readFileSync(join(profile, 'package.json'), 'utf8')
  await expect(manager.mutate({ type: 'plugins-add', specs: ['incompatible@1.0.0'] }, hooks)).rejects.toThrow('requires Aiko DSH')
  expect(readFileSync(join(profile, 'package.json'), 'utf8')).toBe(before)
  expect(hooks.beforeActivate).not.toHaveBeenCalled()
  expect(existsSync(manager.paths.lock)).toBe(false)
})

it('rolls back an activation failure and restarts the retained profile', async () => {
  const { manager, hooks, profile } = setup()
  const before = readFileSync(join(profile, 'package.json'), 'utf8')
  const afterActivate = vi.fn().mockRejectedValueOnce(new Error('startup refused')).mockResolvedValue(undefined)
  await expect(manager.mutate({ type: 'plugins-add', specs: ['plugin@1.0.0'] }, { ...hooks, afterActivate })).rejects.toThrow('startup refused')
  expect(readFileSync(join(profile, 'package.json'), 'utf8')).toBe(before)
  expect(afterActivate).toHaveBeenCalledTimes(2)
  expect(existsSync(manager.paths.pending)).toBe(false)
})

it('protects every runtime package before invoking the package manager', async () => {
  const { manager, hooks, profile } = setup()
  await expect(manager.mutate({ type: 'plugins-add', specs: ['@deepseek-ai/cordis@4.0.2'] }, hooks)).rejects.toThrow('managed by the desktop release')
  expect(existsSync(join(profile, 'node_modules'))).toBe(false)
  expect(hooks.healthCheck).not.toHaveBeenCalled()
})

it('releases the transaction after package-manager spawn failure without changing the profile', async () => {
  const { manager, hooks, profile } = setup()
  const before = readFileSync(join(profile, 'package.json'), 'utf8')
  const missing = new DesktopMarketProject(profile, { ...manager.runtime, node: join(profile, 'missing-node') })
  await expect(missing.mutate({ type: 'plugins-add', specs: ['plugin@1.0.0'] }, hooks)).rejects.toThrow('ENOENT')
  expect(readFileSync(join(profile, 'package.json'), 'utf8')).toBe(before)
  expect(existsSync(manager.paths.lock)).toBe(false)
})

it('preserves the active profile when replacing the previous rollback directory fails', async () => {
  const { manager, hooks, profile } = setup()
  const before = readFileSync(join(profile, 'package.json'), 'utf8')
  const beforeActivate = async () => {
    mkdirSync(dirname(manager.paths.rollback), { recursive: true })
    writeFileSync(manager.paths.rollback, 'not a directory')
  }
  await expect(manager.mutate({ type: 'plugins-add', specs: ['plugin@1.0.0'] }, { ...hooks, beforeActivate }))
    .rejects.toThrow('not a directory')
  expect(readFileSync(join(profile, 'package.json'), 'utf8')).toBe(before)
})

it('refuses broad release-age exemptions in durable workspace settings', async () => {
  const { manager, hooks, profile } = setup()
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'minimumReleaseAgeExclude:\n  - plugin@*\n')
  await expect(manager.mutate({ type: 'plugins-add', specs: ['plugin@1.0.0'] }, hooks))
    .rejects.toThrow('must be exact versions')
  expect(hooks.healthCheck).not.toHaveBeenCalled()
})
