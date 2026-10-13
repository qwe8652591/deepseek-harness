/** Read a local npm package tarball's manifest without extracting the archive. */
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream'
import { createGunzip } from 'node:zlib'

/** Tar headers and padded entry bodies are multiples of this block size. */
const BLOCK = 512
/** Largest `package/package.json` read from a tarball; a manifest is a few kilobytes. */
const MAX_MANIFEST_BYTES = 1024 * 1024
const MISSING = 'the tarball contains no package/package.json'

/**
 * Read `package/package.json` from a gzip-compressed npm tarball, decompressing only up to that entry.
 * @param path Absolute path of the tarball.
 * @returns The parsed manifest.
 * @throws When the file is unreadable or not gzip-compressed tar, contains no `package/package.json`,
 * or that entry exceeds 1 MiB or is not JSON.
 */
export async function readTarballManifest(path: string): Promise<object> {
  // pipeline destroys every stream on failure, so a read or decompression error rejects the iteration below.
  const entries = pipeline(createReadStream(path), createGunzip(), (error) => { void error })
  let pending = Buffer.alloc(0)
  let skip = 0
  for await (const chunk of entries as AsyncIterable<Buffer>) {
    const skipped = Math.min(skip, chunk.length)
    skip -= skipped
    pending = Buffer.concat([pending, chunk.subarray(skipped)])
    while (skip === 0 && pending.length >= BLOCK) {
      const digits = /^\s*([0-7]+)/u.exec(pending.toString('latin1', 124, 136))?.[1]
      // The zero-filled end-of-archive block declares no size: every entry has been read.
      if (digits === undefined) throw new Error(MISSING)
      const size = Number.parseInt(digits, 8)
      const name = pending.toString('utf8', 0, 100).replace(/\0.*$/su, '').replace(/^\.\//u, '')
      if (name === 'package/package.json') {
        if (size > MAX_MANIFEST_BYTES) throw new Error('the package.json in the tarball exceeds 1 MiB')
        if (pending.length < BLOCK + size) break
        return JSON.parse(pending.toString('utf8', BLOCK, BLOCK + size)) as object
      }
      const end = BLOCK + Math.ceil(size / BLOCK) * BLOCK
      skip = Math.max(0, end - pending.length)
      pending = pending.subarray(Math.min(end, pending.length))
    }
  }
  throw new Error(MISSING)
}
