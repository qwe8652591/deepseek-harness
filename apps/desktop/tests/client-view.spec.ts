import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), session: { defaultSession: { on: vi.fn() } } }))
const { isWebUrl, parseClientViewRequest } = await import('../src/client-view.ts')

describe('client view requests from the Host', () => {
  it('accepts the documented operations', () => {
    expect(parseClientViewRequest({ op: 'open', width: 1440, height: 900 })).toEqual({ op: 'open', width: 1440, height: 900 })
    expect(parseClientViewRequest({ op: 'shot', ref: 'e3', scale: 2 })).toEqual({ op: 'shot', ref: 'e3', scale: 2 })
    expect(parseClientViewRequest({ op: 'click', ref: 'e12', text: '工作台' })).toEqual({ op: 'click', ref: 'e12', text: '工作台' })
    expect(parseClientViewRequest({ op: 'press', key: 'Escape' })).toEqual({ op: 'press', key: 'Escape' })
  })

  it('rejects Enter, malformed refs, odd sizes and unknown operations', () => {
    expect(() => parseClientViewRequest({ op: 'press', key: 'Enter' })).toThrow('key not allowed')
    expect(() => parseClientViewRequest({ op: 'click', ref: 'button', text: 'x' })).toThrow('invalid element')
    expect(() => parseClientViewRequest({ op: 'open', width: 100, height: 900 })).toThrow('invalid size')
    expect(() => parseClientViewRequest({ op: 'navigate', url: 'https://example.com' })).toThrow('unknown operation')
    expect(() => parseClientViewRequest('look')).toThrow('invalid request')
  })
})

describe('web view requests from the Host', () => {
  it('needs an http(s) address to open and accepts back and login', () => {
    expect(parseClientViewRequest({ op: 'open', width: 1440, height: 900, url: 'https://example.com/a' }, 'web'))
      .toEqual({ op: 'open', width: 1440, height: 900, url: 'https://example.com/a' })
    expect(parseClientViewRequest({ op: 'back' }, 'web')).toEqual({ op: 'back' })
    expect(parseClientViewRequest({ op: 'login' }, 'web')).toEqual({ op: 'login' })
    expect(() => parseClientViewRequest({ op: 'open', width: 1440, height: 900 }, 'web')).toThrow('invalid address')
  })

  it('keeps web-only fields away from the client view and refuses other schemes', () => {
    expect(() => parseClientViewRequest({ op: 'open', width: 1440, height: 900, url: 'https://example.com' })).toThrow('invalid address')
    expect(() => parseClientViewRequest({ op: 'back' })).toThrow('unknown operation')
    expect(() => parseClientViewRequest({ op: 'login' })).toThrow('invalid login')
    expect(isWebUrl('file:///C:/x')).toBe(false)
    expect(isWebUrl('dsh-app://app/')).toBe(false)
    expect(isWebUrl('https://a:b@example.com')).toBe(false)
    expect(isWebUrl('http://127.0.0.1:57740/')).toBe(true)
  })
})
