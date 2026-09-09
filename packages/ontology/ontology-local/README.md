---
description: "Store and validate ontology objects and links with the local storage-domain provider."
kind: "package-reference"
---

# @deepseek-ai/dsh-ontology-local

English | [中文](README.zh.md)

## Summary

Local Provider for `ctx.ontology`. It validates reloadable definitions, stores immutable object and relationship snapshots through `storage-domain`, enforces endpoint types and cardinality, rebuilds graph caches on startup, executes read-only Function adapters, and dispatches package-owned Action adapters. The Web profile's JSON storage backend keeps records under the Harness home directory.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Install this Provider with a business Consumer as described in the [ontology subsystem](../../../docs/subsystems/ontology.md).

## Model Experience

### Local ontology state

#### What the model sees

Nothing directly. A Consumer must deliberately expose selected `ctx.ontology` state or Actions.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent until a Consumer adds ontology content to a model request.

## Known Limitations and Deferred Work

- **Contribution-owned adapters** — `machine`, `workflow`, `agent`, and `human` describe the intended executor; an Action executes only when its business contribution installs an adapter for the active composition.
- **Single-process graph queries** — the first Provider supports filtered object/link scans; indexes and platform-scale graph traversal belong to a platform Provider.

<a id="dev-note"></a>
### Dev Note

No invariant companion is published: the Provider validates each mutation before publishing it, and its private maps have no independent authoritative observation to compare against.
