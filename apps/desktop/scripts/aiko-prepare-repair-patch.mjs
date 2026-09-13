/** Assemble compiled desktop repair files for native repacking without distributing private sources. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { build } from 'tsdown'

const root = resolve(import.meta.dirname, '../../..')
const output = resolve(process.argv[2])
assert.notEqual(output, root)
mkdirSync(output, { recursive: true })
const modules = {
  'project-manager': ['createSeedMetadata', 'verifySeedIntegrity', 'DesktopProjectManager'],
  'core-package-set': ['readDesktopCorePackageSet', 'verifyDesktopCoreLockfile'],
  'seed-store': ['archivePnpmStore', 'extractPnpmStoreArchives', 'removePnpmProjectRegistrations'],
  'paths': ['resolveDesktopPaths'],
  'host-process': ['DesktopHostProcess'],
}
const entry = join(output, 'entry.mjs')
writeFileSync(entry, Object.entries(modules).map(([module, names]) =>
  `export {${names.join(',')}} from ${JSON.stringify(relative(output, join(root, 'apps/desktop/lib/types', `${module}.js`)).replaceAll('\\', '/'))};`,
).join('\n') + '\n')
await build({ entry: { 'build-tools': entry }, outDir: output, format: 'esm', platform: 'node', target: 'es2024',
  config: false, dts: false, clean: false, deps: { alwaysBundle: [/.*/], neverBundle: ['electron'] },
})
const scripts = {
  'repack.mjs': 'aiko-repack-macos-test.mjs',
  'migration-smoke.mjs': 'aiko-smoke-plugin-migration.mjs',
  'smoke.mjs': 'aiko-smoke-macos-test.mjs',
}
for (const [name, source] of Object.entries(scripts)) cpSync(join(import.meta.dirname, source), join(output, name))
const smoke = join(output, 'smoke.mjs')
writeFileSync(smoke, readFileSync(smoke, 'utf8').replaceAll('1.38.0', '1.39.0'))
const shellFiles = ['main.js', 'preload.cjs', 'preload-app.cjs']
for (const name of shellFiles) cpSync(join(root, 'apps/desktop/lib', name), join(output, name))
const files = ['build-tools.mjs', ...Object.keys(scripts), ...shellFiles]
writeFileSync(join(output, 'patch-manifest.json'), JSON.stringify({ schemaVersion: 1, files: files.map(name => ({
  name, sha256: createHash('sha256').update(readFileSync(join(output, name))).digest('hex'),
})) }, null, 2) + '\n')
console.log(`Archive only patch-manifest.json and its listed files from ${output}`)
