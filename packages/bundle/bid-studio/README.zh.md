---
description: "在 Web profile 上安装投标业务工作台。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-bid-studio-bundle

[English](README.md) | 中文

## 概述

该 profile patch 组合包安装本地本体 Provider、浏览器 Remote、Host 级工作线程 Workflow Provider 与标书工作台双端插件。这里显式安装 Workflow Provider，是因为标准 Web 组合把对话内工作流交给会话 preset，而标书工作台拥有独立于对话的业务工作流。将它添加到标准 Web 组合包之后：

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

```powershell
pnpm dsh plugin --profile web add @deepseek-ai/dsh-bid-studio-bundle
pnpm dsh --profile web
```

<a id="model-experience"></a>
## 模型体验

### 组合包构成

#### 模型看到的内容

组合包本身不添加任何内容；由 `cordis.patch.yml` 插入的插件持有各自的模型可见内容。

#### Token 影响

不直接产生 token。

#### KV Cache 影响

相互独立；组合包本身不向模型请求贡献内容。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- **需要 Web 基础层**：该 patch 添加业务插件，但不安装标准 Web 表层本身。

<a id="dev-note"></a>
### 开发备注

不发布 invariant companion：此 bundle 只贡献静态 patch 列表，运行时检查由安装的插件负责。
