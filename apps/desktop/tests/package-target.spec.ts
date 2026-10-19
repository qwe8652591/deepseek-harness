import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  desktopElectronBuilderArguments,
  desktopElectronBuilderEnvironment,
  parseDesktopPackageInvocation,
  resolveDesktopPackageTarget,
  withoutDesktopUploadCredentials,
  withoutWindowsSigningEnvironment,
  writeReleaseRecord,
} from '../scripts/package-target.ts'

describe('desktop package target', () => {
  it('selects matching runtime and electron-builder architectures', () => {
    expect(resolveDesktopPackageTarget('mac-arm64', 'darwin', 'arm64')).toMatchObject({
      platform: 'darwin', arch: 'arm64', builderPlatform: '--mac', builderArch: '--arm64',
    })
    expect(resolveDesktopPackageTarget('mac-x64', 'darwin', 'x64')).toMatchObject({
      platform: 'darwin', arch: 'x64', builderPlatform: '--mac', builderArch: '--x64',
    })
    expect(resolveDesktopPackageTarget('win-x64', 'win32', 'x64')).toMatchObject({
      platform: 'win32', arch: 'x64', builderPlatform: '--win', builderArch: '--x64',
    })
  })

  it('allows an Apple Silicon host to build the Intel target through Rosetta', () => {
    expect(resolveDesktopPackageTarget('mac-x64', 'darwin', 'arm64').arch).toBe('x64')
  })

  it('rejects unsupported targets and hosts before building', () => {
    expect(() => resolveDesktopPackageTarget('linux-x64', 'linux', 'x64')).toThrow(/unsupported target/u)
    expect(() => resolveDesktopPackageTarget('win-x64', 'darwin', 'arm64')).toThrow(/Windows x64/u)
    expect(() => resolveDesktopPackageTarget('mac-arm64', 'darwin', 'x64')).toThrow(/Apple Silicon/u)
    expect(() => resolveDesktopPackageTarget('mac-arm64', 'linux', 'arm64')).toThrow(/macOS/u)
    expect(() => resolveDesktopPackageTarget('mac-x64', 'darwin', 'ppc64')).toThrow(/Rosetta/u)
  })

  it('parses installer and unpacked-directory invocations', () => {
    expect(parseDesktopPackageInvocation(['mac-arm64'], 'darwin', 'arm64').directory).toBe(false)
    expect(parseDesktopPackageInvocation(['mac-arm64', '--dir'], 'darwin', 'arm64').directory).toBe(true)
    expect(parseDesktopPackageInvocation([], 'darwin', 'arm64').target.name).toBe('mac-arm64')
    expect(parseDesktopPackageInvocation(['--prepare-only'], 'darwin', 'arm64').prepareOnly).toBe(true)
    expect(parseDesktopPackageInvocation(['--check'], 'darwin', 'arm64').check).toBe(true)
    expect(parseDesktopPackageInvocation(['win-x64', '--check', '--unsigned'], 'win32', 'x64')).toMatchObject({ check: true, unsigned: true })
    expect(() => parseDesktopPackageInvocation(['mac-arm64', 'mac-x64'], 'darwin', 'arm64'))
      .toThrow(/at most one target/u)
  })

  it('parses a build version, including the separator a pnpm run script forwards', () => {
    expect(parseDesktopPackageInvocation(['mac-arm64'], 'darwin', 'arm64').requestedBuildVersion).toBeUndefined()
    expect(parseDesktopPackageInvocation(['mac-arm64', '--build-version', '0.1.6-alpha.2.20260921.1'], 'darwin', 'arm64')
      .requestedBuildVersion).toBe('0.1.6-alpha.2.20260921.1')
    expect(parseDesktopPackageInvocation(['mac-arm64', '--build-version', 'auto'], 'darwin', 'arm64')
      .requestedBuildVersion).toBe('auto')
    // A run script's preset arguments come first, so pnpm forwards the separator after the target.
    expect(parseDesktopPackageInvocation(['mac-arm64', '--', '--build-version', 'auto'], 'darwin', 'arm64'))
      .toMatchObject({ requestedBuildVersion: 'auto', target: { name: 'mac-arm64' } })
    expect(parseDesktopPackageInvocation(['--', '--check'], 'darwin', 'arm64').check).toBe(true)
    expect(() => parseDesktopPackageInvocation(['mac-arm64', '--build-version', '  '], 'darwin', 'arm64'))
      .toThrow(/--build-version requires a value/u)
  })

  it('keeps electron-builder publishing disabled for the separate validated upload', () => {
    const target = resolveDesktopPackageTarget('mac-arm64', 'darwin', 'arm64')
    expect(desktopElectronBuilderArguments(target, false)).toEqual([
      'exec',
      'electron-builder',
      '--config',
      'electron-builder.config.mjs',
      '--mac',
      '--arm64',
      '--publish',
      'never',
    ])
    expect(desktopElectronBuilderArguments(target, true)).toContain('--dir')
  })

  it('accepts unsigned Windows artifacts and rejects other targets or preparation-only use', () => {
    expect(parseDesktopPackageInvocation(['win-x64', '--unsigned'], 'win32', 'x64').unsigned).toBe(true)
    expect(parseDesktopPackageInvocation(['win-x64'], 'win32', 'x64').unsigned).toBe(false)
    expect(parseDesktopPackageInvocation(['--unsigned', '--dir'], 'win32', 'x64')).toMatchObject({
      unsigned: true, directory: true,
    })
    expect(() => parseDesktopPackageInvocation(['mac-arm64', '--unsigned'], 'darwin', 'arm64'))
      .toThrow(/requires win-x64/u)
    expect(() => parseDesktopPackageInvocation(['--unsigned', '--prepare-only'], 'win32', 'x64'))
      .toThrow(/cannot use --prepare-only/u)
  })

  it('removes ambient certificate inputs for unsigned builds and overrides an inherited signing mode', () => {
    const environment = {
      DSH_DESKTOP_APP_ID: 'com.example.desktop',
      DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'token-secret',
      CSC_LINK: 'private.pfx',
      CSC_KEY_PASSWORD: 'secret',
      WIN_CSC_LINK: 'windows.pfx',
      CSC_IDENTITY_AUTO_DISCOVERY: 'true',
      DSH_DESKTOP_UNSIGNED: '1',
    }
    expect(desktopElectronBuilderEnvironment(environment, true)).toEqual({
      DSH_DESKTOP_APP_ID: 'com.example.desktop',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      DSH_DESKTOP_UNSIGNED: '1',
    })
    expect(desktopElectronBuilderEnvironment(environment, false)).toEqual({ ...environment, DSH_DESKTOP_UNSIGNED: '0' })
  })

  it.each([false, true])('pins the Windows archive filter for the NSIS decoder (unsigned: %s)', (unsigned) => {
    expect(desktopElectronBuilderEnvironment({
      DSH_DESKTOP_TARGET_PLATFORM: 'win32', ELECTRON_BUILDER_7Z_FILTER: 'ARM64',
    }, unsigned).ELECTRON_BUILDER_7Z_FILTER).toBe('BCJ')
    expect(desktopElectronBuilderEnvironment({
      DSH_DESKTOP_TARGET_PLATFORM: 'darwin', ELECTRON_BUILDER_7Z_FILTER: 'ARM',
    }, unsigned).ELECTRON_BUILDER_7Z_FILTER).toBe('ARM')
  })

  it('keeps Windows signing fields out of build and runtime preparation subprocesses', () => {
    expect(withoutWindowsSigningEnvironment({
      DSH_DESKTOP_WINDOWS_CER_FILE: 'C:\\release\\server.cer',
      DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'token-secret',
      DSH_DESKTOP_WINDOWS_KEY_CONTAINER: 'container',
      DSH_DESKTOP_WINDOWS_SIGNTOOL: 'C:\\tools\\signtool.exe',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
    })).toEqual({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' })
  })

  it('keeps COS credentials out of every packaging subprocess', () => {
    expect(withoutDesktopUploadCredentials({
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
      DOWNLOAD_TEST_COS_BUCKET: 'test-download-bucket',
      DOWNLOAD_TEST_COS_SECRET_ID: 'test-id',
      DOWNLOAD_TEST_COS_SECRET_KEY: 'test-key',
      DOWNLOAD_PROD_COS_BUCKET: 'production-download-bucket',
      DOWNLOAD_PROD_COS_SECRET_ID: 'production-id',
      DOWNLOAD_PROD_COS_SECRET_KEY: 'production-key',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
    })).toEqual({
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
      DOWNLOAD_TEST_COS_BUCKET: 'test-download-bucket',
      DOWNLOAD_PROD_COS_BUCKET: 'production-download-bucket',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
    })
  })

  it('records whether a product build is signed so only self-hosted feeds publish unsigned installers', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-release-record-'))
    try {
      const applications = ['workbench', 'workbench-market', 'workbench-md-editor', 'workbench-visio', 'workbench-drawio', 'workbench-ppt', 'workbench-image-generation', 'workbench-templates']
      writeFileSync(join(root, 'plugin.tgz'), 'archive')
      const integrity = 'sha512-' + createHash('sha512').update('archive').digest('base64')
      const productFile = join(root, 'blue.json')
      writeFileSync(productFile, JSON.stringify({ schemaVersion: 1, profile: 'blue', appId: 'com.blue.dsh', productName: '工作台',
        releases: 'https://downloads.example.test/dsh/releases/', channel: 'stable',
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-agent-team-profile', ...applications, 'workbench-theme-blue'],
        plugins: [...applications, 'workbench-theme-blue', 'workbench-plugin-catalog'].map(name => ({ name, version: '1.0.0', file: 'plugin.tgz', integrity })),
        artwork: { version: 1, theme: 'workbench-theme-blue', productName: '工作台', image: 'data:image/png;base64,YQ==' },
      }))
      const environment = { DSH_DESKTOP_PRODUCT: productFile, DSH_DESKTOP_BUILD_VERSION: '0.2.0',
        DSH_DESKTOP_BUILD_COMMIT: 'a'.repeat(40), DSH_DESKTOP_BUILD_DIRTY: '0' }
      writeReleaseRecord(resolveDesktopPackageTarget('win-x64', 'win32', 'x64'), environment, root, false)
      expect(JSON.parse(readFileSync(join(root, 'win-x64-release.json'), 'utf8'))).toMatchObject({
        target: 'win-x64', version: '0.2.0', signed: false, dirty: false, channel: 'blue-stable-win-x64',
        publicUrl: 'https://downloads.example.test/dsh/releases/blue-stable/',
      })
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
