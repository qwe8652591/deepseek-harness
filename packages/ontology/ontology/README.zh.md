---
description: "与 Provider 无关的业务定义、图记录、Function 和 Action。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ontology

[English](README.md) | 中文

## 概述

与 Provider 无关的本体 Service Definition。它定义对象与关系类型、只读 Function、会改变状态的 Action、品牌化标识符、不可变图快照与 `ctx.ontology` 约定。业务插件注册定义和可执行适配器，Provider 持有校验、图存储、更新和分发。Workflow 刻意不属于 `OntologyDefinition`：编排器协调 Function 与 Action，但不会成为第三种本体原语。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

Service Definition、Provider 和 Consumer 的职责见[本体子系统](../../../docs/subsystems/ontology.zh.md)。

<a id="model-experience"></a>
## 模型体验

### 本体运行时

#### 模型看到的内容

不直接看到。`ctx.ontology` Consumer 可以通过单独记录的工具和提示词片段，选择性暴露定义或 Action。

#### Token 影响

不直接产生 token。

#### KV Cache 影响

在 Consumer 把本体数据投影进模型请求之前保持独立。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- **仅支持标量属性**：第一版运行时保存声明过的字符串、数字、布尔值和日期字符串；嵌套业务记录需要显式类型。
- **Action 尚无事务单元**：API 会校验每次对象或关系变更，但尚不能把一个 Action 的全部写入原子提交。

<a id="dev-note"></a>
### 开发备注

不发布 invariant companion：此包声明服务，可变状态及其检查由 Provider 负责。
