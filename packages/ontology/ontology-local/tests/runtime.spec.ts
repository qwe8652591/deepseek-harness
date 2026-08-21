import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import {
  OntologyActionId,
  OntologyDefinitionId,
  OntologyFunctionId,
  OntologyLinkTypeId,
  OntologyObjectTypeId,
  type OntologyDefinition,
  type OntologyObject,
} from '@deepseek-ai/dsh-ontology'
import LocalOntologyRuntime from '@deepseek-ai/dsh-ontology-local'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const widget = OntologyObjectTypeId('demo.widget')
const create = OntologyActionId('demo.create')
const count = OntologyFunctionId('demo.count')
const related = OntologyLinkTypeId('demo.related')
const definition: OntologyDefinition = {
  id: OntologyDefinitionId('demo'),
  version: 0,
  objectTypes: [{
    id: widget,
    label: 'Widget',
    description: 'Test object.',
    properties: [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'count', label: 'Count', type: 'number' },
    ],
  }],
  linkTypes: [{ id: related, label: 'Related', from: widget, to: widget, cardinality: 'one-to-many' }],
  functions: [{ id: count, label: 'Count', description: 'Count widgets.', result: { kind: 'scalar', type: 'number' } }],
  actions: [{
    id: create,
    label: 'Create',
    target: widget,
    driver: 'machine',
    description: 'Create a widget.',
    inputs: [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'count', label: 'Count', type: 'number' },
    ],
    result: widget,
  }],
}

/** Boot the real storage, domain, and local ontology composition. */
async function harness(pool = new MemoryMediaPool()) {
  const ctx = new Context()
  const storageFiber = await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const runtimeFiber = await ctx.plugin(LocalOntologyRuntime)
  return {
    runtime: ctx.ontology,
    async dispose(): Promise<void> {
      await runtimeFiber.dispose()
      await facility.closeAll()
      await storageFiber.dispose()
    },
  }
}

describe('LocalOntologyRuntime', () => {
  it('registers definitions, validates objects, dispatches Actions, and disposes the contribution', async () => {
    const instance = await harness()
    const runtime = instance.runtime
    const dispose = runtime.register(definition, {
      actions: { [create]: async input => runtime.createObject({ type: widget, properties: input }) },
      functions: { [count]: async (_input, ontology) => ontology.listObjects(widget).length },
    })
    expect(runtime.definitions()).toHaveLength(1)
    const object = await runtime.executeAction(create, { name: 'A', count: 2 })
    expect(object).toMatchObject({ type: widget, properties: { name: 'A', count: 2 } })
    const updated = await runtime.updateObject({ id: (object as OntologyObject).id, properties: { count: 3 } })
    expect(updated).toMatchObject({ properties: { name: 'A', count: 3 } })
    expect(runtime.listObjects(widget)).toHaveLength(1)
    expect(await runtime.executeFunction(count, {})).toBe(1)
    const second = await runtime.executeAction(create, { name: 'B' }) as OntologyObject
    const link = await runtime.createLink({ type: related, from: (object as OntologyObject).id, to: second.id })
    expect(runtime.listLinks({ from: (object as OntologyObject).id })).toEqual([link])
    await expect(runtime.createLink({ type: related, from: second.id, to: second.id })).rejects.toThrow('one-to-many cardinality')
    await expect(runtime.executeAction(create, {})).rejects.toThrow('is required')
    await expect(runtime.createObject({ type: widget, properties: { count: 1 } })).rejects.toThrow('is required')
    await expect(runtime.createObject({ type: widget, properties: { name: 'A', extra: true } })).rejects.toThrow('declares no property')
    dispose()
    expect(runtime.definitions()).toEqual([])
    await expect(runtime.executeAction(create, { name: 'C' })).rejects.toThrow('unknown action')
    await instance.dispose()
  })

  it('reloads durable objects through a new provider instance', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness(pool)
    first.runtime.register(definition, {
      actions: { [create]: async input => first.runtime.createObject({ type: widget, properties: input }) },
      functions: { [count]: async (_input, ontology) => ontology.listObjects(widget).length },
    })
    const created = await first.runtime.executeAction(create, { name: 'Persistent' }) as OntologyObject
    const target = await first.runtime.executeAction(create, { name: 'Target' }) as OntologyObject
    const linked = await first.runtime.createLink({ type: related, from: created.id, to: target.id })
    await first.dispose()

    const second = await harness(pool)
    second.runtime.register(definition, {
      actions: { [create]: async input => second.runtime.createObject({ type: widget, properties: input }) },
      functions: { [count]: async (_input, ontology) => ontology.listObjects(widget).length },
    })
    expect(second.runtime.listObjects(widget)).toEqual([created, target])
    expect(second.runtime.listLinks()).toEqual([linked])
    await second.dispose()
  })

  it('fails loud for duplicate ids and Actions without an executable adapter', async () => {
    const instance = await harness()
    const runtime = instance.runtime
    const implementation = {
      actions: { [create]: async () => undefined },
      functions: { [count]: async () => 0 },
    }
    runtime.register(definition, implementation)
    await expect(runtime.executeAction(create, { name: 'Invalid result' })).rejects.toThrow("result must be object type 'demo.widget'")
    expect(() => runtime.register(definition, implementation)).toThrow('already registered')
    const agentAction = OntologyActionId('demo.agent')
    const dispose = runtime.register({
      id: OntologyDefinitionId('agent-demo'),
      version: 0,
      objectTypes: [],
      linkTypes: [],
      functions: [],
      actions: [{ id: agentAction, label: 'Agent', driver: 'agent', description: 'Agent-routed.' }],
    })
    await expect(runtime.executeAction(agentAction, {})).rejects.toThrow('has no configured adapter')
    dispose()

    const badWidget = OntologyObjectTypeId('invalid.widget')
    const badFunction = OntologyFunctionId('invalid.fabricated')
    const disposeInvalid = runtime.register({
      id: OntologyDefinitionId('invalid'),
      version: 0,
      objectTypes: [{ id: badWidget, label: 'Invalid', description: 'Invalid fixture.', properties: [] }],
      linkTypes: [],
      functions: [{ id: badFunction, label: 'Fabricated', description: 'Returns an unstored object.', result: { kind: 'object', objectType: badWidget } }],
      actions: [],
    }, {
      functions: {
        [badFunction]: async () => ({ id: 'not-stored', type: badWidget, properties: {}, createdAt: 0, updatedAt: 0 }),
      },
    })
    await expect(runtime.executeFunction(badFunction, {})).rejects.toThrow("must reference a stored 'invalid.widget' object")
    disposeInvalid()
    await instance.dispose()
  })
})
