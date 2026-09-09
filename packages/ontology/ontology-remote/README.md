---
description: "Read ontology definitions and dispatch business operations from browser clients."
kind: "package-reference"
---

# @deepseek-ai/dsh-ontology-remote

English | [中文](README.zh.md)

## Summary

Typed browser Remote for ontology definitions, object and relationship reads, Function execution, and Action dispatch. It is a Consumer of `ctx.ontology`; browser business plugins depend on this transport projection instead of binding to a local or platform Provider.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Browser Consumers use the Remote alongside a Host Provider; see the [ontology subsystem](../../../docs/subsystems/ontology.md).

## Model Experience

### Browser ontology Remote

#### What the model sees

Nothing directly. `ctx.ontologyRemote` serves browser plugins rather than model requests.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent until a model-facing Consumer projects ontology data.

## Known Limitations and Deferred Work

- **Object-returning Actions** — the first Remote projects Actions that return an ontology object. Broader workflow results need an explicit wire result union.
- **No subscription stream** — the Demo workbench refreshes after mutations; live multi-window updates remain deferred.

<a id="dev-note"></a>
### Dev Note

No invariant companion is published: the Remote delegates to the ontology service and owns no independent mutable state or event stream.
