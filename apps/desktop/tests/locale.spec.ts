import { describe, expect, it } from 'vitest'
import { brandDesktopLocale, en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, zh } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in English and Chinese', () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('zh-Hans-CN').messages).toEqual(zh)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('fr-FR').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['zh-CN']).id).toBe('zh-CN')
  })

  it('names a branded product wherever the upstream copy names DeepSeek Harness', () => {
    const upstream = resolveDesktopLocale('zh-CN')
    expect(brandDesktopLocale(upstream, undefined)).toBe(upstream)
    const branded = brandDesktopLocale(upstream, '工作台')
    expect(branded.id).toBe('zh-CN')
    expect(branded.messages).toMatchObject({ aboutMenu: '关于 工作台', aboutProduct: '工作台', quitTitle: '退出 工作台？',
      openApplication: '打开 工作台', updateTitle: '工作台 更新', checkUpdatesMenu: zh.checkUpdatesMenu })
    expect(Object.values(branded.messages).filter(message => message.includes('DeepSeek Harness'))).toEqual([])
    expect(brandDesktopLocale(resolveDesktopLocale('en'), 'Workbench').messages.aboutMenu).toBe('About Workbench')
  })

})
