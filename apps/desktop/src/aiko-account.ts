/** Native account ownership: browser handoff, OS-encrypted credentials and a per-process capability relay. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, safeStorage, shell } from 'electron'
import { resolveAikoAccountLocale as resolveDesktopLocale } from './aiko-account-locale.ts'

/** Verified display fields; neither IdP tokens nor the native credential are exposed to renderers. */
export interface DesktopUser {
  issuer: string
  subject: string
  name: string
  organization: string
  email?: string
  expiresAt: number
  capabilities: boolean
}

/** Operator-owned account service and local storage configuration. */
export interface AccountConfig {
  gatewayOrigin: string
  websiteOrigin: string
  storageDirectory: string
  loginTimeoutMs: number
  checkIntervalMs: number
}
interface Credential { credential: string; cookieName: string }
class AccountSessionExpiredError extends Error {}
const random = (): string => randomBytes(32).toString('base64url')
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * Read a public deployment configuration, rejecting remote cleartext and relative storage.
 * @param path - absolute configuration file selected by the application entry.
 * @returns validated deployment settings.
 */
export async function readAccountConfig(path: string): Promise<AccountConfig> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!record(value)) throw new Error('Desktop identity configuration must be an object')
  for (const field of ['gatewayOrigin', 'websiteOrigin']) {
    if (typeof value[field] !== 'string') throw new Error(`Missing identity ${field}`)
    const url = new URL(value[field])
    if (url.origin !== value[field] || url.username || url.password || url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error(`Invalid identity ${field}`)
  }
  if (typeof value.storageDirectory !== 'string' || !isAbsolute(value.storageDirectory)) throw new Error('Identity storageDirectory must be absolute')
  for (const field of ['loginTimeoutMs', 'checkIntervalMs']) {
    if (typeof value[field] !== 'number' || !Number.isSafeInteger(value[field]) || value[field] < 1000 || value[field] > 300000) throw new Error(`Invalid identity ${field}`)
  }
  return { gatewayOrigin: String(value.gatewayOrigin), websiteOrigin: String(value.websiteOrigin), storageDirectory: value.storageDirectory,
    loginTimeoutMs: Number(value.loginTimeoutMs), checkIntervalMs: Number(value.checkIntervalMs) }
}

function parseUser(value: unknown): DesktopUser {
  if (!record(value) || ['issuer', 'subject', 'name', 'organization'].some(key => typeof value[key] !== 'string' || value[key] === '')
    || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now() || typeof value.capabilities !== 'boolean'
    || value.email !== undefined && typeof value.email !== 'string') throw new Error('Invalid account response')
  return { issuer: String(value.issuer), subject: String(value.subject), name: String(value.name), organization: String(value.organization),
    ...(typeof value.email === 'string' ? { email: value.email } : {}), expiresAt: value.expiresAt, capabilities: value.capabilities }
}

function parseCredential(value: unknown): Credential {
  if (!record(value) || typeof value.credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.credential)
    || typeof value.cookieName !== 'string' || !/^aiko_session_[a-f0-9]{12}$/.test(value.cookieName)) throw new Error('Invalid account credential')
  return { credential: value.credential, cookieName: value.cookieName }
}

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return
  await new Promise<void>((resolve) => { server.close(() =>{  resolve() }); server.closeAllConnections() })
}

/** A native account is shared by its local DSH runtime and its capability relay. */
export class DesktopAccount {
  private readonly messages = resolveDesktopLocale(app.getLocale()).messages
  private credential: Credential | undefined
  private user: DesktopUser | undefined
  private cancelLogin: (() => void) | undefined
  private relay: Server | undefined
  private relayFile: string | undefined
  private readonly relayRequests = new Set<AbortController>()
  private readonly file: string

  /**
   * @param config - validated operator configuration.
   * @param openBrowser - presents the platform login in the owning application's browser surface.
   */
  constructor(readonly config: AccountConfig, private readonly openBrowser: (url: string) => Promise<void> = url => shell.openExternal(url)) { this.file = join(config.storageDirectory, 'account.enc') }

  /** @returns current verified public account fields, or null before admission. */
  profile(): DesktopUser | null { return this.user ?? null }

  /** @returns issuer-and-subject-specific local home, never a username-derived path. */
  home(): string {
    if (!this.user) throw new Error('Sign in before opening the local runtime')
    return join(this.config.storageDirectory, 'accounts', digest(JSON.stringify([this.user.issuer, this.user.subject])))
  }

