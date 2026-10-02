/** Isolated first-run platform settings, available again from the sign-in page. */
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseProductPlatform, readProductPlatform, saveProductPlatform, ProductPlatformConfigurationError } from './product-platform.ts'
import { resolveAikoAccountLocale } from './aiko-account-locale.ts'
import type { DesktopProduct } from '../scripts/desktop-product.mjs'

/**
 * Present editable server addresses before creating an account or starting the Host.
 * @param product Public identity fixed by the installer.
 * @returns Absolute saved identity configuration path, or rejects when the user closes setup.
 */
export async function openProductPlatform(product: DesktopProduct): Promise<string> {
  const directory = app.getPath('userData')
  let saved
  try { saved = await readProductPlatform(directory) }
  catch (error) {
    if (!(error instanceof SyntaxError || error instanceof ProductPlatformConfigurationError)) throw error
    saved = undefined // Malformed saved endpoints are corrected in this form.
  }
  const locale = resolveAikoAccountLocale(app.getLocale())
  const window = new BrowserWindow({ width: 680, height: 570, title: product.productName, resizable: false,
    webPreferences: { preload: join(app.getAppPath(), 'lib/preload-product-platform.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  window.setMenuBarVisibility(false)
  const file = join(app.getAppPath(), 'renderer/product-platform.html')
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  const assertSender = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(file).href) throw new Error('Unowned platform settings frame')
  }
  let complete = false
  let saving = false
  let resolveResult!: (identity: string) => void
  let rejectResult!: (error: Error) => void
  const result = new Promise<string>((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
  void result.catch(() => undefined)
  ipcMain.handle('product:platform:read', (event) => { assertSender(event); return { ...locale, productName: product.productName, profile: product.profile, platform: saved } })
  ipcMain.handle('product:platform:save', async (event, value: unknown) => {
    assertSender(event)
    if (saving) return { ok: false, message: locale.messages.platformSaving }
    let platform
    try { platform = parseProductPlatform(value) }
    catch { return { ok: false, message: locale.messages.platformInvalid } }
    saving = true
    try {
      const identity = await saveProductPlatform(directory, platform)
      complete = true
      resolveResult(identity)
      return { ok: true }
    } catch { return { ok: false, message: locale.messages.platformSaveFailed } }
    finally { saving = false }
  })
  window.on('close', (event) => { if (saving) event.preventDefault() })
  window.once('closed', () => { if (!complete) rejectResult(new DOMException('Platform setup closed', 'AbortError')) })
  try { await window.loadFile(file); return await result }
  finally {
    ipcMain.removeHandler('product:platform:read')
    ipcMain.removeHandler('product:platform:save')
    if (!window.isDestroyed()) window.destroy()
  }
}
