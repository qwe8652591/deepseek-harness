/** Validate the assembled application, including native Office conversion outside ASAR. */
import { basename, dirname, join, resolve } from 'node:path'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'
import { readDesktopProduct } from './desktop-product.mjs'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
if (values.unsigned && !windows) throw new Error('desktop smoke: unsigned artifacts require Windows')
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts
const productName = readDesktopProduct(process.env)?.productName ?? 'DeepSeek Harness'
const application = windows ? join(artifacts, 'win-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', productName + '.app', 'Contents')
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
// Native Windows libraries resolve junctions and reject very long checkout paths; qualify at an installed-length path.
const temporary = windows ? await mkdtemp(join(tmpdir(), 'dsh-smoke-')) : undefined
const launch = temporary === undefined ? application : join(temporary, 'app')
try {
  if (temporary !== undefined) await cp(application, launch, { recursive: true })
  const resources = join(launch, windows ? 'resources' : 'Resources')
  const executable = windows ? join(launch, productName + '.exe') : join(launch, 'MacOS', productName)
  await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
} finally {
  if (temporary !== undefined) {
    if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('dsh-smoke-')) {
      throw new Error('desktop smoke: cleanup path escaped the private temporary directory')
    }
    await rm(temporary, { recursive: true, force: true })
  }
}
