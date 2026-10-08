# Agent Note: Plugin workbench navigation

Status: implemented

English | [中文](2026-09-13-plugin-workbench-navigation.zh.md)

## Problem

Different agent engines need separate conversation context while users retain one Workspace browser, Session list and conversation interface. A tab must select the right engine without duplicating those controls or interrupting running work.

## Decision

Workbenches select a preset-based view of native DSH Sessions. Cowork and Code share the Workspace browser, conversation, composer, history and interaction UI. The browser registers workbench membership and a default Agent preset through uiWorkspace; the sidebar registers only its tab. Each preset belongs to at most one workbench. Unknown presets remain in Cowork.

DSH owns Session ids, durable logs and selection. The Claude provider owns execution and its native resume id. Switching tabs restores the last selected Session for that workbench or opens an empty one in the shared Workspace. Running tasks continue. Navigation generations prevent a slow create from selecting itself after the user moves elsewhere. Session creation forwards the preset and publishes it before asynchronous list refresh.

Preset-specific model policies separate supported providers from providers reserved for one engine. Code and Cowork can both offer DeepSeek while the Claude provider stays reserved for Code. Code selections are logged in the native Session with saveAsDefault false, preserving the general Cowork default. New Code sessions inherit the DSH default; existing selections survive. Model context is never transferred merely by selecting another workbench.

The Aiko Claude plugin intercepts Code conversation streams at llm/stream while preserving the selected DeepSeek provider and model in request/header. Claude Code executes its own loop using the DSH credential reference and the same endpoint's Anthropic API. Title requests use the DSH provider directly. A model or connection change rebuilds the CLI process with its existing resume id; credentials remain in process memory and the explicit child environment.

## Alternatives considered

A separate Code session database and custom conversation adapter duplicate navigation behavior and omit native capabilities. Native Sessions let the existing client features operate on the same identities while the provider translates Claude events. Shared projects do not imply shared model transcripts. Workbench selection is retained during the browser lifetime; durable membership comes from each Session's preset.

## Consequences

The generic workbench.conversation presenter remains available for plugin projections and read-only legacy records. Aiko's old aiko_code records retain their storage and are exposed through an archive panel. No committed Session format generation is rewritten, and agent-loop and SDK event formats remain unchanged.

## Verification

Native navigation tests cover separate preset creation, filtered lists, selection restoration and superseded creation. Model tests cover engine provider filtering and preserved shared defaults. Sidebar snapshots retain the native controls across a tab switch. Provider tests cover native transcript rendering, tool traces and approvals; actual host composition requires an authenticated web-profile smoke.
