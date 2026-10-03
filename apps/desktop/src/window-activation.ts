/** Primary-document activation after an external authorization completes. */
import { ipcMain, type BrowserWindow } from 'electron'
import { assertDesktopSender, DESKTOP_IPC } from './ipc.ts'

/**
 * Reveal the existing document and request native focus without loading a new page.
 * @param window Live window selected by the shell's activation policy.
 */
export function revealDesktopWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/**
 * Accept activation only from the current primary window's Desktop main frame.
 * @param primary Current window belonging to this application instance.
 * @param activate Shell activation policy, including admission and mandatory-update handling.
 * @returns Disposer removing the IPC handler before shell shutdown.
 */
export function installDesktopActivation(primary: () => BrowserWindow | undefined, activate: () => void): () => void {
  ipcMain.handle(DESKTOP_IPC.activate, (event) => {
    assertDesktopSender(event, ['app'])
    const window = primary()
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('dsh desktop: rejected activation from a non-primary frame')
    }
    activate()
  })
  return () => { ipcMain.removeHandler(DESKTOP_IPC.activate) }
}
