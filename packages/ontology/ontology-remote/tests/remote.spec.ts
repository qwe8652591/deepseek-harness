import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { OntologyActionId, OntologyObjectTypeId } from '@deepseek-ai/dsh-ontology'
import OntologyRemote from '@deepseek-ai/dsh-ontology-remote'

describe('OntologyRemote', () => {
  it('delegates reads and Action execution to the active Provider', async () => {
    const definitions = vi.fn(() => [])
    const listObjects = vi.fn(() => [])
    const listLinks = vi.fn(() => [])
    const executeFunction = vi.fn(async () => 1)
    const executeAction = vi.fn(async () => ({ ok: true }))
    const ctx = new Context()
    ctx.provide('ontology', { definitions, listObjects, listLinks, executeFunction, executeAction } as never)
    await ctx.plugin(OntologyRemote)

    const type = OntologyObjectTypeId('bid.project')
    const action = OntologyActionId('bid.create-project')
    expect(ctx.ontologyRemote.definitions()).toEqual([])
    expect(ctx.ontologyRemote.listObjects(type)).toEqual([])
    expect(ctx.ontologyRemote.listLinks()).toEqual([])
    await expect(ctx.ontologyRemote.executeAction(action, { name: 'Demo' })).resolves.toEqual({ ok: true })
    expect(listObjects).toHaveBeenCalledWith(type)
    expect(executeAction).toHaveBeenCalledWith(action, { name: 'Demo' })
  })
})
