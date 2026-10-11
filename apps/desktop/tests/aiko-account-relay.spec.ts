import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
const { DesktopAccount } = await import('../src/aiko-account.ts')

let server: Server, origin: string, directory: string
const forwarded: { url: string; cookie: string | undefined; authorization: string | undefined }[] = []

beforeEach(async () => {
  forwarded.length = 0
  directory = await mkdtemp(join(tmpdir(), 'aiko-relay-'))
  server = createServer((req, res) => {
    if (req.url === '/auth/me') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ issuer: origin + '/realms/aiko', subject: 'alice', name: 'alice', organization: 'aiko', expiresAt: Date.now() + 60_000, capabilities: true }))
      return
    }
    forwarded.push({ url: req.url ?? '', cookie: req.headers.cookie, authorization: req.headers.authorization })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
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

describe('DesktopAccount relay', () => {
  it('forwards application calls to the gateway delegation route and nothing else outside the capability API', async () => {
    const account = new DesktopAccount({ gatewayOrigin: origin, websiteOrigin: 'http://127.0.0.1:4173', storageDirectory: directory, loginTimeoutMs: 5000, checkIntervalMs: 5000 })
    expect(await account.restore()).toBe(true)
    const relay = JSON.parse(await readFile(await account.startRelay(), 'utf8')) as { baseUrl: string; token: string }
    try {
      const call = (path: string) => fetch(relay.baseUrl + path, { headers: { authorization: 'Bearer ' + relay.token } })
      const delegated = await call('/applications/test-api-user/api/echo?x=1')
      expect(delegated.status).toBe(200)
      expect(await call('/api/me')).toHaveProperty('status', 200)
      expect(forwarded.map(row => row.url)).toEqual([
        '/auth/desktop/applications/test-api-user/api/echo?x=1',
        '/auth/desktop/capabilities/api/me',
      ])
      // The relay authenticates with the device session cookie; it never invents a bearer token for the application.
      expect(forwarded[0]?.cookie).toBe(`${credential.cookieName}=${credential.credential}`)
      expect(forwarded[0]?.authorization).toBeUndefined()
      expect((await call('/applications/Test/api/echo')).status).toBe(404)
      expect((await call('/applications/test-api-user/admin')).status).toBe(404)
      expect(forwarded).toHaveLength(2)
    } finally { await account.dispose() }
  })
})
