import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { desktopProductFeed, parseDesktopProduct, readDesktopProduct, type DesktopProduct } from '../scripts/desktop-product.mjs'
import { prepareProductProfile, readPackagedProduct, writeProductPolicy } from '../src/product-deployment.ts'
import { parseProductPlatform, readProductPlatform, saveProductPlatform } from '../src/product-platform.ts'
import { resolveDesktopBuildVersion } from '../scripts/desktop-build-version.mjs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-'))
  roots.push(root)
  return root
}
const applications = ['workbench', 'workbench-market', 'workbench-md-editor', 'workbench-visio', 'workbench-drawio', 'workbench-ppt', 'workbench-image-generation', 'workbench-templates']
function product(profile: 'orange' | 'blue' = 'orange'): DesktopProduct {
  return parseDesktopProduct({ schemaVersion: 1, profile, appId: `com.${profile}.dsh`, productName: profile,
    repository: 'aiko-dsh-plugins/deepseek-harness', channel: 'beta',
    bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-agent-team-profile', ...applications, 'workbench-theme-' + profile],
    plugins: [...applications, 'workbench-theme-' + profile, 'workbench-plugin-catalog'].map(name => ({ name, version: '1.0.0' })),
  })
}

it('isolates brand and architecture feeds and refuses mixed product inputs', () => {
  expect(resolveDesktopBuildVersion({ DSH_DESKTOP_PRODUCT: '/explicit-product.json', DSH_DESKTOP_BUILD_VERSION: '1.2.3' }, '0.2.0-rc.2')).toBe('1.2.3')
  expect(() => resolveDesktopBuildVersion({ DSH_DESKTOP_PRODUCT: '/explicit-product.json', DSH_DESKTOP_BUILD_VERSION: '1.2.3+ignored' }, '0.2.0-rc.2')).toThrow(/build metadata/)
  expect(desktopProductFeed(product(), 'win-x64')).toEqual({
    publicUrl: 'https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/orange-beta/', channel: 'orange-beta-win-x64', tag: 'orange-beta',
  })
  expect(desktopProductFeed(product('blue'), 'mac-arm64').channel).toBe('blue-beta-mac-arm64')
  expect(() => parseDesktopProduct({ ...product(), plugins: [...product().plugins, { name: 'workbench-theme-blue', version: '1.0.0' }] })).toThrow(/mixed-brand/)
  expect(() => desktopProductFeed(product(), 'linux-x64')).toThrow(/unsupported/)
})

it('selects a self-hosted HTTPS release directory instead of a GitHub repository', () => {
  const { repository: _repository, ...base } = product('blue')
  const releases = 'https://downloads.example.test:20124/dsh/releases/'
  const hosted = parseDesktopProduct({ ...base, releases })
  expect(hosted.releases).toBe(releases)
  expect(hosted).not.toHaveProperty('repository')
  expect(desktopProductFeed(hosted, 'win-x64')).toEqual({ publicUrl: releases + 'blue-beta/', channel: 'blue-beta-win-x64', tag: 'blue-beta' })
  for (const value of ['http://downloads.example.test/dsh/releases/', 'https://downloads.example.test/dsh/releases',
    'https://user:secret@downloads.example.test/dsh/', 'https://downloads.example.test/dsh/?token=x/', 'https://downloads.example.test/dsh/#x/'])
    expect(() => parseDesktopProduct({ ...base, releases: value })).toThrow(/releases/)
  expect(() => parseDesktopProduct({ ...product(), releases })).toThrow(/exactly one/)
  expect(() => parseDesktopProduct(base)).toThrow(/exactly one/)
})

it('suggests the deployment platform on first run when the product names one', () => {
  const suggested = parseDesktopProduct({ ...product('blue'), platform: 'https://platform.example.test:20124' })
  expect(suggested.platform).toBe('https://platform.example.test:20124')
  expect(product()).not.toHaveProperty('platform')
  for (const value of ['http://platform.example.test', 'https://platform.example.test/', 'https://platform.example.test/path',
    'https://user:secret@platform.example.test', 'https://platform.example.test?x=1', 'not a url'])
    expect(() => parseDesktopProduct({ ...product(), platform: value })).toThrow(/platform/)
})

it('refuses products that preinstall app-center application plugins', () => {
  const official = product().bundles.slice(0, 3)
  for (const name of ['workbench-tender', '@workbench/dsh-knowledge', 'workbench-code']) {
    expect(() => parseDesktopProduct({ ...product(), bundles: [...official, ...applications, name, 'workbench-theme-orange'] })).toThrow(/bundles must match/)
    expect(() => parseDesktopProduct({ ...product(), plugins: [...product().plugins, { name, version: '1.0.0' }] })).toThrow(/incomplete or mixed-brand/)
  }
})

it('verifies archive bytes before packaging and does not embed local build paths', async () => {
  const root = await directory(), file = join(root, 'product.json')
  await writeFile(join(root, 'plugin.tgz'), 'archive')
  const input = { ...product(), artwork: { version: 1, theme: 'workbench-theme-orange', productName: 'orange', image: 'data:image/png;base64,YQ==' },
    plugins: product().plugins.map(plugin => ({ ...plugin, file: 'plugin.tgz', integrity: 'sha512-' + createHash('sha512').update('archive').digest('base64') })),
  }
  await writeFile(file, JSON.stringify(input))
  const built = readDesktopProduct({ DSH_DESKTOP_PRODUCT: file }, true)!
  expect(JSON.stringify(parseDesktopProduct(built))).not.toContain(root)
  await writeFile(join(root, 'plugin.tgz'), 'changed')
  expect(() => readDesktopProduct({ DSH_DESKTOP_PRODUCT: file }, true)).toThrow(/integrity/)
  await writeFile(file, JSON.stringify({ ...input, password: 'forbidden-build-input' }))
  expect(() => readDesktopProduct({ DSH_DESKTOP_PRODUCT: file })).toThrow(/unexpected field/)
})

