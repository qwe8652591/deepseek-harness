import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createClientViewChannel } from '../src/client-view-channel.ts'
import { renderOutline, screenshotFolder, screenshotName } from '../src/client-view-tool.ts'

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

describe('client_ui files and text', () => {
  const root = resolve('/workspace')

  it('keeps screenshots inside the workspace', () => {
    expect(screenshotFolder(root, 'videos/demo/ref')).toBe(join(root, 'videos', 'demo', 'ref'))
    expect(() => screenshotFolder(root, '../outside')).toThrow('inside the workspace')
    expect(() => screenshotFolder(root, resolve('/elsewhere'))).toThrow('inside the workspace')
  })

  it('accepts plain names and defaults to a timestamp', () => {
    expect(screenshotName('模板库-首页')).toBe('模板库-首页')
    expect(screenshotName(undefined)).toMatch(/^client-\d{8}T\d{6}$/)
    expect(() => screenshotName('../x')).toThrow()
  })

  it('renders the outline as numbered elements and visible text', () => {
    const text = renderOutline({ title: '工作台', path: '/', width: 1440, height: 900, text: '探索未至之境',
      elements: [{ ref: 'e1', role: 'button', text: '新会话', x: 0, y: 0, width: 10, height: 10, disabled: false }] })
    expect(text).toBe('Page: 工作台 (/), 1440×900\nElements (1):\ne1 button "新会话"\nVisible text:\n探索未至之境')
  })
})
