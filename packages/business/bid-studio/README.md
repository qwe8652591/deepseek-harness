# @deepseek-ai/dsh-bid-studio

English | [中文](README.zh.md)

Installable tender-workbench plugin. The Host contribution owns the complete bid ontology, standard response process, local validation adapters, and three model tools. The browser contribution owns the `投标工作台` navigation row and keyed application page. Removing or reloading the plugin removes both contributions through Cordis effects.

The standard process imports tender text, extracts requirements and score criteria, prepares enterprise evidence, records evidence matches, identifies risks and tasks, generates response sections, and pauses at a human review gate. Approval is required before the process assembles a formal Markdown artifact for preview or download. The project, process steps, and every business object are durable; [`CONTEXT.md`](CONTEXT.md) defines the domain terms.

The local validation composition executes `agent` steps with repeatable algorithms so the route can be accepted without an API key. The versioned process runs in `ctx.workflowEngine`; its declared host activities invoke ontology Actions, while read-only coverage and risk calculations use ontology Functions. Each Action retains its intended `driver`; a real model router can replace the parsing and generation adapters without changing objects, the review gate, or the workbench.

The workbench ontology inspector has separate views for object types and their properties, directional relationship types and cardinality, read-only Functions, Actions and their driver/input/result definitions, and process steps with their Actions and produced object types. The local Provider stores the relationship instances created by the standard process, so graph traceability survives restart.

## Model Experience

### Bid tools

#### What the model sees

`bid_create_project` creates a durable project. `bid_run_to_review` accepts tender text, executes the automated steps, and returns a run waiting for human review. `bid_export_document` exports the formal artifact only after the workbench records approval.

#### Token effect

Three compact tool schemas are added to the model request when this plugin is active; ontology objects are not added to model context automatically.

#### KV Cache effect

Stable until the bid tool names, descriptions, or schemas change.

## Known Limitations and Deferred Work

- **Validation-grade document intake** — the workbench accepts text and extracts one requirement per useful line; PDF/DOCX parsing, OCR, and page coordinates need a document-ingestion adapter.
- **Validation-grade AI steps** — parsing, matching, and response generation use repeatable local algorithms rather than a model; production needs Agent routing, prompt versions, and output validation.
- **Markdown formal artifact** — the review gate and formal status execute, while DOCX/PDF layout, signature, and template adapters remain separate work.
- **No Action transaction** — each object and relationship write is durable, but a multi-write Action is not yet committed as one storage transaction; the process records a failed step and a later recovery policy must decide whether to resume or compensate.
- **One process run per project** — the validation composition idempotently returns the first run for a project; re-analysis, review rejection, and process-version migration need a new run policy.
