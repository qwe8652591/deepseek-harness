/**
 * The `client_ui` tool: agents open an offscreen copy of this client's own pages, read them, save screenshots into the
 * conversation workspace, and click or type after the user approves. The Electron shell owns the view; this module owns
 * the tool, the approval rules ({@link decideClientUi}) and the idle timeout.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { defineTool, type PreToolDecision, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import {
  CLIENT_UI_ACTIONS, CLIENT_UI_KEYS, CLIENT_VIEW_IDLE_MS, decideClientUi, isLive,
  type ClientUiAction, type ClientUiArgs, type ClientVisit, type OutlinePage,
} from './client-view-policy.ts'

/** One element in a page outline returned by the shell. */
interface ViewElement {
  readonly ref: string
  readonly role: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly disabled: boolean
}

/** A page outline returned by the shell. */
interface ViewPage extends OutlinePage {
  readonly width: number
  readonly height: number
  readonly text: string
  readonly elements: readonly ViewElement[]
}

/** Sends one request to the Electron shell's client view and resolves with its answer. */
export type ClientViewRequester = (request: Record<string, unknown>) => Promise<unknown>

const TOOL_NAME = 'client_ui'
const DEFAULT_DIR = 'client-ui'

const DESCRIPTION = [
  'Look at and operate this client\'s own pages (the workbench app the user is running) in an invisible background copy. The user\'s window never moves.',
  'Use it to see real screens, labels and layout, for example before drawing the client in a video, writing a tutorial, or telling the user where a setting is.',
  'Actions: open (start a visit; optional width/height), look (outline: page title, numbered elements e1…, visible text), shot (save a PNG and an outline JSON into the workspace; optional ref to capture one element, name, dir, scale 1|2),',
  'scroll (dy pixels, optional ref), hover (ref), click (ref), type (ref, value; never presses Enter), press (key: Escape, Tab, arrows, PageUp/PageDown, Home, End), close (end the visit).',
  'The user approves the first viewing call of a visit, and every click, type and press separately. Controls that sign out, delete, uninstall, reset, send or submit are never operated; draw such steps instead of performing them.',
  'Refs come from the latest outline and change when the page changes; look again after the page changes. A visit ends after 10 idle minutes; close it when done.',
  'Screenshots may show the user\'s private conversations; prefer pages without them, and crop with ref.',
].join(' ')

const clamp = (value: unknown, low: number, high: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) ? Math.min(high, Math.max(low, value)) : fallback

/**
 * Render a page outline for the model.
 * @param page - outline returned by the shell.
 * @returns compact text: title and path, numbered elements, visible text.
 */
export function renderOutline(page: ViewPage): string {
  const elements = page.elements.map(element => `${element.ref} ${element.role}${element.disabled ? ' (disabled)' : ''} "${element.text}"`)
  return [
    `Page: ${page.title} (${page.path}), ${String(page.width)}×${String(page.height)}`,
    `Elements (${String(page.elements.length)}):`, ...elements,
    'Visible text:', page.text,
  ].join('\n')
}

/**
 * Resolve the screenshot folder inside the workspace.
 * @param root - absolute workspace root.
 * @param dir - folder relative to the workspace.
 * @returns absolute folder, or throws when it leaves the workspace.
 */
export function screenshotFolder(root: string, dir: string): string {
  const folder = resolve(root, dir)
  const inside = relative(root, folder)
  if (isAbsolute(dir) || inside.startsWith('..') || isAbsolute(inside)) throw new Error('dir must be a folder inside the workspace')
  return folder
}

/**
 * @param name - requested file name without extension.
 * @returns a safe file name, or a timestamped default.
 */
export function screenshotName(name: unknown): string {
  if (typeof name === 'string' && /^[\p{L}\p{N}_-]{1,60}$/u.test(name)) return name
  if (name !== undefined) throw new Error('name may contain letters, digits, "_" and "-" only (at most 60)')
  return `client-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}`
}

const parseArgs = (input: unknown): ClientUiArgs & Record<string, unknown> => {
  const args = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {}
  if (!CLIENT_UI_ACTIONS.includes(args.action as ClientUiAction)) throw new Error(`action must be one of ${CLIENT_UI_ACTIONS.join(', ')}`)
  return {
    ...args,
    action: args.action as ClientUiAction,
    ...(typeof args.ref === 'string' ? { ref: args.ref } : {}),
    ...(typeof args.value === 'string' ? { value: args.value } : {}),
    ...(typeof args.key === 'string' ? { key: args.key } : {}),
  }
}

/**
 * Register `client_ui` and its approval rules on the Host.
 * @param ctx - booted Desktop profile context; disposal closes the view.
 * @param request - private channel to the Electron shell.
 * @param now - clock, replaceable in tests.
 */
