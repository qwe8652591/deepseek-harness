/**
 * Approval rules of the `client_ui` and `web_ui` tools. Viewing needs one approval per visit, scoped to the conversation
 * that asked (for `web_ui`, per website origin); every click, typing or key press needs its own approval; controls whose
 * text names a forbidden action are refused without asking. The rules are fixed security behavior, not configuration.
 */

/** Actions that only read the page (one approval covers a whole visit). */
export const VIEW_ACTIONS = ['open', 'look', 'shot', 'scroll', 'hover'] as const
/** Actions that change the page (each one is approved separately). */
export const OPERATE_ACTIONS = ['click', 'type', 'press'] as const
/** Every `client_ui` action. */
export const CLIENT_UI_ACTIONS = [...VIEW_ACTIONS, ...OPERATE_ACTIONS, 'close'] as const
/** One `client_ui` action. */
export type ClientUiAction = typeof CLIENT_UI_ACTIONS[number]
/** Every `web_ui` action: the client actions plus going back and signing in through a visible window. */
export const WEB_UI_ACTIONS = [...VIEW_ACTIONS, 'back', ...OPERATE_ACTIONS, 'login', 'close'] as const
/** One `web_ui` action. */
export type WebUiAction = typeof WEB_UI_ACTIONS[number]

/** Keys `press` accepts; Enter is excluded because it submits forms and sends messages. */
export const CLIENT_UI_KEYS = ['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'] as const

/** A visit ends after this much time without a call. */
export const CLIENT_VIEW_IDLE_MS = 10 * 60_000

/**
 * Controls never clicked or typed into: signing out, deleting, uninstalling, resetting, and sending or submitting
 * (a sent message starts a real model turn). Matched case-insensitively against the element's text.
 */
export const FORBIDDEN_CONTROL_WORDS = [
  '退出', '登出', '注销', '删除', '移除', '卸载', '清空', '重置', '解除开通', '发送', '提交',
  'sign out', 'log out', 'logout', 'delete', 'remove', 'uninstall', 'reset', 'send', 'submit',
] as const

/** One element of the latest outline, as the policy needs it. */
export interface OutlineElement {
  readonly ref: string
  readonly role: string
  readonly text: string
}

/** The page a visit last saw. */
export interface OutlinePage {
  readonly title: string
  /** First visible heading on the page; empty when there is none. */
  readonly heading?: string
  /** Page origin; `web_ui` approves websites by it. */
  readonly origin?: string
  readonly path: string
  readonly elements: readonly OutlineElement[]
}

/** Arguments the policy reads. */
export interface ClientUiArgs {
  readonly action: WebUiAction
  readonly ref?: string
  readonly value?: string
  readonly key?: string
  /** Website address (`web_ui` open and login). */
  readonly url?: string
}

/** The single open view and the conversation it belongs to. */
export interface ClientVisit {
  readonly owner: string
  lastUsed: number
  page: OutlinePage | undefined
  /** Website origins the user approved during this visit (`web_ui` only). */
  readonly approved?: Set<string>
}

/** Outcome of the policy for one call; `ask` carries the approval text in English and Chinese. */
export type ClientUiDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'ask'; readonly reason: string; readonly display: { readonly en: string; readonly zh: string } }

/** Facts about the calling conversation. */
export interface ClientUiCaller {
  /** Conversation (session) id, or undefined for a call without an agent. */
  readonly owner: string | undefined
  /** The conversation's sandbox is read-only. */
  readonly readOnly: boolean
}

/**
 * @param text - element text.
 * @returns the forbidden word the text contains, if any.
 */
export function forbiddenWord(text: string): string | undefined {
  const lower = text.toLowerCase()
  return FORBIDDEN_CONTROL_WORDS.find(word => lower.includes(word))
}

/**
 * @param visit - the open view, if any.
 * @param now - current time in milliseconds.
 * @returns whether the visit is still within its idle window.
 */
export function isLive(visit: ClientVisit | undefined, now: number): visit is ClientVisit {
  return visit !== undefined && now - visit.lastUsed < CLIENT_VIEW_IDLE_MS
}

