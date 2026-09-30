import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readAikoDeployment, readAikoWelcome, prepareAikoDesktopProfile } from '../src/aiko-deployment.ts'

const directories: string[] = []
interface ProfileManifest { dsh: { profile: { bundles: string[] } } }
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aiko-desktop-'))
  directories.push(root)
  const runtime = join(root, 'runtime'), profile = join(root, 'home/profiles/desktop')
  const names = ['aiko-dsh-workbench-kit', 'aiko-dsh-workbench', 'aiko-dsh-tender', '@aiko-dsh-plugins/dsh-knowledge', 'aiko-dsh-code', 'aiko-dsh-theme', 'yunyao-dsh-theme']
  for (const name of names) {
    const directory = join(runtime, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, exports: { './welcome': './welcome.json' } }))
    if (name.endsWith('dsh-theme')) {
      await writeFile(join(directory, 'welcome.json'), JSON.stringify({ version: 1, theme: name, messages: { 'zh-CN': { accountBrand: name } } }))
    }
  }
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ dependencies: Object.fromEntries(names.map(name => [name, 'file:' + name + '.tgz'])) }))
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'custom-plugin'] } } }))
  await writeFile(join(profile, 'cordis.patch.yml'), '# User configuration\n[]\n')
  const identityConfig = join(root, 'identity.json')
  return { root, runtime, profile, config: { brand: 'yunyao' as const, identityConfig, pluginRuntime: runtime } }
}

it('admits only explicit startup brands and absolute deployment paths', async () => {
  const { root, config } = await fixture()
  const file = join(root, 'deployment.json')
  await writeFile(file, JSON.stringify(config))
  expect(await readAikoDeployment(file)).toEqual(config)
  for (const invalid of [{ ...config, brand: ['yunyao'] }, { ...config, brand: 'unknown' }, { ...config, pluginRuntime: './relative' }]) {
    await writeFile(file, JSON.stringify(invalid))
    await expect(readAikoDeployment(file)).rejects.toThrow()
  }
})

it('uses one theme, preserves user plugins and patches, and switches only owned links', async () => {
  const { runtime, profile, config } = await fixture()
  await prepareAikoDesktopProfile(config, profile)
  expect(await realpath(join(profile, 'node_modules/yunyao-dsh-theme'))).toBe(await realpath(join(runtime, 'node_modules/yunyao-dsh-theme')))
  await expect(lstat(join(profile, 'node_modules/aiko-dsh-theme'))).rejects.toMatchObject({ code: 'ENOENT' })
  const patch = '- id: custom-plugin\n  disabled: true\n'
  await writeFile(join(profile, 'cordis.patch.yml'), patch)
  await prepareAikoDesktopProfile({ ...config, brand: 'aiko' }, profile)
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as ProfileManifest
  expect(manifest.dsh.profile.bundles).toContain('custom-plugin')
  expect(manifest.dsh.profile.bundles.filter((name: string) => name.endsWith('dsh-theme'))).toEqual(['aiko-dsh-theme'])
  expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe(patch)
  await expect(lstat(join(profile, 'node_modules/yunyao-dsh-theme'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects unmanaged plugins without deleting their files', async () => {
  const { profile, config } = await fixture()
  const unknown = join(profile, 'node_modules/aiko-dsh-workbench')
  await mkdir(unknown, { recursive: true })
  await writeFile(join(unknown, 'keep.txt'), 'user installation')
  await expect(prepareAikoDesktopProfile(config, profile)).rejects.toThrow('unmanaged plugin')
  expect(await readFile(join(unknown, 'keep.txt'), 'utf8')).toBe('user installation')
})

it('preserves plugin removal and the official recovery profile on restart', async () => {
  const { profile, config } = await fixture()
  await prepareAikoDesktopProfile(config, profile)
  const path = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base']
  await writeFile(path, JSON.stringify(manifest))
  await prepareAikoDesktopProfile(config, profile)
  const restarted = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  expect(restarted.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base'])
})

it('loads welcome text from the selected package without requiring the other theme', async () => {
  const { runtime, config } = await fixture()
  await rm(join(runtime, 'node_modules/aiko-dsh-theme'), { recursive: true })
  const result = await readAikoWelcome(config, 'zh-CN')
  expect({ id: result.locale.id, brand: result.locale.messages.accountBrand, login: result.locale.messages.accountLogin }).toMatchInlineSnapshot(`
    {
      "brand": "yunyao-dsh-theme",
      "id": "zh-CN",
      "login": "使用平台账号登录",
    }
  `)
})
