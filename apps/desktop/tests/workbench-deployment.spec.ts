import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { afterEach, expect, it } from 'vitest'
import { readWorkbenchDeployment, readWorkbenchWelcome, prepareWorkbenchDesktopProfile } from '../src/workbench-deployment.ts'

const directories: string[] = []
interface ProfileManifest { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbench-desktop-'))
  directories.push(root)
  const runtime = join(root, 'runtime'), profile = join(root, 'home/profiles/desktop')
  const names = ['workbench', 'workbench-tender', '@workbench/dsh-knowledge', 'workbench-code', 'workbench-theme-orange', 'workbench-theme-blue', 'workbench-market', 'workbench-plugin-catalog']
  for (const name of names) {
    const directory = join(runtime, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, exports: { './welcome': './welcome.json', './profiles/orange': './orange.json', './profiles/blue': './blue.json' } }))
    if (name.startsWith('workbench-theme-')) {
      await writeFile(join(directory, 'welcome.json'), JSON.stringify({ version: 1, theme: name, messages: { 'zh-CN': { accountBrand: name } } }))
    }
  }
  for (const [brand, theme] of [['orange', 'workbench-theme-orange'], ['blue', 'workbench-theme-blue']] as const) {
    await writeFile(join(runtime, 'node_modules/workbench', brand + '.json'), JSON.stringify({ dsh: { profile: { bundles: [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-agent-team-profile',
      'workbench', 'workbench-tender', '@workbench/dsh-knowledge', 'workbench-code', 'workbench-market', theme,
    ] } } }))
  }
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ dependencies: Object.fromEntries(names.map(name => [name, 'file:' + name + '.tgz'])) }))
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'custom-plugin'] } } }))
  await writeFile(join(profile, 'cordis.patch.yml'), '# User configuration\n[]\n')
  await writeFile(join(profile, 'pnpm-workspace.yaml'), 'packages: [.]\nnodeLinker: hoisted\nautoInstallPeers: false\noverrides:\n  custom-library: 1.2.3\n')
  const identityConfig = join(root, 'identity.json')
  return { root, runtime, profile, config: { brand: 'blue' as const, identityConfig, pluginRuntime: runtime } }
}

it('admits only explicit startup brands and absolute deployment paths', async () => {
  const { root, config } = await fixture()
  const file = join(root, 'deployment.json')
  await writeFile(file, JSON.stringify(config))
  expect(await readWorkbenchDeployment(file)).toEqual(config)
  for (const invalid of [{ ...config, brand: ['blue'] }, { ...config, brand: 'unknown' }, { ...config, pluginRuntime: './relative' }]) {
    await writeFile(file, JSON.stringify(invalid))
    await expect(readWorkbenchDeployment(file)).rejects.toThrow()
  }
})