it('uses new installer plugins while preserving patches, sessions and recovery choices', async () => {
  const root = await directory(), file = join(root, 'package.json')
  await writeFile(file, JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
  await writeFile(join(root, 'cordis.patch.yml'), '- id: custom-setting\n  config: { value: kept }\n')
  await writeFile(join(root, 'sessions.jsonl'), 'saved user work\n')
  await prepareProductProfile(product(), root)
  const initial = JSON.parse(await readFile(file, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
  expect(initial.dsh.profile.bundles).toEqual(product().bundles)
  initial.dsh.profile.bundles = initial.dsh.profile.bundles.filter(name => name !== 'workbench-market')
  await writeFile(file, JSON.stringify(initial))
  await prepareProductProfile({ ...product(), plugins: product().plugins.map(plugin => ({ ...plugin, version: '1.1.0' })) }, root)
  expect(await readFile(file, 'utf8')).not.toContain('workbench-market')
  expect(await readFile(join(root, '.desktop-product.json'), 'utf8')).toContain('1.1.0')
  expect(await readFile(join(root, 'sessions.jsonl'), 'utf8')).toBe('saved user work\n')
  expect(await readFile(join(root, 'cordis.patch.yml'), 'utf8')).toContain('kept')
  await expect(prepareProductProfile(product('blue'), root)).rejects.toThrow(/another product/)
})

it('refuses unowned installed packages and a runtime with different plugin bytes identified by version', async () => {
  const root = await directory()
  await writeFile(join(root, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }))
  for (const plugin of product().plugins) {
    const path = join(root, 'node_modules', plugin.name)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify(plugin))
  }
  await expect(prepareProductProfile(product(), root)).rejects.toThrow(/unmanaged/)
  await writeFile(join(root, 'desktop-product.json'), JSON.stringify(product()))
  expect(await readPackagedProduct(root, 'orange')).toEqual(product())
  const { repository: _repository, ...hosted } = product()
  await writeFile(join(root, 'desktop-product.json'), JSON.stringify({ ...hosted, releases: 'https://downloads.example.test/dsh/releases/' }))
  expect(await readPackagedProduct(root, 'orange')).toEqual({ ...hosted, releases: 'https://downloads.example.test/dsh/releases/' })
  await writeFile(join(root, 'desktop-product.json'), JSON.stringify({ ...product(), platform: 'https://platform.example.test' }))
  expect((await readPackagedProduct(root, 'orange'))?.platform).toBe('https://platform.example.test')
  await writeFile(join(root, 'desktop-product.json'), JSON.stringify(product()))
  await writeFile(join(root, 'node_modules/workbench/package.json'), JSON.stringify({ name: 'workbench', version: '2.0.0' }))
  await expect(readPackagedProduct(root, 'orange')).rejects.toThrow(/version mismatch/)
  await writeProductPolicy(root, product())
  const policy: unknown = JSON.parse(await readFile(join(root, 'desktop-product.patch.yml'), 'utf8'))
  expect(policy).toContainEqual({ id: 'llm-claude', config: { pluginUpdates: false } })
  expect(policy).toContainEqual({ id: 'plugin-manager', disabled: false, config: { packageChanges: 'local-files' } })
  expect(policy).toContainEqual({ id: 'ui-plugin-manager', disabled: false, config: {
    packageChanges: false, registryProbeEnabled: false, bundledPackages: product().bundles.filter(name => name !== 'workbench-market'),
  } })
})

it('changes public platform addresses without sharing or deleting previous credentials', async () => {
  const root = await directory()
  expect(await readProductPlatform(root)).toBeUndefined()
  const first = parseProductPlatform({ websiteOrigin: 'https://first.example/' })
  const old = await saveProductPlatform(root, first)
  const identity = JSON.parse(await readFile(old, 'utf8')) as { storageDirectory: string }
  await writeFile(join(identity.storageDirectory, 'account.enc'), 'encrypted-fixture')
  const second = parseProductPlatform({ websiteOrigin: 'https://second.example', gatewayOrigin: 'https://auth.second.example' })
  const next = await saveProductPlatform(root, second)
  expect(next).not.toBe(old)
  expect(await readProductPlatform(root)).toEqual(second)
  expect(await saveProductPlatform(root, first)).toBe(old)
  expect(await readFile(join(identity.storageDirectory, 'account.enc'), 'utf8')).toBe('encrypted-fixture')
  expect(await readFile(join(root, 'platform.json'), 'utf8')).not.toContain('account.enc')
  for (const value of ['http://remote.example', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=x']) {
    expect(() => parseProductPlatform({ websiteOrigin: value })).toThrow()
  }
  expect(parseProductPlatform({ websiteOrigin: 'http://127.0.0.1:3000', gatewayOrigin: '' }).gatewayOrigin).toBe('http://127.0.0.1:3000')
})