export function installClientView(ctx: Context, request: ClientViewRequester, now: () => number = Date.now): void {
  let visit: ClientVisit | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  const end = async (): Promise<void> => {
    visit = undefined
    if (idle !== undefined) clearTimeout(idle)
    idle = undefined
    await request({ op: 'close' })
  }
  const touch = (owner: string, page: ViewPage | undefined): void => {
    visit = { owner, lastUsed: now(), page: page ?? visit?.page }
    if (idle !== undefined) clearTimeout(idle)
    idle = setTimeout(() => { void end().catch(() => undefined) }, CLIENT_VIEW_IDLE_MS)
    idle.unref()
  }
  ctx.effect(() => () => { void end().catch(() => undefined) }, 'client view: close on dispose')

  const caller = (exec: Pick<ToolExecution, 'agent'>): { owner: string | undefined; readOnly: boolean; root: string | undefined } => {
    const agent = exec.agent
    if (agent === undefined) return { owner: undefined, readOnly: true, root: undefined }
    const policy = ctx.get('sandboxPolicy')?.resolve({ session: agent.session })
    return { owner: agent.id, readOnly: policy?.mode === 'read-only', root: policy?.workspaceRoot ?? agent.session.header.cwd }
  }

  ctx.inject(['tools'], (scope) => {
    scope.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
      const decision = await next()
      if (exec.name !== TOOL_NAME || decision.kind !== 'allow') return decision
      let args: ClientUiArgs
      try { args = parseArgs(exec.arguments) } catch (error) { return { kind: 'deny', reason: (error as Error).message } }
      const ruling = decideClientUi(args, caller(exec), visit, now())
      if (ruling.kind === 'ask') return { kind: 'ask', reason: ruling.reason, displayReason: { en: ruling.display.en, zh: ruling.display.zh, 'zh-CN': ruling.display.zh } }
      return ruling
    })

    scope.effect(() => scope.tools.register(defineTool({
      name: TOOL_NAME,
      description: DESCRIPTION,
      parameters: {
        action: { type: 'string', required: true, enum: [...CLIENT_UI_ACTIONS], description: 'What to do.' },
        ref: { type: 'string', description: 'Element number from the latest outline, e.g. "e12".' },
        value: { type: 'string', description: 'Text to type (type only).' },
        key: { type: 'string', enum: [...CLIENT_UI_KEYS], description: 'Key to press (press only).' },
        dy: { type: 'integer', description: 'Scroll distance in pixels; negative scrolls up. Default 600.' },
        name: { type: 'string', description: 'Screenshot file name without extension (shot only).' },
        dir: { type: 'string', description: `Workspace folder for screenshots (shot only). Default "${DEFAULT_DIR}".` },
        scale: { type: 'integer', enum: [1, 2], description: 'Screenshot pixel density (shot only). Default 2.' },
        width: { type: 'integer', description: 'View width for open, 800–2560. Default 1440.' },
        height: { type: 'integer', description: 'View height for open, 600–1600. Default 900.' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            summary: { type: 'string', required: true },
            files: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value.summary }],
      },
      async execute(input, exec) {
        const args = parseArgs(input)
        const who = caller(exec)
        if (args.action === 'close') {
          await end()
          return { summary: 'The client view is closed.', files: [] }
        }
        if (who.owner === undefined) throw new Error('client_ui needs a conversation')
        // The approval for this call was decided in tools/pre-execute; a visit that expired meanwhile is reopened.
        if (!isLive(visit, now()) || visit.owner !== who.owner) {
          if (visit !== undefined) await end()
          const opened = await request({ op: 'open', width: clamp(args.width, 800, 2560, 1440), height: clamp(args.height, 600, 1600, 900) }) as { page: ViewPage }
          touch(who.owner, opened.page)
          if (args.action === 'open' || args.action === 'look') return { summary: renderOutline(opened.page), files: [] }
        }
        const expected = (ref: string | undefined): string => visit?.page?.elements.find(element => element.ref === ref)?.text ?? ''
        let response: { page: ViewPage; png?: string }
        switch (args.action) {
          case 'open': case 'look':
            response = await request({ op: 'look' }) as { page: ViewPage }
            break
          case 'shot':
            response = await request({ op: 'shot', ...(args.ref === undefined ? {} : { ref: args.ref }), scale: args.scale === 1 ? 1 : 2 }) as { page: ViewPage; png: string }
            break
          case 'scroll':
            response = await request({ op: 'scroll', ...(args.ref === undefined ? {} : { ref: args.ref }), dy: clamp(args.dy, -10_000, 10_000, 600) }) as { page: ViewPage }
            break
          case 'hover': case 'click':
            response = await request({ op: args.action, ref: args.ref, text: expected(args.ref) }) as { page: ViewPage }
            break
          case 'type':
            response = await request({ op: 'type', ref: args.ref, text: expected(args.ref), value: args.value ?? '' }) as { page: ViewPage }
            break
          case 'press':
            response = await request({ op: 'press', key: args.key }) as { page: ViewPage }
            break
          default: {
            const unknown: never = args.action
            throw new Error(`unknown action ${String(unknown)}`)
          }
        }
        touch(who.owner, response.page)
        if (response.png === undefined) return { summary: renderOutline(response.page), files: [] }
        if (who.root === undefined) throw new Error('client_ui could not resolve the workspace')
        const folder = screenshotFolder(who.root, typeof args.dir === 'string' ? args.dir : DEFAULT_DIR)
        const name = screenshotName(args.name)
        await mkdir(folder, { recursive: true })
        const png = join(folder, `${name}.png`), outline = join(folder, `${name}.json`)
        await writeFile(png, Buffer.from(response.png, 'base64'))
        const { text: _text, ...structure } = response.page
        await writeFile(outline, `${JSON.stringify({ ...structure, ...(args.ref === undefined ? {} : { ref: args.ref }) }, null, 2)}\n`)
        const files = [relative(who.root, png), relative(who.root, outline)].map(file => file.replaceAll('\\', '/'))
        return { summary: `Saved ${files.join(' and ')}.\n${renderOutline(response.page)}`, files }
      },
      presentCall: args => ({ card: 'generic', title: `Client view: ${String((args as { action?: unknown }).action ?? '')}`, kind: 'other' }),
    })), 'client view: tool')
  })
}
