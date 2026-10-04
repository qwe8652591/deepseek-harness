# Agent Note: Resource mentions in native user text

Status: implemented

English | [中文](2026-09-15-resource-mention-display.zh.md)

## Problem

The plain `@name` projection interprets a canonical resource URI as a path, exposing its last identifier and revision in the user bubble instead of its display label. Appending referenced content to that bubble also exposes large serialized payloads as human text.

## Decision

The shared `projectUserText` primitive recognizes `@[label](dsh-resource://...)` alongside native Session references. Both use the authored label; the original URI and revision remain in the hover title and logged input. Resource providers retain URI validation, authorization and reads. The primitive introduces no provider-specific dependency or navigation behavior.

Resource producers record quoted content as separate standard plugin context messages. Native conversation classification and its collapsed context row provide the display; no additional chat renderer is required. Engine adapters that only consume direct human messages must explicitly accept their resource producer's context.

## Alternatives considered

**A workbench-owned bubble renderer** duplicates native conversation rendering and leaves queue rows inconsistent. Shared projection handles both consumers.

**Stripping URI revisions or hidden text from stored input** loses reference identity or model-input evidence. Display projection preserves the original text, and context remains independently logged.

## Consequences

Sent and queued references display compact names with inert user-authored labels. The primitive treats resources as generic file references; it does not infer provider-specific icons. Existing user message bodies are not rewritten or filtered by marker strings. Focused projection snapshots cover revisions, spaces, punctuation and inert markup; native chat tests verify default folding and expansion of separately logged context.
