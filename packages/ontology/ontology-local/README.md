# @deepseek-ai/dsh-ontology-local

English | [中文](README.zh.md)

Local Provider for `ctx.ontology`. It validates reloadable definitions, stores immutable object and relationship snapshots through `storage-domain`, enforces endpoint types and cardinality, rebuilds graph caches on startup, executes read-only Function adapters, and dispatches package-owned Action adapters. The Web profile's JSON storage backend keeps records under the Harness home directory.

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
