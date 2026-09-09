import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, BID_STUDIO_APPLICATION_ID, inject } from '../src/client/index.ts'

describe('Bid Studio browser contribution', () => {
  it('registers and removes its menu and keyed page', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.slots
    const owner = slots.register({
      name: 'root',
      children: {
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
      },
    } as never, () => null)
    const layout = { selectPanel: vi.fn() }
    ctx.provide('layout', layout as never)
    ctx.provide('locale', new LocaleRuntime(ctx))
    const ontologyRemote = { listObjects: vi.fn(async () => []), execute: vi.fn() }
    ctx.provide('remote', { ontologyRemote })
    ctx.provide('remote.ontologyRemote', ontologyRemote)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('sidebar.panellist')).toHaveLength(1)
    expect(slots.entries('main')).toHaveLength(1)
    const [nav] = slots.entriesOfSlot('sidebar.panellist')
    expect(nav?.options.id).toBe(BID_STUDIO_APPLICATION_ID)
    const [page] = slots.entries('main')
    const injected = (page?.inject as () => { close: () => void })()
    injected.close()
    expect(layout.selectPanel).toHaveBeenCalledWith(null)
    await fiber.dispose()
    expect(slots.entries('sidebar.panellist')).toEqual([])
    expect(slots.entries('main')).toEqual([])
    owner()
  })
})
