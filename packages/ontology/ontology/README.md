# @deepseek-ai/dsh-ontology

English | [中文](README.zh.md)

Provider-neutral ontology Service Definition. It defines object and link types, read-only Functions, state-changing Actions, branded identifiers, immutable graph snapshots, and the `ctx.ontology` contract. Business plugins register definitions and executable adapters; a Provider owns validation, graph storage, updates, and dispatch. Workflow is deliberately outside `OntologyDefinition`: an orchestrator coordinates Functions and Actions without becoming a third ontology primitive.

## Model Experience

### Ontology runtime

#### What the model sees

Nothing directly. `ctx.ontology` Consumers may expose selected definitions or Actions through separately documented tools and prompt sections.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent until a Consumer projects ontology data into a model request.

## Known Limitations and Deferred Work

- **Scalar properties only** — the first runtime stores declared string, number, boolean, and date-string properties; nested business records need explicit types.
- **No transactional Action unit** — the API validates each object or link mutation, but does not yet commit all writes made by one Action atomically.
