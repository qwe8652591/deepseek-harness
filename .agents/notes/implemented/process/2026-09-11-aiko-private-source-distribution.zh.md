# Agent Note: Aiko 私有源码与公开分发

Status: implemented

[English](2026-09-11-aiko-private-source-distribution.md) | 中文

## 问题

Aiko 客户端通过公开的 GitHub Release URL 安装插件。限制这些 URL 的访问会破坏安装，除非为每个客户端增加鉴权。公开 Fork 还保留已发布的源码历史，而持续开发需要限制访问。

## 决策

独立的私有仓库负责客户端和插件的活跃开发。Aiko 插件以独立包名向公开 npm 发布构建产物；Mac 应用 ZIP 仍通过公开 GitHub Releases 分发。组织目录为 npm 安装和旧版 GitHub 安装提供独立的源，旧源的不可变下载 URL 保持有效。本地 checkout 使用私有的 `source` 推送 remote，并保留官方 upstream remote。Aiko 插件包省略可选的 TypeScript 源码及浏览器 source map；可执行 JavaScript 和必需的 Python 仍随包分发。核心包保留上游的发布清单。

[Mac 测试工作流](../../../../.github/workflows/aiko-macos-test.yml)构建选定的私有客户端提交。缓存标识包含该提交和架构。客户端自身声明 Playwright 依赖，无需 Office checkout。私有制品包含校验和及来源信息。维护者将验证通过的二进制文件发布到公开客户端仓库，不推送私有实现提交，也不向应用嵌入 GitHub 凭据。

测试应用保留独立的数据目录，且没有更新源。临时签名允许原生验证，不改变正式签名要求。工作流在两种 Mac 架构上验证 ZIP 解压、签名、首次离线启动、输入框中的原生剪贴板快捷键、市场入口以及全新 profile 未安装 Office。Electron 的标准“编辑”菜单负责编辑操作与平台快捷键；仅在渲染进程中处理按键无法提供 macOS 应用菜单。剪贴板验证在 Electron 内保留原有剪贴板条目，并在结束前恢复。

全新 profile 只预装 `aiko-dsh-market` 的准确 npm 版本。pnpm 在 seed 锁文件中记录注册表完整性值；直接 HTTPS 压缩包在填充离线存储前下载并补齐完整性值。Office 由用户从市场按需下载，使其文档运行时无需进入每份客户端 seed。发布校准保留已有插件的包名和来源，因为修改默认值不构成替换用户插件的授权。用户通过原生管理器移除 `dshmarket` 后再添加 `aiko-dsh-market`，两者不共存。Office 自身的平台工作流负责文档和技能验证。

## 考虑过的替代方案

**将分发仓库设为私有。** 这会使匿名下载失效，也无法将已有的公开 Fork 变为独立私有仓库。

**通过 Office 仓库维护的上游补丁构建客户端。** 这会重复客户端归属，并可能遗漏私有客户端变更。客户端构建与冒烟测试依赖均属于客户端 checkout。

**原位替换已发布包。** 现有客户端和锁文件依赖其字节及校验和。更新后的制品使用新的版本；迁移分发位置时复制原有字节并保留旧 URL。

## 影响

新源码提交保持私有，用户继续匿名安装。仓库私有性不会隐藏历史公开代码或可执行插件代码。跨仓库发布仍由维护者显式执行。原生冒烟结果验证测试版本；正式 Mac 分发仍要求 Developer ID 签名和公证。
