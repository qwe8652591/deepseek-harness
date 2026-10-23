import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), session: { defaultSession: { on: vi.fn() } } }))
const { parseClientViewRequest } = await import('../src/client-view.ts')

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
