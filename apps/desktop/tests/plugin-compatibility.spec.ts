import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { assertPluginCompatibility } from '../src/plugin-compatibility.ts'
import { migrateRetiredPlugin } from '../src/retired-plugin-sources.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const plugins = [{ name: 'office', version: '1.0.0', spec: 'office@1.0.0' }, { name: 'kernel', version: '1.2.0', spec: 'kernel@1.2.0' }]
function fixture(compatibility: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-compat-'))
  roots.push(root)
  for (const plugin of plugins) {
    const directory = join(root, 'node_modules', plugin.name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ ...plugin, dsh: plugin.name === 'office' ? { compatibility } : {} }))
  }
  return root
}

it('accepts a declared host interval and installed plugin dependencies', () => {
  const root = fixture({ host: '>=1.0.0 <2.0.0', plugins: { kernel: '^1.0.0' } })
  expect(() => { assertPluginCompatibility(root, '1.5.0', plugins) }).not.toThrow()
})
it.each(['0.9.0', '2.0.0'])('rejects a host outside the declared interval: %s', (version) => {
  const root = fixture({ host: '>=1.0.0 <2.0.0' })
  expect(() => { assertPluginCompatibility(root, version, plugins) }).toThrow('requires Aiko DSH')
})
it.each([{}, { host:'garbage' }, { host:'*',plugins:[] }, { host:'*',plugins:{ kernel:42 } }, { host:'*',plugins:{ kernel:'^2.0.0' } }, { host:'*',plugins:{ missing:'*' } }])('rejects invalid or unsatisfied declarations: %j', (compatibility) => {
  const root = fixture(compatibility)
  expect(() => { assertPluginCompatibility(root, '1.0.0', plugins) }).toThrow()
})
it('allows legacy packages with no declaration and accepts exact prereleases', () => {
  expect(() => { assertPluginCompatibility(fixture(undefined), '1.0.0', plugins) }).not.toThrow()
  expect(() => { assertPluginCompatibility(fixture({ host:'0.1.5-alpha.2' }), '0.1.5-alpha.2', plugins) }).not.toThrow()
})
it('renames only the retired first-party market and preserves forks', () => {
  const old = { name:'dshmarket', version:'1.37.0-aiko.3', spec:'dshmarket@https://github.com/aiko-dsh-plugins/dsh-market/releases/download/v1.37.0-aiko.3/market.tgz' }
  expect(migrateRetiredPlugin(old).name).toBe('aiko-dsh-market')
  const fork = { ...old, spec: old.spec.replace('/aiko-dsh-plugins/', '/another-owner/') }
  expect(migrateRetiredPlugin(fork)).toBe(fork)
})
