/**
 * Offscreen pages that agents read and operate through the Host's `client_ui` and `web_ui` tools.
 * The client view is a copy of the application page (same document and preload) that receives only read-only shell
 * IPC; the web view shows ordinary websites in its own storage partition. Neither window is ever shown. User approval
 * and the forbidden-control rules are enforced by the Host before a request reaches this module.
 */

import { BrowserWindow, session, type Session, type WebContents } from 'electron'

/** Keys the views may press. Enter is excluded: it submits forms and sends chat messages. */
export const CLIENT_VIEW_KEYS = ['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'] as const

/** One key accepted by {@link CLIENT_VIEW_KEYS}. */
export type ClientViewKey = typeof CLIENT_VIEW_KEYS[number]

/** Which offscreen page a request addresses. */
export type OffscreenViewKind = 'client' | 'web'

/** A request the Host sends over the private process channel. `url`, `back` and `login` exist only for the web view. */
export type ClientViewRequest =
  | { readonly op: 'open'; readonly width: number; readonly height: number; readonly url?: string }
  | { readonly op: 'look' }
  | { readonly op: 'back' }
  | { readonly op: 'login'; readonly url?: string }
  | { readonly op: 'shot'; readonly ref?: string; readonly scale: 1 | 2 }
  | { readonly op: 'scroll'; readonly ref?: string; readonly dy: number }
  | { readonly op: 'hover' | 'click'; readonly ref: string; readonly text: string }
  | { readonly op: 'type'; readonly ref: string; readonly text: string; readonly value: string }
  | { readonly op: 'press'; readonly key: ClientViewKey }
  | { readonly op: 'close' }

/** One visible interactive element, addressed by `ref` until the next outline. */
export interface ClientViewElement {
  readonly ref: string
  readonly role: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly disabled: boolean
}

/** What the page shows now. */
export interface ClientViewPage {
  readonly title: string
  /** First visible heading, or empty. */
  readonly heading: string
  /** Page origin, e.g. `https://example.com` or `dsh-app://app`. */
  readonly origin: string
  /** Path without query; the hash only when it carries no parameters. */
  readonly path: string
  readonly width: number
  readonly height: number
  /** Visible page text, at most {@link PAGE_TEXT_LIMIT} characters. */
  readonly text: string
  readonly elements: readonly ClientViewElement[]
}

/** Answer to one {@link ClientViewRequest}. */
export type ClientViewResponse =
  | { readonly op: 'close' }
  | { readonly op: 'shot'; readonly page: ClientViewPage; readonly png: string }
  | { readonly op: Exclude<ClientViewRequest['op'], 'close' | 'shot'>; readonly page: ClientViewPage }

const PAGE_TEXT_LIMIT = 4000
const READY_TIMEOUT_MS = 20_000
/** Below the Host channel deadline, so the Host receives this message rather than its own timeout. */
const OPERATION_TIMEOUT_MS = 45_000
const SETTLE_MS = 600
const CLICK_SETTLE_MS = 1200
const PAGE_SETTLE_MS = 1500
const REF_ATTRIBUTE = 'data-client-view-ref'

const KEY_CODES: Record<ClientViewKey, number> = {
  Escape: 27, Tab: 9, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, PageUp: 33, PageDown: 34, Home: 36, End: 35,
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isRef = (value: unknown): value is string => typeof value === 'string' && /^e[1-9]\d{0,4}$/.test(value)
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max

/**
 * @param value - candidate website address.
 * @returns whether it is an absolute http(s) URL without credentials.
 */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
  } catch { return false }
}

/**
 * Validate a request received from the Host process.
 * @param input - untrusted IPC payload.
 * @param kind - view the request addresses; web-only fields are refused for the client view.
 * @returns the request, or throws when any field is invalid.
 */
