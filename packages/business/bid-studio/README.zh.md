---
description: "持久化管理要求、证据、人工审核与文档导出的投标工作台。"
kind: "package-reference"
---

# @deepseek-ai/dsh-bid-studio

[English](README.md) | 中文

## 概述

可安装的投标工作台插件。Host 贡献拥有完整标书本体、标准应答流程、本地验证适配器和三个模型工具；浏览器贡献在 `sidebar.panellist` 注册导航图标和标签，并在根作用域的 keyed `main` slot 注册页面。两者使用同一个面板 ID；`ctx.layout.selectPanel(null)` 返回对话。插件被移除或重载时，两侧贡献都会随 Cordis effect 一起撤销。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

标准流程按顺序导入招标原文、解析要求与评分项、准备企业证据、创建证据匹配、识别风险与任务、生成应答章节，并暂停在人工审核闸口。审核通过后才允许汇编、预览和下载正式 Markdown 制品。项目、流程步骤和全部业务对象均持久化；[`CONTEXT.md`](CONTEXT.md) 定义领域术语。

`agent` 步骤在本地验证 composition 中由可重复算法执行，使流程无需 API Key 也能验收。版本化流程运行在 `ctx.workflowEngine` 中；它声明的宿主 activity 调用本体 Action，只读覆盖率与风险计算使用本体 Function。Action 的 `driver` 仍保留预期执行者；安装真实模型路由后，可以替换解析和生成适配器而不改变对象、审核闸口或工作台。

工作台的本体查看器分别展示对象类型及其属性、带方向和基数的关系类型、只读 Function、Action 的驱动者/输入/返回定义，以及流程步骤对应的 Action 和产出对象类型。本地 Provider 会保存标准流程创建的关系实例，因此图追溯信息可跨重启保留。

<a id="model-experience"></a>
## 模型体验

### 标书工具

#### 模型看到什么

`bid_create_project` 创建持久化项目。`bid_run_to_review` 接收招标原文，执行自动化步骤并返回等待人工审核的运行。`bid_export_document` 仅在工作台记录审核通过后导出正式制品。

#### Token 影响

插件启用时，模型请求会增加三个紧凑的工具 schema；本体对象不会自动进入模型上下文。

#### KV Cache 影响

只要工具名称、说明和 schema 不变，就保持稳定。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **验证级文档输入** —— 工作台接收纯文本并按行提取要求；PDF/DOCX 解析、OCR 和页码坐标需要文档摄取适配器。
- **验证级 AI 节点** —— 解析、匹配和应答使用可重复的本地算法，不调用模型；生产部署需要 Agent 路由、提示词版本和输出校验。
- **Markdown 正式制品** —— 审核闸口和正式版状态已经执行，DOCX/PDF 排版、签章和模板适配器尚未实现。
- **Action 尚无事务** —— 每次对象和关系写入都是持久化的，但一次多写 Action 尚未作为一个存储事务提交；流程会记录失败步骤，后续恢复策略需要决定继续执行还是补偿。
- **每项目一次流程运行** —— 验证 composition 对同一项目幂等返回首个运行；重新解析、驳回返工和流程版本迁移需要新的运行策略。

<a id="dev-note"></a>
### 开发备注

Host 编译入口为工具注册和本体适配器保留 peer dependencies。浏览器入口使用标准 `bidStudio` 语言命名空间；界面标签随应用语言切换，本体标签和已存储记录保留原始语言。不发布 invariant companion：Host 贡献被注册表接受后不可变，浏览器槽位的所有权由 Client runtime 管理。
