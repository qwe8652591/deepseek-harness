import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareProductRelease, publishProductRelease } from '../scripts/publish-product.ts'

const gh = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync: gh }))

const roots: string[] = []
afterEach(async () => { gh.mockReset(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(brand = 'aiko') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-release-'))
  roots.push(root)
  const applications = ['aiko-dsh-workbench', 'aiko-dsh-market', 'aiko-dsh-md-editor', 'aiko-dsh-visio', 'aiko-dsh-drawio']
  const product = { schemaVersion: 1, profile: brand, appId: `com.${brand}.dsh`, productName: brand,
    repository: 'aiko-dsh-plugins/deepseek-harness', channel: 'beta',
    bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-agent-team-profile', ...applications, `${brand}-dsh-theme`],
    plugins: [...applications, `${brand}-dsh-theme`, 'aiko-dsh-plugin-catalog'].map(name => ({ name, version: '1.0.0' })),
  }
  const record = { schemaVersion: 1, signed: true, dirty: false, target: 'win-x64', version: '0.2.0-rc.3', product,
    publicUrl: `https://github.com/${product.repository}/releases/download/${brand}-beta/`, channel: `${brand}-beta-win-x64`,
  }
  const recordFile = join(root, 'win-x64-release.json')
  const name = `${brand}-dsh-${record.version}-win-x64.exe`
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
