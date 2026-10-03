import { expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { installDesktopActivation, revealDesktopWindow } from '../src/window-activation.ts'

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: ipc }))

it('activates only the owning application main frame and removes its handler', () => {
  const frame = { url: 'dsh-app://app/' } as Electron.WebFrameMain
  const nativeWindow: Partial<BrowserWindow> = { webContents: { mainFrame: frame } as Electron.WebContents, isDestroyed: () => false }
  const window = nativeWindow as BrowserWindow
  const activate = vi.fn()
  const stop = installDesktopActivation(() => window, activate)
  const handle = ipc.handle.mock.lastCall![1] as (event: IpcMainInvokeEvent) => void
  const owner = ({ sender: window.webContents, senderFrame: frame } as IpcMainInvokeEvent)
  try {
    handle(owner)
    expect(activate).toHaveBeenCalledTimes(1)
    for (const caller of [
      ({ sender: window.webContents, senderFrame: { url: 'https://knowledge.example/' } } as IpcMainInvokeEvent),
      ({ sender: window.webContents, senderFrame: { url: 'dsh-app://app/' } } as IpcMainInvokeEvent),
      ({ sender: {}, senderFrame: frame } as IpcMainInvokeEvent),
      ({ sender: window.webContents, senderFrame: null } as IpcMainInvokeEvent),
    ]) expect(() => { handle(caller) }).toThrow()
    window.isDestroyed = () => true
    expect(() => { handle(owner) }).toThrow()
    expect(activate).toHaveBeenCalledTimes(1)
  } finally { stop() }
  expect(ipc.removeHandler).toHaveBeenLastCalledWith(DESKTOP_IPC.activate)
})

it.each([true, false])('restores a minimized window (%s) and preserves its document', (minimized) => {
  const effects: string[] = []
  const loadURL = vi.fn()
  const nativeWindow: Partial<BrowserWindow> = { isMinimized: () => minimized,
    restore: () => { effects.push('restore') }, show: () => { effects.push('show') }, focus: () => { effects.push('focus') },
    loadURL }
  const window = nativeWindow as BrowserWindow
  revealDesktopWindow(window)
  expect(effects).toEqual(minimized ? ['restore', 'show', 'focus'] : ['show', 'focus'])
  expect(loadURL).not.toHaveBeenCalled()
})
