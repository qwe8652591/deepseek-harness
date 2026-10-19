/** Materialize published Workbench plugins against this workspace's exact Desktop runtime. */
import { execFileSync, spawn } from 'node:child_process'
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '../../..')
if (!process.env.npm_config_user_agent?.startsWith('pnpm/10.34.5 ')) throw new Error('Prepare the linked plugin graph with corepack pnpm@10.34.5 --dir apps/desktop run prepare:workbench')
const { values } = parseArgs({ options: { 'source-runtime': { type: 'string' }, output: { type: 'string' } } })
const source = values['source-runtime'], output = values.output
if (!source || !output || !isAbsolute(source) || !isAbsolute(output) || source === output) throw new Error('Provide distinct absolute --source-runtime and --output directories')
const existing: { dependencies: Record<string, string> } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
const packages = ['workbench', 'workbench-tender', '@workbench/dsh-knowledge', 'workbench-code', 'workbench-theme-orange', 'workbench-theme-blue', 'workbench-market', 'workbench-plugin-catalog']
// Retain an explicitly supplied legacy resource package without requiring it for platform services.
if (existing.dependencies['workbench-kit']) packages.push('workbench-kit')
const dependencies: Record<string, string> = {}
for (const name of packages) {
  const spec = existing.dependencies[name]
  if (!spec?.startsWith('file:') || !spec.endsWith('.tgz')) throw new Error('Expected a published local archive: ' + name)
  await realpath(spec.slice(5))
  dependencies[name] = spec
}
const files = execFileSync('git', ['ls-files', 'packages/**/package.json', 'vendor/**/package.json'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
const overrides: Record<string, string> = {}
// The market consumes the directory archive prepared by the same deployment.
overrides['workbench-plugin-catalog'] = dependencies['workbench-plugin-catalog']!
for (const file of files) {
  if (!/^(packages\/[^/]+\/[^/]+|vendor\/[^/]+)\/package.json$/.test(file.trim())) continue
  const path = join(root, file.trim())
  const manifest: { name?: string } = JSON.parse(await readFile(path, 'utf8'))
  if (manifest.name?.startsWith('@deepseek-ai/')) overrides[manifest.name] = 'link:' + dirname(path).replaceAll('\\', '/')
}
const frontend = createRequire(join(root, 'apps/web-frontend/package.json'))
for (const name of ['react', 'react-dom', 'zustand', 'immer']) {
  overrides[name] = 'link:' + dirname(frontend.resolve(name + '/package.json')).replaceAll('\\', '/')
}
for (const name of packages) {
  const archive = dependencies[name]
  if (!archive) throw new Error('Missing prepared plugin archive: ' + name)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive.slice(5), 'package/package.json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) as {
    peerDependencies?: Record<string, string>
  }
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    const target = overrides[peer]
    if (target !== undefined) dependencies[peer] = target
  }
}
await mkdir(output, { recursive: true })
await writeFile(join(output, 'package.json'), JSON.stringify({ name: 'workbench-desktop-development-plugins', private: true, type: 'module', packageManager: 'pnpm@10.34.5', dependencies }, null, 2) + '\n')
await writeFile(join(output, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\noverrides:\n' + Object.entries(overrides).map(([name, path]) => `  ${JSON.stringify(name)}: ${JSON.stringify(path)}`).join('\n') + '\n')
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run through pnpm run prepare:workbench')
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, [pnpm, 'install', '--ignore-scripts'], { cwd: output, stdio: 'inherit', windowsHide: true })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error('Plugin installation exited ' + String(code))))
})
console.log('Prepared desktop plugin runtime: ' + output)
