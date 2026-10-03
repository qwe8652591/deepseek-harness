/** Qualify first-run and changed platform admission through the built Desktop entry in real Electron. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import electron from 'electron'

const { values } = parseArgs({ options: { resources: { type: 'string' }, main: { type: 'string' } } })
assert.ok(values.resources, 'Use --resources <packaged-application/resources>')
const evidenceRoot = fileURLToPath(new URL('../.desktop-build/qualification/', import.meta.url))
await mkdir(evidenceRoot, { recursive: true })
const evidence = await mkdtemp(join(evidenceRoot, 'admission-'))
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^ELECTRON_RUN_AS_NODE$|^DSH_DESKTOP_/iu.test(name)))

try {
  for (const scenario of ['save-and-change', 'reopen', 'cancel-setup']) {
    const root = join(evidence, scenario === 'cancel-setup' ? 'cancel' : 'saved')
    await mkdir(root, { recursive: true })
    const child = spawn(electron, [fileURLToPath(new URL('../tests/fixtures/product-admission.mjs', import.meta.url))], {
      env: { ...environment, DSH_ADMISSION_TEST_ROOT: root, DSH_ADMISSION_TEST_RESOURCES: resolve(values.resources),
        DSH_ADMISSION_TEST_MAIN: values.main === undefined ? fileURLToPath(new URL('../lib/main.js', import.meta.url)) : resolve(values.main),
        DSH_ADMISSION_TEST_SCENARIO: scenario }, stdio: 'inherit', windowsHide: true,
    })
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; child.kill() }, 30000)
    let result
    try {
      result = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => resolve({ code, signal }))
      })
    } finally { clearTimeout(timeout) }
    assert.equal(timedOut, false, 'Admission or explicit cancellation failed to complete')
    assert.equal(result.signal, null)
    const report = JSON.parse(await readFile(join(root, `${scenario}.json`), 'utf8'))
    assert.equal(result.code, 0, report.failure)
    assert.equal(report.passed, true, `Desktop quit before completing ${scenario}: ${report.phase}`)
    console.log('Product admission passed: ' + scenario)
  }
} finally { console.log('Product admission evidence: ' + evidence) }
