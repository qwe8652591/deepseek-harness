/**
 * Host-only workflow request and live-run handles. The browser-safe durable
 * vocabulary remains in `./types` so Client programs never import Agent or
 * host Cordis context declarations.
 *
 * @module @deepseek-ai/dsh-workflow
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  WorkflowMeta, WorkflowResult, WorkflowRunId,
} from './types.ts'

/**
 * Host operation exposed by name to one workflow script.
 * @param input - Lossless plain JSON input supplied by the script.
 * @param signal - Canonical run cancellation signal.
 * @returns Lossless plain JSON result for the script.
 */
export type WorkflowActivity = (input: unknown, signal: AbortSignal) => Promise<unknown>

/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. A script that calls `agent()` requires
 * `parent`; activity-only business workflows do not.
 */
export interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** Named Host operations exposed to the script through `activity()`. */
  activities?: Readonly<Record<string, WorkflowActivity>>
  /** The agent on whose behalf child agents execute. Required when the script calls `agent()`. */
  parent?: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}

/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and Host-work quiescence.
 */
export interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its pending Host work. */
  cancel(reason?: string): void
  /** Cancel if needed and await bounded settlement and cleanup. */
  dispose(): Promise<void>
}
