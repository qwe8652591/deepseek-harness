/**
 * Offscreen copy of the application page that agents read and operate through the Host's `client_ui` tool.
 * The window is never shown, stays on the application origin, and receives only read-only shell IPC; user
 * approval and the forbidden-control rules are enforced by the Host before a request reaches this module.
 */

import { BrowserWindow, session, type WebContents } from 'electron'

/** Keys the view may press. Enter is excluded: it submits forms and sends chat messages. */
export const CLIENT_VIEW_KEYS = ['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'] as const

/** One key accepted by {@link CLIENT_VIEW_KEYS}. */
export type ClientViewKey = typeof CLIENT_VIEW_KEYS[number]

/** A request the Host sends over the private process channel. */
export type ClientViewRequest =
  | { readonly op: 'open'; readonly width: number; readonly height: number }
  | { readonly op: 'look' }
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
const REF_ATTRIBUTE = 'data-client-view-ref'

const KEY_CODES: Record<ClientViewKey, number> = {
  Escape: 27, Tab: 9, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, PageUp: 33, PageDown: 34, Home: 36, End: 35,
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isRef = (value: unknown): value is string => typeof value === 'string' && /^e[1-9]\d{0,4}$/.test(value)
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max

/**
 * Validate a request received from the Host process.
 * @param input - untrusted IPC payload.
 * @returns the request, or throws when any field is invalid.
 */
export function parseClientViewRequest(input: unknown): ClientViewRequest {
  if (!isRecord(input)) throw new Error('client view: invalid request')
  switch (input.op) {
    case 'open': {
      const { width, height } = input
      if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 800 || (width as number) > 2560
        || (height as number) < 600 || (height as number) > 1600) throw new Error('client view: invalid size')
      return { op: 'open', width: width as number, height: height as number }
    }
    case 'look': case 'close':
      return { op: input.op }
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
    const text = (element.getAttribute('aria-label') || element.innerText || element.value || element.getAttribute('title') || element.getAttribute('placeholder') || '')
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
  return { title: document.title, heading: heading ? heading.innerText.replace(/\\s+/g, ' ').trim().slice(0, 80) : '',
    path: location.pathname + location.hash, width: innerWidth, height: innerHeight,
    text:(document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, ${String(PAGE_TEXT_LIMIT)}), elements }
})()`

/** Page script: locate one numbered element, scroll it into view, and report its current text and centre. */
const locateScript = (ref: string): string => `(() => {
  const element = document.querySelector('[${REF_ATTRIBUTE}="${ref}"]')
  if (!element) return null
  element.scrollIntoView({ block: 'center', inline: 'center' })
  const box = element.getBoundingClientRect()
  const text = (element.getAttribute('aria-label') || element.innerText || element.value || element.getAttribute('title') || element.getAttribute('placeholder') || '')
    .replace(/\\s+/g, ' ').trim().slice(0, 80)
  return { text, x: box.x + box.width / 2, y: box.y + box.height / 2, box: { x: box.x, y: box.y, width: box.width, height: box.height } }
})()`

interface Located {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly box: { x: number; y: number; width: number; height: number }
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

/** Owns at most one offscreen application window and serializes the requests sent to it. */
export class DesktopClientView {
  #window: BrowserWindow | undefined
  #queue: Promise<unknown> = Promise.resolve()
  #downloadsBlocked = false

  /** @param options - document, preload and renderer arguments of the primary window. */
  constructor(private readonly options: ClientViewOptions) {}

  /**
   * @param contents - IPC sender or request owner.
   * @returns whether `contents` belongs to the offscreen view.
   */
  owns(contents: WebContents | undefined): boolean {
    const window = this.#window
    return contents !== undefined && window !== undefined && !window.isDestroyed() && contents === window.webContents
  }

  /** WebContents id of the open view, used to admit its WebSocket to the Host. */
  get webContentsId(): number | undefined { return this.#window?.isDestroyed() === false ? this.#window.webContents.id : undefined }

  /**
   * Run one Host request after the previous one finished.
   * @param input - untrusted request from the Host process.
   * @returns the operation result; rejects with a message the Host shows to the agent.
   */
  handle(input: unknown): Promise<ClientViewResponse> {
    const start = (): Promise<ClientViewResponse> => this.#bounded(parseClientViewRequest(input))
    const run = this.#queue.then(start, start)
    this.#queue = run.catch(() => undefined)
    return run
  }

  /** One operation within {@link OPERATION_TIMEOUT_MS}; a stuck page is destroyed so later requests are not queued behind it. */
  async #bounded(request: ClientViewRequest): Promise<ClientViewResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        this.close()
        reject(new Error(`client view: ${request.op} did not finish in time; the view was closed`))
      }, OPERATION_TIMEOUT_MS)
    })
    try { return await Promise.race([this.#run(request), timeout]) }
    finally { clearTimeout(timer) }
  }

  /** Destroy the window; the next `open` loads a fresh copy. */
  close(): void {
    const window = this.#window
    this.#window = undefined
    if (window !== undefined && !window.isDestroyed()) window.destroy()
  }

  async #run(request: ClientViewRequest): Promise<ClientViewResponse> {
    if (request.op === 'close') { this.close(); return { op: 'close' } }
    if (request.op === 'open') {
      const window = this.#window
      if (window === undefined || window.isDestroyed()) await this.#open(request.width, request.height)
      else if (this.#size().width !== request.width || this.#size().height !== request.height) {
        window.setContentSize(request.width, request.height)
        await delay(SETTLE_MS)
      }
      return { op: 'open', page: await this.#outline() }
    }
    const contents = this.#contents()
    switch (request.op) {
      case 'look':
        return { op: 'look', page: await this.#outline() }
      case 'shot': {
        const target = request.ref === undefined ? undefined : await this.#locate(request.ref)
        const png = await this.#capture(request.scale, target?.box)
        return { op: 'shot', page: await this.#outline(), png }
      }
      case 'scroll': {
        const { width, height } = this.#size()
        const point = request.ref === undefined ? { x: width / 2, y: height / 2 } : await this.#locate(request.ref)
        await this.#input('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: request.dy })
        await delay(SETTLE_MS)
        return { op: 'scroll', page: await this.#outline() }
      }
      case 'hover': case 'click': {
        const target = await this.#locate(request.ref, request.text)
        await this.#input('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y })
        if (request.op === 'click') {
          for (const type of ['mousePressed', 'mouseReleased']) {
            await this.#input('Input.dispatchMouseEvent', { type, x: target.x, y: target.y, button: 'left', clickCount: 1 })
          }
        }
        // A click often opens a page whose content renders in a second pass.
        await delay(request.op === 'click' ? CLICK_SETTLE_MS : SETTLE_MS)
        return { op: request.op, page: await this.#outline() }
      }
      case 'type': {
        await this.#locate(request.ref, request.text)
        const focused = await contents.executeJavaScript(`(() => {
          const element = document.querySelector('[${REF_ATTRIBUTE}="${request.ref}"]')
          if (!element) return false
          element.focus()
          if (typeof element.select === 'function') element.select()
          return document.activeElement === element || element.contains(document.activeElement)
        })()`) as boolean
        if (!focused) throw new Error('client view: the element does not accept typing')
        await this.#input('Input.insertText', { text: request.value })
        await delay(SETTLE_MS)
        return { op: 'type', page: await this.#outline() }
      }
      case 'press': {
        const key = { key: request.key, code: request.key, windowsVirtualKeyCode: KEY_CODES[request.key] }
        await this.#input('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
        await this.#input('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
        await delay(SETTLE_MS)
        return { op: 'press', page: await this.#outline() }
      }
      default: {
        const unknown: never = request
        throw new Error(`client view: unknown operation ${String(unknown)}`)
      }
    }
  }

  async #open(width: number, height: number): Promise<void> {
    if (!this.#downloadsBlocked) {
      this.#downloadsBlocked = true
      session.defaultSession.on('will-download', (event, _item, contents) => { if (this.owns(contents)) event.preventDefault() })
    }
    const window = new BrowserWindow({
      show: false, width, height, useContentSize: true,
      webPreferences: {
        preload: this.options.preload, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
        webviewTag: false, offscreen: true, additionalArguments: [...this.options.additionalArguments], devTools: true,
      },
    })
    this.#window = window
    const contents = window.webContents
    contents.setFrameRate(10)
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => { if (!url.startsWith(this.options.url)) event.preventDefault() })
    contents.on('will-redirect', (event, url) => { if (!url.startsWith(this.options.url)) event.preventDefault() })
    window.on('closed', () => { if (this.#window === window) this.#window = undefined })
    try {
      await window.loadURL(this.options.url)
      // The DevTools session attaches after the first load: Page.enable on a never-navigated offscreen page does not answer.
      contents.debugger.attach('1.3')
      contents.debugger.on('message', (_event, method) => {
        // Page dialogs would block the renderer; the view dismisses them.
        if (method === 'Page.javascriptDialogOpening') void contents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false }).catch(() => undefined)
      })
      await contents.debugger.sendCommand('Page.enable')
      const deadline = Date.now() + READY_TIMEOUT_MS
      while ((await contents.executeJavaScript('document.querySelectorAll(\'button,[role=button],[role=treeitem]\').length') as number) < 3) {
        if (Date.now() > deadline) throw new Error('client view: the application page did not finish loading')
        await delay(300)
      }
      await delay(SETTLE_MS)
    } catch (error) {
      this.close()
      throw error
    }
  }

  #contents(): WebContents {
    const window = this.#window
    if (window === undefined || window.isDestroyed()) throw new Error('client view: not open')
    return window.webContents
  }

  #size(): { width: number; height: number } {
    const window = this.#window
    if (window === undefined || window.isDestroyed()) throw new Error('client view: not open')
    const [width = 0, height = 0] = window.getContentSize()
    return { width, height }
  }

  async #outline(): Promise<ClientViewPage> {
    return await this.#contents().executeJavaScript(OUTLINE_SCRIPT) as ClientViewPage
  }

  /**
   * @param ref - element number from the latest outline.
   * @param expected - text approved by the user; a different current text refuses the action.
   */
  async #locate(ref: string, expected?: string): Promise<Located> {
    const located = await this.#contents().executeJavaScript(locateScript(ref)) as Located | null
    if (located === null) throw new Error(`client view: element ${ref} is gone; look again`)
    if (expected !== undefined && located.text !== expected) throw new Error(`client view: element ${ref} now reads "${located.text}"; look again`)
    await delay(150)
    return located
  }

  async #input(method: string, parameters: Record<string, unknown>): Promise<void> {
    await this.#contents().debugger.sendCommand(method, parameters)
  }

  async #capture(scale: 1 | 2, box?: Located['box']): Promise<string> {
    const contents = this.#contents()
    const { width, height } = this.#size()
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

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, milliseconds) })
