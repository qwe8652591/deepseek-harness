import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { accountHomeDirectory } from '../src/aiko-account.ts'
import { parseProductPlatform, saveProductPlatform } from '../src/product-platform.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-account-directories-'))
  roots.push(root)
  return root
}

it('names new account homes and product platforms with short digests that keep Windows paths under MAX_PATH', async () => {
  const root = await directory()
  const home = accountHomeDirectory(root, 'https://login.example/realms/aiko', 'subject-1')
  expect(basename(home)).toMatch(/^[0-9a-f]{16}$/)
  expect(accountHomeDirectory(root, 'https://login.example/realms/aiko', 'subject-2')).not.toBe(home)
  const identity = await saveProductPlatform(root, parseProductPlatform({ websiteOrigin: 'https://first.example' }))
  expect(basename(join(identity, '..'))).toMatch(/^[0-9a-f]{16}$/)
})

it('keeps using an account home created under the earlier full-digest name', async () => {
  const root = await directory()
  const issuer = 'https://login.example/realms/aiko', subject = 'subject-1'
  const short = accountHomeDirectory(root, issuer, subject)
  const legacy = join(root, 'accounts', createHash('sha256').update(JSON.stringify([issuer, subject])).digest('hex'))
  await mkdir(legacy, { recursive: true })
  expect(accountHomeDirectory(root, issuer, subject)).toBe(legacy)
  expect(short).toBe(join(root, 'accounts', basename(legacy).slice(0, 16)))
})
