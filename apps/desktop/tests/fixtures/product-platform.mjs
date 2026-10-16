/** Real sandboxed preload and IPC qualification using isolated platform settings. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow } from 'electron'
import { openProductPlatform } from '../../lib/types/product-platform-window.js'

/**
 * Exercise first run, a changed shared auth origin, and a separately configured gateway.
 * @param {string} root Private qualification directory.
 * @returns {Promise<string[]>} Captured renderer screenshots.
 */
export async function qualifyProductPlatform(root) {
  const application = app.getAppPath(), userData = app.getPath('userData')
  const screenshots = []
  app.setAppPath(fileURLToPath(new URL('../../', import.meta.url)))
  try {
    for (const profile of ['aiko', 'yunyao']) {
      app.setPath('userData', join(root, profile))
      // Yunyao names its deployment platform, so its first run starts with that address filled in.
      const product = { profile, productName: profile === 'aiko' ? 'Aiko DSH' : '云遥宇航', ...profile === 'yunyao' ? { platform: 'https://suggested.example' } : {} }
      for (let pass = 0; pass < 3; pass++) {
        const before = new Set(BrowserWindow.getAllWindows())
        const result = openProductPlatform(product)
        let window
        for (let tries = 0; tries < 100 && !window; tries++) {
          window = BrowserWindow.getAllWindows().find(candidate => !before.has(candidate))
          if (!window) await delay(20)
        }
        assert.ok(window, 'Setup window was created')
        if (window.webContents.isLoading()) await once(window.webContents, 'did-finish-load')
        for (let tries = 0; tries < 100; tries++) {
          if (await window.webContents.executeJavaScript('document.body.dataset.brand !== undefined')) break
          await delay(20)
        }
        assert.equal(await window.webContents.executeJavaScript('document.body.dataset.brand'), profile)
        await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        assert.equal(await window.webContents.executeJavaScript('document.getElementById("gateway").value'), '')
        if (pass === 0) assert.equal(await window.webContents.executeJavaScript('document.getElementById("website").value'), profile === 'yunyao' ? 'https://suggested.example' : '')
        const website = `https://platform${pass}.example`
        const gateway = pass === 2 ? 'https://auth.example' : ''
        if (pass === 0) {
          const name = `${profile}-platform-setup.png`
          await writeFile(join(root, name), (await window.webContents.capturePage()).toPNG())
          screenshots.push(name)
        }
        await window.webContents.executeJavaScript(`document.getElementById('website').value = ${JSON.stringify(website)}; document.getElementById('gateway').value = ${JSON.stringify(gateway)}; document.getElementById('platform-form').requestSubmit();`)
        const identity = JSON.parse(await readFile(await result, 'utf8'))
        assert.equal(identity.websiteOrigin, website)
        assert.equal(identity.gatewayOrigin, gateway || website)
        assert.equal(window.isDestroyed(), true)
      }
    }
  } finally { app.setAppPath(application); app.setPath('userData', userData) }
  return screenshots
}
