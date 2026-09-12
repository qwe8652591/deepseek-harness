/** Verify the packaged client's offline market installation and native editing shortcuts. */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { _electron } from 'playwright'

const [bundle, output] = process.argv.slice(2).map(path => resolve(path))
const executable = join(bundle, 'Contents/MacOS/DSH Aiko Test')
const userData = mkdtempSync(join(output, 'smoke profile '))
const offline = { ...process.env, HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: '', NODE_USE_ENV_PROXY: '1' }
delete offline.ELECTRON_RUN_AS_NODE
let app
let page
const logs = []
try {
  app = await _electron.launch({ executablePath: executable, args: [`--user-data-dir=${userData}`, '--proxy-server=http://127.0.0.1:9'], env: offline, timeout: 120000 })
  app.process().stderr.on('data', chunk => logs.push(chunk.toString()))
  const home = await app.evaluate(({ app }) => app.getPath('userData'))
  assert.equal(home, userData)
  const profile = join(home, 'harness/profiles/desktop')
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    page = app.windows().find(window => window.url().startsWith('dsh-app://app/'))
    if (page) break
    await setTimeout(500)
  }
  assert.ok(page, `Client did not finish offline first launch:\n${logs.join('')}`)
  const welcome = page.getByRole('dialog', { name: /^(Internal Testing Notice|内测声明)$/ })
  await welcome.waitFor({ state: 'visible', timeout: 30000 })
  await page.screenshot({ path: join(output, 'welcome.png') })
  await welcome.getByRole('button', { name: /^(Continue|继续)$/ }).click({ timeout: 30000 })
  await page.getByRole('button', { name: /^(Configure later|稍后配置)$/ }).click({ timeout: 30000 })
  const roles = await app.evaluate(({ Menu }) => {
    const collect = menu => menu.items.flatMap(item => [item.role?.toLowerCase(), ...(item.submenu ? collect(item.submenu) : [])])
    return collect(Menu.getApplicationMenu())
  })
  for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
    assert.ok(roles.includes(role.toLowerCase()), `Application menu is missing the native ${role} command`)
  }
  const workspace = join(userData, 'clipboard-workspace')
  mkdirSync(workspace)
  const created = await page.evaluate(async path => {
    const response = await fetch('/api/workspace/create', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        type: 'client-request', rpcId: crypto.randomUUID(), method: 'workspace/create',
        payload: { args: { request: { path } } },
      }),
    })
    if (!response.ok) throw new Error(`Workspace setup failed: HTTP ${response.status}`)
    return response.json()
  }, workspace)
  assert.equal(created.result.ok, true, JSON.stringify(created))
  await page.getByRole('textbox', { name: /^(Choose workspace|选择工作区)$/ }).click({ timeout: 30000 })
  await page.getByRole('menuitem', { name: 'clipboard-workspace', exact: true }).click({ timeout: 30000 })
  const composer = page.locator('[contenteditable="true"][role="textbox"]')
  await composer.waitFor({ timeout: 30000 })
  const savedClipboard = await app.evaluateHandle(async ({ clipboard, ClipboardItem }) => Promise.all(
    (await clipboard.read()).filter(item => item.types.length > 0).map(async item => new ClipboardItem(Object.fromEntries(
      await Promise.all(item.types.map(async type => [type, await item.getType(type)])),
    ))),
  ))
  const copied = 'Aiko native copy 复制'
  const pasted = 'Aiko native paste 粘贴'
  const clipboardEquals = async expected => {
    const deadline = Date.now() + 10000
    let actual
    do {
      actual = await app.evaluate(({ clipboard }) => clipboard.readText())
      if (actual === expected) return
      await setTimeout(50)
    } while (Date.now() < deadline)
    assert.equal(actual, expected, 'Native clipboard command did not complete')
  }
  try {
    await composer.click()
    await composer.pressSequentially(copied)
    await composer.press('Meta+A')
    await composer.press('Meta+C')
    await clipboardEquals(copied)
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), pasted)
    await composer.press('Meta+V')
    await page.waitForFunction(text => document.querySelector('[contenteditable="true"][role="textbox"]')?.textContent === text, pasted)
    await composer.press('Meta+A')
    await composer.press('Meta+X')
    await clipboardEquals(pasted)
    await page.waitForFunction(() => document.querySelector('[contenteditable="true"][role="textbox"]')?.textContent === '')
  } finally {
    try {
      await app.evaluate(async ({ clipboard }, saved) => {
        clipboard.clear()
        if (saved.length > 0) await clipboard.write(saved)
      }, savedClipboard)
    } finally {
      await savedClipboard.dispose()
    }
  }
  await page.screenshot({ path: join(output, 'desktop.png') })
  const installed = await page.evaluate(() => window.dshDesktop.market.list())
  assert.deepEqual(installed.map(plugin => plugin.name), ['aiko-dsh-market'])
  assert.equal(installed[0].version, '1.38.0')
  assert.equal(installed[0].spec, 'aiko-dsh-market@1.38.0')
  assert.equal(existsSync(join(profile, 'node_modules/aiko-dsh-office')), false)
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh.profile.bundles.includes('aiko-dsh-market'), true)
  assert.equal(manifest.dsh.profile.bundles.includes('aiko-dsh-office'), false)
  assert.equal(manifest.dependencies['aiko-dsh-office'], undefined)
  const settings = page.getByRole('button', { name: /^(Settings|设置)$/ })
  await settings.first().click({ timeout: 30000 })
  await page.getByRole('button', { name: /^(Market|Plugin Market|Plugin market|插件市场)$/ }).click({ timeout: 30000 })
  await page.screenshot({ path: join(output, 'market.png') })
  writeFileSync(join(output, 'smoke.json'), JSON.stringify({ architecture: process.arch, offlineFirstLaunch: true, nativeEditing: true, marketUi: true, officeNotPreinstalled: true, plugins: installed }, null, 2) + '\n')
} finally {
  writeFileSync(join(output, 'electron.log'), logs.join(''))
  try {
    if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'last-window.png') })
  } finally {
    if (app) await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
}