it('uses one theme, preserves user plugins and patches, and switches only owned links', async () => {
  const { runtime, profile, config } = await fixture()
  await prepareWorkbenchDesktopProfile(config, profile)
  const initialized = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as ProfileManifest
  expect(initialized.dsh.profile.bundles).toContain('workbench-market')
  expect(initialized.dsh.profile.bundles).not.toContain('workbench-plugin-catalog')
  expect(initialized.dependencies['workbench-plugin-catalog']).toBe('file:workbench-plugin-catalog.tgz')
  const workspace = load(await readFile(join(profile, 'pnpm-workspace.yaml'), 'utf8'))
  const linkedSource: unknown = expect.stringMatching(/^link:/)
  expect(workspace).toMatchObject({ overrides: {
    'custom-library': '1.2.3',
    'workbench-plugin-catalog': linkedSource,
    'workbench-market': linkedSource,
  } })
  expect(await realpath(join(profile, 'node_modules/workbench-theme-blue'))).toBe(await realpath(join(runtime, 'node_modules/workbench-theme-blue')))
  await expect(lstat(join(profile, 'node_modules/workbench-theme-orange'))).rejects.toMatchObject({ code: 'ENOENT' })
  const patch = '- id: custom-plugin\n  disabled: true\n'
  await writeFile(join(profile, 'cordis.patch.yml'), patch)
  await prepareWorkbenchDesktopProfile({ ...config, brand: 'orange' }, profile)
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as ProfileManifest
  expect(manifest.dsh.profile.bundles).toContain('custom-plugin')
  expect(manifest.dsh.profile.bundles.filter((name: string) => name.startsWith('workbench-theme-'))).toEqual(['workbench-theme-orange'])
  expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe(patch)
  await expect(lstat(join(profile, 'node_modules/workbench-theme-blue'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(profile, 'pnpm-workspace.yaml'), 'utf8')).not.toContain('workbench-theme-blue:')
})

it('puts the Workbench plugin names first in the release-age exclusions, keeping pnpm’s own entries after them', async () => {
  const { profile, config } = await fixture()
  // pnpm 11.7.0 appends one exact-version entry per added package and honors only the first entry naming a
  // package, so a second fresh version of the same app-center plugin would fail every later install.
  await writeFile(join(profile, 'pnpm-workspace.yaml'), 'packages: [.]\nnodeLinker: hoisted\nminimumReleaseAgeExclude:\n'
    + "  - '@workbench/dsh-knowledge-weknora@1.0.0'\n  - left-pad@1.3.0\n  - workbench-code\n")
  await prepareWorkbenchDesktopProfile(config, profile)
  await prepareWorkbenchDesktopProfile(config, profile)
  const workspace = load(await readFile(join(profile, 'pnpm-workspace.yaml'), 'utf8')) as { minimumReleaseAgeExclude: string[] }
  expect(workspace.minimumReleaseAgeExclude).toEqual([
    '@workbench/*', 'workbench-*', 'blue-dsh-*',
    '@workbench/dsh-knowledge-weknora@1.0.0', 'left-pad@1.3.0', 'workbench-code',
  ])
})

it('rejects unmanaged plugins without deleting their files', async () => {
  const { profile, config } = await fixture()
  const unknown = join(profile, 'node_modules/workbench')
  await mkdir(unknown, { recursive: true })
  await writeFile(join(unknown, 'keep.txt'), 'user installation')
  await expect(prepareWorkbenchDesktopProfile(config, profile)).rejects.toThrow('unmanaged plugin')
  expect(await readFile(join(unknown, 'keep.txt'), 'utf8')).toBe('user installation')
})

it('migrates the legacy workbench name assertion only after the split package is installed', async () => {
  const { runtime, profile, config } = await fixture()
  await prepareWorkbenchDesktopProfile(config, profile)
  const file = join(profile, 'cordis.patch.yml')
  const rows = [{ id: 'workdsh', name: 'workbench', disabled: true, config: { accountFile: config.identityConfig, capabilities: { baseUrl: 'https://platform.example.test' } } },
    { id: 'custom', name: 'workbench', disabled: false }]
  await writeFile(file, JSON.stringify(rows))
  await prepareWorkbenchDesktopProfile(config, profile)
  expect(load(await readFile(file, 'utf8'))).toEqual(rows)
  const platform = join(runtime, 'node_modules/workbench/node_modules/workdsh-plugin-platform')
  await mkdir(platform, { recursive: true })
  await writeFile(join(platform, 'package.json'), '{"name":"workdsh-plugin-platform"}')
  const expected = [{ ...rows[0], name: 'workdsh-plugin-platform' }, rows[1]]
  await prepareWorkbenchDesktopProfile(config, profile)
  expect(load(await readFile(file, 'utf8'))).toEqual(expected)
  await prepareWorkbenchDesktopProfile(config, profile)
  expect(load(await readFile(file, 'utf8'))).toEqual(expected)
})

it('preserves plugin removal and the official recovery profile on restart', async () => {
  const { profile, config } = await fixture()
  await prepareWorkbenchDesktopProfile(config, profile)
  const path = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base']
  await writeFile(path, JSON.stringify(manifest))
  await prepareWorkbenchDesktopProfile(config, profile)
  const restarted = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  expect(restarted.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base'])
})

it('loads welcome text from the selected package without requiring the other theme', async () => {
  const { runtime, config } = await fixture()
  await rm(join(runtime, 'node_modules/workbench-theme-orange'), { recursive: true })
  const result = await readWorkbenchWelcome(config, 'zh-CN')
  expect({ id: result.locale.id, brand: result.locale.messages.accountBrand, login: result.locale.messages.accountLogin }).toMatchInlineSnapshot(`
    {
      "brand": "workbench-theme-blue",
      "id": "zh-CN",
      "login": "使用平台账号登录",
    }
  `)
})

it('resolves an explicit product profile and rejects conflicting startup brands', async () => {
  const { root, config } = await fixture()
  const file = join(root, 'deployment.json')
  for (const profile of ['orange', 'blue']) {
    await writeFile(file, JSON.stringify({ ...config, brand: undefined, profile }))
    expect(await readWorkbenchDeployment(file)).toEqual({ ...config, profile, brand: profile })
  }
  for (const invalid of [{ profile: 'unknown' }, { profile: null }, { profile: '../orange' }, { profile: 'orange', brand: 'blue' }]) {
    await writeFile(file, JSON.stringify({ ...config, ...invalid }))
    await expect(readWorkbenchDeployment(file)).rejects.toThrow()
  }
})

it.each(['orange', 'blue'] as const)('composes the %s product profile without activating Kit or replacing Desktop base bundles', async (brand) => {
  const { profile, config } = await fixture()
  await prepareWorkbenchDesktopProfile({ ...config, brand, profile: brand }, profile)
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as ProfileManifest
  expect(manifest.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base', 'custom-plugin', '@deepseek-ai/dsh-experimental-agent-team-profile',
    'workbench', 'workbench-tender', '@workbench/dsh-knowledge', 'workbench-code', 'workbench-market',
    brand === 'orange' ? 'workbench-theme-orange' : 'workbench-theme-blue',
  ])
  expect(manifest.dependencies['workbench-kit']).toBeUndefined()
  const other = brand === 'orange' ? 'workbench-theme-blue' : 'workbench-theme-orange'
  await expect(lstat(join(profile, 'node_modules', other))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('migrates a brand-only deployment once while retaining later user choices and recovery state', async () => {
  const { profile, config } = await fixture()
  await prepareWorkbenchDesktopProfile(config, profile)
  await writeFile(join(profile, 'cordis.patch.yml'), '- id: custom-plugin\n  disabled: true\n- id: workbench-kit\n  disabled: true\n- id: orange-theme\n  disabled: true\n')
  const named = { ...config, profile: config.brand }
  await prepareWorkbenchDesktopProfile(named, profile)
  const path = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  expect(manifest.dsh.profile.bundles).not.toContain('workbench-kit')
  expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe('- id: custom-plugin\n  disabled: true\n')
  manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base']
  await writeFile(path, JSON.stringify(manifest))
  await prepareWorkbenchDesktopProfile(named, profile)
  expect((JSON.parse(await readFile(path, 'utf8')) as ProfileManifest).dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base'])
})

it('refuses a product template containing the opposite theme before editing the profile', async () => {
  const { runtime, profile, config } = await fixture()
  const before = await readFile(join(profile, 'package.json'), 'utf8')
  await writeFile(join(runtime, 'node_modules/workbench/blue.json'), JSON.stringify({ dsh: { profile: { bundles: ['workbench-theme-orange', 'workbench-theme-blue'] } } }))
  await expect(prepareWorkbenchDesktopProfile({ ...config, profile: config.brand }, profile)).rejects.toThrow('only its selected theme')
  expect(await readFile(join(profile, 'package.json'), 'utf8')).toBe(before)
})
