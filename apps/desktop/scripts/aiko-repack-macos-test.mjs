/** Update the desktop shell and npm seed of a digest-pinned, previously validated Mac test app. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractAll, createPackage, getRawHeader } from '@electron/asar'

assert.equal(process.platform, 'darwin')
assert.equal(process.arch, 'arm64')
const [base, patch, output] = process.argv.slice(2).map(path => resolve(path))
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
assert.equal(hash(base), '5100d89f95c264bed256d2a1aa33bb9ba2d862c8dd891c2ee35ae32e74fd32b6')
mkdirSync(output, { recursive: true })
const work = mkdtempSync(join(output, 'repack-'))
const remove = path => {
  assert.ok(resolve(path).startsWith(work + '/'), 'Temporary cleanup escaped the repack directory')
  rmSync(path, { recursive: true, force: true })
}
const run = (command, args, cwd = work, env = process.env) => new Promise((done, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  child.once('error', reject)
  child.once('close', code => code === 0 ? done() : reject(new Error(`${command} exited ${code}`)))
})
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const tools = await import(pathToFileURL(join(patch, 'build-tools.mjs')))
await run('/usr/bin/ditto', ['-x', '-k', base, work])
const bundle = join(work, 'DSH Aiko Test.app')
await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
const resources = join(bundle, 'Contents/Resources')
const seed = join(resources, 'seed')
tools.verifySeedIntegrity(seed)
const coreSet = json(join(seed, 'desktop-packages.json'))
const oldRelease = json(join(seed, 'desktop-release.json'))
const originalSeed = join(work, 'original-seed')
cpSync(seed, originalSeed, { recursive: true })
const store = join(seed, 'store')
tools.extractPnpmStoreArchives(seed, store)
remove(join(seed, 'integrity.json'))
// Resolve the new release seed from its manifests; the user's active lockfile is never touched here.
remove(join(seed, 'pnpm-lock.yaml'))
tools.createSeedMetadata(seed, oldRelease, { 'aiko-dsh-market': '1.39.0' })
const runtime = { node: join(resources, 'runtime/node/node'), pnpm: join(resources, 'runtime/pnpm/bin/pnpm.mjs') }
const npmrc = join(work, 'npmrc')
writeFileSync(npmrc, '')
const env = { ...process.env, NPM_CONFIG_USERCONFIG: npmrc, PATH: `${dirname(runtime.node)}:${process.env.PATH}` }
const install = offline => run(runtime.node, [runtime.pnpm, `--config.store-dir=${store}`,
  '--config.enable-global-virtual-store=false', '--config.registry=https://registry.npmjs.org/',
  'install', '--prod', ...(offline ? ['--offline', '--frozen-lockfile', '--trust-lockfile'] : ['--no-frozen-lockfile']),
], seed, env)
await install(false)
remove(join(seed, 'node_modules'))
await install(true)
remove(join(seed, 'node_modules'))
tools.verifyDesktopCoreLockfile(readFileSync(join(seed, 'pnpm-lock.yaml'), 'utf8'), tools.readDesktopCorePackageSet(seed, oldRelease.version))
assert.deepEqual(json(join(seed, 'desktop-packages.json')), coreSet)
tools.removePnpmProjectRegistrations(store)
tools.archivePnpmStore(seed, store)
const files = []
function inventory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) inventory(path)
    else { assert.ok(entry.isFile()); files.push({ path: relative(seed, path), bytes: readFileSync(path).length, sha256: hash(path) }) }
  }
}
inventory(seed)
writeFileSync(join(seed, 'integrity.json'), JSON.stringify({ schemaVersion: 2, files }, null, 2) + '\n')
tools.verifySeedIntegrity(seed)
const asarPath = join(resources, 'app.asar')
assert.ok(!existsSync(asarPath + '.unpacked'), 'This baseline must not contain external ASAR files')
const source = join(work, 'app-source')
extractAll(asarPath, source)
const changed = ['main.js', 'preload.cjs', 'preload-app.cjs']
for (const name of changed) cpSync(join(patch, name), join(source, 'lib', name))
await createPackage(source, asarPath)
const plist = join(bundle, 'Contents/Info.plist')
const headerHash = createHash('sha256').update(getRawHeader(asarPath).headerString).digest('hex')
await run('/usr/libexec/PlistBuddy', ['-c', `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${headerHash}`, plist])
await run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleVersion 20260913.2', plist])
// Only the outer bundle's resources changed; preserve the verified native binaries' signatures.
await run('/usr/bin/codesign', ['--force', '--sign', '-', bundle])
await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
assert.ok(!existsSync(join(resources, 'app-update.yml')))
await run(process.execPath, [join(patch, 'smoke.mjs'), bundle, output])
await run(process.execPath, [join(patch, 'migration-smoke.mjs'), bundle, originalSeed, output])
const archive = join(output, 'dsh-aiko-test-0.1.5-alpha.2-npm-repair-arm64.zip')
await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, archive])
const verify = join(work, 'verify-zip')
await run('/usr/bin/ditto', ['-x', '-k', archive, verify])
await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', join(verify, 'DSH Aiko Test.app')])
writeFileSync(join(output, 'SHA256SUMS'), `${hash(archive)}  ${archive.split('/').at(-1)}\n`)
writeFileSync(join(output, 'repack.json'), JSON.stringify({ baseSha256: hash(base), architecture: process.arch,
  appVersion: oldRelease.version, build: '20260913.2', corePackagesUnchanged: true,
  changedShellFiles: Object.fromEntries(changed.map(name => [name, hash(join(patch, name))])),
  market: 'aiko-dsh-market@1.39.0', signature: 'ad-hoc', notarized: false,
  archiveSha256: hash(archive), offlineFirstLaunch: true, migration: json(join(output, 'migration.json')),
}, null, 2) + '\n')
console.log(`Validated Apple Silicon repair: ${archive}`)
