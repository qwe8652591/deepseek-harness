import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const credential = { credential: 'a'.repeat(43), cookieName: 'workbench_session_0123456789ab' }
// safeStorage 用明文代替加密：encryptString 写进 saved，decryptString 读出来。
const electron = vi.hoisted(() => ({ saved: '', writes: 0 }))
vi.mock('electron', () => ({
  app: { getLocale: () => 'zh-CN' },
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (text: string) => { electron.saved = text; electron.writes += 1; return Buffer.from('sealed') },
    decryptString: () => electron.saved,
  },
}))
const { DesktopAccount, AccountUnavailableError } = await import('../src/workbench-account.ts')

let server: Server, origin: string, directory: string
let me: { status: number; body?: unknown }
const issuer = (): string => origin + '/realms/workbench'
const alice = () => ({ issuer: issuer(), subject: 'alice', name: 'alice', organization: 'orange', expiresAt: Date.now() + 60_000, capabilities: true })

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'workbench-account-offline-'))
  electron.writes = 0
  me = { status: 200 }
  server = createServer((req, res) => {
    if (req.url !== '/auth/me') { res.writeHead(404); res.end(); return }
    res.writeHead(me.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(me.status === 200 ? alice() : me.body ?? { error: 'Bad gateway' }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  electron.saved = JSON.stringify({ origin, ...credential })
  await writeFile(join(directory, 'account.enc'), 'sealed')
})

afterEach(async () => {
  if (server.listening) await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  await rm(directory, { recursive: true, force: true })
})

const account = () => new DesktopAccount({ gatewayOrigin: origin, websiteOrigin: 'http://127.0.0.1:4173', storageDirectory: directory, loginTimeoutMs: 5000, checkIntervalMs: 5000 })
const saved = () => JSON.parse(electron.saved) as Record<string, unknown>
const stored = async () => stat(join(directory, 'account.enc')).then(() => true, () => false)

describe('DesktopAccount when the account service is temporarily unavailable', () => {
  it('stores the verified account once, and again only when it changes', async () => {
    const first = account()
    expect(await first.restore()).toBe(true)
    expect(saved().user).toMatchObject({ subject: 'alice', organization: 'orange' })
    expect(saved()).toMatchObject(credential)
    const writes = electron.writes
    await first.verify()
    await first.verify()
    expect(electron.writes, 'a new expiry alone is not stored again').toBe(writes)
  })

  it('opens the last verified account when the server answers 502 at startup, and keeps the credential', async () => {
    expect(await account().restore()).toBe(true)
    me = { status: 502 }
    const restarted = account()
    expect(await restarted.restore()).toBe(true)
    expect(restarted.profile()).toMatchObject({ subject: 'alice', issuer: issuer() })
    expect(await stored()).toBe(true)
  })

  it('opens the last verified account when the server cannot be reached at all', async () => {
    expect(await account().restore()).toBe(true)
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    const offline = account()
    expect(await offline.restore()).toBe(true)
    expect(offline.profile()?.subject).toBe('alice')
    await expect(offline.verify()).rejects.toBeInstanceOf(AccountUnavailableError)
    expect(await stored()).toBe(true)
  })

  it('still asks to sign in when no verified account was stored yet and the server is down', async () => {
    me = { status: 503 }
    await expect(account().restore()).rejects.toBeInstanceOf(AccountUnavailableError)
    expect(await stored(), 'the credential stays for the next try').toBe(true)
  })

  it('treats a 502 during a periodic check as temporary, and a 401 as signed out', async () => {
    const running = account()
    expect(await running.restore()).toBe(true)
    me = { status: 502 }
    await expect(running.verify()).rejects.toBeInstanceOf(AccountUnavailableError)
    expect(running.profile()?.subject).toBe('alice')
    expect(await stored()).toBe(true)
    me = { status: 200 }
    await expect(running.verify()).resolves.toBeUndefined()
    me = { status: 401, body: { error: 'Authentication required' } }
    const error = await running.verify().catch((cause: unknown) => cause)
    expect(error).not.toBeInstanceOf(AccountUnavailableError)
    expect(running.profile()).toBeNull()
    expect(await stored(), 'a rejected credential is removed').toBe(false)
  })
})
