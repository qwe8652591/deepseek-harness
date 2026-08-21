import { defineConfig } from 'tsdown'

export default defineConfig(({ env }) => env?.DSH_BUILD_FACE === 'client'
  ? { entry: '' }
  : {
      name: '@deepseek-ai/dsh-desktop',
      entry: { main: 'lib/types/main.js', runtime: 'lib/types/runtime.js' },
      outDir: 'lib',
      format: 'esm',
      fixedExtension: false,
      platform: 'node',
      target: 'es2024',
      external: ['electron'],
      dts: false,
      clean: false,
    })
