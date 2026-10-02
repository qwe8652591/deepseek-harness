# Agent Note: Report dependent suspension after disabling a provider

English | [中文](2026-10-02-dependent-plugin-suspension.zh.md)

Status: implemented

## Problem

Disabling a service provider stopped its dependent plugins through Cordis injection, but profile reconciliation reported those newly pending entries as activation failures. Plugin Manager returned `application: failed` for a successfully saved disable operation and omitted the successful reload notification.

## Decision

Reconciliation records active entries before applying patches. When an active entry is disabled or removed, an unchanged entry with the same fiber can become pending without failing reconciliation. Its missing-service diagnostic remains in the returned warnings. Explicit enablement targets must still activate; new entries, changed configurations, failed fibers and disposal errors still fail.

## Alternatives considered

Persistently disabling dependents would overwrite the user's choices and prevent automatic recovery. Ignoring all pending entries would hide broken new installations. The exception uses observed lifecycle transitions and retains the existing activation policy for other entries.

## Consequences

Provider reactivation restores dependents through Cordis without editing their profile selections. Loader composition tests cover plugin and bundle toggles, explicit activation of a suspended dependent, and an unrelated newly pending entry. The workbench distribution exercises the packed components against the actual DSH profile and Plugin Manager.