export function parseClientViewRequest(input: unknown, kind: OffscreenViewKind = 'client'): ClientViewRequest {
  if (!isRecord(input)) throw new Error('client view: invalid request')
  switch (input.op) {
    case 'open': {
      const { width, height, url } = input
      if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 800 || (width as number) > 2560
        || (height as number) < 600 || (height as number) > 1600) throw new Error('client view: invalid size')
      if (kind === 'client' ? url !== undefined : !isWebUrl(url)) throw new Error('client view: invalid address')
      return { op: 'open', width: width as number, height: height as number, ...(kind === 'web' ? { url: url as string } : {}) }
    }
    case 'look': case 'close':
      return { op: input.op }
    case 'back':
      if (kind !== 'web') throw new Error('client view: unknown operation')
      return { op: 'back' }
    case 'login':
      if (kind !== 'web' || (input.url !== undefined && !isWebUrl(input.url))) throw new Error('client view: invalid login')
      return { op: 'login', ...(input.url === undefined ? {} : { url: input.url }) }
    case 'shot':
      if ((input.ref !== undefined && !isRef(input.ref)) || (input.scale !== 1 && input.scale !== 2)) throw new Error('client view: invalid shot')
      return { op: 'shot', ...(input.ref === undefined ? {} : { ref: input.ref }), scale: input.scale }
    case 'scroll':
      if ((input.ref !== undefined && !isRef(input.ref)) || !Number.isInteger(input.dy) || Math.abs(input.dy as number) > 10_000) {
        throw new Error('client view: invalid scroll')
      }
      return { op: 'scroll', ...(input.ref === undefined ? {} : { ref: input.ref }), dy: input.dy as number }
    case 'hover': case 'click':
      if (!isRef(input.ref) || !isText(input.text, 200)) throw new Error('client view: invalid element')
      return { op: input.op, ref: input.ref, text: input.text }
    case 'type':
      if (!isRef(input.ref) || !isText(input.text, 200) || !isText(input.value, 2000)) throw new Error('client view: invalid typing')
      return { op: 'type', ref: input.ref, text: input.text, value: input.value }
    case 'press':
      if (!CLIENT_VIEW_KEYS.includes(input.key as ClientViewKey)) throw new Error('client view: key not allowed')
      return { op: 'press', key: input.key as ClientViewKey }
    default:
      throw new Error('client view: unknown operation')
  }
}

/** Page script: number the visible interactive elements and read the visible text. */
const OUTLINE_SCRIPT = `(() => {
  const attribute = ${JSON.stringify(REF_ATTRIBUTE)}
  for (const old of document.querySelectorAll('[' + attribute + ']')) old.removeAttribute(attribute)
  const selector = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[contenteditable=""],[contenteditable=true],'
    + '[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=treeitem],[role=checkbox],[role=radio],[role=switch],[role=combobox],[tabindex]:not([tabindex="-1"])'
  const elements = []
  for (const element of document.querySelectorAll(selector)) {
    const box = element.getBoundingClientRect()
    if (box.width < 2 || box.height < 2 || box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
    const text = (element.getAttribute('aria-label') || element.innerText || (element.type === 'password' ? '' : element.value) || element.getAttribute('title') || element.getAttribute('placeholder') || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 80)
    if (!text) continue
    const ref = 'e' + (elements.length + 1)
    element.setAttribute(attribute, ref)
    const role = element.getAttribute('role') || (element.tagName.toLowerCase() + (element.tagName === 'INPUT' ? ':' + element.type : ''))
    elements.push({ ref, role, text,
      x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height),
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true' })
    if (elements.length >= 300) break
  }
  const heading = [...document.querySelectorAll('h1,h2,[role=heading]')]
    .find(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.top < innerHeight })
  const hash = /[=&]/.test(location.hash) ? '' : location.hash
  return { title: document.title, heading: heading ? heading.innerText.replace(/\\s+/g, ' ').trim().slice(0, 80) : '',
    origin: location.origin, path: location.pathname + hash, width: innerWidth, height: innerHeight,
    text: (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, ${String(PAGE_TEXT_LIMIT)}), elements }
})()`

/** Page script: locate one numbered element, scroll it into view, and report its current text and centre. */
const locateScript = (ref: string): string => `(() => {
  const element = document.querySelector('[${REF_ATTRIBUTE}="${ref}"]')
  if (!element) return null
  element.scrollIntoView({ block: 'center', inline: 'center' })
  const box = element.getBoundingClientRect()
  const text = (element.getAttribute('aria-label') || element.innerText || (element.type === 'password' ? '' : element.value) || element.getAttribute('title') || element.getAttribute('placeholder') || '')
    .replace(/\\s+/g, ' ').trim().slice(0, 80)
  return { text, x: box.x + box.width / 2, y: box.y + box.height / 2, box: { x: box.x, y: box.y, width: box.width, height: box.height } }
})()`

interface Located {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly box: { x: number; y: number; width: number; height: number }
}

/** One offscreen page: serialized requests, outline, screenshots and input. Subclasses own window creation and loading. */
abstract class OffscreenView {
  protected window: BrowserWindow | undefined
  private queue: Promise<unknown> = Promise.resolve()

