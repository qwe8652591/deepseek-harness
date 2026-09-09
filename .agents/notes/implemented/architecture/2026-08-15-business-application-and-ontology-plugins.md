# Agent Note: Business applications compose from UI slots and ontology plugins

Status: implemented

English | [中文](2026-08-15-business-application-and-ontology-plugins.zh.md)

## Problem

The Web Client composed conversation features through slots but offered no additive entry point for an installable business application to add both a sidebar command and a center-column page. A tender workbench would therefore have to replace the conversation, modify the sidebar package, or ship as a separate frontend. Each choice couples one business domain to the core client and prevents plugin installation or hot reload from owning the complete feature lifetime.

The tender domain also needs stable object, relationship, and Action definitions without binding those definitions to Electron or to one persistence location. Putting ontology state in the desktop shell would make a later platform Provider a second application architecture rather than a provider replacement.

## Decision

`ui-layout` declares the root-scoped keyed `main` slot; `ctx.layout.selectPanel(id)` selects a registered panel and `selectPanel(null)` returns to the conversation. `ui-sidebar` declares the additive `sidebar.panellist` list slot and owns its navigation buttons. A business plugin registers an icon with a localized label and a main page under the same branded panel id. Both registrations disappear with the plugin effect.

`@deepseek-ai/dsh-ontology` defines the provider-neutral `ctx.ontology` API, branded identifiers, object/link/Function/Action descriptors, immutable graph snapshots, validated updates, and adapter contracts. A Function is read-only and returns a declared scalar, object, or object list; an Action may mutate objects and links or invoke a Function. Workflow is not an ontology primitive: it remains a separate orchestration capability above Functions and Actions. `@deepseek-ai/dsh-ontology-local` stores object and link snapshots through the existing `storage-domain` capability, rebuilds immutable caches at startup, enforces link endpoints and cardinality, and dispatches contribution-owned adapters. An Action's `machine`, `workflow`, `agent`, or `human` driver records the intended executor; missing adapters fail explicitly. `@deepseek-ai/dsh-ontology-remote` projects definitions, graph reads, Function execution, and object-returning Action dispatch to browser Consumers without binding them to the local Provider.

`@deepseek-ai/dsh-bid-studio` is a Consumer on both planes. Its Host half registers thirteen object types covering project, source, analysis, evidence, response, human review, process state, and artifacts; twelve traceability link types; three Functions; eleven Actions; an eight-step standard response process; and three model-facing tools. The process runs through `ctx.workflowEngine`: its script calls namespaced Host activities, the activities execute ontology Actions, and the matching step invokes the evidence-coverage Function before recording its result. Those Actions create durable link instances as well as denormalized foreign ids. The local validation composition executes agent-designated parsing and generation through repeatable adapters, records every process step, and stops before export until a human approves the review object. Its browser half registers the `投标工作台` menu and a page that runs and observes the same process, displays requirement-to-response traceability, records approval, and previews or downloads the formal Markdown artifact. `@deepseek-ai/dsh-bid-studio-bundle` installs the Provider, Remote, workflow engine, and Consumer as one profile layer.

The [official Electron application](../../../../apps/desktop/README.md) owns window and runtime lifecycle. Business definitions and execution remain installable plugins; the desktop shell contains no ontology or tender behavior.

Bid Studio compiles its Host and browser entries separately. The Host entry keeps shared plugin peers for tool registration and ontology adapters, following the same dependency classification as the API controllers. The browser entry registers typed Chinese and English dictionaries through the standard locale service; stored business records and ontology labels retain their source language. The ontology packages and bid bundle omit invariant companions because they own no independently observable relation beyond their existing validation and registry ownership.

The bid bundle is an optional Web profile layer. Desktop owns a separate executable package graph and plugin installation policy; enabling the Web bundle does not implicitly install it into the desktop profile.

The ontology definition belongs to the business plugin; the ontology runtime belongs to a replaceable Provider; Electron owns only window and process lifecycle. This division lets a platform Provider replace local storage and execution without changing the bid definition or page registration.

## Verification

The layout and sidebar client specs pin slot declaration, navigation observation, rendering, teardown, and snapshots. The local Provider specs pin durable object/link reload, cardinality, validated updates, definition disposal, Function execution, Action dispatch, and missing-adapter failures. Workflow integration specs run Host activities through a real worker without a parent agent. The Remote specs pin typed projection. Bid Studio Host tests execute intake, analysis, scoring, evidence matching, risk/task creation, response generation, review approval, and formal export through the registered Function/Action interfaces and assert the created graph; browser specs pin menu/page registration, ontology views, navigation, and effect-owned removal. Desktop lifecycle and transport verification belongs to the official application's test suite.

## Alternatives considered

- **Hardcode the tender workbench into Electron**: rejected because business definitions, runtime state, and navigation would share the desktop release lifecycle and could not be installed or hot-reloaded independently.
- **Make every business plugin replace the conversation slot**: rejected because only one single-slot owner can exist and the business page would destroy conversation state instead of coexisting with it.
- **Store ontology definitions in the local Provider**: rejected because Provider replacement would also require redefining every business type and Action. Definitions are domain-owned contributions; storage and execution are provider-owned.
- **Build the first ontology runtime directly on the platform**: rejected for the local-first product slice. The provider-neutral API preserves that route without requiring a platform dependency to open the workbench.

## Consequences

Business plugins add a menu and full page through the standard panel slots, and Cordis effect disposal owns every registration lifetime. Web profiles support live reload. The official desktop application owns package updates separately from the business plugin; its matching runtime and client assets follow the desktop release policy.

The local Provider stores link instances and supports filtered graph reads, but multi-write Actions are not yet one storage transaction. Bid Studio keeps selected foreign-id properties as denormalized query fields while links remain the authoritative traceability edges. The first Remote supports the declared Function result union, object-returning Actions, and refresh-after-mutation rather than an open Action result union or subscription stream. The validation composition accepts text, uses repeatable agent-step adapters, allows one process run per project, and exports Markdown. Real model routing, permissions, audit events, PDF/DOCX ingestion, transactional recovery, reruns and rejection loops, and Office export remain named capability additions rather than implicit behavior in the desktop shell.