/**
 * @param url - candidate website address.
 * @returns its origin when it is an absolute http(s) URL without credentials.
 */
export function webOrigin(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.username === '' && parsed.password === '' ? parsed.origin : undefined
  } catch { return undefined }
}

const clip = (text: string, length: number): string => text.length > length ? `${text.slice(0, length)}…` : text
/** The client window title is "<conversation> — <app>"; the conversation part is not the page's name. */
const where = (page: OutlinePage): string => page.heading || page.title.split(' — ').at(-1) || page.path

/** Labels that differ between the two tools. */
interface Place {
  readonly tool: 'client_ui' | 'web_ui'
  readonly zh: string
  readonly en: string
}

/** Shared checks before the visit: conversation, other conversation's live visit, read-only screenshots. */
function precheck(
  args: ClientUiArgs, caller: ClientUiCaller, visit: ClientVisit | undefined, now: number, tool: string,
): ClientUiDecision | ClientVisit | undefined {
  if (caller.owner === undefined) return { kind: 'deny', reason: `${tool} needs a conversation.` }
  const live = isLive(visit, now) ? visit : undefined
  if (live !== undefined && live.owner !== caller.owner) {
    return { kind: 'deny', reason: `Another conversation is using ${tool} right now. Try again after it closes the view or in 10 minutes.` }
  }
  if (args.action === 'shot' && caller.readOnly) return { kind: 'deny', reason: 'This conversation is read-only and cannot save screenshots.' }
  return live
}

/** Click, type and press: forbidden controls are refused; everything else asks with the element and page. */
function decideOperation(args: ClientUiArgs, caller: ClientUiCaller, live: ClientVisit | undefined, place: Place): ClientUiDecision {
  if (caller.readOnly) return { kind: 'deny', reason: `This conversation is read-only; ${place.tool} can only look.` }
  if (live?.page === undefined) return { kind: 'deny', reason: 'Open a page first (action "open"), then use refs from its outline.' }
  const page = live.page
  if (args.action === 'press') {
    if (!(CLIENT_UI_KEYS as readonly string[]).includes(args.key ?? '')) return { kind: 'deny', reason: `Key not allowed. Allowed keys: ${CLIENT_UI_KEYS.join(', ')}.` }
    return {
      kind: 'ask', reason: `${place.tool}: press ${args.key ?? ''}`,
      display: { zh: `在${place.zh}按 ${args.key ?? ''} 键（页面：${where(page)}）`, en: `Press ${args.key ?? ''} in ${place.en} (page: ${where(page)})` },
    }
  }
  const element = page.elements.find(candidate => candidate.ref === args.ref)
  if (element === undefined) return { kind: 'deny', reason: `Element ${args.ref ?? '(none)'} is not in the latest outline; look again.` }
  const word = forbiddenWord(element.text)
  if (word !== undefined) {
    return { kind: 'deny', reason: `"${element.text}" is a ${word} control; ${place.tool} never clicks or types into it. Ask the user to do it themselves if it is needed.` }
  }
  if (args.action === 'type') {
    const value = clip(args.value ?? '', 60)
    return {
      kind: 'ask', reason: `${place.tool}: type into ${element.ref}`,
      display: {
        zh: `在${place.zh}的「${clip(element.text, 40)}」里输入「${value}」（页面：${where(page)}）`,
        en: `Type "${value}" into "${clip(element.text, 40)}" in ${place.en} (page: ${where(page)})`,
      },
    }
  }
  return {
    kind: 'ask', reason: `${place.tool}: click ${element.ref}`,
    display: {
      zh: `在${place.zh}点击「${clip(element.text, 40)}」（${element.role}，页面：${where(page)}）`,
      en: `Click "${clip(element.text, 40)}" (${element.role}) in ${place.en} (page: ${where(page)})`,
    },
  }
}

/**
 * Decide one `client_ui` call.
 * @param args - validated tool arguments.
 * @param caller - calling conversation.
 * @param visit - the open view, if any.
 * @param now - current time in milliseconds.
 * @returns allow, deny with the reason shown to the agent, or ask with the approval text.
 */
