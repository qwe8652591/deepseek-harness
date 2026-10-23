import { describe, expect, it } from 'vitest'
import { CLIENT_VIEW_IDLE_MS, decideClientUi, decideWebUi, forbiddenWord, type ClientVisit, type OutlinePage } from '../src/client-view-policy.ts'

const page: OutlinePage = {
  title: '查看工作台页面并截图 — DSH', heading: '工作台', path: '/',
  elements: [
    { ref: 'e1', role: 'button', text: '工作台' },
    { ref: 'e2', role: 'button', text: '退出登录' },
    { ref: 'e3', role: 'textarea', text: '描述你想要构建的内容' },
    { ref: 'e4', role: 'button', text: '发送消息' },
  ],
}
const now = 1_000_000
const visit = (owner: string, lastUsed = now - 1000): ClientVisit => ({ owner, lastUsed, page })
const me = { owner: 's1', readOnly: false }

describe('client_ui approval rules', () => {
  it('asks once to start viewing, then lets the same conversation look without asking', () => {
    expect(decideClientUi({ action: 'look' }, me, undefined, now)).toMatchObject({ kind: 'ask', display: { zh: expect.stringContaining('查看客户端界面') } })
    expect(decideClientUi({ action: 'shot' }, me, visit('s1'), now)).toEqual({ kind: 'allow' })
    expect(decideClientUi({ action: 'scroll' }, me, visit('s1'), now)).toEqual({ kind: 'allow' })
  })

  it('asks again after the visit has been idle for ten minutes', () => {
    expect(decideClientUi({ action: 'look' }, me, visit('s1', now - CLIENT_VIEW_IDLE_MS), now).kind).toBe('ask')
  })

  it('keeps another conversation out while a visit is live', () => {
    expect(decideClientUi({ action: 'look' }, { owner: 's2', readOnly: false }, visit('s1'), now))
      .toMatchObject({ kind: 'deny', reason: expect.stringContaining('Another conversation') })
    expect(decideClientUi({ action: 'look' }, { owner: 's2', readOnly: false }, visit('s1', now - CLIENT_VIEW_IDLE_MS), now).kind).toBe('ask')
  })

  it('asks for every click and names the element and page', () => {
    const decision = decideClientUi({ action: 'click', ref: 'e1' }, me, visit('s1'), now)
    expect(decision).toMatchObject({ kind: 'ask', display: { zh: '在客户端界面点击「工作台」（button，页面：工作台）' } })
    expect(decideClientUi({ action: 'type', ref: 'e3', value: '你好' }, me, visit('s1'), now))
      .toMatchObject({ kind: 'ask', display: { zh: expect.stringContaining('输入「你好」') } })
    expect(decideClientUi({ action: 'press', key: 'Escape' }, me, visit('s1'), now).kind).toBe('ask')
  })

  it('names the page by its heading, or by the window title without the conversation name', () => {
    const untitled = { ...visit('s1'), page: { ...page, heading: '' } }
    expect(decideClientUi({ action: 'click', ref: 'e1' }, me, untitled, now)).toMatchObject({ display: { zh: '在客户端界面点击「工作台」（button，页面：DSH）' } })
  })

  it('refuses forbidden controls, Enter, stale refs and operations before a visit, without asking', () => {
    expect(decideClientUi({ action: 'click', ref: 'e2' }, me, visit('s1'), now)).toMatchObject({ kind: 'deny' })
    expect(decideClientUi({ action: 'click', ref: 'e4' }, me, visit('s1'), now)).toMatchObject({ kind: 'deny' })
    expect(decideClientUi({ action: 'press', key: 'Enter' }, me, visit('s1'), now)).toMatchObject({ kind: 'deny' })
    expect(decideClientUi({ action: 'click', ref: 'e9' }, me, visit('s1'), now)).toMatchObject({ kind: 'deny', reason: expect.stringContaining('look again') })
    expect(decideClientUi({ action: 'click', ref: 'e1' }, me, undefined, now)).toMatchObject({ kind: 'deny', reason: expect.stringContaining('Open a page first') })
  })

  it('lets read-only conversations look but not operate or save', () => {
    const readOnly = { owner: 's1', readOnly: true }
    expect(decideClientUi({ action: 'look' }, readOnly, visit('s1'), now)).toEqual({ kind: 'allow' })
    expect(decideClientUi({ action: 'shot' }, readOnly, visit('s1'), now).kind).toBe('deny')
    expect(decideClientUi({ action: 'click', ref: 'e1' }, readOnly, visit('s1'), now).kind).toBe('deny')
  })

  it('always allows close and refuses calls without a conversation', () => {
    expect(decideClientUi({ action: 'close' }, { owner: undefined, readOnly: true }, undefined, now)).toEqual({ kind: 'allow' })
    expect(decideClientUi({ action: 'look' }, { owner: undefined, readOnly: true }, undefined, now).kind).toBe('deny')
  })

  it('matches forbidden words in either language, ignoring case', () => {
    expect(forbiddenWord('Sign Out')).toBe('sign out')
    expect(forbiddenWord('卸载插件')).toBe('卸载')
    expect(forbiddenWord('应用中心')).toBeUndefined()
  })
})

