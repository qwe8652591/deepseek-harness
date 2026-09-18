/** Source hooks retain package identity when the fallback declarer is a workspace link. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'

it('resolves a linked fallback through the source map instead of the built export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-source-resolution-'))
  try {
    const workspace = join(root, 'workspace')
    const linked = join(root, 'node_modules', 'bundle')
    const profiles = join(root, 'profiles')
    const profile = join(profiles, 'test')
    await mkdir(join(workspace, 'node_modules', 'fixture-lib'), { recursive: true })
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await mkdir(profile, { recursive: true })
    await writeFile(join(workspace, 'package.json'), '{"type":"module"}')
    await writeFile(join(workspace, 'node_modules', 'fixture-lib', 'package.json'), '{"type":"module","exports":"./built.js"}')
    await writeFile(join(workspace, 'node_modules', 'fixture-lib', 'built.js'), 'export const value = "built"')
    await writeFile(join(workspace, 'source.ts'), 'export const value = "source"')
    await symlink(workspace, linked, process.platform === 'win32' ? 'junction' : 'dir')
    const tsconfig = join(root, 'tsconfig.json')
    await writeFile(tsconfig, JSON.stringify({ compilerOptions: { paths: { 'fixture-lib': ['./workspace/source.ts'] } } }))
    const script = join(root, 'entry.mjs')
    const generation = {
      profilesDir: profiles, profileDir: profile, localPackageNames: [],
      entries: [{ name: 'fixture-lib', version: '1.0.0', packageDir: join(linked, 'node_modules', 'fixture-lib'),
        declarer: join(linked, 'package.json'), scope: 'installation' }],
    }
    await writeFile(script, `
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { installProfileResolution } from ${JSON.stringify(new URL('../src/profile-resolution/resolver.ts', import.meta.url).href)}
const registration = installProfileResolution(${JSON.stringify(generation)})
try {
  const addon = createRequire(${JSON.stringify(import.meta.url)})('node-addon-require-builtin')
  const loader = addon.requireBuiltin('internal/modules/esm/loader').getOrInitializeCascadedLoader()
  const result = await loader.import('fixture-lib', pathToFileURL(${JSON.stringify(join(profile, 'entry.mjs'))}).href, {})
  console.log(result.value)
} finally { registration.dispose() }
`)
    const result = await execa(process.execPath, ['--import', import.meta.resolve('tsx/esm'), script], {
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
      env: { TSX_TSCONFIG_PATH: tsconfig }, timeout: 25_000, killSignal: 'SIGKILL',
    })
    expect(result.stdout).toBe('source')
    expect(result.stderr).toBe('')
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
