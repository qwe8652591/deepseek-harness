import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareProductRelease, publishProductRelease, stageProductRelease } from '../scripts/publish-product.ts'

const gh = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync: gh }))

const roots: string[] = []
afterEach(async () => { gh.mockReset(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(brand = 'aiko', releases?: string) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-release-'))
  roots.push(root)
  const applications = ['aiko-dsh-workbench', 'aiko-dsh-market', 'aiko-dsh-md-editor', 'aiko-dsh-visio', 'aiko-dsh-drawio', 'aiko-dsh-ppt', 'aiko-dsh-image-generation', 'aiko-dsh-annotation']
  const product = { schemaVersion: 1, profile: brand, appId: `com.${brand}.dsh`, productName: brand,
    ...releases === undefined ? { repository: 'aiko-dsh-plugins/deepseek-harness' } : { releases }, channel: 'beta',
    bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-agent-team-profile', ...applications, `${brand}-dsh-theme`],
    plugins: [...applications, `${brand}-dsh-theme`, 'aiko-dsh-plugin-catalog'].map(name => ({ name, version: '1.0.0' })),
  }
  const record = { schemaVersion: 1, signed: releases === undefined, dirty: false, target: 'win-x64', version: '0.2.0-rc.3', product,
    publicUrl: `${releases ?? 'https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/'}${brand}-beta/`, channel: `${brand}-beta-win-x64`,
  }
  const recordFile = join(root, 'win-x64-release.json')
  const name = `${brand}-dsh-${record.version}-win-x64${releases === undefined ? '' : '-unsigned'}.exe`
  const bytes = 'installer test fixture', sha512 = createHash('sha512').update(bytes).digest('base64')
  const metadata = { version: record.version, path: name, sha512, files: [{ url: name, sha512, size: Buffer.byteLength(bytes) }] }
  const metadataFile = join(root, `${record.channel}.yml`)
  await writeFile(recordFile, JSON.stringify(record))
  await writeFile(join(root, name), bytes)
  await writeFile(join(root, name + '.blockmap'), 'blockmap fixture')
  await writeFile(metadataFile, JSON.stringify(metadata))
  return { root, recordFile, record, metadataFile, metadata, name }
}

it.each(['aiko', 'yunyao'])('publishes %s channel metadata pointing at its immutable version payload', async (brand) => {
  const f = await fixture(brand)
  const plan = await prepareProductRelease(f.recordFile)
  expect(plan.versionTag).toBe(`${brand}-v0.2.0-rc.3`)
  expect(plan.channelTag).toBe(`${brand}-beta`)
  expect(load(plan.metadata)).toMatchObject({ path: `https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/${plan.versionTag}/${f.name}` })
  expect(plan.artifacts.map(path => path.slice(f.root.length + 1))).toEqual([f.name, f.name + '.blockmap', 'win-x64-release.json'])
})

it('refuses unsigned builds, dirty builds, changed payloads and another brand before publication', async () => {
  const f = await fixture()
  for (const record of [{ ...f.record, signed: false }, { ...f.record, dirty: true }, { ...f.record, channel: 'yunyao-beta-win-x64' }]) {
    await writeFile(f.recordFile, JSON.stringify(record))
    await expect(prepareProductRelease(f.recordFile)).rejects.toThrow()
  }
  await writeFile(f.recordFile, JSON.stringify(f.record))
  await writeFile(f.metadataFile, JSON.stringify({ ...f.metadata, files: [{ ...f.metadata.files[0], url: 'yunyao-dsh-0.2.0-rc.3-win-x64.exe' }] }))
  await expect(prepareProductRelease(f.recordFile)).rejects.toThrow(/brand/)
  await writeFile(f.metadataFile, JSON.stringify(f.metadata))
  await writeFile(join(f.root, f.name), 'altered installer')
  await expect(prepareProductRelease(f.recordFile)).rejects.toThrow(/checksum/)
})

it('uploads immutable payloads before the channel and cleans temporary publication files', async () => {
  const plan = await prepareProductRelease((await fixture()).recordFile)
  gh.mockReturnValue('[]')
  await publishProductRelease(plan)
  const commands = gh.mock.calls.map(call => call[1] as string[])
  expect(commands.filter(args => args[0] === 'release').map(args => args.slice(1, 3))).toEqual([
    ['create', plan.versionTag], ['upload', plan.versionTag], ['edit', plan.versionTag],
    ['create', plan.channelTag], ['upload', plan.channelTag],
  ])
  expect(commands[2]).not.toContain('--clobber')
  const channelUpload = commands.at(-1)!
  expect(channelUpload.at(-1)).toBe('--clobber')
  await expect(readFile(channelUpload.at(-2)!)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('leaves the public channel unchanged when payload upload fails', async () => {
  const plan = await prepareProductRelease((await fixture()).recordFile)
  gh.mockImplementation((_command: string, args: string[]) => {
    if (args[0] === 'release' && args[1] === 'upload') throw new Error('upload failed')
    return '[]'
  })
  await expect(publishProductRelease(plan)).rejects.toThrow('upload failed')
  expect(gh.mock.calls.some(call => (call[1] as string[]).includes(plan.channelTag))).toBe(false)
})

const hosted = 'https://downloads.example.test:20124/dsh/releases/'

it('publishes unsigned self-hosted payloads under the server version directory', async () => {
  const f = await fixture('yunyao', hosted)
  const plan = await prepareProductRelease(f.recordFile)
  expect(load(plan.metadata)).toMatchObject({ path: `${hosted}yunyao-v0.2.0-rc.3/${f.name}`, files: [{ url: `${hosted}yunyao-v0.2.0-rc.3/${f.name}` }] })
  const output = join(f.root, 'out')
  const read = vi.fn(async () => undefined)
  expect(await stageProductRelease(plan, output, read)).toEqual([
    `yunyao-v0.2.0-rc.3/${f.name}`, `yunyao-v0.2.0-rc.3/${f.name}.blockmap`, 'yunyao-v0.2.0-rc.3/win-x64-release.json', 'yunyao-beta/yunyao-beta-win-x64.yml',
  ])
  expect(read).toHaveBeenCalledWith(`${hosted}yunyao-beta/yunyao-beta-win-x64.yml`)
  expect((await readdir(join(output, 'yunyao-v0.2.0-rc.3'))).sort()).toEqual([f.name, f.name + '.blockmap', 'win-x64-release.json'].sort())
  expect(await readFile(join(output, 'yunyao-beta', 'yunyao-beta-win-x64.yml'), 'utf8')).toBe(plan.metadata)
  await expect(stageProductRelease(plan, output, read)).rejects.toThrow(/already staged/)
})

it('refuses a self-hosted channel that already carries the same or a newer version', async () => {
  const plan = await prepareProductRelease((await fixture('yunyao', hosted)).recordFile)
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-stage-'))
  roots.push(root)
  for (const version of ['0.2.0-rc.3', '0.2.0'])
    await expect(stageProductRelease(plan, join(root, version), async () => `version: ${version}`)).rejects.toThrow(/must increase/)
  await mkdir(join(root, 'empty'))
  expect(await stageProductRelease(plan, join(root, 'empty'), async () => 'version: 0.2.0-rc.2')).toHaveLength(4)
})

it('keeps unsigned builds out of GitHub products and staged releases out of GitHub products', async () => {
  const f = await fixture('yunyao', hosted)
  const github = await prepareProductRelease((await fixture()).recordFile)
  await expect(stageProductRelease(github, join(f.root, 'out'), async () => undefined)).rejects.toThrow(/self-hosted/)
  const plan = await prepareProductRelease(f.recordFile)
  await expect(publishProductRelease(plan)).rejects.toThrow(/GitHub/)
})

it('stages a signed self-hosted Mac release whose channel names the dmg installer for downloads', async () => {
  const { product } = (await fixture('yunyao', hosted)).record
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-release-mac-'))
  roots.push(root)
  const record = { schemaVersion: 1, signed: true, dirty: false, target: 'mac-arm64', version: '0.2.0-rc.3', product,
    publicUrl: `${hosted}yunyao-beta/`, channel: 'yunyao-beta-mac-arm64' }
  const zip = 'yunyao-dsh-0.2.0-rc.3-mac-arm64.zip', dmg = 'yunyao-dsh-0.2.0-rc.3-mac-arm64.dmg'
  const zipBytes = 'zip fixture', dmgBytes = 'dmg installer fixture'
  const sha = (bytes: string) => createHash('sha512').update(bytes).digest('base64')
  await writeFile(join(root, 'mac-arm64-release.json'), JSON.stringify(record))
  await writeFile(join(root, zip), zipBytes)
  await writeFile(join(root, zip + '.blockmap'), 'blockmap fixture')
  await writeFile(join(root, dmg), dmgBytes)
  await writeFile(join(root, 'yunyao-beta-mac-arm64-mac.yml'), JSON.stringify({ version: record.version, path: zip, sha512: sha(zipBytes),
    files: [{ url: zip, sha512: sha(zipBytes), size: Buffer.byteLength(zipBytes) }] }))
  const plan = await prepareProductRelease(join(root, 'mac-arm64-release.json'))
  expect(load(plan.metadata)).toMatchObject({
    path: `${hosted}yunyao-v0.2.0-rc.3/${zip}`,
    files: [{ url: `${hosted}yunyao-v0.2.0-rc.3/${zip}` }],
    installer: { url: `${hosted}yunyao-v0.2.0-rc.3/${dmg}`, sha512: sha(dmgBytes), size: Buffer.byteLength(dmgBytes) },
  })
  const output = join(root, 'out')
  expect(await stageProductRelease(plan, output, async () => undefined)).toEqual([
    `yunyao-v0.2.0-rc.3/${zip}`, `yunyao-v0.2.0-rc.3/${zip}.blockmap`, `yunyao-v0.2.0-rc.3/${dmg}`, 'yunyao-v0.2.0-rc.3/mac-arm64-release.json',
    'yunyao-beta/yunyao-beta-mac-arm64-mac.yml',
  ])
})
