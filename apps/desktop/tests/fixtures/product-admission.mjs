/** Run the real Desktop entry through setup and sign-in with private Electron application data. */
import assert from 'node:assert/strict'
import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.env.DSH_ADMISSION_TEST_ROOT
const resources = process.env.DSH_ADMISSION_TEST_RESOURCES
const entry = process.env.DSH_ADMISSION_TEST_MAIN
const scenario = process.env.DSH_ADMISSION_TEST_SCENARIO
assert.ok(root && resources && entry && scenario, 'The launcher supplies isolated admission inputs')
mkdirSync(join(root, 'appdata'), { recursive: true })
app.setPath('appData', join(root, 'appdata'))
app.setAppPath(join(resources, 'app.asar'))
// Use packaged assets and the actual entry while keeping Electron's lock and account data private.
Object.defineProperty(app, 'isPackaged', { value: true })
Object.defineProperty(process, 'resourcesPath', { value: resources })

const origin = 'https://platform.example'
const changedOrigin = 'https://changed-platform.example'
let phase = 'launch'
let passed = false
let setupCount = 0
let loginCount = 0
let failure
const phases = []
function record(value) { phase = value; phases.push(value) }
function report() {
  writeFileSync(join(root, `${scenario}.json`), JSON.stringify({ scenario, phase, phases, passed, failure }, null, 2) + '\n')
}
app.once('will-quit', report)

async function interact(window) {
  const url = window.webContents.getURL()
  if (url.includes('/renderer/product-platform.html')) {
    setupCount++
    record('setup-' + setupCount)
    if (scenario === 'cancel-setup') {
      passed = true
      window.close()
      return
    }
    assert.equal(scenario, 'save-and-change', 'Saved configuration must reopen directly at sign-in')
    await window.webContents.executeJavaScript(`new Promise(resolve => {
      const ready = () => { if (document.body.dataset.brand) resolve(); else requestAnimationFrame(ready) }; ready();
    })`)
    const value = setupCount === 1 ? origin : changedOrigin
    record('save-' + setupCount)
    await window.webContents.executeJavaScript(`document.getElementById('website').value = ${JSON.stringify(value)};
      document.getElementById('gateway').value = ''; document.getElementById('platform-form').requestSubmit();`)
  } else if (url.includes('/aiko-welcome/') && url.includes('/login.html')) {
    loginCount++
    record('login-' + loginCount)
    const saved = JSON.parse(readFileSync(join(app.getPath('userData'), 'platform.json'), 'utf8'))
    assert.equal(saved.websiteOrigin, scenario === 'save-and-change' && loginCount === 1 ? origin : changedOrigin)
    assert.equal(saved.gatewayOrigin, saved.websiteOrigin)
    if (scenario === 'save-and-change' && loginCount === 1) {
      record('change-platform')
      await window.webContents.executeJavaScript(`new Promise(resolve => {
        const ready = () => {
          const button = document.getElementById('status').nextElementSibling;
          if (button?.tagName === 'BUTTON') { button.click(); resolve() } else requestAnimationFrame(ready);
        }; ready();
      })`)
    } else {
      assert.equal(loginCount, scenario === 'save-and-change' ? 2 : 1)
      assert.equal(setupCount, scenario === 'save-and-change' ? 2 : 0)
      passed = true
      record('close-login')
      window.close()
    }
  }
}

app.on('browser-window-created', (_event, window) => {
  window.hide()
  window.webContents.on('did-finish-load', () => {
    void interact(window).catch(error => {
      failure = error.stack
      passed = false
      report()
      app.exit(1)
    })
  })
})

// No window-all-closed handler here: the Desktop entry must own transitions and explicit cancellation.
await import(pathToFileURL(entry).href)