  /** @param kind - view addressed by requests; also names it in error messages. */
  constructor(protected readonly kind: OffscreenViewKind) {}

  /**
   * @param contents - IPC sender or request owner.
   * @returns whether `contents` belongs to this view.
   */
  owns(contents: WebContents | undefined): boolean {
    const window = this.window
    return contents !== undefined && window !== undefined && !window.isDestroyed() && contents === window.webContents
  }

  /**
   * Run one Host request after the previous one finished.
   * @param input - untrusted request from the Host process.
   * @returns the operation result; rejects with a message the Host shows to the agent.
   */
  handle(input: unknown): Promise<ClientViewResponse> {
    const start = (): Promise<ClientViewResponse> => this.bounded(parseClientViewRequest(input, this.kind))
    const run = this.queue.then(start, start)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Destroy the window; the next `open` loads a fresh page. */
  close(): void {
    const window = this.window
    this.window = undefined
    if (window !== undefined && !window.isDestroyed()) window.destroy()
  }

  /** Create the hidden window; the caller loads it. */
  protected abstract create(width: number, height: number): BrowserWindow

  /**
   * Load the page an `open` asks for into a created window.
   * @param window - the view window.
   * @param url - requested website, web view only.
   */
  protected abstract load(window: BrowserWindow, url: string | undefined): Promise<void>

  /**
   * Web-view-only operations.
   * @param request - `back` or `login`.
   * @returns the page after the operation.
   */
  protected extra(request: Extract<ClientViewRequest, { op: 'back' | 'login' }>): Promise<ClientViewResponse> {
    throw new Error(`${this.kind} view: ${request.op} is not supported`)
  }

  /** One operation within {@link OPERATION_TIMEOUT_MS}; a stuck page is destroyed so later requests are not queued behind it. */
  private async bounded(request: ClientViewRequest): Promise<ClientViewResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        this.close()
        reject(new Error(`${this.kind} view: ${request.op} did not finish in time; the view was closed`))
      }, OPERATION_TIMEOUT_MS)
    })
    try { return await Promise.race([this.run(request), timeout]) }
    finally { clearTimeout(timer) }
  }

  private async run(request: ClientViewRequest): Promise<ClientViewResponse> {
    if (request.op === 'close') { this.close(); return { op: 'close' } }
    if (request.op === 'open') {
      let window = this.window
      if (window === undefined || window.isDestroyed()) {
        window = this.create(request.width, request.height)
        this.window = window
        window.on('closed', () => { if (this.window === window) this.window = undefined })
        try {
          await this.load(window, request.url)
          // The DevTools session attaches after the first load: Page.enable on a never-navigated offscreen page does not answer.
          const contents = window.webContents
          contents.debugger.attach('1.3')
          contents.debugger.on('message', (_event, method) => {
            // Page dialogs would block the renderer; the view dismisses them.
            if (method === 'Page.javascriptDialogOpening') void contents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false }).catch(() => undefined)
          })
          await contents.debugger.sendCommand('Page.enable')
        } catch (error) {
          this.close()
          throw error
        }
      } else {
        const { width, height } = this.size()
        if (width !== request.width || height !== request.height) window.setContentSize(request.width, request.height)
        if (request.url !== undefined) await this.load(window, request.url)
        else await delay(SETTLE_MS)
      }
      return { op: 'open', page: await this.outline() }
    }
    const contents = this.contents()
    switch (request.op) {
      case 'look':
        return { op: 'look', page: await this.outline() }
      case 'back': case 'login':
        return await this.extra(request)
      case 'shot': {
        const target = request.ref === undefined ? undefined : await this.locate(request.ref)
        const png = await this.capture(request.scale, target?.box)
        return { op: 'shot', page: await this.outline(), png }
      }
      case 'scroll': {
        const { width, height } = this.size()
        const point = request.ref === undefined ? { x: width / 2, y: height / 2 } : await this.locate(request.ref)
        await this.input('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: request.dy })
        await delay(SETTLE_MS)
        return { op: 'scroll', page: await this.outline() }
      }
      case 'hover': case 'click': {
        const target = await this.locate(request.ref, request.text)
        await this.input('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y })
        if (request.op === 'click') {
          for (const type of ['mousePressed', 'mouseReleased']) {
            await this.input('Input.dispatchMouseEvent', { type, x: target.x, y: target.y, button: 'left', clickCount: 1 })
          }
        }
        // A click often opens a page whose content renders in a second pass.
        await delay(request.op === 'click' ? CLICK_SETTLE_MS : SETTLE_MS)
        return { op: request.op, page: await this.outline() }
      }
      case 'type': {
        await this.locate(request.ref, request.text)
        const focused = await contents.executeJavaScript(`(() => {
          const element = document.querySelector('[${REF_ATTRIBUTE}="${request.ref}"]')
          if (!element) return false
          element.focus()
          if (typeof element.select === 'function') element.select()
          return document.activeElement === element || element.contains(document.activeElement)
        })()`) as boolean
        if (!focused) throw new Error(`${this.kind} view: the element does not accept typing`)
        await this.input('Input.insertText', { text: request.value })
        await delay(SETTLE_MS)
        return { op: 'type', page: await this.outline() }
      }
      case 'press': {
        const key = { key: request.key, code: request.key, windowsVirtualKeyCode: KEY_CODES[request.key] }
        await this.input('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
        await this.input('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
        await delay(SETTLE_MS)
        return { op: 'press', page: await this.outline() }
      }
      default: {
        const unknown: never = request
        throw new Error(`${this.kind} view: unknown operation ${String(unknown)}`)
      }
    }
  }

  protected contents(): WebContents {
    const window = this.window
    if (window === undefined || window.isDestroyed()) throw new Error(`${this.kind} view: not open`)
    return window.webContents
  }

  private size(): { width: number; height: number } {
    const window = this.window
    if (window === undefined || window.isDestroyed()) throw new Error(`${this.kind} view: not open`)
    const [width = 0, height = 0] = window.getContentSize()
    return { width, height }
  }

  protected async outline(): Promise<ClientViewPage> {
    return await this.contents().executeJavaScript(OUTLINE_SCRIPT) as ClientViewPage
  }

  /**
   * @param ref - element number from the latest outline.
   * @param expected - text approved by the user; a different current text refuses the action.
   */
  private async locate(ref: string, expected?: string): Promise<Located> {
    const located = await this.contents().executeJavaScript(locateScript(ref)) as Located | null
    if (located === null) throw new Error(`${this.kind} view: element ${ref} is gone; look again`)
    if (expected !== undefined && located.text !== expected) throw new Error(`${this.kind} view: element ${ref} now reads "${located.text}"; look again`)
    await delay(150)
    return located
  }

  private async input(method: string, parameters: Record<string, unknown>): Promise<void> {
    await this.contents().debugger.sendCommand(method, parameters)
  }

  private async capture(scale: 1 | 2, box?: Located['box']): Promise<string> {
    const contents = this.contents()
    const { width, height } = this.size()
    if (scale === 2) await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
    try {
      if (scale === 2) await delay(SETTLE_MS)
      const clip = box === undefined ? undefined : {
        x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, width), height: Math.min(box.height, height), scale: 1,
      }
      const shot = await contents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', ...(clip === undefined ? {} : { clip }) }) as { data: string }
      return shot.data
    } finally {
      if (scale === 2) await contents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
    }
  }
}

/** Options shared with the primary window so the copy boots the same application. */
export interface ClientViewOptions {
  /** Application document URL; navigation away from it is refused. */
  readonly url: string
  /** The primary window's preload script. */
  readonly preload: string
  /** The primary window's renderer arguments. */
  readonly additionalArguments: readonly string[]
}

/** Offscreen copy of the application page. */
export class DesktopClientView extends OffscreenView {
  private downloadsBlocked = false

  /** @param options - document, preload and renderer arguments of the primary window. */
  constructor(private readonly options: ClientViewOptions) { super('client') }

  /** WebContents id of the open view, used to admit its WebSocket to the Host. */
  get webContentsId(): number | undefined { return this.window?.isDestroyed() === false ? this.window.webContents.id : undefined }

  protected create(width: number, height: number): BrowserWindow {
    if (!this.downloadsBlocked) {
      this.downloadsBlocked = true
      session.defaultSession.on('will-download', (event, _item, contents) => { if (this.owns(contents)) event.preventDefault() })
    }
    const window = new BrowserWindow({
      show: false, width, height, useContentSize: true,
      webPreferences: {
        preload: this.options.preload, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
        webviewTag: false, offscreen: true, additionalArguments: [...this.options.additionalArguments], devTools: true,
      },
    })
    const contents = window.webContents
    contents.setFrameRate(10)
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => { if (!url.startsWith(this.options.url)) event.preventDefault() })
    contents.on('will-redirect', (event, url) => { if (!url.startsWith(this.options.url)) event.preventDefault() })
    return window
  }

  protected async load(window: BrowserWindow): Promise<void> {
    await window.loadURL(this.options.url)
    const deadline = Date.now() + READY_TIMEOUT_MS
    while ((await window.webContents.executeJavaScript('document.querySelectorAll(\'button,[role=button],[role=treeitem]\').length') as number) < 3) {
      if (Date.now() > deadline) throw new Error('client view: the application page did not finish loading')
      await delay(300)
    }
    await delay(SETTLE_MS)
  }
}

