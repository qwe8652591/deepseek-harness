/** Exercise packaged Host pages in an isolated Electron renderer. */
import assert from 'node:assert/strict'
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.DSH_MENU_TEST_ROOT
const url = process.env.DSH_MENU_TEST_URL
assert.ok(root && url)
mkdirSync(root, { recursive: true })
const phase = value => writeFileSync(join(root, 'phase.txt'), value)
phase('initializing Electron')
app.setPath('userData', join(root, 'browser'))
app.commandLine.appendSwitch('lang', 'zh-CN')
app.disableHardwareAcceleration()
async function run() {
  await app.whenReady()
  phase('creating renderer')
  const window = new BrowserWindow({ show: false, width: 1360, height: 1000,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  const execute = code => window.webContents.executeJavaScript(code)
  async function capture(name) {
    await execute('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    writeFileSync(join(root, name), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  }
  async function waitFor(expression) {
    await execute(`new Promise((resolve, reject) => {
      const until = Date.now() + 20000;
      const check = () => {
        if (${expression}) resolve();
        else if (Date.now() > until) reject(new Error('UI expectation timed out'));
        else setTimeout(check, 100);
      }; check();
    })`)
  }
  const button = text => `[...document.querySelectorAll('button,[role="button"],a')].find(node => node.textContent.trim() === ${JSON.stringify(text)})`
  try {
    phase('loading Host page')
    await window.loadURL(url)
    phase('finding plugin menu')
    await waitFor(button('插件'))
    await waitFor(button('继续'))
    await execute(`${button('继续')}.click()`)
    await waitFor(`!(${button('继续')})`)
    await execute(`${button('插件')}.click()`)
    phase('reading plugin inventory')
    await waitFor(`document.querySelector('[data-plugin-package="workbench"]')`)
    assert.equal(await execute(`document.body.innerText.includes('版本随客户端整体更新')`), true)
    assert.equal(await execute(`!!(${button('添加插件')})`), false)
    await execute(`document.querySelector('[data-plugin-package="workbench"] button').click()`)
    phase('opening component details')
    await waitFor(`document.querySelector('[data-plugin-detail="workbench"]')`)
    assert.equal(await execute(`document.body.innerText.includes('包含的组件')`), true)
    await capture('plugins.png')
    await waitFor(`document.querySelector('[aria-label="Product qualification，账号菜单"]')`)
    await execute(`document.querySelector('[aria-label="Product qualification，账号菜单"]').click()`)
    await waitFor(button('设置'))
    phase('opening settings')
    await execute(`${button('设置')}.click()`)
    await waitFor(`document.querySelector('[role="dialog"]')`)
    await execute(`[...document.querySelectorAll('[role="dialog"] button')].find(node => node.textContent.trim() === '工作台').click()`)
    await waitFor(`document.querySelector('[aria-label="关闭知识库"]:not(:disabled)')`)
    assert.equal(await execute(`document.querySelector('.workbench-modules').innerText.includes('读取状态中')`), false)
    assert.equal(await execute(`document.querySelector('.workbench-modules [role="alert"]') !== null`), false)
    await execute(`document.querySelector('[aria-label="配置知识库"]').click()`)
    await waitFor(`document.querySelector('.workbench-modules-config input')`)
    await capture('modules.png')
    await execute(`document.querySelector('[aria-label="关闭知识库"]').click()`)
    await waitFor(`document.querySelector('[aria-label="开启知识库"]:not(:disabled)')`)
    await execute(`document.querySelector('[aria-label="开启知识库"]').click()`)
    await waitFor(`document.querySelector('[aria-label="关闭知识库"]:not(:disabled)')`)
    writeFileSync(join(root, 'result.json'), JSON.stringify({ passed: true, menu: true, components: true,
      moduleSettings: true, knowledgeConfig: true, disableAndEnable: true, individualInstall: false }, null, 2) + '\n')
    app.exit(0)
  } catch (error) {
    writeFileSync(join(root, 'failure.txt'), String(error) + '\n' + await execute('document.body.innerText'))
    await capture('failure.png')
    app.exit(1)
  }
}
void run().catch(error => { writeFileSync(join(root, 'failure.txt'), String(error)); app.exit(1) })
