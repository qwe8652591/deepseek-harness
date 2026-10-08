# Agent Note: Panel workbench registration

Status: implemented

English | [中文](2026-09-13-panel-workbench-registration.zh.md)

## Problem

Requirements and design workbenches center on documents while reusing native Agent Sessions. Selecting their tabs must open their document interface without creating an unrelated Session or letting background Session selection close the document.

## Decision

The uiWorkspace registration distinguishes native Session groups from plugin-owned panels. Session groups retain the [preset-based navigation](2026-09-13-plugin-workbench-navigation.md). Panel registrations name an existing main slot and claim no presets. Their selection survives native Session list updates; explicitly opening a Conversation selects the native Session's group. Removing an active panel reveals the current Conversation without creating a Session.

## Alternatives considered

A placeholder preset would misclassify document Sessions and require unnecessary Host composition. Requirements-specific navigation in the sidebar would couple the shell to one product. A panel registration lets future document workbenches use the same navigation service.

## Consequences

Plugins declare the destination kind and register their UI and disposer through effects. The main panel and workbench keys may differ. Native Session execution, storage and Agent presets remain owned by their existing services; plugins can select a bound Session while keeping their document panel open.

## Verification

Workspace service tests cover panel selection, native updates, explicit Conversation navigation, workbench restoration, superseded creation and active-panel disposal. An owner-local snapshot records the panel and running Session selections together. The requirements plugin's built browser smoke verifies its registration against the actual Web profile.