/** Options of the website view. */
export interface WebViewOptions {
  /** Storage partition shared by the hidden view and its login window, e.g. `persist:web-ui-<account>`. */
  readonly partition: string
  /** Title of the visible login window. */
  readonly loginTitle: (origin: string) => string
}

/** Offscreen website page with its own storage, plus a visible window where the user signs in. */
export class DesktopWebView extends OffscreenView {
  private loginWindow: BrowserWindow | undefined
  private prepared: Session | undefined
  /** Address of the latest `open`; after sign-in the hidden page returns here instead of replaying a stale sign-in URL. */
  private target: string | undefined

  /** @param options - partition and login window title. */
  constructor(private readonly options: WebViewOptions) { super('web') }

  /** Destroy the hidden page and any open login window. */
  override close(): void {
    super.close()
    const login = this.loginWindow
    this.loginWindow = undefined
    if (login !== undefined && !login.isDestroyed()) login.destroy()
  }

  /** The partition refuses downloads and every permission request (camera, location, notifications…). */
  private storage(): Session {
    if (this.prepared !== undefined) return this.prepared
    const storage = session.fromPartition(this.options.partition)
    storage.on('will-download', (event) => { event.preventDefault() })
    storage.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
    storage.setPermissionCheckHandler(() => false)
    this.prepared = storage
    return storage
  }

