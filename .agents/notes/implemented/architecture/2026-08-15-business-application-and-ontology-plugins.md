# Agent Note: Business applications compose from UI slots and ontology plugins

Status: implemented

English | [中文](2026-08-15-business-application-and-ontology-plugins.zh.md)

## Problem

The Web Client composed conversation features through slots but offered no additive entry point for an installable business application to add both a sidebar command and a center-column page. A tender workbench would therefore have to replace the conversation, modify the sidebar package, or ship as a separate frontend. Each choice couples one business domain to the core client and prevents plugin installation or hot reload from owning the complete feature lifetime.

The tender domain also needs stable object, relationship, and Action definitions without binding those definitions to Electron or to one persistence location. Putting ontology state in the desktop shell would make a later platform Provider a second application architecture rather than a provider replacement.

## Decision

`ui-layout` declares the root-scoped keyed `application` slot and extends `ctx.layout` with an observable active-application id. The frame renders the conversation and details columns when no application is active; otherwise it dispatches the active id through the `application` slot and closes the details track. `ui-sidebar` declares the additive `sidebar.application` list slot. A business plugin contributes its navigation command and keyed page through those two slots, and their registrations disappear with the plugin effect.

`@deepseek-ai/dsh-ontology` defines the provider-neutral `ctx.ontology` API, branded identifiers, object/link/Function/Action descriptors, immutable graph snapshots, validated updates, and adapter contracts. A Function is read-only and returns a declared scalar, object, or object list; an Action may mutate objects and links or invoke a Function. Workflow is not an ontology primitive: it remains a separate orchestration capability above Functions and Actions. `@deepseek-ai/dsh-ontology-local` stores object and link snapshots through the existing `storage-domain` capability, rebuilds immutable caches at startup, enforces link endpoints and cardinality, and dispatches contribution-owned adapters. An Action's `machine`, `workflow`, `agent`, or `human` driver records the intended executor; missing adapters fail explicitly. `@deepseek-ai/dsh-ontology-remote` projects definitions, graph reads, Function execution, and object-returning Action dispatch to browser Consumers without binding them to the local Provider.

`@deepseek-ai/dsh-bid-studio` is a Consumer on both planes. Its Host half registers thirteen object types covering project, source, analysis, evidence, response, human review, process state, and artifacts; twelve traceability link types; three Functions; eleven Actions; an eight-step standard response process; and three model-facing tools. The process runs through `ctx.workflowEngine`: its script calls namespaced Host activities, the activities execute ontology Actions, and the matching step invokes the evidence-coverage Function before recording its result. Those Actions create durable link instances as well as denormalized foreign ids. The local validation composition executes agent-designated parsing and generation through repeatable adapters, records every process step, and stops before export until a human approves the review object. Its browser half registers the `投标工作台` menu and a page that runs and observes the same process, displays requirement-to-response traceability, records approval, and previews or downloads the formal Markdown artifact. `@deepseek-ai/dsh-bid-studio-bundle` installs the Provider, Remote, workflow engine, and Consumer as one profile layer.

`@deepseek-ai/dsh-desktop` is a process supervisor rather than an in-process Host. Electron starts the ordinary Web profile plus the bid bundle in an independent Node child, consumes a small ready/shutdown IPC protocol, writes child output to the Electron log directory, and enforces a finite graceful shutdown. The BrowserWindow loads only the child's bound loopback origin. This keeps Electron responsible for desktop and runtime lifecycle without giving it ontology or tender behavior.

Electron does not expose the private Node ESM loader used by Cordis HMR. The Loader therefore resolves bare plugin names from the config tree's `baseUrl` with `createRequire()` when that private loader is absent, preserving profile-local module resolution. The desktop surface opts out of profile-patch watching; installed plugin and profile changes take effect after restart, while ordinary Node-hosted Web profiles retain live config and module reload.

The ontology definition belongs to the business plugin; the ontology runtime belongs to a replaceable Provider; Electron owns only window and process lifecycle. This division lets a platform Provider replace local storage and execution without changing the bid definition or page registration.

## Verification

The layout and sidebar client specs pin slot declaration, navigation observation, rendering, teardown, and snapshots. The local Provider specs pin durable object/link reload, cardinality, validated updates, definition disposal, Function execution, Action dispatch, and missing-adapter failures. Workflow integration specs run Host activities through a real worker without a parent agent. The Remote specs pin typed projection. Bid Studio Host tests execute intake, analysis, scoring, evidence matching, risk/task creation, response generation, review approval, and formal export through the registered Function/Action interfaces and assert the created graph; browser specs pin menu/page registration, ontology views, navigation, and effect-owned removal. The desktop TypeScript and bundle builds pin the independent runtime entrypoint and hardened BrowserWindow supervisor.

## Alternatives considered

- **Hardcode the tender workbench into Electron**: rejected because business definitions, runtime state, and navigation would share the desktop release lifecycle and could not be installed or hot-reloaded independently.
- **Make every business plugin replace the conversation slot**: rejected because only one single-slot owner can exist and the business page would destroy conversation state instead of coexisting with it.
- **Store ontology definitions in the local Provider**: rejected because Provider replacement would also require redefining every business type and Action. Definitions are domain-owned contributions; storage and execution are provider-owned.
- **Build the first ontology runtime directly on the platform**: rejected for the local-first product slice. The provider-neutral API preserves that route without requiring a platform dependency to open the workbench.

## Consequences

Business plugins can add a menu and full page without editing the shell after the two generic slots exist, and Cordis effect disposal owns every registration lifetime. Node-hosted Web profiles can use that lifecycle for hot reload; the Electron client applies package updates on restart. The bid bundle is installable over the standard Web profile, while the Electron app supervises the same composition rather than embedding a desktop-only runtime.

The local Provider stores link instances and supports filtered graph reads, but multi-write Actions are not yet one storage transaction. Bid Studio keeps selected foreign-id properties as denormalized query fields while links remain the authoritative traceability edges. The first Remote supports the declared Function result union, object-returning Actions, and refresh-after-mutation rather than an open Action result union or subscription stream. The validation composition accepts text, uses repeatable agent-step adapters, allows one process run per project, and exports Markdown. Real model routing, permissions, audit events, PDF/DOCX ingestion, transactional recovery, reruns and rejection loops, and Office export remain named capability additions rather than implicit behavior in the desktop shell.
