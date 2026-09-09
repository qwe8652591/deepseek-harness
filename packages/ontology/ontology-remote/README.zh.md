---
description: "在浏览器客户端读取本体定义并分派业务操作。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ontology-remote

[English](README.md) | 中文

## 概述

用于本体定义、对象与关系读取、Function 执行和 Action 分发的类型化浏览器 Remote。它是 `ctx.ontology` 的 Consumer；浏览器业务插件依赖该传输投影，而不直接绑定本地或平台 Provider。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

浏览器 Consumer 将 Remote 与 Host Provider 配合使用，参见[本体子系统](../../../docs/subsystems/ontology.zh.md)。

<a id="model-experience"></a>
## 模型体验

### 浏览器本体 Remote

#### 模型看到什么

不会直接看到。`ctx.ontologyRemote` 服务浏览器插件，而不是模型请求。

#### Token 影响

没有直接影响。

#### KV Cache 影响

在模型 Consumer 投影本体数据之前彼此独立。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **返回对象的 Action** —— 第一版 Remote 投影返回本体对象的 Action；更广泛的工作流结果需要显式的 wire 结果联合类型。
- **尚无订阅流** —— Demo 工作台在变更后主动刷新；多窗口实时更新仍待实现。

<a id="dev-note"></a>
### 开发备注

不发布 invariant companion：Remote 将操作委托给本体服务，自身没有独立可变状态或事件流。
