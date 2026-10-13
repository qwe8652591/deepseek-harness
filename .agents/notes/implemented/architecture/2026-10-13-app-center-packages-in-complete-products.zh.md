# Agent Note: 完整产品中的应用中心插件包

Status: implemented

[English](2026-10-13-app-center-packages-in-complete-products.md) | 中文

## Problem

[完整品牌 Desktop 产品](2026-10-03-complete-branded-desktop-products.zh.md)拒绝一切包的安装和卸载，让一个安装包只带一套经过验证的插件。工作台应用中心按需安装平台登记的应用插件；标书、Code 和知识库应用不再预装。安装一律被拒绝时，品牌产品装不了任何应用插件。

## Decision

Plugin Manager 接受 `packageChanges: 'local-files'`。该模式下 `installBundle` 只接受绝对路径的本地插件包文件，pnpm 运行前读出的包名不能是安装包自带的包。registry、Git 和远程 tarball spec、读不出的文件以及自带包名都以 `managed-installation` 拒绝并附说明，因此被拒绝的请求不改动任何 profile 文件。卸载规则不变：安装包自带的包永远不可卸载。产品策略选用这一模式，页面继续隐藏包操作。

平台按包名和版本保存审核过的插件包，只发给开通了应用的成员。工作台核对下载文件的 SHA-512、包名和版本后，把文件路径交给 `installBundle`，因此应用插件从不按名字从 registry 解析。插件的依赖仍经 pnpm 配置的 registry 解析。

## Alternatives considered

允许所有包变更会让 registry spec 覆盖自带的包；账号 profile 里出现安装包自带的包会使下一次产品启动失败。私有 npm registry 需要发布凭据、一个 registry 服务，以及公开读取或把 registry 凭据写进 pnpm 配置，按名字解析仍受公共回退影响。把所有应用插件预装进安装包，每次插件发布都要重发安装包，开发者的应用也要等下一次产品发布。

## Consequences

自带的包仍只随应用更新。应用插件独立更新，版本由成员确认的平台登记固定。产品验证从本地文件安装并卸载一个夹具插件包，并检查 registry spec 和自带包名被拒绝。pnpm 记住每个已安装插件包文件的位置，所以工作台保留每个已安装版本的文件。
