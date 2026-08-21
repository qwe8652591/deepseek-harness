# Ontology

English | [中文](ontology.zh.md)

The ontology subsystem gives business plugins a stable language for object types, directional relationships, read-only Functions, and state-changing Actions without choosing local or platform storage. [`@deepseek-ai/dsh-ontology`](../../packages/ontology/ontology/README.md) declares the provider-neutral `ctx.ontology` service, [`@deepseek-ai/dsh-ontology-local`](../../packages/ontology/ontology-local/README.md) supplies the durable local Provider, [`@deepseek-ai/dsh-ontology-remote`](../../packages/ontology/ontology-remote/README.md) projects it to browser Consumers, and business plugins such as [Bid Studio](../../packages/business/bid-studio/README.md) own domain definitions and handlers. The [business-application and ontology Agent Note](../../.agents/notes/implemented/architecture/2026-08-15-business-application-and-ontology-plugins.md) records this division.

## Definitions

An `OntologyDefinition` is one versioned, hot-reloadable contribution. It contains closed property catalogs for object types, directional link descriptors with cardinality, Function descriptors with declared input and result categories, and Action descriptors with declared inputs, result type, and intended driver. Every definition, type, link, Function, and Action id is namespaced and branded; a Provider rejects duplicate ids and references that do not resolve within the contribution. Definitions belong to the business plugin that understands their meaning, not to the storage Provider or desktop shell.

An `OntologyObject` is an immutable provider-owned snapshot containing its opaque id, declared type, complete property map, and timestamps. `createObject()` validates required fields, allowed values, undeclared fields, and shared scalar types (`string`, `number`, `boolean`, and a `date` string accepted by `Date.parse()`). `updateObject()` merges a declared property patch, validates the complete replacement, persists it, and returns a new snapshot. `OntologyLink` records are independently durable: `createLink()` validates endpoint types, duplicate edges, and declared cardinality; `listLinks()` filters by type or endpoint; `deleteLink()` removes one edge.

## Functions, Actions, and workflow

A Function is a reusable read-only calculation over the current object and relationship snapshots. Its handler receives `OntologyReadContext` and returns a validated scalar, stored object, or stored object list. An Action declares a `machine`, `workflow`, `agent`, or `human` driver and receives `OntologyActionContext`, which can create and update objects and relationships or call a registered Function; a declared object result must resolve to a stored object of that type. Missing Function handlers and executable `machine` Action handlers fail at registration; any invoked Action without an adapter fails explicitly.

Workflow is not part of `OntologyDefinition`. It is the coordination layer above Functions and Actions: a workflow script may call declared host activities, and those activity handlers invoke ontology Actions or Functions through the Provider. Registration returns a disposer. Removing or hot-reloading a business plugin removes its definitions and adapters through that disposer; stored graph records remain Provider-owned. The local Provider persists object and link snapshots through `storage-domain` and rebuilds immutable caches at startup.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Source: [`packages/ontology/ontology/src/index.ts:30`](../../packages/ontology/ontology/src/index.ts)

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

Source: [`packages/ontology/ontology-remote/src/index.ts:27`](../../packages/ontology/ontology-remote/src/index.ts)
<!-- END GENERATED cordis-surface -->
