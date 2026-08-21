/** Electron supervisor for the independent local Harness runtime. */
import { fork, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, shell } from 'electron'
import type { RuntimeMessage } from './protocol.ts'

let quitting = false
let runtimeProcess: ChildProcess | undefined
let runtimeLogs: readonly [WriteStream, WriteStream] | undefined
let mainWindow: BrowserWindow | undefined

/** Render nested failures so a packaged desktop boot remains diagnosable. */
function errorText(error: unknown, indent = ''): string {
  if (!(error instanceof Error)) return `${indent}${String(error)}`
  const line = `${indent}${error.name}: ${error.message}`
  if (error instanceof AggregateError) {
    return [line, ...error.errors.map(child => errorText(child, `${indent}  `))].join('\n')
  }
  return error.cause === undefined ? line : `${line}\n${errorText(error.cause, `${indent}  `)}`
}

/** Return whether an IPC payload is the runtime's ready notification. */
function isReadyMessage(value: unknown): value is Extract<RuntimeMessage, { type: 'ready' }> {
  if (value === null || typeof value !== 'object') return false
  return 'type' in value && value.type === 'ready' && 'url' in value && typeof value.url === 'string'
}

/** Start the local runtime as a supervised Node child and await its bound URL. */
async function startRuntime(): Promise<string> {
  const logDirectory = app.getPath('logs')
  mkdirSync(logDirectory, { recursive: true })
  const stdout = createWriteStream(join(logDirectory, 'runtime.stdout.log'), { flags: 'a' })
  const stderr = createWriteStream(join(logDirectory, 'runtime.stderr.log'), { flags: 'a' })
  runtimeLogs = [stdout, stderr]

  const runtimePath = fileURLToPath(new URL('./runtime.js', import.meta.url))
  const child = fork(runtimePath, [], {
    execPath: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  runtimeProcess = child
  child.stdout?.pipe(stdout)
  child.stderr?.pipe(stderr)

  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('dsh-desktop: local runtime did not become ready within 30 seconds'))
    }, 30_000)
    const cleanup = (): void => {
      clearTimeout(timeout)
      child.off('message', onMessage)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    const onMessage = (message: unknown): void => {
      if (!isReadyMessage(message)) return
      cleanup()
      resolve(message.url)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onExit = (code: number | null): void => {
      cleanup()
      reject(new Error(`dsh-desktop: local runtime exited before readiness (${String(code)})`))
    }
    child.on('message', onMessage)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

/** Stop the child through its lifecycle protocol, then enforce a finite teardown. */
async function stopRuntime(): Promise<void> {
  const child = runtimeProcess
  runtimeProcess = undefined
  if (child !== undefined && child.exitCode === null) {
    child.send({ type: 'shutdown' } satisfies RuntimeMessage)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill()
        resolve()
      }, 5_000)
      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }
  for (const stream of runtimeLogs ?? []) stream.end()
  runtimeLogs = undefined
}

/** Create one hardened window over the supervised loopback host. */
async function createWindow(): Promise<void> {
  const url = await startRuntime()
  const allowedOrigin = new URL(url).origin
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f7f8fa',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    const protocol = new URL(target).protocol
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(target)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== allowedOrigin) event.preventDefault()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  mainWindow = window
  await window.loadURL(url)
}

const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.on('window-all-closed', () => { app.quit() })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void stopRuntime().finally(() => { app.quit() })
  })
  void app.whenReady().then(createWindow).catch((error: unknown) => {
    process.stderr.write(`dsh-desktop: ${errorText(error)}\n`)
    void stopRuntime().finally(() => { app.exit(1) })
  })
}
