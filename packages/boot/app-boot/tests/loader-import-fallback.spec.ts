/** Bare plugin resolution when an embedding host cannot expose Node's private ESM loader. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { expect, it } from 'vitest'

it('resolves a bare plugin from the config base URL without the private ESM loader', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-loader-fallback-'))
  const packageRoot = join(root, 'node_modules', '@fixture', 'plugin')
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@fixture/plugin',
    type: 'module',
    exports: './index.js',
  }))
  writeFileSync(join(packageRoot, 'index.js'), 'export const source = "profile"\n')

  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(join(root, 'cordis.yml')).href
  await ctx.plugin(Loader)
  ctx.loader.internal = undefined

  try {
    await expect(ctx.loader.import('@fixture/plugin')).resolves.toMatchObject({ source: 'profile' })
  } finally {
    await ctx.fiber.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})
