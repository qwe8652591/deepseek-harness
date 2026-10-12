import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const credential = { credential: 'a'.repeat(43), cookieName: 'aiko_session_0123456789ab' }
const electron = vi.hoisted(() => ({ saved: '' }))
vi.mock('electron', () => ({
  app: { getLocale: () => 'zh-CN' },
  shell: { openExternal: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret', decryptString: () => electron.saved },
}))
const { DesktopAccount, AccountSignedOutError } = await import('../src/aiko-account.ts')

let server: Server, origin: string, directory: string, logoutLocation: string, logoutStatus: number
let me: { status: number; body: unknown } | undefined
const issuer = (): string => origin + '/realms/aiko'

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aiko-account-'))
  logoutStatus = 303
  me = undefined
  server = createServer((req, res) => {
    if (req.url === '/auth/me' && me) { res.writeHead(me.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(me.body)); return }
    if (req.url === '/auth/me') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ issuer: issuer(), subject: 'alice', name: 'alice', organization: 'aiko', expiresAt: Date.now() + 60_000, capabilities: true }))
      return
    }
    if (req.url === '/auth/logout' && req.method === 'POST' && logoutStatus === 502) {
      res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Local logout complete; unified sign-out failed' })); return
    }
    if (req.url === '/auth/logout' && req.method === 'POST') { res.writeHead(303, { location: logoutLocation }); res.end(); return }
    res.writeHead(404); res.end()
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  electron.saved = JSON.stringify({ origin, ...credential })
  await writeFile(join(directory, 'account.enc'), 'sealed')
})

afterEach(async () => {
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  await rm(directory, { recursive: true, force: true })
})

async function signedIn(openBrowser: (url: string) => Promise<void>) {
  const account = new DesktopAccount({ gatewayOrigin: origin, websiteOrigin: 'http://127.0.0.1:4173', storageDirectory: directory, loginTimeoutMs: 5000, checkIntervalMs: 5000 }, openBrowser)
  expect(await account.restore()).toBe(true)
  return account
}

describe('DesktopAccount.logout', () => {
  it('completes a per-device logout that redirects to the website without opening a browser', async () => {
    logoutLocation = 'http://127.0.0.1:4173'
    const openBrowser = vi.fn(async () => {})
    const account = await signedIn(openBrowser)
    await expect(account.logout()).resolves.toBeUndefined()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(account.profile()).toBeNull()
    expect(await account.restore()).toBe(false)
  })

  it('opens the issuer end-session URL so the browser clears its sign-in session', async () => {
    logoutLocation = issuer() + '/protocol/openid-connect/logout?client_id=desktop'
    const openBrowser = vi.fn(async () => {})
    const account = await signedIn(openBrowser)
    await account.logout()
    expect(openBrowser).toHaveBeenCalledWith(logoutLocation)
  })

  it('never opens a destination outside the issuer', async () => {
    logoutLocation = 'https://example.com/protocol/openid-connect/logout'
    const openBrowser = vi.fn(async () => {})
    const account = await signedIn(openBrowser)
    await account.logout()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(account.profile()).toBeNull()
  })

  it('treats a gateway 502 as this device signed out: the gateway ends local sessions before the identity provider', async () => {
    logoutStatus = 502
    const openBrowser = vi.fn(async () => {})
    const account = await signedIn(openBrowser)
    await expect(account.logout()).resolves.toBeUndefined()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(account.profile()).toBeNull()
    expect(await account.restore()).toBe(false)
  })
})

describe('DesktopAccount.verify', () => {
  it('reports a sign-out elsewhere separately from an expired session, and forgets the credential either way', async () => {
    const account = await signedIn(vi.fn(async () => {}))
    me = { status: 401, body: { error: 'Signed out everywhere' } }
    const signedOut = account.verify()
    await expect(signedOut).rejects.toBeInstanceOf(AccountSignedOutError)
    await expect(signedOut).rejects.toThrow('已在其它设备或应用中退出登录')
    expect(account.profile()).toBeNull()
    expect(await account.restore()).toBe(false)
  })

  it('keeps an expiry distinct so the same account keeps its panel storage', async () => {
    const account = await signedIn(vi.fn(async () => {}))
    me = { status: 401, body: { error: 'Aiko authentication required' } }
    const expired = await account.verify().then(() => undefined, (error: unknown) => error)
    expect(expired).toBeInstanceOf(Error)
    expect(expired).not.toBeInstanceOf(AccountSignedOutError)
    expect((expired as Error).message).toBe('登录已过期，请重新登录。')
  })
})
