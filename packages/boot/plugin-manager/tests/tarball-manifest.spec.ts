/** Reading a local package tarball's manifest before pnpm runs. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, it, onTestFinished } from 'vitest'
import { readTarballManifest } from '../src/tarball-manifest.ts'
import { tarEntries, tarHeader, writeTarball } from './tarball.ts'

function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tarball-manifest-'))
  onTestFinished(() => { rmSync(dir, { recursive: true, force: true }) })
  return dir
}

it('reads the manifest that npm and pnpm write first in a package tarball', async () => {
  const file = join(directory(), 'first.tgz')
  writeTarball(file, { 'package/package.json': '{"name":"first","version":"1.0.0"}', 'package/index.js': 'export {}\n' })
  expect(await readTarballManifest(file)).toEqual({ name: 'first', version: '1.0.0' })
})

it('skips entries larger than one decompressed chunk and reads a manifest that spans chunks', async () => {
  const file = join(directory(), 'large.tgz')
  const description = 'x'.repeat(40000)
  writeTarball(file, {
    './package/dist/bundle.js': Buffer.alloc(100000, 1),
    './package/package.json': JSON.stringify({ name: 'large', description }),
  })
  expect(await readTarballManifest(file)).toEqual({ name: 'large', description })
})

it('refuses an archive whose entries end before any package/package.json', async () => {
  const file = join(directory(), 'none.tgz')
  writeTarball(file, { 'package/index.js': 'export {}\n' })
  await expect(readTarballManifest(file)).rejects.toThrow('no package/package.json')
})

it('refuses a truncated archive, and a manifest over 1 MiB without reading its body', async () => {
  const dir = directory()
  const truncated = join(dir, 'truncated.tgz')
  writeFileSync(truncated, gzipSync(Buffer.concat([tarHeader('package/package.json', 100), Buffer.from('{"name"')])))
  await expect(readTarballManifest(truncated)).rejects.toThrow('no package/package.json')
  const oversized = join(dir, 'oversized.tgz')
  writeFileSync(oversized, gzipSync(tarHeader('package/package.json', 2 * 1024 * 1024)))
  await expect(readTarballManifest(oversized)).rejects.toThrow('exceeds 1 MiB')
})

it('refuses a file that is not gzip-compressed', async () => {
  const file = join(directory(), 'plain.tgz')
  writeFileSync(file, tarEntries({ 'package/package.json': '{}' }))
  await expect(readTarballManifest(file)).rejects.toThrow()
})