  /** @returns true if an OS-encrypted saved credential passes live server verification. */
  async restore(): Promise<boolean> {
    let saved: Buffer
    try { saved = await readFile(this.file) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
    this.assertEncryption()
    const value: unknown = JSON.parse(safeStorage.decryptString(saved))
    if (!record(value) || value.origin !== this.config.gatewayOrigin) throw new Error('Saved account belongs to another identity service')
    this.credential = parseCredential(value)
    try { await this.verify(); return true }
    catch (error) { if (error instanceof AccountSessionExpiredError) return false; throw error }
  }

  private assertEncryption(): void {
    if (!safeStorage.isEncryptionAvailable() || process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') throw new Error(this.messages.accountStorageUnavailable)
  }

  private async save(): Promise<void> {
    this.assertEncryption()
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = this.file + '.' + random() + '.tmp'
    await writeFile(temporary, safeStorage.encryptString(JSON.stringify({ origin: this.config.gatewayOrigin, ...this.credential })), { mode: 0o600, flag: 'wx' })
    await rename(temporary, this.file)
  }

  /**
   * Open the system browser and await one state- and PKCE-bound loopback callback.
   * @param returnUrl - optional fixed loopback page owned by the browser application shell.
   * @returns verified user after the credential is encrypted to disk.
   */
  async login(returnUrl?: string): Promise<DesktopUser> {
    if (this.cancelLogin) throw new Error(this.messages.accountLoginBusy)
    if (returnUrl !== undefined) {
      const destination = new URL(returnUrl)
      if (destination.protocol !== 'http:' || destination.hostname !== '127.0.0.1' || destination.username || destination.password || destination.search || destination.hash) throw new Error('Invalid local login return URL')
    }
    this.assertEncryption()
    const state = random(), verifier = random()
    let callback = '', completing = false
    let resolveLogin!: (value: DesktopUser) => void
    let rejectLogin!: (error: Error) => void
    const result = new Promise<DesktopUser>((resolve, reject) => { resolveLogin = resolve; rejectLogin = reject })
    // Opening the browser may fail before the callback promise is awaited.
    void result.catch(() => {})
    const abort = new AbortController()
    const listener = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', callback)
        if (req.method !== 'GET' || req.headers.host !== new URL(callback).host || url.pathname !== '/auth/callback'
          || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state
          || url.searchParams.getAll('code').length !== 1 || completing) {
          res.writeHead(400, { 'cache-control': 'no-store' }); res.end('Invalid login callback'); return
        }
        completing = true
        const response = await fetch(this.config.gatewayOrigin + '/auth/desktop/redeem', {
          method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error', signal: abort.signal,
          body: JSON.stringify({ code: url.searchParams.get('code'), code_verifier: verifier, redirect_uri: callback }),
        })
        if (!response.ok) throw new Error(this.messages.accountLoginExpired)
        const value: unknown = await response.json()
        if (!record(value)) throw new Error('Invalid account exchange')
        abort.signal.throwIfAborted()
        this.credential = parseCredential(value)
        this.user = parseUser(value.user)
        await this.save()
        if (abort.signal.aborted) { await this.forget(); abort.signal.throwIfAborted() }
        res.writeHead(303, { location: returnUrl ?? this.config.websiteOrigin + '/login/', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); res.end()
        resolveLogin(this.user)
      })().catch((error: unknown) => {
        res.writeHead(400, { 'cache-control': 'no-store' }); res.end('Login failed. Return to the client and retry.')
        rejectLogin(error instanceof Error ? error : new Error('Login failed'))
      })
    })
    const cancel = (): void => { abort.abort(); rejectLogin(new Error(this.messages.accountLoginCancelled)) }
    this.cancelLogin = cancel
    const timer = setTimeout(() => { abort.abort(); rejectLogin(new Error(this.messages.accountLoginTimeout)) }, this.config.loginTimeoutMs)
    try {
      await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
      const address = listener.address()
      if (!address || typeof address === 'string') throw new Error('Local login callback unavailable')
      callback = `http://127.0.0.1:${String(address.port)}/auth/callback`
      const url = new URL('/auth/desktop/authorize', this.config.gatewayOrigin)
      url.searchParams.set('redirect_uri', callback); url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
      await this.openBrowser(url.href)
      return await result
    } finally { clearTimeout(timer); abort.abort(); this.cancelLogin = undefined; await close(listener) }
  }

  /** Stop a pending login without admitting a late browser callback. */
  cancel(): void { this.cancelLogin?.() }

  /**
   * Make a main-process-only request. The renderer cannot choose destinations or read credentials.
   * @param path - fixed account or capability route selected by trusted code.
   * @param init - request options; redirects are always returned to the caller.
   * @returns server response.
   */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.credential) throw new Error(this.messages.accountSignInAgain)
    const headers = new Headers(init.headers)
    headers.set('cookie', `${this.credential.cookieName}=${this.credential.credential}`)
    headers.set('origin', this.config.gatewayOrigin)
    return fetch(this.config.gatewayOrigin + path, { ...init, headers, redirect: 'manual', signal: init.signal ?? AbortSignal.timeout(15000) })
  }

  /** Refresh public identity through the server; revoked credentials are removed locally. */
  async verify(): Promise<void> {
    const response = await this.request('/auth/me')
    if (response.status === 401) { await this.forget(); throw new AccountSessionExpiredError(this.messages.accountSessionExpired) }
    if (!response.ok) throw new Error(this.messages.accountUnavailable)
    const next = parseUser(await response.json())
    if (this.user && (next.subject !== this.user.subject || next.issuer !== this.user.issuer)) throw new Error('Account identity changed')
    this.user = next
  }

  /** Revoke the shared server session before removing the locally encrypted credential. */
  async logout(): Promise<void> {
    const issuer = this.user?.issuer
    const response = await this.request('/auth/logout', { method: 'POST' })
    if (response.status !== 303 && response.status !== 401) throw new Error(this.messages.accountLogoutFailed)
    await this.forget()
    // Per-device logout redirects to the website, which has no meaning here; only the issuer's end-session URL
    // is opened, so the browser clears its SSO session. Any other destination is ignored, never opened.
    const target = response.headers.get('location')
    if (!target || !issuer) return
    const url = new URL(target, this.config.gatewayOrigin), expected = new URL(issuer)
    if (url.origin !== expected.origin || url.pathname !== expected.pathname + '/protocol/openid-connect/logout') return
    // Session revocation is complete even if the OS cannot open its browser to clear provider cookies.
    await this.openBrowser(url.href).catch(() => {})
  }

  private async forget(): Promise<void> { this.credential = undefined; this.user = undefined; await rm(this.file, { force: true }) }

  /**
   * Serve the verified account and capability API with a per-process local key; upstream credentials stay in main.
   * @returns private credentials file understood by the Workbench and capability Host providers.
   */
  async startRelay(): Promise<string> {
    if (this.relay) throw new Error('Capability relay already started')
    const token = random()
    const relay = createServer((req, res) => {
      void (async () => {
        const supplied = req.headers.authorization ?? ''
        if (!timingSafeEqual(Buffer.from(digest(supplied)), Buffer.from(digest('Bearer ' + token)))) { res.writeHead(401); res.end(); return }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname === '/auth/me' && req.method === 'GET' && !url.search) {
          try {
            await this.verify()
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            res.end(JSON.stringify(this.profile()))
          } catch (error) {
            res.writeHead(error instanceof AccountSessionExpiredError ? 401 : 503, { 'cache-control': 'no-store' })
            res.end()
          }
          return
        }
        if (!(url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname.startsWith('/mcp/'))) { res.writeHead(404); res.end(); return }
        const controller = new AbortController(); this.relayRequests.add(controller)
        res.once('close', () =>{  controller.abort() })
        try {
          const headers = new Headers()
          for (const name of ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']) {
            const value = req.headers[name]; if (typeof value === 'string') headers.set(name, value)
          }
          const method = req.method ?? 'GET'
          const init: RequestInit & { duplex?: 'half' } = { method, headers, signal: controller.signal }
          if (!['GET', 'HEAD'].includes(method)) { init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>; init.duplex = 'half' }
          const response = await this.request('/auth/desktop/capabilities' + url.pathname + url.search, init)
          res.statusCode = response.status
          for (const name of ['content-type', 'mcp-session-id']) { const value = response.headers.get(name); if (value) res.setHeader(name, value) }
          if (response.body) await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), res)
          else res.end()
        } finally { this.relayRequests.delete(controller) }
      })().catch(() => { if (res.headersSent) res.destroy(); else { res.writeHead(503); res.end('Account service unavailable') } })
    })
    await new Promise<void>((resolve, reject) => { relay.once('error', reject); relay.listen(0, '127.0.0.1', resolve) })
    this.relay = relay
    const address = relay.address()
    if (!address || typeof address === 'string') throw new Error('Capability relay unavailable')
    const file = join(this.home(), 'credentials', 'desktop-capabilities-' + String(process.pid) + '.json')
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(file, JSON.stringify({ authMode: 'aiko', platformOrigin: this.config.gatewayOrigin, baseUrl: `http://127.0.0.1:${String(address.port)}`, token }), { mode: 0o600 })
    this.relayFile = file
    return file
  }

  /** Abort live capability streams, close listeners and remove the per-process relay key. */
  async dispose(): Promise<void> {
    this.cancel()
    for (const controller of this.relayRequests) controller.abort()
    await close(this.relay); this.relay = undefined
    if (this.relayFile) await rm(this.relayFile, { force: true })
  }
}
