/** Exercise persisted GitHub-source repair using real npm packages and the native Mac application. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { _electron } from 'playwright'
import { DesktopHostProcess, DesktopProjectManager, resolveDesktopPaths } from './build-tools.mjs'

const [bundle, originalSeed, output] = process.argv.slice(2).map(path => resolve(path))
const userData = mkdtempSync(join(output, 'migration-profile-'))
const home = join(userData, 'harness')
const resources = join(bundle, 'Contents/Resources')
const runtime = { node: join(resources, 'runtime/node/node'), pnpm: join(resources, 'runtime/pnpm/bin/pnpm.mjs') }
const paths = resolveDesktopPaths(home)
const manager = new DesktopProjectManager(paths, runtime)
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const hooks = {
  async healthCheck(project) {
    const host = new DesktopHostProcess(runtime.node, project)
    try { await host.start(); assert.equal((await host.fetch(new Request('dsh-app://app/index.html'))).status, 200) }
    finally { await host.stop() }
  }, beforeActivate: async () => {}, afterActivate: async () => {},
}
await manager.applyRelease(originalSeed, '0.1.5-alpha.2', hooks)
await manager.mutate({ type: 'plugins-add', specs: ['aiko-dsh-office@0.3.0', 'aiko-dsh-ontology-kernel@0.1.4'] }, hooks)
// Only durable source fields are synthesized; package installation and post-migration launch are real.
const manifestPath = join(paths.profile, 'package.json')
const manifest = json(manifestPath)
const sources = {
  'dshmarket': 'https://github.com/aiko-dsh-plugins/dsh-market/releases/download/v1.37.0-aiko.3/market.tgz',
  'aiko-dsh-office': 'https://github.com/aiko-dsh-plugins/dsh-office/releases/download/v0.2.0/aiko-dsh-office-0.2.0.tgz',
  'aiko-dsh-ontology-kernel': 'https://github.com/aiko-dsh-plugins/dsh-ontology-kernel/releases/download/v0.1.2/aiko-dsh-ontology-kernel-0.1.2.tgz',
}
delete manifest.dependencies['aiko-dsh-market']
Object.assign(manifest.dependencies, sources)
manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.map(name => name === 'aiko-dsh-market' ? 'dshmarket' : name)
save(manifestPath, manifest)
const alias = join(paths.profile, 'node_modules/dshmarket')
mkdirSync(alias)
save(join(alias, 'package.json'), { name: 'dshmarket', version: '1.37.0-aiko.3', dsh: { bundle: { patch: './cordis.patch.yml' } } })
writeFileSync(join(alias, 'cordis.patch.yml'), '[]\n')
const sentinel = join(home, 'user-data-preservation.txt')
writeFileSync(sentinel, 'Existing user data must survive the plugin migration.\n')
const before = readFileSync(manifestPath, 'utf8')
await assert.rejects(manager.applyRelease(join(resources, 'seed'), '0.1.5-alpha.2', {
  ...hooks, healthCheck: async () => { throw new Error('injected staging health failure') },
}), /injected staging health failure/)
assert.equal(readFileSync(manifestPath, 'utf8'), before)
assert.equal(readFileSync(sentinel, 'utf8'), 'Existing user data must survive the plugin migration.\n')
let app, page
const logs = []
try {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ executablePath: join(bundle, 'Contents/MacOS/DSH Aiko Test'),
    args: [`--user-data-dir=${userData}`], env, timeout: 120000 })
  app.process().stderr.on('data', chunk => logs.push(chunk.toString()))
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    page = app.windows().find(window => window.url().startsWith('dsh-app://app/'))
    if (page) break
    await setTimeout(500)
  }
  assert.ok(page, `Migrated application did not start:\n${logs.join('')}`)
  assert.equal(await page.evaluate(() => window.dshDesktop.market.hostVersion()), '0.1.5-alpha.2')
  const installed = await page.evaluate(() => window.dshDesktop.market.list())
  assert.deepEqual(installed.map(plugin => plugin.spec), ['aiko-dsh-market@1.39.0', 'aiko-dsh-office@0.3.1', 'aiko-dsh-ontology-kernel@0.1.5'])
  assert.equal(readFileSync(sentinel, 'utf8'), 'Existing user data must survive the plugin migration.\n')
  assert.ok(!readFileSync(manifestPath, 'utf8').includes('github.com/aiko-dsh-plugins/'))
  assert.ok(!readFileSync(join(paths.profile, 'pnpm-lock.yaml'), 'utf8').includes('github.com/aiko-dsh-plugins/'))
  await page.screenshot({ path: join(output, 'migration.png') })
  save(join(output, 'migration.json'), { syntheticRetiredSourceRecords: true, nativeStartup: true,
    failedStagingPreservedInstallation: true, userDataPreserved: true, compatibilityBridge: true, installed })
} finally {
  writeFileSync(join(output, 'migration.log'), logs.join(''))
  if (app) await app.close()
}
