// @vitest-environment jsdom
/** Engine-projected data through the shared host Conversation, Chat, and approval slots. */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { WorkbenchEditor } from '../src/client/input/WorkbenchEditor.tsx'
import { WorkbenchConversation } from '../src/client/skeleton/WorkbenchConversation.tsx'
import type { WorkbenchConversationOwnerProps } from '../src/client/contract/workbench.ts'
import { en, zh } from '../src/client/locales.ts'
import { WorkbenchMessage } from '../../ui-chat/src/client/chat/WorkbenchMessage.tsx'
import { en as chatEn, zh as chatZh } from '../../ui-chat/src/client/locale.ts'
import { WorkbenchApprovalPanel } from '../../ui-approval/src/client/ApprovalPanel.tsx'
import { en as approvalEn, zh as approvalZh } from '../../ui-approval/src/client/locales.ts'

const runtimes: SlotTestRuntime[] = []
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose(); cleanup() })

async function bench(overrides: Partial<WorkbenchConversationOwnerProps> = {}) {
  const owner: WorkbenchConversationOwnerProps = {
    identity: 'claude-session', title: 'Code', engine: 'Claude Code', status: 'Ready',
    messages: [
      { id: '1', kind: 'user', text: 'Explain this function.' },
      { id: '2', kind: 'assistant', text: 'It returns **42**.\n\n```ts\nreturn 42\n```' },
    ],
    approvals: [], running: false, busy: false, draft: 'Continue', cwd: '/project', projects: [], started: true, error: null,
    setDraft: vi.fn(), setCwd: vi.fn(), send: vi.fn(async () => {}), stop: vi.fn(async () => {}), answer: vi.fn(async () => {}),
    ...overrides,
  }
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  await runtime.mount({ inject: ['slots'], apply(ctx: Context) {
    ctx.provide('locale', locale)
    ctx.effect(() => locale.register('conversation', { zh, en }))
    ctx.effect(() => locale.register('chat', { zh: chatZh, en: chatEn }))
    ctx.effect(() => locale.register('approval', { zh: approvalZh, en: approvalEn }))
    ctx.slots.installLocale(locale)
    ctx.slots.inject('workbench.conversation', () => ctx.slots.register({
      name: 'workbench.conversation', locale: 'conversation',
      children: {
        'workbench.conversation.message': { kind: 'single', scope: 'root' },
        'workbench.conversation.approval': { kind: 'single', scope: 'root' },
        'workbench.conversation.editor': { kind: 'single', scope: 'root' },
      },
    }, WorkbenchConversation))
    ctx.slots.inject('workbench.conversation.editor', () => ctx.slots.register({ name: 'workbench.conversation.editor', locale: 'conversation' }, WorkbenchEditor))
    ctx.slots.inject('workbench.conversation.message', () => ctx.slots.register({ name: 'workbench.conversation.message', locale: 'chat' }, WorkbenchMessage))
    ctx.slots.inject('workbench.conversation.approval', () => ctx.slots.register({ name: 'workbench.conversation.approval', locale: 'approval' }, WorkbenchApprovalPanel))
  } })
  function Frame({ renderSlot }: PropsRuntime<'root'> & PropsRenderSlots<'workbench.conversation'>) {
    return renderSlot('workbench.conversation', owner)
  }
  await runtime.root.declare({ 'workbench.conversation': { kind: 'single', scope: 'root' } }, Frame)
  return { view: runtime.renderRoot(), owner }
}

it('renders engine messages with native Markdown, copy actions, and composer keyboard guards', async () => {
  const { view, owner } = await bench()
  expect(await view.findByText('42', { selector: 'strong' })).toBeTruthy()
  expect(view.container.querySelector('pre')).toBeTruthy()
  const input = view.getByRole('textbox', { name: 'Send a message or create a task' })
  await waitFor(() => { expect(input.textContent).toBe('Continue') })
  expect(view.container).toMatchSnapshot()
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true })
  expect(owner.send).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(owner.send).toHaveBeenCalledOnce()
  expect(input.textContent).toBe('Continue')
})

it('routes the shared Stop action to the active engine', async () => {
  const { view, owner } = await bench({ running: true })
  fireEvent.click(await view.findByRole('button', { name: 'Stop generating' }))
  expect(owner.stop).toHaveBeenCalledOnce()
  expect(owner.send).not.toHaveBeenCalled()
})

it('expands structured engine tool arguments without escaping the serialized JSON twice', async () => {
  const { view } = await bench({ messages: [
    { id: 'tool-1', kind: 'tool', label: 'Read', text: JSON.stringify({ file_path: 'src/main.ts' }) },
  ] })
  fireEvent.click(await view.findByRole('button', { name: /Read/ }))
  expect(view.container.querySelector('pre')?.textContent).toBe('{\n  "file_path": "src/main.ts"\n}')
})

it('retains approval controls after a failed answer and submits the exact request', async () => {
  const answer = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(undefined)
  const { view } = await bench({ running: true, answer, approvals: [
    { id: 'approval-1', tool: 'Write', detail: '{"file_path":"/project/app.ts"}', questions: [] },
  ] })
  const allow = await view.findByRole('button', { name: /allow once/i })
  fireEvent.click(allow)
  await waitFor(() => { expect(allow.hasAttribute('disabled')).toBe(false) })
  fireEvent.click(allow)
  expect(answer).toHaveBeenNthCalledWith(2, 'approval-1', true, {})
})

it('requires all requested answers before allowing an engine question', async () => {
  const { view, owner } = await bench({ approvals: [
    { id: 'question-1', tool: 'AskUserQuestion', detail: '{}', questions: [{ question: 'Which target?', options: ['Web', 'Desktop'] }] },
  ] })
  const allow = await view.findByRole('button', { name: /allow once/i })
  expect(allow.hasAttribute('disabled')).toBe(true)
  fireEvent.change(view.getByRole('combobox', { name: 'Which target?' }), { target: { value: 'Web' } })
  fireEvent.click(allow)
  expect(owner.answer).toHaveBeenCalledWith('question-1', true, { 'Which target?': 'Web' })
})
