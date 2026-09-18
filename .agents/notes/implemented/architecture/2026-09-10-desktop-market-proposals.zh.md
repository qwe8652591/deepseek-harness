# Agent Note: 桌面市场包变更请求

Status: implemented

[English](2026-09-10-desktop-market-proposals.md) | 中文

## Problem

独立插件目录提出包安装请求，Electron 拥有 Desktop profile 及其运行中的 Host。目录请求不能替换不可变应用运行时。

## Decision

应用渲染进程提交结构化安装与卸载请求。Electron 校验所属顶层发送方及载荷，在原生确认中列出全部来源，并在任务、应用安装或其他市场事务进行期间拒绝变更。源码开发 profile 拒绝修改。

[市场事务管理器](../../../../apps/desktop/src/market-project.ts)在确认 Host 停止后，暂存外部插件元数据、依赖和用户 patch。它校验包自身声明的兼容范围，并在替换目录前启动暂存 profile。激活日志和回滚目录支持恢复；激活失败恢复原 profile。应用运行时包保持受保护。已禁用的 bundle 保持禁用，除非被明确选中安装。

`0.1.5-alpha.2` 实现使用预装市场 seed。`0.1.6-alpha.2` 运行时不读取该 seed 或其预装表。这些原生打包与修复入口拒绝更新的发行版；恢复预装前，需要兼容的市场版本和新的原生打包工作流。

## Alternatives considered

让市场直接操作文件系统或 pnpm 会绕过暂存与恢复。保留旧核心包项目会与签名的不可变运行时冲突。原生确认和独立的外部插件事务保留目录集成，同时遵守应用包归属。

## Consequences

目录内容和依赖规划仍独立分发。接受变更后可以重启 Host 并刷新应用。兼容声明仅适用于其中列出的发行版；旧 Mac 检查不能证明新版运行时兼容。上游应用仍提供共享 Web Plugin Manager。
