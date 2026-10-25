/**
 * Draft context items: a source keeps items beside the draft text, a default
 * send puts their serialized lines before the text and empties the list, and
 * a failed send restores them.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { DraftAttachmentId, InputTriggerController, SubmitOutcome } from '../src/client/contract/input.ts'
import { SessionInputShell } from '../src/client/input/facade.ts'

const commandAttachments = {
  serialize: () => Promise.resolve([]),
  release: () => {},
  unsupportedNotice: (token: string) => `${token.trim()} attachments-unsupported`,
}

type Sink = (text: string, ids: readonly DraftAttachmentId[], mode: 'queue' | 'steer', signal: AbortSignal) => Promise<SubmitOutcome>

function shellWith(sink: Sink) {
  const serializeReference = vi.fn((source: string, ref: string) => Promise.resolve(`[${source}] ${ref}`))
  const inputTriggers = {
    serializeReference,
    track: vi.fn(),
    lexicon: { getSnapshot: () => new Map(), subscribe: () => () => {} },
  } as unknown as InputTriggerController
  const shell = new SessionInputShell({ actx: {} as Context, inputTriggers: () => inputTriggers, defaultSink: sink, commandAttachments })
  return { shell, serializeReference }
}

describe('draft context items', () => {
  it('puts, replaces in place and removes one item per source and key', () => {
    const { shell } = shellWith(vi.fn())
    expect(shell.setContext({ source: 'templates', key: 'visio', item: { ref: 'visio:flow/blue', label: 'Flow' } })).toBe(true)
    expect(shell.setContext({ source: 'templates', key: 'ppt', item: { ref: 'ppt:signal', label: 'Signal' } })).toBe(true)
    expect(shell.setContext({ source: 'templates', key: 'visio', item: { ref: 'visio:tree/blue', label: 'Tree' } })).toBe(true)
    expect(shell.snapshot.context).toEqual([
      { source: 'templates', key: 'visio', ref: 'visio:tree/blue', label: 'Tree' },
      { source: 'templates', key: 'ppt', ref: 'ppt:signal', label: 'Signal' },
    ])
    expect(shell.setContext({ source: 'templates', key: 'visio' })).toBe(true)
    expect(shell.setContext({ source: 'templates', key: 'visio' })).toBe(false)
    expect(shell.snapshot.context).toEqual([{ source: 'templates', key: 'ppt', ref: 'ppt:signal', label: 'Signal' }])
  })

  it('sends the serialized items before the text and empties the list', async () => {
    const sink = vi.fn<Sink>(() => Promise.resolve({ kind: 'success' }))
    const { shell } = shellWith(sink)
    shell.setContext({ source: 'templates', key: 'visio', item: { ref: 'visio:flow/blue', label: 'Flow' } })
    shell.setContext({ source: 'templates', key: 'ppt', item: { ref: 'ppt:signal', label: 'Signal' } })
    shell.setDraft('Draw the order process')
    shell.submit('queue')
    expect(shell.snapshot.context).toEqual([])
    await vi.waitFor(() => {
      expect(sink).toHaveBeenCalledWith(
        '[templates] visio:flow/blue\n[templates] ppt:signal\n\nDraw the order process', [], 'queue', expect.any(AbortSignal))
    })
  })

  it('restores the items of a failed send without displacing an item put since', async () => {
    const sink = vi.fn<Sink>().mockResolvedValueOnce({ kind: 'error', text: 'unavailable' })
    let settle: (() => void) | undefined
    const { shell, serializeReference } = shellWith(sink)
    serializeReference.mockImplementationOnce((source, ref) => new Promise((resolve) => { settle = () => resolve(`[${source}] ${ref}`) }))
    shell.setContext({ source: 'templates', key: 'visio', item: { ref: 'visio:flow/blue', label: 'Flow' } })
    shell.setContext({ source: 'templates', key: 'ppt', item: { ref: 'ppt:signal', label: 'Signal' } })
    shell.setDraft('Draw it')
    shell.submit('queue')
    shell.setContext({ source: 'templates', key: 'ppt', item: { ref: 'ppt:cartesian', label: 'Cartesian' } })
    settle?.()
    await vi.waitFor(() => {
      expect(shell.snapshot.draft).toBe('Draw it')
    })
    expect(shell.snapshot.context).toEqual([
      { source: 'templates', key: 'visio', ref: 'visio:flow/blue', label: 'Flow' },
      { source: 'templates', key: 'ppt', ref: 'ppt:cartesian', label: 'Cartesian' },
    ])
  })

  it('sends chip-free text without serializing when no item is kept', async () => {
    const sink = vi.fn<Sink>(() => Promise.resolve({ kind: 'success' }))
    const { shell, serializeReference } = shellWith(sink)
    shell.setDraft('Plain message')
    shell.submit('queue')
    await vi.waitFor(() => {
      expect(sink).toHaveBeenCalledWith('Plain message', [], 'queue', expect.any(AbortSignal))
    })
    expect(serializeReference).not.toHaveBeenCalled()
  })
})
