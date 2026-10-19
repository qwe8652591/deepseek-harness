import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { smokeHostEnvironment } from '../scripts/smoke-runtime.ts'

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
