/** Qualify packaged product plugins, concurrent account Hosts and restart without user credentials. */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readAsar } from 'app-builder-lib/out/asar/asar.js'
import { createPluginProfile } from '../src/project-manager.ts'
import { prepareProductProfile } from '../src/product-deployment.ts'
import { parseDesktopProduct } from './desktop-product.mjs'

const { values } = parseArgs({ options: { installed: { type: 'string' }, runtime: { type: 'string' } } })
assert.ok(values.installed, 'Use --installed <application-directory> [--runtime <prepared-dsh-directory>]')
const installed = resolve(values.installed)
const resources = join(installed, 'resources')
const runtime = values.runtime === undefined ? join(resources, 'app.asar/dsh') : resolve(values.runtime)
const archive = values.runtime === undefined ? await readAsar(join(resources, 'app.asar')) : undefined
const metadata = async (name: string): Promise<string> => archive === undefined
  ? readFile(join(runtime, name), 'utf8') : (await archive.readFile(join('dsh', name))).toString()
const product = parseDesktopProduct(JSON.parse(await metadata('desktop-product.json')))
const manifest: unknown = JSON.parse(await metadata('package.json'))
assert.ok(isRecord(manifest) && typeof manifest.version === 'string')
const executable = join(installed, product.productName + (process.platform === 'win32' ? '.exe' : ''))
const evidenceRoot = resolve(import.meta.dirname, '../.desktop-build/qualification')
await mkdir(evidenceRoot, { recursive: true })
const evidence = await mkdtemp(join(evidenceRoot, 'product-host-'))
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/KEY|SECRET|TOKEN|PASSWORD|^DSH_|^AIKO_|^NODE_OPTIONS$|^ELECTRON_/iu.test(name)))
const requiredClients = product.plugins.map(plugin => plugin.name)
  .filter(name => name !== 'aiko-dsh-market' && name !== 'aiko-dsh-plugin-catalog')
const children: {
  child: ChildProcess
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  deadline: ReturnType<typeof setTimeout>
  timedOut: boolean
}[] = []
const reports: { profile: string; origin: string; clients: string[] }[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function start(profile: string): Promise<(typeof children)[number]> {
  const child = spawn(executable, ['--expose-internals',
    join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'), runtime, profile,
    join(resources, 'runtime/primary-runtime'), join(resources, 'runtime/pnpm/bin/pnpm.cjs'), join(resources, 'runtime/bin'),
  ], { cwd: profile, windowsHide: true, env: { ...environment, ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME: resolve(profile, '../..'), DSH_CLIENT_VERSION: String(manifest.version) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let diagnostic = ''
  const capture = (chunk: Buffer): void => {
    diagnostic = (diagnostic + chunk.toString().replace(/(token|code|state)=([^&\s]+)/giu, '$1=[REDACTED]')).slice(-65536)
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => { resolve({ code, signal }) })
  })
  const state = { child, exit, timedOut: false, deadline: setTimeout(() => { state.timedOut = true; child.kill() }, 120000) }
  children.push(state)
  try {
    const ready = await new Promise<{ url: string; injections: unknown[] }>((resolve, reject) => {
      child.once('error', reject)
      child.on('message', (message: unknown) => {
        if (!isRecord(message)) return
        if (message.type === 'fatal') reject(new Error(String(message.diagnostic ?? message.message)))
        if (message.type === 'ready' && typeof message.url === 'string' && Array.isArray(message.injections)) {
          resolve({ url: message.url, injections: message.injections })
        }
      })
      void exit.then((result) => { reject(new Error(`Host stopped before readiness: ${JSON.stringify(result)}\n${diagnostic}`)) })
    })
    const boot = ready.injections.find(row => isRecord(row) && row.kind === 'global' && row.name === '__DSH_BOOT__')
    assert.ok(isRecord(boot) && isRecord(boot.value) && Array.isArray(boot.value.entries))
    const entries = boot.value.entries.filter(isRecord)
    const clients = entries.map(row => String(row.id))
    for (const name of requiredClients) assert.ok(clients.includes(name), `Missing bundled client: ${name}`)
    const login = await fetch(ready.url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    assert.ok(cookie, 'Host authentication did not set a cookie')
    const page = await fetch(new URL('/', ready.url), { headers: { cookie }, signal: AbortSignal.timeout(10000) })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /<html/u)
    for (const entry of entries.filter(row => requiredClients.includes(String(row.id)))) {
      assert.equal(typeof entry.url, 'string')
      const script = await fetch(new URL(String(entry.url), ready.url), { headers: { cookie }, signal: AbortSignal.timeout(10000) })
      assert.equal(script.status, 200, `Unavailable plugin asset: ${String(entry.id)}`)
      assert.ok((await script.text()).length > 0)
    }
    assert.doesNotMatch(diagnostic, /failed to import|StartupError/u)
    reports.push({ profile, origin: new URL(ready.url).origin, clients: requiredClients })
    return state
  } catch (error) {
    await writeFile(join(evidence, `failure-${children.length}.log`), diagnostic)
    throw error
  }
}

async function stop(state: (typeof children)[number]): Promise<void> {
  if (state.child.connected) state.child.send({ type: 'shutdown' }, () => {})
  const result = await state.exit
  clearTimeout(state.deadline)
  assert.equal(state.timedOut, false, 'Host startup or teardown exceeded its deadline')
  assert.equal(result.signal, null)
  assert.equal(result.code, 0)
}

try {
  const profiles = [join(evidence, 'first/profiles/desktop'), join(evidence, 'second/profiles/desktop')]
  for (const profile of profiles) { createPluginProfile(profile); await prepareProductProfile(product, profile) }
  const started = await Promise.allSettled(profiles.map(start))
  for (const result of started) if (result.status === 'rejected') throw result.reason
  assert.notEqual(reports[0]?.origin, reports[1]?.origin, 'Concurrent product Hosts must own different ports')
  await Promise.all(children.map(stop))
  await stop(await start(profiles[0]!))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ product: product.profile, passed: true, reports }, null, 2) + '\n')
  console.log(`Product Host passed: ${product.profile}; two concurrent profiles, bundled clients and restart`)
} finally {
  await Promise.all(children.map(async (state) => {
    if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill()
    await state.exit
    clearTimeout(state.deadline)
  }))
  console.log('Product Host evidence: ' + evidence)
}
