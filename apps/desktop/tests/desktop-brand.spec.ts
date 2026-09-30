import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { readDesktopBrand } from '../scripts/desktop-brand.mjs'
import { prepareDesktopBrand } from '../scripts/prepare-desktop-brand.ts'
import { unpackIco } from '../scripts/render-tray-icon.ts'
import { readNativeDesktopBrand } from '../src/desktop-brand.ts'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { loadDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture(brand: 'aiko' | 'yunyao') {
  const root = await mkdtemp(join(tmpdir(), 'desktop-brand-'))
  directories.push(root)
  const theme = brand === 'aiko' ? 'aiko-dsh-theme' : 'yunyao-dsh-theme'
  const directory = join(root, 'node_modules', theme)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: theme, exports: { './desktop-icon': './icon.json' } }))
  const source = brand === 'aiko'
    ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#de7c21"/></svg>')
    : await sharp({ create: { width: 100, height: 50, channels: 4, background: '#3289ab' } }).png().toBuffer()
  const asset = { version: 1, theme, productName: brand === 'aiko' ? 'Aiko DSH' : '云遥宇航',
    image: 'data:image/' + (brand === 'aiko' ? 'svg+xml' : 'png') + ';base64,' + source.toString('base64') }
  await writeFile(join(directory, 'icon.json'), JSON.stringify(asset))
  return { root, directory, asset, env: { DSH_DESKTOP_BRAND: brand, DSH_DESKTOP_BRAND_RUNTIME: root } }
}

describe('native desktop brand selection', () => {
  it.each(['aiko', 'yunyao'] as const)('renders %s artwork into app, tray and installer assets', async (brand) => {
    const { root, env } = await fixture(brand)
    const directory = await prepareDesktopBrand(env, root)
    expect(directory).toBeDefined()
    const icon = join(directory!, 'icon.png')
    const metadata = await sharp(icon).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1024, 1024, true])
    const { data, info } = await sharp(icon).raw().toBuffer({ resolveWithObject: true })
    expect(data[3]).toBe(0)
    expect(data[(512 * info.width + 512) * info.channels + 3]).toBe(255)
    expect(unpackIco(await readFile(join(directory!, 'icon.ico'))).map(entry => entry.size))
      .toEqual([16, 20, 24, 32, 40, 48, 64, 128, 256])
    const native = readNativeDesktopBrand(false, '/unused', directory, brand)
    await expect(JSON.stringify({ ...native, icon: '<icon.png>', tray: '<icon.ico>' }, null, 2) + '\n')
      .toMatchFileSnapshot('./expected/desktop-brand/' + brand + '.json')
    const config = createElectronBuilderConfig({ ...env, DSH_DESKTOP_APP_ID: 'com.example.' + brand,
      DSH_DESKTOP_UNSIGNED: '1', DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: '{"allowedAuthOrigins":["https://login.example.com"]}',
    }, 'win32', 'x64')
    expect(config.extraMetadata.dshDesktopBrand).toBe(brand)
    expect(config.win.icon).toContain(join('branding', brand, 'icon.ico'))
    expect(config.mac.icon).toContain(join('branding', brand, 'icon.png'))
    expect(config.nsis.installerIcon).toBe(config.win.icon)
    expect(config.nsis.uninstallerIcon).toBe(config.win.icon)
    expect(config.extraResources.find(entry => entry.to === 'tray.ico')?.from).toBe(config.win.icon)
    expect(config.extraResources.filter(entry => entry.to === 'branding')).toHaveLength(1)
  })

  it('does not accept another brand, an invalid manifest or missing prepared artwork', async () => {
    const { root, directory, asset, env } = await fixture('aiko')
    const prepared = await prepareDesktopBrand(env, root)
    expect(() => readNativeDesktopBrand(false, root, prepared, 'yunyao')).toThrow('differs')
    expect(() => readNativeDesktopBrand(false, root, undefined, 'aiko')).toThrow('missing')
    await rm(join(prepared!, 'icon.ico'))
    expect(() => readNativeDesktopBrand(false, root, prepared, 'aiko')).toThrow('incomplete')
    await writeFile(join(directory, 'icon.json'), JSON.stringify({ ...asset, theme: 'yunyao-dsh-theme' }))
    expect(() => readDesktopBrand(env)).toThrow('invalid theme')
    await writeFile(join(directory, 'icon.json'), JSON.stringify({ ...asset, image: 'https://example.com/logo.svg' }))
    expect(() => readDesktopBrand(env)).toThrow('embedded')
  })

  it('installed applications ignore development resources', async () => {
    const { root, env } = await fixture('aiko')
    const directory = await prepareDesktopBrand(env, root)
    expect(readNativeDesktopBrand(true, root, directory, undefined)).toBeUndefined()
    expect(() => readNativeDesktopBrand(true, root, directory, 'aiko')).toThrow('missing')
    const { cp } = await import('node:fs/promises')
    const resources = join(root, 'installed')
    await cp(directory!, join(resources, 'branding'), { recursive: true })
    expect(readNativeDesktopBrand(true, resources, '/ignored', 'aiko', 'aiko')?.brand).toBe('aiko')
    expect(() => readNativeDesktopBrand(true, resources, '/ignored', 'aiko', 'yunyao')).toThrow('application manifest')
    expect(() => readNativeDesktopBrand(true, resources, '/ignored', 'aiko', 'other')).toThrow('invalid packaged')
    expect(() => readNativeDesktopBrand(true, root, undefined, undefined, 'aiko')).toThrow('missing')
    await writeFile(join(resources, 'branding', 'brand.json'), '{"version":2}')
    expect(() => readNativeDesktopBrand(true, resources, undefined, 'aiko')).toThrow('invalid')
  })

  it('keeps upstream packaging unchanged and rejects incomplete brand selection', () => {
    expect(readDesktopBrand({})).toBeUndefined()
    expect(readNativeDesktopBrand(false, '/unused', undefined, undefined)).toBeUndefined()
    expect(() => readDesktopBrand({ DSH_DESKTOP_BRAND: 'other' })).toThrow('select')
    expect(() => readDesktopBrand({ DSH_DESKTOP_BRAND: 'aiko' })).toThrow('absolute')
  })

  it('takes brand configuration only from the target dotenv file', async () => {
    const { root, env } = await fixture('yunyao')
    await writeFile(join(root, '.env.windows'), 'DSH_DESKTOP_BRAND=yunyao\nDSH_DESKTOP_BRAND_RUNTIME=.\n')
    const loaded = loadDesktopPackageEnvironment('win32', {
      ...env, DSH_DESKTOP_BRAND: 'aiko', DSH_DESKTOP_BRAND_RESOURCES: '/untrusted',
    }, root)
    expect(readDesktopBrand(loaded)?.brand).toBe('yunyao')
    expect(loaded.DSH_DESKTOP_BRAND_RESOURCES).toBeUndefined()
    await writeFile(join(root, '.env.windows'), '')
    expect(readDesktopBrand(loadDesktopPackageEnvironment('win32', env, root))).toBeUndefined()
  })
})
