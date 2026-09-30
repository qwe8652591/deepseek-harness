# Agent Note: Aiko 平台在官方 Desktop 上的准入

Status: implemented

[English](2026-09-30-aiko-desktop-platform-deployment.md) | 中文

## Problem

旧版 Aiko Desktop 在较早的桌面壳上提供浏览器平台登录和加密凭据，而工作台插件已经使用 DSH 0.2.0-rc.2。用旧壳替换官方桌面入口会丢失当前原生适配、运行时准备和恢复行为。

## Decision

本分支保留完整官方 Desktop，增加可选的启动部署配置。Electron 主进程先验证平台账号，再创建其 Host；数据目录由账号的 issuer 和 subject 决定。所选主题包提供被动欢迎页资源，固定 preload 操作保持凭据归属主进程。产品 IPC 校验所属应用窗口及主 frame。

由维护者预先准备的平级插件共享当前 workspace 的 DSH、Cordis 和 React 包。启动过程在既有写锁内组合 Desktop profile。首次组合启用工作台的 Agent Teams 依赖；后续组合保留用户移除和原生恢复状态。Profile 只链接所选主题。工作台使用明确的插槽优先级，与官方 DeepSeek 账号设置共存。

## Alternatives considered

**整体移植旧主窗口。** 这会丢弃上游浏览器、目录、快捷键、更新和恢复行为，扩大每次升级的分歧。

**在 Electron 内运行现有浏览器服务。** 这会保留额外的应用包装层，绕过官方 Desktop profile 和原生适配，并可能并发写入浏览器工作区。

**让每个插件安装独立框架运行时。** Cordis 服务身份和 React hooks 必须属于运行中的 Host 与 Client。因此外部开发依赖图链接确切的 workspace 包，不解析独立 npm 副本。

## Consequences

既有平台拥有身份并授权能力访问。原生退出只撤销自身 Desktop 会话，凭据不进入产品渲染进程。每进程独立的转接文件避免客户端互相覆盖活动账号桥。独立数据和 Electron 用户数据目录保护并行运行的浏览器服务，但不会自动迁移已有会话及模型配置。

这是源码部署，未验证自定义签名安装包或更新通道。Windows 加密凭据依赖配套 Electron 用户数据密钥。链接插件图使用 pnpm 10.34.5 准备，因为 pnpm 11.7.0 在 peer 图遍历中失败；官方 workspace 保留自己的版本。上游原生菜单图形和发布身份仍属于官方壳。

## Verification

本模块测试覆盖拒绝错误部署、单主题选择、保留非托管文件、用户 patch、恢复状态及 profile 写锁互斥。按需执行的构建后 Electron 测试覆盖真实平台 PKCE、加密恢复、拒绝未鉴权转接请求、带认证的能力访问和退出；它签发独立 Desktop 会话供交互验收，不认证模型输出或签名安装包。配置与命令见 [Aiko 部署](../../../../apps/desktop/aiko/README.zh.md)。
