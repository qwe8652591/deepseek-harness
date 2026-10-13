/** Qualify packaged product plugins, concurrent account Hosts and restart without user credentials. */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { readAsar } from 'app-builder-lib/out/asar/asar.js'
import electron from 'electron'
import { createPluginProfile } from '../src/project-manager.ts'
import { prepareProductProfile } from '../src/product-deployment.ts'
import { parseDesktopProduct } from './desktop-product.mjs'

const { values } = parseArgs({ options: { installed: { type: 'string' }, runtime: { type: 'string' }, ui: { type: 'boolean' } } })
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
const version = manifest.version
assert.equal(typeof electron, 'string')
// Outside Electron this package exports its executable path, despite its main-process types.
const rendererExecutable = electron as unknown as string
const executable = join(installed, product.productName + (process.platform === 'win32' ? '.exe' : ''))
const evidenceRoot = resolve(import.meta.dirname, '../.desktop-build/qualification')
await mkdir(evidenceRoot, { recursive: true })
const evidence = await mkdtemp(join(evidenceRoot, 'product-host-'))
/** A gzip-compressed npm package holding a bundle with an empty patch. */
function bundleTarball(manifest: Record<string, string>): Buffer {
  const files: [string, string][] = [
    ['package/package.json', JSON.stringify({ ...manifest, dsh: { bundle: { patch: './cordis.patch.yml' } } })],
    ['package/cordis.patch.yml', '[]\n'],
  ]
  const blocks = files.flatMap(([name, text]) => {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write('0000000\0', 108)
    header.write('0000000\0', 116)
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124)
    header.write('00000000000\0', 136)
    header.write('        ', 148)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.write('00', 263)
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    return [header, body, Buffer.alloc((512 - body.length % 512) % 512)]
  })
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}
const APP_FIXTURE = 'dsh-product-app-fixture'
await mkdir(join(evidence, 'fixtures'), { recursive: true })
const appFixture = join(evidence, 'fixtures', `${APP_FIXTURE}-1.0.0.tgz`)
const suppliedFixture = join(evidence, 'fixtures', 'aiko-dsh-workbench-999.0.0.tgz')
await writeFile(appFixture, bundleTarball({ name: APP_FIXTURE, version: '1.0.0' }))
await writeFile(suppliedFixture, bundleTarball({ name: 'aiko-dsh-workbench', version: '999.0.0' }))
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
const account = { issuer: 'https://product-test.example', subject: 'fixture', name: 'Product qualification',
  organization: 'Qualification', capabilities: true, expiresAt: Date.now() + 600000 }