describe('web_ui approval rules', () => {
  const site = 'https://kb.example.com'
  const webPage: OutlinePage = { ...page, origin: site, heading: '知识库' }
  const web = (approved: string[], current = webPage): ClientVisit => ({ owner: 's1', lastUsed: now - 1000, page: current, approved: new Set(approved) })

  it('asks once per website and lets the approved website be read', () => {
    expect(decideWebUi({ action: 'open', url: `${site}/kb` }, me, undefined, now))
      .toMatchObject({ kind: 'ask', display: { zh: expect.stringContaining(`查看网站 ${site}`) } })
    expect(decideWebUi({ action: 'open', url: `${site}/other` }, me, web([site]), now)).toEqual({ kind: 'allow' })
    expect(decideWebUi({ action: 'shot' }, me, web([site]), now)).toEqual({ kind: 'allow' })
    expect(decideWebUi({ action: 'open', url: 'https://other.example.com' }, me, web([site]), now).kind).toBe('ask')
  })

  it('asks again before reading a page that moved to an unapproved origin, and refuses to operate it', () => {
    const moved = web([site], { ...webPage, origin: 'https://sso.example.com' })
    expect(decideWebUi({ action: 'look' }, me, moved, now)).toMatchObject({ kind: 'ask', reason: 'web_ui: view https://sso.example.com' })
    expect(decideWebUi({ action: 'click', ref: 'e1' }, me, moved, now)).toMatchObject({ kind: 'deny', reason: expect.stringContaining('not approved') })
  })

  it('refuses bad addresses and reading before open', () => {
    expect(decideWebUi({ action: 'open', url: 'file:///C:/secret.txt' }, me, undefined, now).kind).toBe('deny')
    expect(decideWebUi({ action: 'open', url: 'https://user:pw@example.com' }, me, undefined, now).kind).toBe('deny')
    expect(decideWebUi({ action: 'look' }, me, undefined, now)).toMatchObject({ kind: 'deny', reason: expect.stringContaining('Open a website first') })
  })

  it('asks before opening a sign-in window, and asks for every click with the website named', () => {
    expect(decideWebUi({ action: 'login' }, me, web([site]), now)).toMatchObject({ kind: 'ask', display: { zh: expect.stringContaining(`登录网站 ${site}`) } })
    expect(decideWebUi({ action: 'login' }, me, undefined, now).kind).toBe('deny')
    expect(decideWebUi({ action: 'click', ref: 'e1' }, me, web([site]), now))
      .toMatchObject({ kind: 'ask', display: { zh: `在网站 ${site} 点击「工作台」（button，页面：知识库）` } })
    expect(decideWebUi({ action: 'click', ref: 'e2' }, me, web([site]), now).kind).toBe('deny')
  })
})
