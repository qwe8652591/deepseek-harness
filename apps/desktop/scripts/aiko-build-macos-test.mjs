/** Build the checked-out Aiko client as an isolated, ad-hoc-signed Mac test app. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.platform, 'darwin', 'Mac test packages must be built on a native Mac runner')
assert.ok(['arm64', 'x64'].includes(process.arch))
const root = resolve(import.meta.dirname, '../../..')
const appRoot = join(root, 'apps/desktop')
const require = createRequire(join(appRoot, 'package.json'))
const { load, dump } = require('js-yaml')
const target = `mac-${process.arch}`
const paths = (await import(pathToFileURL(join(appRoot, 'scripts/desktop-build-paths.mjs')))).desktopTargetBuildPaths(target)
const output = join(paths.root, 'test-artifacts')
const seed = join(paths.root, 'test-seed')
const store = join(seed, 'store')
const buildEnv = { ...process.env, DSH_DESKTOP_TARGET_PLATFORM: 'darwin', DSH_DESKTOP_TARGET_ARCH: process.arch }
const run = (command, args, cwd = root, env = buildEnv) => new Promise((done, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  child.once('error', reject)
  child.once('close', (code, signal) => code === 0 ? done() : reject(new Error(`${command} ${args.join(' ')} exited ${code ?? signal}`)))
})
const pnpm = (...args) => run('pnpm', args)
const json = path => JSON.parse(readFileSync(path, 'utf8'))

const commit = cwd => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
const preparation = { format: 3, source: commit(root), architecture: process.arch }
const preparedPath = join(paths.root, 'prepared.json')
if (existsSync(preparedPath)) {
  assert.deepEqual(json(preparedPath), preparation, 'Cached core artifacts do not match the selected source')
} else {
  await pnpm('run', 'build:official')
  await pnpm('run', 'build:desktop')
  await pnpm('run', 'release:pack', '--family', 'dsh', '--out', paths.packedDsh, '--concurrency', '4')
  await pnpm('--dir', 'apps/desktop-host', 'pack', '--pack-destination', paths.packedDsh)
  await pnpm('run', 'release:pack', '--family', 'vendor', '--out', paths.packedVendor, '--concurrency', '4')
  mkdirSync(paths.packedLandlock, { recursive: true })
  await pnpm('--dir', 'native/system', 'run', 'build:ts')
  await pnpm('--dir', 'native/system/packages/entry', 'pack', '--pack-destination', paths.packedLandlock)
  await pnpm('--dir', 'apps/desktop', 'run', 'prepare:runtime')
  await pnpm('--dir', 'apps/desktop', 'run', 'prepare:packages')
  writeFileSync(preparedPath, JSON.stringify(preparation, null, 2) + '\n')
}

const desktopModule = name => import(pathToFileURL(join(appRoot, 'lib/types', `${name}.js`)))
const { createSeedMetadata, verifySeedIntegrity } = await desktopModule('project-manager')
const { DESKTOP_HOST_PROTOCOL_VERSION } = await desktopModule('host-protocol')
const { readDesktopCorePackageSet, verifyDesktopCoreLockfile } = await desktopModule('core-package-set')
const { archivePnpmStore, removePnpmProjectRegistrations } = await desktopModule('seed-store')
const version = json(join(appRoot, 'package.json')).version
assert.equal(version, json(join(root, 'package.json')).version)
const runtime = json(join(paths.runtime, 'versions.json'))
const release = { schemaVersion: 1, version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, nodeVersion: runtime.node, pnpmVersion: runtime.pnpm }
rmSync(seed, { recursive: true, force: true })
cpSync(paths.packageSet, seed, { recursive: true })
mkdirSync(store, { recursive: true })
const plugins = json(join(appRoot, 'preinstalled-plugins.json'))
createSeedMetadata(seed, release, plugins)
const node = join(paths.runtime, 'node/node')
const embeddedPnpm = join(paths.runtime, 'pnpm/bin/pnpm.mjs')
const seedEnv = {
  ...Object.fromEntries(Object.entries(buildEnv).filter(([name]) => !/^(?:DSH_DESKTOP_|npm_|pnpm_|corepack_)/i.test(name))),
  PATH: `${dirname(node)}:${process.env.PATH}`,
  NPM_CONFIG_USERCONFIG: join(paths.root, 'test.npmrc'),
}
writeFileSync(seedEnv.NPM_CONFIG_USERCONFIG, '')
const install = (offline = false, lockfileOnly = false) => run(node, [embeddedPnpm,
  `--config.store-dir=${store}`, '--config.enable-global-virtual-store=false',
  '--config.registry=https://registry.npmjs.org/', 'install', '--prod',
  ...(lockfileOnly ? ['--lockfile-only'] : []),
  ...(offline ? ['--offline', '--frozen-lockfile', '--trust-lockfile'] : []),
], seed, seedEnv)
await install(false, true)

// Direct release tarballs need integrity in the lockfile to resolve without an HTTP HEAD.
const lockPath = join(seed, 'pnpm-lock.yaml')
const lock = load(readFileSync(lockPath, 'utf8'))
for (const source of Object.values(plugins).filter(source => source.startsWith('https://'))) {
  const response = await fetch(source)
  assert.equal(response.status, 200, `Preinstalled release download failed: ${source}`)
  const body = Buffer.from(await response.arrayBuffer())
  const records = Object.values(lock.packages).filter(record => record.resolution?.tarball === source)
  assert.equal(records.length, 1)
  const integrity = `sha512-${createHash('sha512').update(body).digest('base64')}`
  if (records[0].resolution.integrity) assert.equal(records[0].resolution.integrity, integrity)
  records[0].resolution.integrity = integrity
}
writeFileSync(lockPath, dump(lock, { lineWidth: -1, noRefs: true }))
verifyDesktopCoreLockfile(readFileSync(lockPath, 'utf8'), readDesktopCorePackageSet(seed, version))
// Populate pnpm's integrity-keyed entries only after the release digests are fixed.
await install()
rmSync(join(seed, 'node_modules'), { recursive: true, force: true })
await install(true)
rmSync(join(seed, 'node_modules'), { recursive: true, force: true })
removePnpmProjectRegistrations(store)
archivePnpmStore(seed, store)
const files = []
function inventory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) inventory(path)
    else {
      assert.ok(entry.isFile(), `Unexpected seed entry: ${path}`)
      const body = readFileSync(path)
      files.push({ path: relative(seed, path), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') })
    }
  }
}
inventory(seed)
writeFileSync(join(seed, 'integrity.json'), JSON.stringify({ schemaVersion: 2, files }, null, 2) + '\n')
verifySeedIntegrity(seed)

// Only the test entry owns a separate home; the official main and release configuration stay intact.
writeFileSync(join(appRoot, 'lib/macos-test-main.js'), `import { app } from 'electron'\nimport { join } from 'node:path'\napp.setName('DSH Aiko Test')\napp.setPath('userData', app.commandLine.getSwitchValue('user-data-dir') || join(app.getPath('appData'), 'DSH Aiko Test'))\nprocess.env.DSH_HOME = join(app.getPath('userData'), 'harness')\nawait import('./main.js')\n`)
const configPath = join(paths.root, 'electron-builder-test.json')
writeFileSync(configPath, JSON.stringify({
  appId: 'com.aiko.dsh.test', productName: 'DSH Aiko Test',
  artifactName: 'dsh-aiko-test-${version}-${arch}.${ext}',
  directories: { output }, asar: true,
  files: ['lib/*.js', 'lib/*.cjs', 'renderer/**/*', 'package.json'],
  extraMetadata: { main: 'lib/macos-test-main.js' },
  extraResources: [{ from: paths.runtime, to: 'runtime' }, { from: seed, to: 'seed' }],
  mac: { identity: '-', hardenedRuntime: false, notarize: false, target: ['zip'], category: 'public.app-category.productivity' },
  publish: null,
}, null, 2) + '\n')
await run('pnpm', ['exec', 'electron-builder', '--config', configPath, '--mac', `--${process.arch}`, '--dir', '--publish', 'never'], appRoot,
  { ...buildEnv, CSC_IDENTITY_AUTO_DISCOVERY: 'false' })
const bundle = join(output, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'DSH Aiko Test.app')
assert.ok(existsSync(bundle), 'electron-builder did not emit the test application')
assert.ok(!existsSync(join(bundle, 'Contents/Resources/app-update.yml')), 'Test applications must not auto-update')
await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
const archive = join(output, `dsh-aiko-test-${version}-${process.arch}.zip`)
await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, `${archive}.pending`])
const extracted = mkdtempSync(join(output, 'verify archive '))
try {
  await run('/usr/bin/ditto', ['-x', '-k', `${archive}.pending`, extracted])
  const application = join(extracted, 'DSH Aiko Test.app')
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', application])
  await run(process.execPath, [resolve(import.meta.dirname, 'aiko-smoke-macos-test.mjs'), application, output])
} finally {
  rmSync(extracted, { recursive: true, force: true })
}
renameSync(`${archive}.pending`, archive)
writeFileSync(join(output, 'SHA256SUMS'), `${createHash('sha256').update(readFileSync(archive)).digest('hex')}  ${archive.split('/').at(-1)}\n`)
writeFileSync(join(output, 'source.json'), JSON.stringify(preparation, null, 2) + '\n')
console.log(`Validated Mac test archive: ${archive}`)
