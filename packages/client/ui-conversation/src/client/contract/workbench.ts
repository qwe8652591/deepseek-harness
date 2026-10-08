/** Engine-independent presentation supplied by workbench plugins. */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** A display record; the engine retains its own durable transcript identity. */
export interface WorkbenchMessage {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'tool' | 'result' | 'notice' | 'error'
  readonly text: string
  readonly label?: string | undefined
  readonly streaming?: boolean | undefined
}

/** One engine-owned decision. Answering never grants persistent permission. */
export interface WorkbenchApproval {
  readonly id: string
  readonly tool: string
  readonly detail: string
  readonly questions: readonly { readonly question: string; readonly options: readonly string[] }[]
}

/** Engine state and actions consumed by the shared conversation surface. */
export interface WorkbenchConversationOwnerProps {
  readonly identity: string
  readonly title: string
  readonly engine: string
  readonly status: string
  readonly messages: readonly WorkbenchMessage[]
  readonly approvals: readonly WorkbenchApproval[]
  readonly running: boolean
  readonly busy: boolean
  readonly draft: string
  readonly cwd: string
  readonly projects: readonly { readonly path: string; readonly title: string }[]
  readonly started: boolean
  readonly error: string | null
  /** Retain a draft in the engine's selected session. */
  readonly setDraft: (text: string) => void
  /** Select the next session's working directory. */
  readonly setCwd: (path: string) => void
  /** Submit the retained draft and publish any failure in error. */
  readonly send: () => Promise<void>
  /** Cancel the current engine turn and publish any failure in error. */
  readonly stop: () => Promise<void>
  /** Resolve exactly the displayed request. */
  readonly answer: (id: string, allow: boolean, answers: Record<string, string>) => Promise<void>
}

/** Retained draft and keyboard actions supplied by the workbench composer. */
export interface WorkbenchEditorOwnerProps extends Pick<WorkbenchConversationOwnerProps, 'draft' | 'busy' | 'running' | 'cwd' | 'setDraft' | 'send'> {
  readonly className: string | undefined
  /** Report pasted files that this text-only engine adapter cannot submit. */
  readonly onFilesUnsupported: () => void
}

/** Shared message presentation with no native DSH Session dependency. */
export type WorkbenchMessageOwnerProps = { readonly message: WorkbenchMessage }

/** Shared approval presentation with an engine-owned settlement callback. */
export interface WorkbenchApprovalOwnerProps {
  readonly approval: WorkbenchApproval
  readonly busy: boolean
  /** Settle the displayed request, rejecting if it remains unanswered. */
  readonly answer: (allow: boolean, answers: Record<string, string>) => Promise<void>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Workbench-owned entry rendered by the host's conversation presentation. */
    'workbench.conversation': { kind: 'single'; scope: 'root'; owner: WorkbenchConversationOwnerProps }
    /** Native editor behavior for an engine-owned text draft. */
    'workbench.conversation.editor': { kind: 'single'; scope: 'root'; owner: WorkbenchEditorOwnerProps }
    /** Chat-owned user, assistant, and tool record presentation. */
    'workbench.conversation.message': { kind: 'single'; scope: 'root'; owner: WorkbenchMessageOwnerProps }
    /** Approval-owned request presentation, independent of engine transport. */
    'workbench.conversation.approval': { kind: 'single'; scope: 'root'; owner: WorkbenchApprovalOwnerProps }
  }
}

/** Shared shell props derived from its registered child slots. */
export type WorkbenchConversationProps = PropsRuntime<'workbench.conversation'>
  & PropsRenderSlots<'workbench.conversation.message' | 'workbench.conversation.approval' | 'workbench.conversation.editor'>
  & PropsLocale<'conversation'>
