---
description: "通过本地 storage-domain Provider 存储并校验本体对象与关系。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ontology-local

[English](README.md) | 中文

## 概述

`ctx.ontology` 的本地 Provider。它校验可重载定义，通过 `storage-domain` 保存不可变对象和关系快照，强制端点类型与基数，在启动时重建图缓存，执行只读 Function 适配器，并分发业务包拥有的 Action 适配器。Web profile 使用的 JSON 存储后端会把记录保存在 Harness 主目录中。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

将此 Provider 与业务 Consumer 一起安装，参见[本体子系统](../../../docs/subsystems/ontology.zh.md)。

<a id="model-experience"></a>
## 模型体验

### 本地本体状态

#### 模型看到什么

不会直接看到。Consumer 必须明确选择要暴露的 `ctx.ontology` 状态或 Action。

#### Token 影响

没有直接影响。

#### KV Cache 影响

在 Consumer 把本体内容加入模型请求之前彼此独立。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **贡献方持有适配器** —— `machine`、`workflow`、`agent` 和 `human` 描述预期执行者；只有业务贡献为当前 composition 安装适配器时，Action 才能执行。
- **单进程图查询** —— 第一版 Provider 支持带筛选条件的对象／关系扫描；索引和平台规模的图遍历属于平台 Provider。

<a id="dev-note"></a>
### 开发备注

不发布 invariant companion：Provider 在发布前验证每次变更，其私有映射没有可用于比对的独立权威观测。
