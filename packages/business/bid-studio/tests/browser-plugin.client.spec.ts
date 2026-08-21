import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/client'
import { apply, BID_STUDIO_APPLICATION_ID, inject } from '@deepseek-ai/dsh-bid-studio/client'

describe('Bid Studio browser contribution', () => {
  it('registers and removes its menu and keyed page', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.slots
    const owner = slots.register({
      name: 'root',
      children: {
        'sidebar.application': { kind: 'list', scope: 'root' },
        'application': { kind: 'keyed', scope: 'root' },
      },
    } as never, () => null)
    const layout = new LayoutController()
    ctx.provide('layout', layout)
    const ontologyRemote = { listObjects: vi.fn(async () => []), execute: vi.fn() }
    ctx.provide('remote', { ontologyRemote })
    ctx.provide('remote.ontologyRemote', ontologyRemote)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('sidebar.application')).toHaveLength(1)
    expect(slots.entries('application')).toHaveLength(1)
    const nav = slots.entries('sidebar.application')[0]
    const injected = (nav?.inject as () => { open: () => void })()
    const observed = vi.fn()
    layout.subscribe(observed)
    injected.open()
    expect(layout.getSnapshot()).toEqual({ activeApplication: BID_STUDIO_APPLICATION_ID })
    expect(observed).toHaveBeenCalledOnce()
    await fiber.dispose()
    expect(slots.entries('sidebar.application')).toEqual([])
    expect(slots.entries('application')).toEqual([])
    owner()
  })
})
