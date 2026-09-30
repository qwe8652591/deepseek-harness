/** Platform login admission before the official Desktop Host starts. */
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DesktopAccount, readAccountConfig } from './aiko-account.ts'
import { readAikoWelcome, type AikoDeployment } from './aiko-deployment.ts'

/**
 * Restore or obtain a verified platform session, with passive assets from one theme plugin.
 * @param deployment - startup-selected identity and theme installation.
 * @returns a verified native account owned by the caller until shutdown.
 */
export async function signInAikoDesktop(deployment: AikoDeployment): Promise<DesktopAccount> {
  const account = new DesktopAccount(await readAccountConfig(deployment.identityConfig))
  const welcome = await readAikoWelcome(deployment, app.getLocale())
  const directory = join(app.getPath('userData'), 'aiko-welcome', deployment.brand)
  await mkdir(directory, { recursive: true })
  const html = await readFile(join(welcome.directory, 'login.html'), 'utf8')
  await writeFile(join(directory, 'login.html'), html.replaceAll('"/login.css"', '"./login.css"').replaceAll('"/login.js"', '"./login.js"'))
  await copyFile(join(welcome.directory, 'login.css'), join(directory, 'login.css'))
  await copyFile(join(app.getAppPath(), 'renderer', 'aiko-login.js'), join(directory, 'login.js'))
  let window: BrowserWindow | undefined
  let admitted = false
  let resolveAdmission!: () => void
  let rejectAdmission!: (error: Error) => void
  const admission = new Promise<void>((resolve, reject) => { resolveAdmission = resolve; rejectAdmission = reject })
  // Restoration can fail before the admission waiter is entered; its rejection still reaches the explicit await below.
  void admission.catch(() => undefined)
  const assertWelcome = (event: IpcMainInvokeEvent): void => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || new URL(event.senderFrame.url).pathname !== new URL(pathToFileURL(join(directory, 'login.html')).href).pathname)
      throw new Error('Account IPC rejected an unowned welcome frame')
  }
  ipcMain.handle('aiko:account:locale', (event) => { assertWelcome(event); return welcome.locale })
  ipcMain.handle('aiko:account:login', async (event) => {
    assertWelcome(event)
    const user = await account.login()
    admitted = true
    resolveAdmission()
    return user
  })
  ipcMain.handle('aiko:account:cancel', (event) => { assertWelcome(event); account.cancel() })
  try {
    let restoreError = ''
    try { admitted = await account.restore() }
    catch { restoreError = welcome.locale.messages.accountRestoreError }
    if (!admitted) {
      window = new BrowserWindow({ width: 1120, height: 780, title: welcome.locale.messages.accountProduct,
        webPreferences: { preload: join(app.getAppPath(), 'lib', 'preload-aiko-account.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
      window.setMenuBarVisibility(false)
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', (event) => { event.preventDefault() })
      window.once('closed', () => { if (!admitted) { account.cancel(); rejectAdmission(new DOMException('Login window closed', 'AbortError')) } })
      await window.loadFile(join(directory, 'login.html'), { query: { message: restoreError } })
      await admission
      window.destroy()
    }
    app.setName(welcome.locale.messages.accountBrand)
    return account
  } catch (error) { await account.dispose(); throw error }
  finally { for (const method of ['locale', 'login', 'cancel']) ipcMain.removeHandler('aiko:account:' + method) }
}

/**
 * Install the workbench's narrow account bridge after its application window exists.
 * @param account - main-process account that owns the credential.
 * @param assertSender - rejects calls outside the product window's main frame.
 * @param restart - stops the Host and restarts admission after logout.
 */
export function installAikoAccountBridge(
  account: DesktopAccount, assertSender: (event: IpcMainInvokeEvent) => void, restart: () => Promise<void>,
): void {
  ipcMain.handle('aiko:account:get', (event) => { assertSender(event); return account.profile() })
  ipcMain.handle('aiko:account:logout', async (event) => {
    assertSender(event)
    await account.logout()
    await restart()
  })
  ipcMain.handle('aiko:account:open', async (event, destination: unknown) => {
    assertSender(event)
    if (destination !== 'website' && destination !== 'capabilities' && destination !== 'account') throw new Error('Invalid platform destination')
    const paths = { website: account.config.websiteOrigin, capabilities: account.config.gatewayOrigin + '/capabilities/', account: account.config.gatewayOrigin + '/auth/account' }
    await shell.openExternal(paths[destination])
  })
}
