/**
 * Approval rules of the `client_ui` tool. Viewing needs one approval per visit, scoped to the conversation that asked;
 * every click, typing or key press needs its own approval; controls whose text names a forbidden action are refused
 * without asking. The rules are fixed security behavior, not configuration.
 */

/** Actions that only read the page (one approval covers a whole visit). */
export const VIEW_ACTIONS = ['open', 'look', 'shot', 'scroll', 'hover'] as const
/** Actions that change the page (each one is approved separately). */
export const OPERATE_ACTIONS = ['click', 'type', 'press'] as const
/** Every `client_ui` action. */
export const CLIENT_UI_ACTIONS = [...VIEW_ACTIONS, ...OPERATE_ACTIONS, 'close'] as const
/** One `client_ui` action. */
export type ClientUiAction = typeof CLIENT_UI_ACTIONS[number]

/** Keys `press` accepts; Enter is excluded because it submits forms and sends messages. */
export const CLIENT_UI_KEYS = ['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'] as const

/** A visit ends after this much time without a `client_ui` call. */
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
  readonly path: string
  readonly elements: readonly OutlineElement[]
}

/** Arguments the policy reads. */
export interface ClientUiArgs {
  readonly action: ClientUiAction
  readonly ref?: string
  readonly value?: string
  readonly key?: string
}

/** The single open view and the conversation it belongs to. */
export interface ClientVisit {
  readonly owner: string
  lastUsed: number
  page: OutlinePage | undefined
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

const clip = (text: string, length: number): string => text.length > length ? `${text.slice(0, length)}…` : text
const where = (page: OutlinePage): string => page.heading || page.title || page.path

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
  if (caller.owner === undefined) return { kind: 'deny', reason: 'client_ui needs a conversation.' }
  const live = isLive(visit, now) ? visit : undefined
  if (live !== undefined && live.owner !== caller.owner) {
    return { kind: 'deny', reason: 'Another conversation is viewing the client right now. Try again after it closes the view or in 10 minutes.' }
  }
  if (args.action === 'shot' && caller.readOnly) return { kind: 'deny', reason: 'This conversation is read-only and cannot save screenshots.' }
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
  if (caller.readOnly) return { kind: 'deny', reason: 'This conversation is read-only; client_ui can only look.' }
  if (live?.page === undefined) return { kind: 'deny', reason: 'Open the client view first (action "open"), then use refs from its outline.' }
  if (args.action === 'press') {
    if (!(CLIENT_UI_KEYS as readonly string[]).includes(args.key ?? '')) return { kind: 'deny', reason: `Key not allowed. Allowed keys: ${CLIENT_UI_KEYS.join(', ')}.` }
    return {
      kind: 'ask', reason: `client_ui: press ${args.key ?? ''}`,
      display: { zh: `在客户端界面按 ${args.key ?? ''} 键（页面：${where(live.page)}）`, en: `Press ${args.key ?? ''} in the client view (page: ${where(live.page)})` },
    }
  }
  const element = live.page.elements.find(candidate => candidate.ref === args.ref)
  if (element === undefined) return { kind: 'deny', reason: `Element ${args.ref ?? '(none)'} is not in the latest outline; look again.` }
  const word = forbiddenWord(element.text)
  if (word !== undefined) {
    return { kind: 'deny', reason: `"${element.text}" is a ${word} control; client_ui never clicks or types into it. Ask the user to do it in their own window if it is needed.` }
  }
  if (args.action === 'type') {
    const value = clip(args.value ?? '', 60)
    return {
      kind: 'ask', reason: `client_ui: type into ${element.ref}`,
      display: {
        zh: `在客户端界面的「${clip(element.text, 40)}」里输入「${value}」（页面：${where(live.page)}）`,
        en: `Type "${value}" into "${clip(element.text, 40)}" in the client view (page: ${where(live.page)})`,
      },
    }
  }
  return {
    kind: 'ask', reason: `client_ui: click ${element.ref}`,
    display: {
      zh: `在客户端界面点击「${clip(element.text, 40)}」（${element.role}，页面：${where(live.page)}）`,
      en: `Click "${clip(element.text, 40)}" (${element.role}) in the client view (page: ${where(live.page)})`,
    },
  }
}
