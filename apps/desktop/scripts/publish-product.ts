/** Validate complete product releases and publish immutable payloads before their channel pointer. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { load, dump } from 'js-yaml'
import { valid, prerelease, gt } from 'semver'
import { desktopProductFeed, parseDesktopProduct, type DesktopProduct } from './desktop-product.mjs'
import { desktopUpdateMetadataFilename } from './desktop-auto-update-environment.mjs'

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Verified payloads and rendered public feed, ready for review before publication. */
export interface ProductReleasePlan {
  product: DesktopProduct
  version: string
  target: string
  versionTag: string
  channelTag: string
  metadataFilename: string
  metadata: string
  artifacts: string[]
}

/**
 * Refuse incomplete, unsigned or cross-brand artifacts before any GitHub mutation.
 * @param recordFile Completion record produced by a successful signed package command.
 * @returns Payload files and metadata whose URLs name an immutable version release.
 */
export async function prepareProductRelease(recordFile: string): Promise<ProductReleasePlan> {
  const record: unknown = JSON.parse(await readFile(recordFile, 'utf8'))
  if (!object(record) || record.schemaVersion !== 1 || record.signed !== true || record.dirty !== false
    || typeof record.version !== 'string' || valid(record.version) === null || typeof record.target !== 'string')
    throw new Error('product release: a signed, clean build completion record is required')
  const product = parseDesktopProduct(record.product)
  if (product.channel === 'stable' && prerelease(record.version) !== null) throw new Error('product release: prerelease cannot use the stable channel')
  const feed = desktopProductFeed(product, record.target)
  if (record.publicUrl !== feed.publicUrl || record.channel !== feed.channel) throw new Error('product release: update destination mismatch')
  const platform = record.target.startsWith('mac-') ? 'darwin' : 'win32'
  const metadataFilename = desktopUpdateMetadataFilename(record.version, platform, feed.channel)
  const root = resolve(recordFile, '..')
  const value: unknown = load(await readFile(join(root, metadataFilename), 'utf8'))
  if (!object(value) || value.version !== record.version || !Array.isArray(value.files) || value.files.length !== 1)
    throw new Error('product release: invalid update metadata')
  const file: unknown = value.files[0]
  const prefix = `${product.profile}-dsh-${record.version}-${record.target}`
  const filename = `${prefix}.${platform === 'darwin' ? 'zip' : 'exe'}`
  if (!object(file) || file.url !== filename || typeof file.sha512 !== 'string' || typeof file.size !== 'number'
    || value.path !== undefined && value.path !== filename || value.sha512 !== undefined && value.sha512 !== file.sha512)
    throw new Error('product release: updater payload does not match this brand, version and target')
  const payload = join(root, filename), bytes = await readFile(payload)
  if (bytes.length !== file.size || createHash('sha512').update(bytes).digest('base64') !== file.sha512)
    throw new Error('product release: updater checksum mismatch')
  const artifacts = [payload, payload + '.blockmap', ...(platform === 'darwin' ? [join(root, prefix + '.dmg')] : []), recordFile]
  for (const path of artifacts) if (!(await stat(path)).isFile() || (await stat(path)).size === 0) throw new Error('product release: missing artifact ' + basename(path))
  const versionTag = `${product.profile}-v${record.version}`
  const url = `https://github.com/${product.repository}/releases/download/${versionTag}/${filename}`
  const metadata = dump({ ...value, files: [{ ...file, url }], ...(value.path === undefined ? {} : { path: url }) })
  return { product, version: record.version, target: record.target, versionTag,
    channelTag: feed.tag, metadataFilename, metadata, artifacts }
}

/**
 * Publish a reviewed plan with immutable binaries and a separately replaceable channel file.
 * Existing payload names are refused; the channel pointer is written only after payload upload succeeds.
 * @param plan Verified build and payload metadata.
 * @returns Resolves after GitHub accepts the channel metadata.
 */
export async function publishProductRelease(plan: ProductReleasePlan): Promise<void> {
  const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf8', windowsHide: true })
  const repo = ['--repo', plan.product.repository]
  const releases: unknown = JSON.parse(gh(['api', `repos/${plan.product.repository}/releases?per_page=100`]))
  if (!Array.isArray(releases) || !releases.every(object)) throw new Error('product release: invalid GitHub response')
  const channel = releases.find(item => item.tag_name === plan.channelTag)
  const version = releases.find(item => item.tag_name === plan.versionTag)
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-product-release-'))
  try {
    const metadataPath = join(scratch, plan.metadataFilename)
    await writeFile(metadataPath, plan.metadata)
    if (channel !== undefined) {
      if (!Array.isArray(channel.assets)) throw new Error('product release: invalid channel assets')
      if (channel.assets.some(asset => object(asset) && asset.name === plan.metadataFilename)) {
        gh(['release', 'download', plan.channelTag, ...repo, '--pattern', plan.metadataFilename, '--dir', join(scratch, 'previous')])
        const previous: unknown = load(await readFile(join(scratch, 'previous', plan.metadataFilename), 'utf8'))
        if (!object(previous) || typeof previous.version !== 'string' || !valid(previous.version) || !gt(plan.version, previous.version))
          throw new Error('product release: channel version must increase')
      }
    }
    const body = join(scratch, 'notes.md')
    await writeFile(body, `${plan.product.productName} ${plan.version}\n\nComplete desktop distribution; plugins update with the application.\n`)
    if (version === undefined) gh(['release', 'create', plan.versionTag, ...repo, '--title', `${plan.product.productName} ${plan.version}`, '--notes-file', body, '--draft', '--latest=false', ...prerelease(plan.version) === null ? [] : ['--prerelease']])
    // gh refuses existing filenames: published payloads are never clobbered.
    gh(['release', 'upload', plan.versionTag, ...repo, ...plan.artifacts])
    gh(['release', 'edit', plan.versionTag, ...repo, '--draft=false', '--latest=false'])
    if (channel === undefined) gh(['release', 'create', plan.channelTag, ...repo, '--title', `${plan.product.productName} ${plan.product.channel} updates`, '--notes-file', body, '--prerelease', '--latest=false'])
    gh(['release', 'upload', plan.channelTag, ...repo, metadataPath, '--clobber'])
  } finally { await rm(scratch, { recursive: true, force: true }) }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const { values } = parseArgs({ options: { record: { type: 'string' }, publish: { type: 'boolean', default: false } } })
  if (!values.record) throw new Error('Use --record <target-release.json>; add --publish only after reviewing the plan')
  const plan = await prepareProductRelease(resolve(values.record))
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n')
  if (values.publish) await publishProductRelease(plan)
}
