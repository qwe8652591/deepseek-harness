/** Host-side bid process, review, and artifact behavior. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { OntologyFunctionId } from '@deepseek-ai/dsh-ontology'
import type {
  CreateOntologyObjectRequest,
  CreateOntologyLinkRequest,
  OntologyActionContext,
  OntologyActionHandlers,
  OntologyDefinition,
  OntologyFunctionHandlers,
  OntologyFunctionValue,
  OntologyImplementation,
  OntologyLink,
  OntologyLinkId,
  OntologyLinkQuery,
  OntologyObject,
  OntologyObjectId,
  OntologyObjectTypeId,
  UpdateOntologyObjectRequest,
} from '@deepseek-ai/dsh-ontology'
import { WorkflowRunId, type WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import {
  apply,
  APPROVE_BID_REVIEW,
  BID_OBJECT_TYPES,
  CREATE_BID_PROJECT,
  EXPORT_BID_DOCUMENT,
  RUN_BID_TO_REVIEW,
} from '../src/index.ts'

describe('Bid Studio Host contribution', () => {
  it('runs the complete route to review, records approval, and exports a traced artifact', async () => {
    const ctx = new Context()
    let definition: OntologyDefinition | undefined
    let implementation: OntologyImplementation | undefined
    const unregister = vi.fn()
    const register = vi.fn((value: OntologyDefinition, valueImplementation?: OntologyImplementation) => {
      definition = value
      implementation = valueImplementation
      return unregister
    })
    const disposeService = ctx.reflect.provide('ontology', { register })
    const disposeWorkflow = ctx.reflect.provide('workflowEngine', fakeWorkflowEngine())
    const unregisterTools = vi.fn()
    const registerTool = vi.fn(() => unregisterTools)
    const disposeTools = ctx.reflect.provide('tools', { register: registerTool })
    const fiber = ctx.plugin({ inject: ['ontology', 'tools'], apply })
    await fiber.await()

    expect(definition).toMatchObject({ id: 'bid-studio', version: 2 })
    expect(definition?.objectTypes).toHaveLength(13)
    expect(definition?.linkTypes).toHaveLength(12)
    expect(definition?.functions).toHaveLength(3)
    expect(definition?.actions).toHaveLength(11)
    const handlers = implementation?.actions
    const functions = implementation?.functions
    const repository = memoryOntology(functions)
    const create = requireHandler(handlers, CREATE_BID_PROJECT)
    const project = await create({ name: '城市数据平台' }, repository.context) as OntologyObject
    const run = await requireHandler(handlers, RUN_BID_TO_REVIEW)({
      projectId: project.id,
      tenderText: [
        '投标人必须具备 ISO 9001 认证，5分。',
        '提供城市数据平台同类案例，10分。',
        '项目必须在合同签订后 90 日内完成实施交付和验收，10分。',
        '投标报价不得超过采购预算，15分。',
      ].join('\n'),
    }, repository.context) as OntologyObject

    expect(run.properties).toMatchObject({ status: '待人工审核', currentStep: 'review' })
    expect(repository.list(BID_OBJECT_TYPES.requirement)).toHaveLength(4)
    expect(repository.list(BID_OBJECT_TYPES.scoreCriterion)).toHaveLength(4)
    expect(repository.list(BID_OBJECT_TYPES.requirement)[2]?.properties.category).toBe('交付')
    expect(repository.list(BID_OBJECT_TYPES.evidenceMatch).length).toBeGreaterThan(0)
    expect(repository.list(BID_OBJECT_TYPES.risk)).toHaveLength(1)
    expect(repository.list(BID_OBJECT_TYPES.task)).toHaveLength(1)
    expect(repository.list(BID_OBJECT_TYPES.response)).toHaveLength(4)
    expect(repository.list(BID_OBJECT_TYPES.workflowStep)).toHaveLength(8)
    expect(repository.links()).toHaveLength(31)
    expect(repository.list(BID_OBJECT_TYPES.review)[0]?.properties.status).toBe('待审核')

    await requireHandler(handlers, APPROVE_BID_REVIEW)({ projectId: project.id, reviewer: '张经理' }, repository.context)
    const artifact = await requireHandler(handlers, EXPORT_BID_DOCUMENT)({ projectId: project.id }, repository.context) as OntologyObject
    expect(artifact.properties).toMatchObject({ name: '城市数据平台-正式标书.md', format: 'markdown', status: '正式版' })
    expect(String(artifact.properties.content)).toContain('符合性矩阵')
    expect(repository.list(BID_OBJECT_TYPES.project)[0]?.properties.stage).toBe('已导出')
    expect(repository.list(BID_OBJECT_TYPES.workflowRun)[0]?.properties.status).toBe('已完成')
    expect(repository.list(BID_OBJECT_TYPES.response).every(response => response.properties.approved === true)).toBe(true)
    await expect(requireFunction(functions, OntologyFunctionId('bid.evidence-coverage'))({ projectId: project.id }, repository.context)).resolves.toBe(0.75)
    await expect(requireFunction(functions, OntologyFunctionId('bid.unresolved-risk-count'))({ projectId: project.id }, repository.context)).resolves.toBe(1)

    const completedRun = repository.list(BID_OBJECT_TYPES.workflowRun)[0]
    if (completedRun === undefined) throw new Error('missing workflow run')
    await repository.context.updateObject({ id: project.id, properties: { stage: '审核通过' } })
    await repository.context.updateObject({ id: completedRun.id, properties: { status: '待人工审核', currentStep: 'export' } })
    const recovered = await requireHandler(handlers, EXPORT_BID_DOCUMENT)({ projectId: project.id }, repository.context) as OntologyObject
    expect(recovered.id).toBe(artifact.id)
    expect(repository.list(BID_OBJECT_TYPES.artifact)).toHaveLength(1)
    expect(repository.list(BID_OBJECT_TYPES.project)[0]?.properties.stage).toBe('已导出')
    expect(repository.list(BID_OBJECT_TYPES.workflowRun)[0]?.properties).toMatchObject({ status: '已完成', currentStep: 'completed' })
    expect(registerTool).toHaveBeenCalledTimes(3)

    await fiber.dispose()
    expect(unregister).toHaveBeenCalledOnce()
    expect(unregisterTools).toHaveBeenCalledTimes(3)
    await disposeTools()
    await disposeWorkflow()
    await disposeService()
  })
})

function requireHandler(handlers: OntologyActionHandlers | undefined, action: keyof OntologyActionHandlers) {
  const handler = handlers?.[action]
  if (handler === undefined) throw new Error(`Action '${action}' did not register`)
  return handler
}

function requireFunction(handlers: OntologyFunctionHandlers | undefined, functionId: OntologyFunctionId) {
  const handler = handlers?.[functionId]
  if (handler === undefined) throw new Error(`Function '${functionId}' did not register`)
  return handler
}

function memoryOntology(functions: OntologyFunctionHandlers | undefined) {
  const objects: OntologyObject[] = []
  const links: OntologyLink[] = []
  let sequence = 0
  const context: OntologyActionContext = {
    async createObject(request: CreateOntologyObjectRequest): Promise<OntologyObject> {
      const now = Date.now()
      const object: OntologyObject = { id: `object-${++sequence}` as OntologyObjectId, type: request.type, properties: { ...request.properties }, createdAt: now, updatedAt: now }
      objects.push(object)
      return object
    },
    async updateObject(request: UpdateOntologyObjectRequest): Promise<OntologyObject> {
      const index = objects.findIndex(object => object.id === request.id)
      if (index < 0) throw new Error(`missing ${request.id}`)
      const current = objects[index]
      if (current === undefined) throw new Error(`missing ${request.id}`)
      const updated: OntologyObject = { ...current, properties: { ...current.properties, ...request.properties }, updatedAt: Date.now() }
      objects[index] = updated
      return updated
    },
    listObjects(type?: OntologyObjectTypeId): readonly OntologyObject[] {
      return objects.filter(object => type === undefined || object.type === type)
    },
    async createLink(request: CreateOntologyLinkRequest): Promise<OntologyLink> {
      const link: OntologyLink = { id: `link-${links.length + 1}` as OntologyLinkId, ...request, createdAt: Date.now() }
      links.push(link)
      return link
    },
    async deleteLink(id: OntologyLinkId): Promise<boolean> {
      const index = links.findIndex(link => link.id === id)
      if (index < 0) return false
      links.splice(index, 1)
      return true
    },
    listLinks(query: OntologyLinkQuery = {}): readonly OntologyLink[] {
      return links.filter(link => (query.type === undefined || link.type === query.type)
        && (query.from === undefined || link.from === query.from)
        && (query.to === undefined || link.to === query.to))
    },
    async executeFunction(functionId: OntologyFunctionId, input): Promise<OntologyFunctionValue> {
      const handler = requireFunction(functions, functionId)
      return await handler(input, context) as OntologyFunctionValue
    },
  }
  return { context, list: (type: OntologyObjectTypeId) => context.listObjects(type), links: () => context.listLinks() }
}

function fakeWorkflowEngine() {
  return {
    start(request: WorkflowStartRequest) {
      const controller = new AbortController()
      const result = (async () => {
        try {
          const steps = (request.args as { steps: string[] }).steps
          for (const stepId of steps) await request.activities?.['bid.execute-step']?.({ stepId }, controller.signal)
          await request.activities?.['bid.submit-review']?.({}, controller.signal)
          const value = await request.activities?.['bid.finish-review']?.({}, controller.signal)
          return { value: value ?? null, stopReason: 'completed' as const, agentsStarted: 0 }
        } catch (error) {
          return { value: null, stopReason: 'error' as const, error: error instanceof Error ? error.message : String(error), agentsStarted: 0 }
        }
      })()
      return {
        id: WorkflowRunId('test-workflow-run'),
        meta: request.meta,
        result,
        cancel: (reason?: string) => { controller.abort(reason) },
        dispose: async () => { await result },
      }
    },
  }
}
