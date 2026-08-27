# 本体

[English](ontology.md) | 中文

本体子系统为业务插件提供稳定的对象类型、有向关系、只读 Function 和改变状态的 Action 语言，同时不指定本地或平台存储。[`@deepseek-ai/dsh-ontology`](../../packages/ontology/ontology/README.zh.md) 声明与 Provider 无关的 `ctx.ontology` 服务，[`@deepseek-ai/dsh-ontology-local`](../../packages/ontology/ontology-local/README.zh.md) 提供持久化本地 Provider，[`@deepseek-ai/dsh-ontology-remote`](../../packages/ontology/ontology-remote/README.zh.md) 将能力投影给浏览器 Consumer，[标书工作台](../../packages/business/bid-studio/README.zh.md)等业务插件持有领域定义与 handler。[业务应用与本体 Agent Note](../../.agents/notes/implemented/architecture/2026-08-15-business-application-and-ontology-plugins.zh.md)记录了这一职责划分。

## 定义

一个 `OntologyDefinition` 是一项有版本、可热重载的贡献，其中包含对象类型的封闭属性目录、带基数的有向关系描述符、声明输入与返回类别的 Function 描述符，以及声明输入、结果类型和预期驱动者的 Action 描述符。每个定义、类型、关系、Function 与 Action id 都具有命名空间和品牌类型；Provider 会拒绝重复 id，以及无法在该贡献内解析的引用。定义属于理解其业务含义的业务插件，而不属于存储 Provider 或桌面外壳。

一个 `OntologyObject` 是 Provider 持有的不可变快照，包含不透明 id、声明类型、完整属性 map 与时间戳。`createObject()` 校验必填字段、允许值、未声明字段和共享标量类型（`string`、`number`、`boolean` 与可被 `Date.parse()` 接受的 `date` 字符串）。`updateObject()` 合并声明过的属性补丁，校验并持久化完整替换记录，然后返回新快照。`OntologyLink` 记录独立持久化：`createLink()` 校验端点类型、重复边和声明基数，`listLinks()` 按类型或端点筛选，`deleteLink()` 删除一条边。

## Function、Action 与 Workflow

Function 是基于当前对象与关系快照的可复用只读计算。handler 接收 `OntologyReadContext`，返回经过校验的标量、已存储对象或已存储对象列表。Action 声明 `machine`、`workflow`、`agent` 或 `human` 驱动方式，并接收 `OntologyActionContext`，可以创建和更新对象及关系，也可以调用已经注册的 Function；声明过的对象结果必须解析到对应类型的已存储对象。缺少 Function handler 或可执行的 `machine` Action handler 会在注册时失败；任何被调用但没有适配器的 Action 都会明确失败。

Workflow 不属于 `OntologyDefinition`，而是位于 Function 和 Action 之上的协调层：工作流脚本可以调用已声明的宿主 activity，这些 activity handler 再通过 Provider 调用本体 Action 或 Function。注册会返回 disposer。移除或热重载业务插件时，通过该 disposer 移除定义与适配器；已经存储的图记录仍由 Provider 持有。本地 Provider 通过 `storage-domain` 持久化对象和关系快照，并在启动时重建不可变缓存。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxontology--ontologyruntime-abstract-seam"></a>

### `ctx.ontology` — `OntologyRuntime` (abstract seam)

Provider contract for ontology definitions, graph state, Functions, and Actions.

```ts cordis-catalog
/**
 * Register one definition contribution.
 * @param definition - Business definition.
 * @param implementation - Function and Action adapters.
 * @returns Contribution disposer.
 */
abstract register(definition: OntologyDefinition, implementation?: OntologyImplementation): () => void

/**
 * Return active definitions in registration order.
 * @returns Immutable snapshot.
 */
abstract definitions(): readonly OntologyDefinition[]

/**
 * Create and validate an object.
 * @param request - Object fields.
 * @returns Provider-owned object.
 */
abstract createObject(request: CreateOntologyObjectRequest): Promise<OntologyObject>

/**
 * Merge declared properties into a stored object.
 * @param request - Object id and property patch.
 * @returns Updated immutable object.
 */
abstract updateObject(request: UpdateOntologyObjectRequest): Promise<OntologyObject>

/**
 * List immutable objects.
 * @param type - Optional type filter.
 * @returns Matching objects.
 */
abstract listObjects(type?: OntologyObjectTypeId): readonly OntologyObject[]

/**
 * Create and validate a link.
 * @param request - Link type and endpoint ids.
 * @returns Provider-owned link.
 */
abstract createLink(request: CreateOntologyLinkRequest): Promise<OntologyLink>

/**
 * Delete one link.
 * @param id - Link id.
 * @returns Whether the link existed.
 */
abstract deleteLink(id: OntologyLinkId): Promise<boolean>

/**
 * List immutable links.
 * @param query - Optional endpoint and type filters.
 * @returns Matching links.
 */
abstract listLinks(query?: OntologyLinkQuery): readonly OntologyLink[]

/**
 * Execute a registered read-only Function.
 * @param functionId - Function id.
 * @param input - Function fields.
 * @returns Validated Function result.
 */
abstract executeFunction( functionId: OntologyFunctionId, input: Readonly<Record<string, OntologyPropertyValue>>, ): Promise<OntologyFunctionValue>

/**
 * Execute a registered Action.
 * @param action - Action id.
 * @param input - Action fields.
 * @returns Driver result.
 */
abstract executeAction(action: OntologyActionId, input: Readonly<Record<string, OntologyPropertyValue>>): Promise<unknown>
```

Source: [`packages/ontology/ontology/src/index.ts`](../../packages/ontology/ontology/src/index.ts)

<a id="ctxontologyremote--ontologyremote"></a>

### `ctx.ontologyRemote` — `OntologyRemote`

Remote Consumer that keeps transport concerns out of the Provider interface.

```ts cordis-catalog
/**
 * Return every active versioned definition.
 * @returns Active definitions in registration order.
 */
@Remote('definitions') definitions(): readonly OntologyDefinition[]

/**
 * Return current object snapshots.
 * @param type - Optional object-type filter.
 * @returns Matching immutable objects.
 */
@Remote('listObjects') listObjects(type?: OntologyObjectTypeId): readonly OntologyObject[]

/**
 * Return current link snapshots.
 * @param query - Optional endpoint and type filters.
 * @returns Matching immutable links.
 */
@Remote('listLinks') listLinks(query?: OntologyLinkQuery): readonly OntologyLink[]

/**
 * Execute one registered read-only Function.
 * @param functionId - Function id.
 * @param input - Scalar Function fields.
 * @returns Validated Function result.
 */
@Remote('executeFunction') async executeFunction( functionId: OntologyFunctionId, input: Readonly<Record<string, OntologyPropertyValue>>, ): Promise<OntologyFunctionValue>

/**
 * Execute one registered Action through the Provider's declared route.
 * @param action - Action id.
 * @param input - Scalar Action fields.
 * @returns Object created or returned by the Action.
 */
@Remote('executeAction') async executeAction(action: OntologyActionId, input: Readonly<Record<string, OntologyPropertyValue>>): Promise<OntologyObject>
```

Source: [`packages/ontology/ontology-remote/src/index.ts`](../../packages/ontology/ontology-remote/src/index.ts)
<!-- END GENERATED cordis-surface -->
