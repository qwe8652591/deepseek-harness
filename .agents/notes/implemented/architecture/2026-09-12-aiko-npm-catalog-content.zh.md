# Agent Note: Aiko npm 目录内容

Status: implemented

[English](2026-09-12-aiko-npm-catalog-content.md) | 中文

## 问题

即使运行包已发布到 npm，市场的指南、截图和依赖标识仍可能使用仓库 URL，从而依赖公开插件仓库。仅为展示 Office 说明就下载其完整运行包，也会产生不必要的大体积下载。

## 决策

公开的 `aiko-dsh-plugin-catalog` npm 数据包携带精确的 npm 安装目标、插件依赖引用、本地化 Markdown 和内嵌位图预览。Aiko 市场通过 `additionalRegistryPackages` 读取它；宿主在向任一客户端提供内容前验证压缩包完整性和大小。Markdown 展示不执行原始 HTML，也不请求仓库图片。目录不执行代码，也不激活 profile bundle。

仓库 URL 保留为目录合并和依赖引用的兼容标识。独立的公开主页与反馈字段负责导航。npm 安装按包名匹配，并保留明确的安装来源。已有 GitHub 安装需要明确迁移；删除仓库无法重定向其锁文件 URL。[桌面 seed](../../../../apps/desktop/preinstalled-plugins.json)固定使用支持 npm 内容的市场版本。

## 考虑过的替代方案

**将说明保留在公开插件仓库。** 普通产品使用仍依赖这些仓库，无法完成退役。

**展示说明时读取完整运行包。** Office 包含三种平台的解释器。轻量目录避免在安装前下载这些资源。

**将全部仓库标识替换为 npm 页面 URL。** 现有消费者使用仓库标识合并目录和引用依赖。独立的展示字段保留这些行为，同时消除对标识所指仓库的网络访问。

## 影响

插件运行时与展示内容分别使用有版本的 npm 包更新。目录在所有引用的运行包版本验证完成后发布。目录包包含图片许可声明，且仅包含数据文件。私有开发、公开 npm 运行包分发和公开 Mac 客户端下载，继续遵循[分发决策](../process/2026-09-11-aiko-private-source-distribution.zh.md)中的归属安排。
