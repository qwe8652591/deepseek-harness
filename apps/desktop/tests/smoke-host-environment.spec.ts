import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { smokeHostEnvironment, smokeInstallSpec } from '../scripts/smoke-runtime.ts'

const desktopVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

it('gives the smoke Host the client version the packaged app passes, defaulting to the Desktop version', () => {
  // The desktop profile enables product telemetry, whose required serviceVersion reads DSH_CLIENT_VERSION.
  expect(smokeHostEnvironment({}, '/smoke').DSH_CLIENT_VERSION).toBe(desktopVersion)
  expect(smokeHostEnvironment({ DSH_CLIENT_VERSION: '9.9.9' }, '/smoke').DSH_CLIENT_VERSION).toBe('9.9.9')
})

it('isolates the smoke Host in its home and drops package-manager variables', () => {
  const environment = smokeHostEnvironment({ npm_config_registry: 'https://example.invalid', KEEP: '1' }, '/smoke')
  expect(environment).toMatchObject({ DSH_HOME: '/smoke', HOME: '/smoke', USERPROFILE: '/smoke', KEEP: '1' })
  expect(environment.npm_config_registry).toBeUndefined()
})

it('installs the smoke plugin from a package file in a whole-product build, which accepts only .tgz files', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { readTarballManifest } = await import('../../../packages/boot/plugin-manager/src/tarball-manifest.ts')
  const home = mkdtempSync(join(tmpdir(), 'smoke-install-spec-'))
  try {
    const plugin = join(home, 'plugin')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(plugin)
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'smoke-plugin', version: '1.0.0' }))
    writeFileSync(join(plugin, 'index.js'), 'export function apply() {}\n')
    expect(await smokeInstallSpec(plugin, home, false)).toBe(plugin)
    const spec = await smokeInstallSpec(plugin, home, true)
    expect(spec.endsWith('.tgz')).toBe(true)
    expect(await readTarballManifest(spec)).toMatchObject({ name: 'smoke-plugin', version: '1.0.0' })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
