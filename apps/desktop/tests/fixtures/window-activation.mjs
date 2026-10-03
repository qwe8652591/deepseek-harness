/** Exercise the shipped preload and activation handler with native windows. */
import assert from 'node:assert/strict'
import { app, BrowserWindow, protocol } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { installDesktopActivation, revealDesktopWindow } from '../../src/window-activation.ts'

const root = process.env.DSH_ACTIVATION_TEST_ROOT
const preload = process.env.DSH_ACTIVATION_TEST_PRELOAD
const brand = process.env.DSH_ACTIVATION_TEST_BRAND
assert.ok(root && preload && brand)
app.setPath('userData', join(root, brand))
app.disableHardwareAcceleration()
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

async function until(condition) {
  const end = Date.now() + 10000
  while (!condition()) {
    if (Date.now() > end) throw new Error('Native activation did not reach the expected state: ' + JSON.stringify(BrowserWindow.getAllWindows().map(window => ({
      visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused(), focusable: window.isFocusable(), title: window.getTitle(),
    }))))
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function run() {
  await app.whenReady()
  protocol.handle('dsh-app', () => new Response('<!doctype html><html><body><textarea>保留的知识库配置</textarea></body></html>', { headers: { 'content-type': 'text/html;charset=utf-8' } }))
  const create = () => new BrowserWindow({ show: false, width: 560, height: 260, title: brand + ' · 授权返回验证',
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const primary = create()
  const other = create()
  let activations = 0
  const stop = installDesktopActivation(() => primary, () => { activations++; revealDesktopWindow(primary) })
  try {
    await primary.loadURL('dsh-app://app/')
    await other.loadURL('dsh-app://app/')
    assert.equal(await primary.webContents.executeJavaScript('typeof window.dshDesktop?.activate'), 'function')
    await primary.webContents.executeJavaScript(`document.querySelector('textarea').value = '授权前未保存的配置'; window.testDocument = 42`)
    assert.match(await other.webContents.executeJavaScript('window.dshDesktop.activate().then(() => "accepted", error => error.message)'), /non-primary frame/)
    assert.equal(activations, 0)
    assert.equal(primary.isVisible(), false)
    await primary.webContents.executeJavaScript('window.dshDesktop.activate()')
    await until(() => primary.isVisible())
    const hiddenFocus = primary.isFocused()
    primary.minimize()
    await until(() => primary.isMinimized())
    await primary.webContents.executeJavaScript('window.dshDesktop.activate()')
    await until(() => primary.isVisible() && !primary.isMinimized())
    const minimizedFocus = primary.isFocused()
    assert.equal(await primary.webContents.executeJavaScript('document.querySelector("textarea").value'), '授权前未保存的配置')
    assert.equal(await primary.webContents.executeJavaScript('window.testDocument'), 42)
    assert.equal(activations, 2)
    assert.equal(other.isVisible(), false)
    await other.loadURL('dsh-app://external/')
    assert.equal(await other.webContents.executeJavaScript('typeof window.dshDesktop.activate'), 'undefined')
    stop()
    assert.match(await primary.webContents.executeJavaScript('window.dshDesktop.activate().then(() => "accepted", error => error.message)'), /No handler registered/)
    writeFileSync(join(root, brand + '.json'), JSON.stringify({ passed: true, brand, hiddenRestored: true,
      minimizedRestored: true, hiddenFocus, minimizedFocus, documentPreserved: true, foreignWindowRejected: true }, null, 2) + '\n')
  } finally { stop(); primary.destroy(); other.destroy() }
  app.exit(0)
}
void run().catch(error => { writeFileSync(join(root, brand + '-failure.txt'), String(error.stack ?? error)); app.exit(1) })
