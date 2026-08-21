import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import LocalOntologyRuntime from '@deepseek-ai/dsh-ontology-local'
import WorkerThreadWorkflowEngine from '@deepseek-ai/dsh-workflow-worker-thread'
import type { OntologyObject } from '@deepseek-ai/dsh-ontology'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { BID_OBJECT_TYPES, BID_ONTOLOGY, CREATE_BID_PROJECT, RUN_BID_TO_REVIEW } from '../src/definition.ts'
import { createBidActionHandlers, createBidFunctionHandlers } from '../src/workflow.ts'

describe('Bid Studio real local runtime', () => {
  it('runs the standard process through a worker and persists its ontology graph', async () => {
    const ctx = new Context()
    const storageFiber = await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    const disposeSubagents = ctx.reflect.provide('subagents', {
      getProvider: () => ({}),
      start: async () => { throw new Error('activity-only workflow must not start a subagent') },
    })
    const workflowFiber = await ctx.plugin(WorkerThreadWorkflowEngine, {})
    const ontologyFiber = await ctx.plugin(LocalOntologyRuntime)
    const unregister = ctx.ontology.register(BID_ONTOLOGY, {
      actions: createBidActionHandlers(request => ctx.workflowEngine.start(request)),
      functions: createBidFunctionHandlers(),
    })

    const project = await ctx.ontology.executeAction(CREATE_BID_PROJECT, { name: '真实运行时验收' }) as OntologyObject
    const run = await ctx.ontology.executeAction(RUN_BID_TO_REVIEW, {
      projectId: project.id,
      tenderText: [
        '投标人必须具有有效 ISO 9001 认证，5分。',
        '提供城市数据平台同类案例，10分。',
        '项目必须在合同签订后 90 日内完成实施交付和验收，10分。',
        '投标报价不得超过采购预算，15分。',
      ].join('\n'),
    }) as OntologyObject

    expect(run.properties).toMatchObject({ status: '待人工审核', currentStep: 'review' })
    expect(ctx.ontology.listObjects(BID_OBJECT_TYPES.workflowStep)).toHaveLength(8)
    expect(ctx.ontology.listLinks().length).toBeGreaterThan(20)
    expect(ctx.ontology.listObjects(BID_OBJECT_TYPES.review)).toHaveLength(1)

    unregister()
    await ontologyFiber.dispose()
    await workflowFiber.dispose()
    await disposeSubagents()
    await facility.closeAll()
    await storageFiber.dispose()
  })
})