  private guard(contents: WebContents): void {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => { if (!isWebUrl(url)) event.preventDefault() })
    contents.on('will-redirect', (event, url) => { if (!isWebUrl(url)) event.preventDefault() })
  }

  protected create(width: number, height: number): BrowserWindow {
    const window = new BrowserWindow({
      show: false, width, height, useContentSize: true,
      webPreferences: {
        session: this.storage(), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, offscreen: true,
      },
    })
    window.webContents.setFrameRate(10)
    this.guard(window.webContents)
    return window
  }

  protected async load(window: BrowserWindow, url: string | undefined): Promise<void> {
    if (url === undefined) throw new Error('web view: open needs a url')
    this.target = url
    try { await window.loadURL(url) }
    catch (error) {
      // An aborted load means the page redirected itself; a failed one is reported with the network error.
      if (!(error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED')) throw new Error(`web view: could not open ${new URL(url).origin}: ${error instanceof Error ? error.message : String(error)}`)
    }
    await delay(PAGE_SETTLE_MS)
  }

  protected override async extra(request: Extract<ClientViewRequest, { op: 'back' | 'login' }>): Promise<ClientViewResponse> {
    const contents = this.contents()
    if (request.op === 'back') {
      if (!contents.navigationHistory.canGoBack()) throw new Error('web view: there is no previous page')
      contents.navigationHistory.goBack()
      await delay(PAGE_SETTLE_MS)
      return { op: 'back', page: await this.outline() }
    }
    const target = request.url ?? contents.getURL()
    if (!isWebUrl(target)) throw new Error('web view: open a website before signing in')
    this.loginWindow?.destroy()
    const login = new BrowserWindow({
      show: false, width: 1000, height: 760, title: this.options.loginTitle(new URL(target).origin), autoHideMenuBar: true,
      webPreferences: { session: this.storage(), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
    })
    this.loginWindow = login
    this.guard(login.webContents)
    login.on('page-title-updated', (event) => { event.preventDefault() })
    login.once('ready-to-show', () => { login.show(); login.focus() })
    login.on('closed', () => {
      if (this.loginWindow === login) this.loginWindow = undefined
      // The hidden page picks up the new sign-in at the address the agent asked for.
      const view = this.window
      if (view !== undefined && !view.isDestroyed()) {
        if (this.target === undefined) view.webContents.reload()
        else void view.loadURL(this.target).catch(() => undefined)
      }
    })
    void login.loadURL(target).catch(() => undefined)
    return { op: 'login', page: await this.outline() }
  }
}

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, milliseconds) })
