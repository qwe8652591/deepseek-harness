import { describe, expect, it, vi } from 'vitest'
import { createClientViewChannel } from '../src/client-view-channel.ts'

describe('client view channel', () => {
  it('matches answers to requests and rejects with the shell error', async () => {
    const sent: Array<{ requestId: number }> = []
    const channel = createClientViewChannel(async (message) => { sent.push(message as { requestId: number }) })
    const first = channel.request({ op: 'look' })
    const second = channel.request({ op: 'close' })
    await Promise.resolve()
    channel.receive({ type: 'client-view-result', requestId: sent[1]!.requestId, error: 'client view: not open' })
    channel.receive({ type: 'client-view-result', requestId: sent[0]!.requestId, value: { page: 1 } })
    await expect(first).resolves.toEqual({ page: 1 })
    await expect(second).rejects.toThrow('client view: not open')
  })

  it('times out when the shell never answers', async () => {
    vi.useFakeTimers()
    try {
      const channel = createClientViewChannel(async () => {}, 1000)
      const pending = channel.request({ op: 'look' })
      vi.advanceTimersByTime(1001)
      await expect(pending).rejects.toThrow('did not answer in time')
    } finally { vi.useRealTimers() }
  })

  it('rejects at once when the shell is gone', async () => {
    const channel = createClientViewChannel(() => Promise.reject(new Error('client view: the desktop shell is not connected')))
    await expect(channel.request({ op: 'look' })).rejects.toThrow('not connected')
  })
})