export function decideClientUi(args: ClientUiArgs, caller: ClientUiCaller, visit: ClientVisit | undefined, now: number): ClientUiDecision {
  if (args.action === 'close') return { kind: 'allow' }
  const live = precheck(args, caller, visit, now, 'client_ui')
  if (live !== undefined && 'kind' in live) return live
  if ((VIEW_ACTIONS as readonly string[]).includes(args.action)) {
    if (live !== undefined) return { kind: 'allow' }
    return {
      kind: 'ask',
      reason: 'client_ui: open the client view',
      display: {
        zh: '查看客户端界面：在后台打开工作台界面浏览和截图（不会动你的窗口），能看到你的会话和设置。本次查看结束或闲置 10 分钟后需要重新允许。',
        en: 'View the client: open the workbench in the background to browse and take screenshots (your window does not move). It can see your conversations and settings. Approval ends when this visit closes or after 10 idle minutes.',
      },
    }
  }
  return decideOperation(args, caller, live, { tool: 'client_ui', zh: '客户端界面', en: 'the client view' })
}

/**
 * Decide one `web_ui` call. Each website origin is approved once per visit; a page that moved to an origin the user
 * has not approved asks again before it is read.
 * @param args - validated tool arguments.
 * @param caller - calling conversation.
 * @param visit - the open web view, if any.
 * @param now - current time in milliseconds.
 * @returns allow, deny with the reason shown to the agent, or ask with the approval text.
 */
export function decideWebUi(args: ClientUiArgs, caller: ClientUiCaller, visit: ClientVisit | undefined, now: number): ClientUiDecision {
  if (args.action === 'close') return { kind: 'allow' }
  const live = precheck(args, caller, visit, now, 'web_ui')
  if (live !== undefined && 'kind' in live) return live
  const approved = (origin: string): boolean => live?.approved?.has(origin) === true
  const viewing = (origin: string): ClientUiDecision => approved(origin) ? { kind: 'allow' } : {
    kind: 'ask', reason: `web_ui: view ${origin}`,
    display: {
      zh: `查看网站 ${origin}：在后台打开浏览和截图（不会动你的窗口），用的是单独保存的登录状态。本次查看结束或闲置 10 分钟后需要重新允许。`,
      en: `View ${origin}: open it in the background to browse and take screenshots (your window does not move), with its own saved sign-in. Approval ends when this visit closes or after 10 idle minutes.`,
    },
  }
  if (args.action === 'open') {
    const origin = webOrigin(args.url)
    if (origin === undefined) return { kind: 'deny', reason: 'open needs url, an http(s) address without user name or password.' }
    return viewing(origin)
  }
  if (args.action === 'login') {
    const origin = webOrigin(args.url) ?? live?.page?.origin
    if (args.url !== undefined && webOrigin(args.url) === undefined) return { kind: 'deny', reason: 'login url must be an http(s) address.' }
    if (origin === undefined || live === undefined) return { kind: 'deny', reason: 'Open the website first (action "open"), then ask the user to sign in.' }
    return {
      kind: 'ask', reason: `web_ui: sign in to ${origin}`,
      display: {
        zh: `登录网站 ${origin}：打开一个登录窗口（会显示在屏幕上），请你在里面登录后关掉它。登录状态会保存下来，之后在后台访问这个网站时使用。`,
        en: `Sign in to ${origin}: a sign-in window opens on screen; sign in and close it. The sign-in is saved and used when this website is opened in the background.`,
      },
    }
  }
  if ((VIEW_ACTIONS as readonly string[]).includes(args.action) || args.action === 'back') {
    const origin = live?.page?.origin
    if (live === undefined || origin === undefined) return { kind: 'deny', reason: 'Open a website first (action "open" with url).' }
    return viewing(origin)
  }
  const origin = live?.page?.origin ?? ''
  if (live !== undefined && !approved(origin)) return { kind: 'deny', reason: `The page is now on ${origin}, which the user has not approved; look at it first so the user can approve it.` }
  return decideOperation(args, caller, live, { tool: 'web_ui', zh: `网站 ${origin} `, en: origin })
}
