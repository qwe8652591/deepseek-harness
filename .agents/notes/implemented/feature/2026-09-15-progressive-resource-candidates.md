# Agent Note: Progressive resource candidates

Status: implemented

English | [中文](2026-09-15-progressive-resource-candidates.zh.md)

## Problem

A shared resource source combines local files, Sessions and remote Studio listings. Waiting for every listing delays available resources when one backend is slow. Replacing a partially displayed array can also move keyboard selection to a different resource at the same index.

## Decision

The [native input-trigger menu](../../../../packages/client/ui-input-trigger/README.md) accepts request-scoped candidate publication before final settlement. Sources retain backend discovery, grouping and error presentation; the controller owns publication cancellation and native picks. Disabled status rows cannot become selections. Updates within a query preserve selection by opaque candidate value, with name and section as the fallback for value-less candidates. Final settlement closes the publication callback; query replacement, menu dismissal and Session disposal invalidate outstanding publications.

## Alternatives considered

Waiting for all providers preserves one final result but delays independent choices. Registering every discovered backend as a global trigger source couples Session-scoped discovery to the global source roster and single-source launcher. A second resource popup duplicates the native composer's interaction rules.

## Consequences

The Kit can display provider results as they arrive while retaining one native resource source and codec. It owns localized loading and failure rows. The menu's empty-result auto-close rule also applies to intermediate publications. Focused controller, reducer and rendered-menu tests cover selectable partial results, stable selection, disabled status rows and discarded late publications. Candidate discovery changes no model input or Session log format.
