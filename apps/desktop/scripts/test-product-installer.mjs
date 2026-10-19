/** Exercise fresh installation, replacement and uninstall through the branded NSIS configuration. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify, parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createElectronBuilderConfig } from './electron-builder-config.mjs'

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Product installer checks require Windows x64')
const { values } = parseArgs({ options: { product: { type: 'string' }, output: { type: 'string' } } })
if (!values.product) throw new Error('Use --product <product.json>')
const require = createRequire(import.meta.url)
const { build, Platform, Arch } = require('electron-builder')
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows.js')
const execute = promisify(execFile)
async function exists(path) {
  try { await access(path); return true }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
const appRoot = fileURLToPath(new URL('..', import.meta.url))
const outputRoot = resolve(values.output ?? join(appRoot, '.desktop-build/product-installer-tests'))
await mkdir(outputRoot, { recursive: true })
const output = await mkdtemp(join(outputRoot, 'run-'))
const payload = join(output, 'payload'), installed = join(output, 'installed')
const guid = randomUUID(), name = `DSH Install Test ${guid.slice(0, 8)}`
const packageName = `dsh-install-test-${guid}`
const executable = name + '.exe', uninstaller = join(installed, 'Uninstall ' + executable)
const leaf = 'resources/app.asar.unpacked/dsh/node_modules/workbench/node_modules/workdsh-plugin-platform/node_modules/@modelcontextprotocol/sdk/node_modules/ajv-formats/node_modules/ajv/node_modules/fast-deep-equal/es6/index.js'
const marker = join(payload, leaf)
await mkdir(dirname(marker), { recursive: true })
await writeFile(marker, 'long dependency payload\n')
assert.ok(join(installed, leaf).length > 260)
const source = join(output, 'payload.nsi')
await writeFile(source, `Unicode true\nRequestExecutionLevel user\nSilentInstall silent\nName "${name}"\nOutFile "${join(payload, executable)}"\nSection\nSectionEnd\n`)
const compiler = await getMakeNsisPath()
const environment = { ...process.env, DSH_DESKTOP_PRODUCT: resolve(values.product), DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64', DSH_DESKTOP_UNSIGNED: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_7Z_FILTER: 'BCJ' }
const options = { env: environment, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 60000 }
await execute(compiler.path, ['/V2', source], { ...options, env: { ...environment, ...compiler.env } })
const config = createElectronBuilderConfig(environment)
const previousFilter = process.env.ELECTRON_BUILDER_7Z_FILTER
process.env.ELECTRON_BUILDER_7Z_FILTER = 'BCJ'
try {
  await build({ projectDir: appRoot, prepackaged: payload, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never',
    config: { ...config, appId: `com.dsh.installtest.n${guid.replaceAll('-', '')}`, productName: name, protocols: [],
      extraMetadata: { name: packageName }, artifactName: 'installer-test.exe', directories: { output },
      nsis: { ...config.nsis, guid, runAfterFinish: false, createDesktopShortcut: false, createStartMenuShortcut: false },
      beforeBuild: undefined, afterPack: undefined, afterSign: undefined, artifactBuildCompleted: undefined },
  })
  const installer = join(output, 'installer-test.exe')
  // A single raw command line preserves NSIS's required unquoted /D= remainder, including spaces.
  const install = () => execute('powershell.exe', ['-NoProfile', '-Command',
    '$p=Start-Process -FilePath $env:DSH_TEST_INSTALLER -ArgumentList ("/S /D="+$env:DSH_TEST_DESTINATION) -PassThru -WindowStyle Hidden; if(-not $p.WaitForExit(45000)){ $p.Kill(); $p.WaitForExit(); throw "Installation timed out" }; exit $p.ExitCode'],
  { ...options, env: { ...environment, DSH_TEST_INSTALLER: installer, DSH_TEST_DESTINATION: installed } })
  try {
    await install()
    assert.equal(await readFile(join(installed, leaf), 'utf8'), 'long dependency payload\n', 'fresh installation must retain long dependency paths')
    await writeFile(join(installed, 'old-version-only.txt'), 'obsolete payload')
    await install()
    assert.equal(await readFile(join(installed, leaf), 'utf8'), 'long dependency payload\n')
    await assert.rejects(access(join(installed, 'old-version-only.txt')), { code: 'ENOENT' })
  } finally {
    if (await exists(uninstaller)) {
      await execute(uninstaller, ['/S'], options)
      for (let attempt = 0; await exists(installed); attempt++) {
        if (attempt === 100) throw new Error('Test uninstaller left its application directory')
        await delay(100)
      }
    }
  }
  await writeFile(join(output, 'result.json'), JSON.stringify({ freshInstall: true, replacement: true, uninstall: true, longPath: join(installed, leaf).length }, null, 2) + '\n')
  console.log('Product installer passed: ' + output)
} finally {
  if (previousFilter === undefined) delete process.env.ELECTRON_BUILDER_7Z_FILTER
  else process.env.ELECTRON_BUILDER_7Z_FILTER = previousFilter
  console.log('Product installer evidence: ' + output)
}
