# @deepseek-ai/dsh-ontology-remote

English | [中文](README.zh.md)

Typed browser Remote for ontology definitions, object and relationship reads, Function execution, and Action dispatch. It is a Consumer of `ctx.ontology`; browser business plugins depend on this transport projection instead of binding to a local or platform Provider.

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
