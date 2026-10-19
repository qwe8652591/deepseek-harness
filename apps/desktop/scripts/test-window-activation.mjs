/** Qualify native activation with isolated data and the built Desktop preload. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { Rolldown } from 'tsdown'

const parent = fileURLToPath(new URL('../.desktop-build/qualification/', import.meta.url))
await mkdir(parent, { recursive: true })
const root = await mkdtemp(join(parent, 'activation-'))
const entry = join(root, 'fixture.mjs')
const bundle = await Rolldown.rolldown({ input: fileURLToPath(new URL('../tests/fixtures/window-activation.mjs', import.meta.url)),
  platform: 'node', external: ['electron'] })
try { await bundle.write({ file: entry, format: 'esm' }) }
finally { await bundle.close() }
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/KEY|SECRET|TOKEN|PASSWORD|^DSH_|^WORKBENCH_|^NODE_OPTIONS$|^ELECTRON_/iu.test(name)))
try {
  for (const brand of ['orange', 'blue']) {
    const child = spawn(electron, [entry], { env: { ...environment, DSH_ACTIVATION_TEST_ROOT: root,
      DSH_ACTIVATION_TEST_PRELOAD: fileURLToPath(new URL('../lib/preload-app.cjs', import.meta.url)),
      DSH_ACTIVATION_TEST_BRAND: brand }, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const capture = chunk => { log = (log + chunk.toString()).slice(-16000) }
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    let timedOut = false
    const deadline = setTimeout(() => { timedOut = true; child.kill() }, 45000)
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    }).finally(() => clearTimeout(deadline))
    await writeFile(join(root, brand + '.log'), log)
    assert.equal(timedOut, false, brand + ' activation timed out')
    assert.equal(result.signal, null)
    assert.equal(result.code, 0, brand + ' activation failed; inspect ' + root)
    const report = JSON.parse(await readFile(join(root, brand + '.json'), 'utf8'))
    assert.equal(report.passed, true)
    console.log(brand + ': hidden/minimized window restored; document preserved; foreign sender rejected; native focus ' + JSON.stringify({ hidden: report.hiddenFocus, minimized: report.minimizedFocus }))
  }
} finally { console.log('Activation evidence: ' + root) }
