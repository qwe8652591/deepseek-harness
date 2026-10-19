import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ sessionData: '', cleared: [] as string[] }))
vi.mock('electron', () => {
  const fake = (name: string) => ({
    setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {}, setDevicePermissionHandler: () => {},
    setDisplayMediaRequestHandler: () => {}, on: () => {}, webRequest: { onBeforeRequest: () => {} },
    clearStorageData: async () => { electron.cleared.push(name) }, clearCache: async () => {},
  })
  return { app: { getPath: () => electron.sessionData }, session: { fromPartition: fake } }
})
const { DesktopBrowserGuests } = await import('../src/browser-guests.ts')
const owner = {} as Parameters<InstanceType<typeof DesktopBrowserGuests>['acquire']>[0]

beforeEach(async () => {
  electron.sessionData = await mkdtemp(join(tmpdir(), 'dsh-guests-'))
  electron.cleared = []
})
afterEach(async () => { await rm(electron.sessionData, { recursive: true, force: true }) })

describe('DesktopBrowserGuests storage', () => {
  it('keeps one persistent partition per account and workspace, and a temporary one without an account', () => {
    const alice = 'a'.repeat(32), bob = 'b'.repeat(32)
    const first = new DesktopBrowserGuests(() => undefined, alice).acquire(owner, 'workbench-apps').partition
    expect(first).toMatch(/^persist:dsh-browser-a{32}-[a-f0-9]{16}$/)
    expect(new DesktopBrowserGuests(() => undefined, alice).acquire(owner, 'workbench-apps').partition).toBe(first)
    expect(new DesktopBrowserGuests(() => undefined, alice).acquire(owner, 'session').partition).not.toBe(first)
    expect(new DesktopBrowserGuests(() => undefined, bob).acquire(owner, 'workbench-apps').partition).not.toBe(first)
    expect(new DesktopBrowserGuests(() => undefined).acquire(owner, 'workbench-apps').partition).toMatch(/^dsh-sidebar-browser-/)
    expect(() => new DesktopBrowserGuests(() => undefined, '../x')).toThrow(/account scope/)
  })

  it('sign-out erases this account partitions from earlier runs too, and leaves other accounts alone', async () => {
    const alice = 'a'.repeat(32)
    await mkdir(join(electron.sessionData, 'Partitions', `dsh-browser-${alice}-0123456789abcdef`), { recursive: true })
    await mkdir(join(electron.sessionData, 'Partitions', `dsh-browser-${'b'.repeat(32)}-0123456789abcdef`), { recursive: true })
    const guests = new DesktopBrowserGuests(() => undefined, alice)
    const current = guests.acquire(owner, 'workbench-apps').partition
    await guests.clearAccountStorage()
    expect(electron.cleared.sort()).toEqual([`persist:dsh-browser-${alice}-0123456789abcdef`, current].sort())
    await new DesktopBrowserGuests(() => undefined).clearAccountStorage()
    expect(electron.cleared).toHaveLength(2)
  })
})
