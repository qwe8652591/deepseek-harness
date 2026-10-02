import { readFileSync } from 'node:fs'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { expect, it, onTestFinished, vi } from 'vitest'
import { resolveAikoAccountLocale } from '../src/aiko-account-locale.ts'

it.each(['aiko', 'yunyao'])('shows %s setup and follows a changed platform when auth is shared', async (profile) => {
  const locale = resolveAikoAccountLocale('zh-CN')
  const dom = new JSDOM(readFileSync(new URL('../renderer/product-platform.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' })
  onTestFinished(() => { dom.window.close() })
  const save = vi.fn(async () => ({ ok: false, message: locale.messages.platformInvalid }))
  Object.defineProperty(dom.window, 'productPlatform', { value: {
    read: async () => ({ ...locale, profile, productName: profile === 'aiko' ? 'Aiko DSH' : '云遥宇航', platform: { websiteOrigin: 'https://old.example', gatewayOrigin: 'https://old.example' } }), save,
  } })
  runInContext(readFileSync(new URL('../renderer/product-platform.js', import.meta.url), 'utf8'), dom.getInternalVMContext())
  const document = dom.window.document
  await expect.poll(() => document.body.dataset.brand).toBe(profile)
  const website = document.getElementById('website') as HTMLInputElement
  const gateway = document.getElementById('gateway') as HTMLInputElement
  expect(gateway.value).toBe('')
  website.value = 'https://next.example'
  document.getElementById('platform-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
  await expect.poll(() => save.mock.calls.length).toBe(1)
  expect(save).toHaveBeenCalledWith({ websiteOrigin: 'https://next.example', gatewayOrigin: '' })
  expect(document.getElementById('error')?.textContent).toBe(locale.messages.platformInvalid)
  expect(document.body.textContent).toMatchSnapshot()
})