const accountKey = createHash('sha256').update(JSON.stringify([account.issuer, account.subject])).digest('hex')
const relayToken = randomBytes(32).toString('base64url')
const relay = createServer((request, response) => {
  if (request.headers.authorization !== 'Bearer ' + relayToken) { response.writeHead(401); response.end(); return }
  const value = request.url === '/auth/me' ? account : request.url === '/api/me'
    ? { user: { id: account.subject, username: account.name } }
    : ['/api/skills', '/api/experts', '/api/connectors'].includes(request.url ?? '') ? [] : undefined
  response.writeHead(value === undefined ? 404 : 200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value ?? { error: 'Unknown fixture route' }))
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function start(profile: string): Promise<(typeof children)[number]> {
  const child = spawn(executable, ['--expose-internals',
    join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'), runtime, profile,
    join(resources, 'runtime/primary-runtime'), join(resources, 'runtime/pnpm/bin/pnpm.cjs'), join(resources, 'runtime/bin'),
  ], { cwd: profile, windowsHide: true, env: { ...environment, ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME: resolve(profile, '../..'), DSH_CLIENT_VERSION: version,
    AIKO_DESKTOP_ACCOUNT_FILE: resolve(profile, '../../credentials/product-test.json') }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
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
    const bundles = await fetch(new URL('/api/pluginManager/listBundles', ready.url), {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'inventory', method: 'pluginManager/listBundles', payload: { args: {} } }), signal: AbortSignal.timeout(10000),
    })
    assert.equal(bundles.status, 200, 'Product module settings require the plugin inventory RPC')
    const envelope: unknown = await bundles.json()
    assert.ok(isRecord(envelope))
    const inventory = envelope.result
    assert.ok(isRecord(inventory) && inventory.ok === true && Array.isArray(inventory.value))
    for (const name of requiredClients) assert.ok(inventory.value.some(row => isRecord(row) && row.name === name && row.error === undefined), `Unavailable bundled module: ${name}`)
    assert.ok(clients.includes('@deepseek-ai/dsh-client-ui-plugin-manager'), 'Plugin sidebar must be loaded')
    const policy = ready.injections.find(row => isRecord(row) && row.kind === 'global' && row.name === '__DSH_PLUGIN_MANAGER_CONFIG__')
    assert.ok(isRecord(policy) && isRecord(policy.value) && policy.value.packageChanges === false)
    const call = async (method: string, args: Record<string, unknown>): Promise<unknown> => {
      const response = await fetch(new URL('/api/pluginManager/' + method, ready.url), {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({
          type: 'client-request', rpcId: method, method: 'pluginManager/' + method, payload: { args },
        }),
        signal: AbortSignal.timeout(120000),
      })
      const reply: unknown = await response.json()
      assert.ok(isRecord(reply) && isRecord(reply.result) && reply.result.ok === true, `${method} failed: ${JSON.stringify(reply)}`)
      return reply.result.value
    }
    const profileBefore = await readFile(join(profile, 'package.json'), 'utf8')
    // Bundled packages stay fixed: registry specs and installation-supplied names are refused before pnpm runs.
    for (const [method, args, code] of [
      ['installBundle', { spec: 'dsh-product-policy-test' }, 'managed-installation'],
      ['installBundle', { spec: suppliedFixture }, 'managed-installation'],
      ['removeBundle', { name: 'aiko-dsh-workbench' }, 'not-removable'],
    ] as const) {
      const value = await call(method, args)
      assert.ok(isRecord(value) && value.application === 'failed' && isRecord(value.error) && value.error.code === code,
        `Whole-product package policy must refuse ${method} with ${code}: ${JSON.stringify(value)}`)
    }
    assert.equal(await readFile(join(profile, 'package.json'), 'utf8'), profileBefore)
    // App-center plugins arrive as local package files: one installs with the bundled pnpm and removes again.
    const installedFixture = await call('installBundle', { spec: appFixture, options: { enabled: false } })
    assert.ok(isRecord(installedFixture) && ['applied', 'restart-required'].includes(String(installedFixture.application))
      && installedFixture.bundle === APP_FIXTURE, `A local application package must install: ${JSON.stringify(installedFixture)}`)
    const listed = await call('listBundles', {})
    assert.ok(Array.isArray(listed) && listed.some(row => isRecord(row) && row.name === APP_FIXTURE && row.removable === true),
      'An installed application package must be removable')
    const removedFixture = await call('removeBundle', { name: APP_FIXTURE })
    assert.ok(isRecord(removedFixture) && removedFixture.application === 'applied', `A local application package must remove: ${JSON.stringify(removedFixture)}`)
    const dependencies: unknown = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')).dependencies
    assert.ok(!isRecord(dependencies) || !(APP_FIXTURE in dependencies), 'Removal must leave no profile dependency')
    for (const entry of entries.filter(row => requiredClients.includes(String(row.id)))) {
      assert.equal(typeof entry.url, 'string')
      const script = await fetch(new URL(String(entry.url), ready.url), { headers: { cookie }, signal: AbortSignal.timeout(10000) })
      assert.equal(script.status, 200, `Unavailable plugin asset: ${String(entry.id)}`)
      assert.ok((await script.text()).length > 0)
    }
    assert.doesNotMatch(diagnostic, /failed to import|StartupError/u)
    reports.push({ profile, origin: new URL(ready.url).origin, clients: requiredClients })
    if (values.ui && reports.length === 2) {
      const renderer = spawn(rendererExecutable, [resolve(import.meta.dirname, '../tests/fixtures/product-plugin-menu.mjs')], {
        windowsHide: true, env: { ...environment, DSH_MENU_TEST_ROOT: join(evidence, 'ui'), DSH_MENU_TEST_URL: ready.url }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let rendererLog = ''
      const captureRenderer = (chunk: Buffer): void => { rendererLog = (rendererLog + chunk.toString()).slice(-16000) }
      renderer.stdout.on('data', captureRenderer)
      renderer.stderr.on('data', captureRenderer)
      let timedOut = false
      const deadline = setTimeout(() => { timedOut = true; renderer.kill() }, 90000)
      const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        renderer.once('error', reject)
        renderer.once('close', (code, signal) => { resolve({ code, signal }) })
      }).finally(() => { clearTimeout(deadline) })
      await writeFile(join(evidence, 'renderer.log'), rendererLog.replace(/(token|code|state)=([^&\s]+)/giu, '$1=[REDACTED]'))
      assert.equal(timedOut, false, 'Plugin menu UI timed out')
      assert.equal(result.signal, null)
      assert.equal(result.code, 0, 'Plugin menu UI failed; see ui/failure.txt')
    }
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
  await new Promise<void>((resolve, reject) => { relay.once('error', reject); relay.listen(0, '127.0.0.1', resolve) })
  const address = relay.address()
  assert.ok(address && typeof address !== 'string')
  const relayOrigin = `http://127.0.0.1:${address.port}`
  const profiles = ['first', 'second'].map(name => join(evidence, name, accountKey, 'profiles/desktop'))
  for (const profile of profiles) {
    createPluginProfile(profile); await prepareProductProfile(product, profile)
    const credentials = resolve(profile, '../../credentials')
    await mkdir(credentials, { recursive: true })
    await writeFile(join(credentials, 'product-test.json'), JSON.stringify({ authMode: 'aiko',
      baseUrl: relayOrigin, platformOrigin: relayOrigin, token: relayToken }), { mode: 0o600 })
  }
  const started = await Promise.allSettled(profiles.map(start))
  for (const result of started) if (result.status === 'rejected') throw result.reason
  assert.notEqual(reports[0]?.origin, reports[1]?.origin, 'Concurrent product Hosts must own different ports')
  await Promise.all(children.map(stop))
  await stop(await start(profiles[0]!))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ product: product.profile, passed: true, reports }, null, 2) + '\n')
  console.log(`Product Host passed: ${product.profile}; two concurrent profiles, bundled clients, app-center package install and restart`)
} finally {
  await Promise.all(children.map(async (state) => {
    if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill()
    await state.exit
    clearTimeout(state.deadline)
  }))
  relay.closeAllConnections()
  await new Promise<void>((resolve, reject) => { relay.close(error => error ? reject(error) : resolve()) })
  console.log('Product Host evidence: ' + evidence)
}
