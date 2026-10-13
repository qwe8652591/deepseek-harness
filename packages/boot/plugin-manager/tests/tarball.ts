/** npm-style package tarballs for plugin-manager specs: gzip-compressed ustar entries in the order given. */
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

/**
 * One ustar header with a valid checksum.
 * @param name Entry path inside the archive.
 * @param size Declared body size; it may differ from the bytes that follow, to describe truncated archives.
 * @returns The 512-byte header block.
 */
export function tarHeader(name: string, size: number): Buffer {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write('0000644\0', 100, 8, 'latin1')
  block.write('0000000\0', 108, 8, 'latin1')
  block.write('0000000\0', 116, 8, 'latin1')
  block.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'latin1')
  block.write('00000000000\0', 136, 12, 'latin1')
  block.write('        ', 148, 8, 'latin1')
  block.write('0', 156, 1, 'latin1')
  block.write('ustar\0', 257, 6, 'latin1')
  block.write('00', 263, 2, 'latin1')
  let sum = 0
  for (const byte of block) sum += byte
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1')
  return block
}

/**
 * @param files Entry paths mapped to their contents, in archive order.
 * @returns The uncompressed tar stream closed by the two zero blocks that end an archive.
 */
export function tarEntries(files: Readonly<Record<string, string | Buffer>>): Buffer {
  const parts: Buffer[] = []
  for (const [name, content] of Object.entries(files)) {
    const bytes = typeof content === 'string' ? Buffer.from(content) : content
    parts.push(tarHeader(name, bytes.length), bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)])
}

/**
 * @param path Where the gzip-compressed tarball is written.
 * @param files Entry paths mapped to their contents, in archive order.
 */
export function writeTarball(path: string, files: Readonly<Record<string, string | Buffer>>): void {
  writeFileSync(path, gzipSync(tarEntries(files)))
}

/**
 * @param path Where the tarball is written.
 * @param manifest Fields merged over a bundle declaration with an empty patch.
 */
export function writeBundleTarball(path: string, manifest: Readonly<Record<string, unknown>>): void {
  writeTarball(path, {
    'package/package.json': JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } }, ...manifest }),
    'package/cordis.patch.yml': '[]\n',
  })
}
