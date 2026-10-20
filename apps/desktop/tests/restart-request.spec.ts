import type { MessageBoxOptions } from 'electron'
import { expect, it, vi } from 'vitest'
import { confirmRestart } from '../src/restart-request.ts'

const dialog = () => vi.fn<(box: MessageBoxOptions) => Promise<{ response: number }>>()
const messages = { restartRequestTitle: '需要重启', restartRequestDefault: '改动要重启客户端后生效。', restartRequestNow: '立即重启', restartRequestLater: '稍后' }

it('asks with the caller reason and restarts only when the user picks restart now', async () => {
  const show = dialog().mockResolvedValue({ response: 0 })
  await expect(confirmRestart({ show, messages, reason: '测试中心已更新，后台代码有改动。' })).resolves.toBe(true)
  expect(show).toHaveBeenCalledWith(expect.objectContaining({
    type: 'question', title: '需要重启', message: '测试中心已更新，后台代码有改动。',
    buttons: ['立即重启', '稍后'], defaultId: 0, cancelId: 1, noLink: true,
  }))
  show.mockResolvedValue({ response: 1 })
  await expect(confirmRestart({ show, messages, reason: 'x' })).resolves.toBe(false)
})

it.each([undefined, 42, '', '   ', 'x'.repeat(301)])('falls back to the default reason for %j', async (reason) => {
  const show = dialog().mockResolvedValue({ response: 1 })
  await confirmRestart({ show, messages, reason })
  expect(show.mock.calls[0]?.[0].message).toBe('改动要重启客户端后生效。')
})
