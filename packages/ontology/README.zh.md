---
description: "本体定义、持久化图存储与浏览器访问。"
kind: "package-group"
---

# 本体包

[English](README.md) | 中文

## 概述

本体定义、持久化图存储与浏览器访问。

## 目录

- [包](#packages)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 角色 | `ctx` key |
|---|---|---|
| [`ontology`](ontology/README.zh.md) | 定义、图状态、Function 与 Action 的 Service Definition | `ontology` |
| [`ontology-local`](ontology-local/README.zh.md) | 基于 `storage-domain` 的持久化本地 Provider | 提供 `ontology` |
| [`ontology-remote`](ontology-remote/README.zh.md) | 类型化浏览器 Consumer | `ontologyRemote` |

业务定义属于 Consumer 插件。Provider 持有图存储及 Function／Action 执行，因此本地 Provider 与平台 Provider 可以实现同一 API。Workflow 仍是独立的编排能力，可以调用这些本体原语。

[本体子系统](../../docs/subsystems/ontology.zh.md)定义共享类型和运行语义。

<a id="dev-note"></a>
## 开发备注

无。
