import { defineConfig } from 'tsdown'

/**
 * The dsh package ships the `bin` referenced by package.json plus the stable
 * profile-boot library entry used by in-process application shells. The root
 * tsdown builds only `lib/types/index.js`, so this override names both emitted
 * artifacts explicitly.
 * Declarations come from `tsc -b` (dts: false), matching every package.
 */
export default defineConfig({
  entry: {
    bin: 'lib/types/bin.js',
    'profile-boot': 'lib/types/profile-boot.js',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
