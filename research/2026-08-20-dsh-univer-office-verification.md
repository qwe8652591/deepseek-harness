# `dsh-univer-office` 与 Univer 办公能力核验

检索日期：2026-08-20（Asia/Shanghai）

## 结论

`dsh-univer-office` 是 DreamNum/Univer 团队公开的第三方 DeepSeek Harness bundle，不是 `deepseek-ai` 官方内置插件。源码位于 [`dream-num/dsh-univer-office`](https://github.com/dream-num/dsh-univer-office)，当前 manifest 版本为 `0.2.5`，许可证为 Apache-2.0；`package.json` 未单列个人 maintainer。[插件 manifest](https://github.com/dream-num/dsh-univer-office/blob/main/package.json)

官方安装命令确实是：

```sh
dsh plugin --profile web add dsh-univer-office
dsh web
```

插件安装后必须重启正在运行的 DSH，再刷新浏览器；它不会热加载到已经运行的进程。[插件 README](https://github.com/dream-num/dsh-univer-office#get-started-in-3-minutes)

当前插件实际提供五种办公 Unit：Sheet、Doc、Slide、Base 和 Board。所谓“七大办公能力”把 Board 内的 diagram/流程图用法另算一种，并把尚未进入插件的 PDF 另算一种，因此不是当前 `0.2.5` 的准确能力清单。Univer 官方网站也将 PDF 标为 “Coming soon”。[插件能力矩阵](https://github.com/dream-num/dsh-univer-office#capabilities)；[Univer 官网](https://univer.ai/)

当前 checkout 是 `@deepseek-ai/dsh` `0.1.0-rc.5`，而插件 peer dependency 精确要求 `dsh-host-webserver`、`dsh-session`、`dsh-skill` 和 `dsh-tools` 的 `0.1.0-rc.6`。因此不能在这个 checkout 中直接安装；应先把 Harness 升级到 rc.6 兼容组合，再在独立 profile 验证。[插件 peerDependencies](https://github.com/dream-num/dsh-univer-office/blob/main/package.json#L166-L177)；[当前 CLI package.json](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/package.json)

## 身份、版本和组成

| 项目 | 核实结果 |
|---|---|
| 仓库 | [`dream-num/dsh-univer-office`](https://github.com/dream-num/dsh-univer-office) |
| 所有者 | DreamNum，即 Univer 团队；不是 `deepseek-ai` |
| 包名 | `dsh-univer-office`；仓库列出的若干相似名称是防冒用占位包，不含插件代码 |
| 当前版本 | `0.2.5` |
| 许可证 | Apache-2.0 |
| Node 要求 | `>=22.19.0` |
| DSH 要求 | rc.6 系列 peer packages |
| Bundle 形式 | `dsh.bundle.patch` 指向 `cordis.patch.yml`，并声明 Web Client 依赖注入 |

Manifest 为 Web Client 注入 runtime、locale、sidebar 和 conversation 扩展；Host 侧组合 Univer Service Provider、Tools Consumer、webServer Consumer 与 Skill Provider。发布包还包含 Gateway、Viewer、一次性 Unit Content Worker、Slide render machine 和 Office 转换器，不要求用户全局安装 `univer-cli`。[插件 manifest](https://github.com/dream-num/dsh-univer-office/blob/main/package.json)；[架构文档](https://github.com/dream-num/dsh-univer-office/blob/main/docs/architecture.md)

## 当前真实能力

| Unit | 创建与编辑 | 导入 | 导出 | 校验与限制 |
|---|---|---|---|---|
| Sheet | 单元格、公式、格式、表、图表、透视表、筛选、验证、图片等 | `.xlsx` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` | 结构化范围检查、重算、实时预览 |
| Doc | 段落、富文本、列表、任务、表格、图片、图表、页眉页脚和分页 | `.docx` | `.docx` | 文档回读、实时预览 |
| Slide | 页面、文本、形状、图片、表格、图表、SVG 布局和转场 | `.pptx` | `.pptx` | 结构检查及文本越界、溢出、重叠 lint |
| Base | 表、字段、记录、视图、公式、筛选、排序和分组 | 无 | `.xlsx` `.csv` `.tsv` | Facade 精确回读、实时预览 |
| Board | 形状、文本、连接线、图片、原生图表、路由和 diagram | 无 | 无 | 元素与连接线分析；思维导图、表格、墨迹、高级编辑和文件导出暂不支持 |

一个 `.univer` 文件可以包含多个不同 Unit，公式和嵌入内容可以引用同一文件内的其他 Unit。这是宣传中“统一运行时、跨文件类型处理”的准确范围，不等于任意独立 Office 文件之间自动双向同步。[插件 README](https://github.com/dream-num/dsh-univer-office#what-can-it-do)

插件向 Agent 暴露 11 个结构化工具：`univer_new`、`univer_status`、`univer_worktree`、`univer_unit`、`univer_import`、`univer_inspect`、`univer_execute`、`univer_export`、`univer_lint`、`univer_compile_svg` 和 `univer_api`。它还提供 8 个按需加载的 Skill：核心编排、Sheet、Doc、Slide、Base、Board、Embed 和跨 Unit 公式。[工具和 Skill 清单](https://github.com/dream-num/dsh-univer-office#built-in-tools)

这意味着 Agent 能直接复用 DeepSeek Harness 的工具与 Skill 发现机制；插件自己实现 Office 领域 Service、工具适配、工作区校验和 UI，不需要重新实现 Harness Agent Loop。

## Worktree 与人工审核

插件确实为每次写操作创建独立的 Univer 文档 worktree。典型生命周期为 `create → edit → ready → reopen/merge/discard`：`ready` 只提交审核，不改变 trunk；只有 `merge` 和 `discard` 结束 worktree，而且需要用户明确请求及 DSH 审批。[插件流程](https://github.com/dream-num/dsh-univer-office#how-it-works)；[架构中的工具审批约束](https://github.com/dream-num/dsh-univer-office/blob/main/docs/architecture.md#9-tools-consumer)

这里的 worktree 是 `.univer` 文件协作运行时的领域概念，不是为项目源码创建 `git worktree`。架构使用 Gateway collaboration service 与 SQLite `.univer` 持久化，并没有调用 Git worktree；所以短视频中的“Git Worktree 办公版”只能理解为“Git 风格的分支、审核和合并体验”，不能理解为办公任务在独立 Git checkout 内运行。[插件架构](https://github.com/dream-num/dsh-univer-office/blob/main/docs/architecture.md#7-providergateway-%E4%B8%8E-unit-content-worker)

## 实时预览、协作和数据同步

插件已实现的是本地 Gateway + HTTP/WebSocket Viewer：Agent 修改 worktree 时，DSH Client 可以实时显示内容、浮窗和回合审阅卡片；不同 DSH session 的窗口和审阅状态隔离。Host 负责文件和进程权限，Client 只能通过 `/univer-api/*` 与 Host 交互，Viewer 使用 Host 生成的不透明 URL 连接 Gateway。[Host/Client 边界](https://github.com/dream-num/dsh-univer-office/blob/main/docs/architecture.md#host-%E4%B8%8E-client-%E7%9A%84%E8%BE%B9%E7%95%8C)

这不能直接等同于多人在线办公平台的完整实时协作。Univer 官方文档说明多人实时协作依赖 Univer Server，并属于 Univer Pro 产品面；该插件 README 主要证明同一文件的 Agent worktree、预览与人工合并，没有给出多用户身份、权限、在线 presence 或组织级同步的完整协议与部署承诺。[Univer 协作文档](https://docs.univer.ai/guides/sheets/features/collaboration)；[Univer Pro 概览](https://docs.univer.ai/guides/pro)

## “七大能力”逐项判断

| 宣传项 | 判断 |
|---|---|
| 表格 | 已实现为 Sheet Unit |
| 文档 | 已实现为 Doc Unit |
| PPT | 已实现为 Slide Unit |
| 多维表格 | 已实现为 Base Unit |
| 画布 | 已实现为 Board Unit，但部分高级能力与导出缺失 |
| PDF | 当前插件未列入 Unit、导入、导出或工具能力；Univer 官网标为 Coming soon |
| 流程图 | Board 已能创建 shapes、connectors 和 diagrams，但流程图不是独立 Unit 或独立工具 |

因此准确说法是“五种 Unit + Board 内 diagram + PDF 规划中”，不是七个已经同等成熟的办公模块。

## 安装前风险

1. **版本不兼容。** 当前 Harness rc.5 与插件 rc.6 peer requirements 不匹配，直接安装可能引入第二套核心包或在启动时缺少 API。
2. **宿主权限。** 这是 out-of-tree 可执行插件，会读写 session workspace、注册 Host 工具与 HTTP route、启动本地 Gateway/Worker，并从默认端口 `9080` 起监听 loopback；应像审查本地应用一样审查来源和版本。
3. **原生依赖与浏览器。** 公式引擎、Office 转换器和 SQLite 有平台属性；Slide layout lint 和 SVG 字体测量还需要 Chrome/Chromium。[运行要求](https://github.com/dream-num/dsh-univer-office#requirements-and-current-limits)
4. **Pro 与再分发授权。** Manifest 使用 `@univerjs-pro/*`、insiders 包，发布产物含 bundled Univer license。虽然插件仓库自身为 Apache-2.0，把它预装进商业 Electron 客户端或再分发时仍需单独确认 Pro 组件和 bundled license 的商业条款。[依赖清单](https://github.com/dream-num/dsh-univer-office/blob/main/package.json)；[发布产物说明](https://github.com/dream-num/dsh-univer-office/blob/main/docs/architecture.md#12-%E6%9E%84%E5%BB%BA%E4%B8%8E%E5%8F%91%E5%B8%83)
5. **视觉验证仍需人工。** 插件当前不把截图暴露给模型；结构检查和 Slide lint 不等同于像素级视觉审核。[当前限制](https://github.com/dream-num/dsh-univer-office#requirements-and-current-limits)
6. **“本地协作”范围有限。** 本地 Gateway 证明文件不必发送到外部 SaaS，但不自动提供组织用户、权限、多人 presence 和云端备份。

## 建议的安装路线

先升级 DeepSeek Harness 到与 rc.6 peers 一致的版本，确认 Node `>=22.19` 和可用 Chrome/Chromium。然后使用独立 DSH home/profile 安装锁定版本 `dsh-univer-office@0.2.5`，验证 `dsh web` 启动、Gateway 端口、五类 Unit、Office 导入导出、worktree 的 ready/merge/discard、卸载和进程清理。验证完成后再决定是否加入主 Web profile或 Electron 预制插件。

本调研没有执行安装，也没有下载 npm tarball；结论来自 DreamNum/Univer 与 DeepSeek Harness 的一方仓库、manifest 和官方文档。
