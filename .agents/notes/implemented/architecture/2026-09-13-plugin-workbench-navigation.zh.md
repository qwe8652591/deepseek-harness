# Agent Note: 插件工作台导航

Status: implemented

[English](2026-09-13-plugin-workbench-navigation.md) | 中文

## 问题

不同 agent（智能体）引擎需要独立的对话上下文，同时用户应保留统一的 Workspace 浏览器、Session 列表和对话界面。标签必须选择正确的引擎，避免重复这些控件或中断正在执行的任务。

## 决策

工作台按预设选择原生 DSH Session 视图。Cowork 和 Code 共用 Workspace 浏览器、对话、输入框、历史及交互界面。浏览器通过 uiWorkspace 注册工作台归属和默认 Agent 预设；侧栏只注册标签。每个预设最多属于一个工作台。未注册的预设归入 Cowork。

DSH 管理 Session id、持久化日志和选择状态。Claude Provider 管理执行及其原生恢复 id。切换标签会恢复该工作台最后选中的 Session，或在共享 Workspace 中打开空会话。运行中的任务继续执行。导航代次防止较慢的创建请求在用户离开后重新选中自身。创建 Session 会转发预设，并在异步列表刷新前发布预设投影。

预设模型策略区分支持的 Provider 和引擎独占的 Provider。Code 和 Cowork 都可以提供 DeepSeek，而 Claude Provider 仅供 Code 使用。Code 的模型选择以 saveAsDefault false 记录在原生 Session 中，保留 Cowork 的通用默认模型。新 Code 会话继承 DSH 默认模型；现有选择保持不变。切换工作台不会转移模型上下文。

Aiko Claude 插件在 llm/stream 拦截 Code 对话请求，同时在 request/header 保留选中的 DeepSeek Provider 和模型。Claude Code 使用 DSH 凭据引用及同一服务地址的 Anthropic API 执行内部循环。标题请求直接使用 DSH Provider。模型或连接配置改变时，CLI 进程使用原恢复 id 重建；凭据仅保留在进程内存及显式子进程环境中。

## 考虑过的替代方案

独立的 Code 会话数据库和自定义对话适配器会重复导航行为，并缺少原生能力。原生 Session 让现有客户端功能使用统一身份，Provider 负责转换 Claude 事件。共享项目并不意味着共享模型上下文。工作台选择在浏览器生命周期内保留；持久化归属来自各 Session 的预设。

## 影响

通用 workbench.conversation 展示组件仍供插件投影和只读历史记录使用。Aiko 的旧 aiko_code 记录保留原存储，通过历史面板查看。不重写已提交的 Session 格式代次，agent-loop 和 SDK 事件格式保持不变。

## 验证

原生导航测试覆盖不同预设创建、列表筛选、选择恢复和被后续导航取代的创建。模型测试覆盖引擎 Provider 筛选及共享默认模型保留。侧栏快照验证切换标签时保留原生控件。Provider 测试覆盖原生对话渲染、工具轨迹和审批；实际宿主组合需要经过认证的 web profile 冒烟验证。
