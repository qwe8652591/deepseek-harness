---
description: "Ontology definitions, durable graph storage, and browser access."
kind: "package-group"
---

# Ontology packages

English | [中文](README.zh.md)

## Summary

Ontology definitions, durable graph storage, and browser access.

## Table of Contents

- [Packages](#packages)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role | `ctx` key |
|---|---|---|
| [`ontology`](ontology/README.md) | Service Definition for definitions, graph state, Functions, and Actions | `ontology` |
| [`ontology-local`](ontology-local/README.md) | Durable local Provider over `storage-domain` | provides `ontology` |
| [`ontology-remote`](ontology-remote/README.md) | Typed browser Consumer | `ontologyRemote` |

Business definitions belong to Consumer plugins. Providers own graph storage and Function/Action execution, so a local or platform Provider can implement the same API. Workflow remains a separate orchestration capability that may invoke ontology primitives.

The [Ontology subsystem](../../docs/subsystems/ontology.md) defines the shared types and runtime semantics.

<a id="dev-note"></a>
## Dev Note

None.
