# DeepSeek Harness 上游 `rc.8` 至 `0.1.1-rc.2` 升级调研

检索日期：2026-08-27（Asia/Shanghai）

## 结论

本地 `master` 已合并的最近官方基线是 `dsh-v0.1.0-rc.8`（`141eb6fef8`），当前官方 `upstream/master` 是 `dsh-v0.1.1-rc.2`（`b150a551b8`）。官方区间共 207 个提交，其中 142 个非合并提交；完整树差异为 2,416 个文件、30,503 行新增、12,485 行删除。准确对比入口是 [`dsh-v0.1.0-rc.8...dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.0-rc.8...dsh-v0.1.1-rc.2)。

这次升级的产品能力主线是：DeepSeek 视觉模型与统一图像请求链、可持久化的凭据记录与授权流程、Web 会话体验和插件启动注入机制、会话投影内部状态模型。它没有新增 Ontology 能力，没有改变官方 Workflow/Skill 的执行能力，也没有新增 Subagent provider 或 Electron 应用。

对本地投标工作台和 Ontology Kernel，源码级直接风险较低：本地业务包没有依赖这次破坏性变化最大的 attachment、LLM 和 session-projection API，官方也未修改 workflow/skill 的源码。升级的主要工作是解决文档与生成目录冲突、统一整套 workspace 版本，然后重新验证 Web Client 注入、工作流和 Electron 启动。

`dsh-univer-office` 是当前最大兼容性风险。本机安装的 `0.2.6` 对 `dsh-host-webserver`、`dsh-session`、`dsh-skill`、`dsh-tools` 声明精确 peer 版本 `0.1.0-rc.6`，而官方新版本把整套包提升到 `0.1.1-rc.2`。新的 Web 注入 API 保留了旧的 `tapIndex` 逃生口，功能设计上不是硬删除，但这个 peer 组合不受支持；不能把“当前 rc.8 能启动”推断为升级后兼容。

## 对比基线与方法

| 项目 | 结果 |
|---|---|
| 本地分支 | `master`，HEAD `0f0baf4300` |
| 本地官方基线 | `dsh-v0.1.0-rc.8`，`141eb6fef8` |
| 官方远端 | `upstream = https://github.com/deepseek-ai/deepseek-harness.git` |
| 官方默认分支 | `master` |
| 官方最新点 | `dsh-v0.1.1-rc.2`，`b150a551b8` |
| 分叉计数 | 本地独有 2 个提交；官方独有 207 个提交 |
| 发布说明 | [`v0.1.1-rc.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.1)；[`v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.2) |

本次执行了 `git fetch upstream --prune --tags`，只更新远端引用，没有修改工作树。差异以共同祖先 `dsh-v0.1.0-rc.8` 为基线，而不是直接用当前 HEAD 充当官方基线，因为当前 HEAD 还含本地投标、Ontology 和 Electron 两个提交。

## 上游变化分类

### 1. 核心 Agent 与 Loop

`packages/core/**/src` 在该区间没有源码变化，`agent-loop`、agent、tools、session 和 system-prompt 只随整套发布提升 package 版本。也就是说，此次没有新的 Agent Loop 调度语义、工具调用协议或官方多代理执行模型。

实际影响 Agent 请求的是 LLM/attachment 外围链路，而不是 loop 本身：请求中的图像由统一投影管线标准化，再按模型路由生成确定性的 request image；直接 DeepSeek adapter 优先使用 Files API，并复用已上传文件。[统一图像管线决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/feature/2026-08-20-unified-image-request-pipeline.md)；[`dsh-attachment` 新接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/attachment/attachment/src/index.ts)；[`dsh-llm-deepseek` adapter](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/llm/llm-deepseek/src/adapter.ts)

### 2. DeepSeek 视觉与图像

`v0.1.1-rc.1` 新增 `DeepSeek-V4-Flash-Vision-Exp` 模型目录项；`v0.1.1-rc.2` 又完成统一图像链路：源图归一化、按路由缩放和转码、确定性缓存、Files API 上传与 file id 复用、过期或缺失文件的一次恢复、Files 失败时的有界 inline fallback。[`rc.1` 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.1)；[`rc.2` 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.2)；[Files fallback 决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/bug-fix/2026-08-21-deepseek-files-inline-fallback.md)

这是本次最大的源码变化，集中在 `packages/attachment/*`、`packages/llm/llm*` 和 `read_image`。`AttachmentStore` 新增 `readImageRequest()`；`ImageAttachmentRef` 可记录归一化前尺寸；新增 `ImageRequestPolicy`、`RequestImageAttachment` 和 `ImageVariantId`。直接实现或替换 attachment/LLM provider 的第三方插件需要重新编译与验证。

同时，旧的 image region read 路径已删除，`read_image` 改为报告缩放后尺寸与坐标比例。依赖旧 region API 的视觉插件不是只改 peer version 就能适配，需要迁移工具调用。

### 3. Credentials 与 Authorization

凭据层从单一环境变量引用扩展为两套 key space：已有 `CredentialRef` 继续表示环境变量名，新增 `CredentialKey` 与持久化 record 表示插件持有的 API key 或授权 grant。新增 `dsh-authorization` capability，允许 provider 通过与用户交互的 flow 获得并提交凭据；`llm-pi-ai` 接入持久化 credential store、ambient auth 和登录流程，OAuth-only provider 因而可以重新进入模型目录。[凭据与授权架构决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.md)；[`dsh-credentials` 源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/credentials/credentials/src/index.ts)；[`dsh-authorization` 源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/credentials/authorization/src/index.ts)

本地凭据文件会在启动时从预发布 flat document 升级为可同时保存 refs 与 records 的文档。该迁移属于预发布格式升级，应在复制的 DSH home 上先验证；不要用生产唯一副本做首次启动。这个区间落地的是 capability 与 provider 接入，完整的 Web 登录 UI 尚未落地，不能把它表述成用户已经可以在设置页完成所有 OAuth 登录。

### 4. Web UI 与插件启动

用户可见改进包括：Markdown 少列数表格自适应、宽表突破消息列并按需横向滚动、99.x% cache hit 精度显示、Subagent 标题中的父子会话切换、`ask_user_question` 支持多行与 `Shift+Enter`、修复 `@` 引用前编辑错位、同一回合重试耗尽后仍显示最终错误、新建空白会话排序与静态资源 404 修复。[`rc.1` 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.1)；[宽表决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/feature/2026-08-19-web-markdown-wide-table-view.md)；[多行问答决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/feature/2026-08-20-multiline-question-answer-field.md)

插件启动层新增结构化 `webserver/index-inject` 事件与 `IndexInjection` 行联合类型，由 HTTP Web 和 worker shell 共享同一注入表。内部的 client-modules 和 ui-theme 已迁移；旧 `tapIndex`/`applyIndexTaps` 没有被删除，继续作为 raw HTML escape hatch。[Web index injection 决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/architecture/2026-08-19-web-index-injection-table.md)；[`webserver` 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/host/webserver/src/index.ts)

### 5. Plugin、Skill、Subagent 与 Workflow

- `packages/skill/**/src` 和 `packages/workflow/**/src` 没有变化；没有新增 Skill 发现规则、Workflow Engine 节点或执行器。
- 插件安装命令和 CLI 源码没有产品变化；整套 workspace package 统一升到 `0.1.1-rc.2`，所以外部插件的 peer version 才是升级重点。
- Subagent provider、控制工具和报告工具没有新增能力。变化集中在 Web 标题血缘切换和 projection 内部适配；官方 release 将其归类为体验优化。[Subagent header 合并提交](https://github.com/deepseek-ai/deepseek-harness/commit/0864878cd094333ffa9c8d1406ed88648c6e26fb)
- Workflow 的大量 diff 是 package 版本、文档链接本地化和测试快照，不代表运行时新增功能。

### 6. Session Projection、SDK 与 API

`session-projection` 有一处可信插件 API 的结构性变化：新增 `SessionProjectionStateMap` 作为 host fold state 类型表；每个 definition 必须提供 `stateSchema`；client-visible projection 把 `viewSchema` 与 `view` 放进 `wire`；删除 `persist` opt-in，所有 unit 统一 checkpoint；新增 `stateOf()` 读取 host-only state。[Session projection 决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/architecture/2026-08-19-session-projection-state-and-client-views.md)；[`session-projection` 类型](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/session/session-projection/src/types.ts)

`packages/sdk/**/src` 没有变化，因此 TypeScript/Python SDK 的公开 RPC 操作没有本次新增。`packages/api/gateway` 的变化主要用于 Web boot injection transport，`packages/api/remotes` 只有与凭据 reference 更新事件命名对齐的轻量变化。外部插件若直接注册 session projection，需要按上述新 definition 编译；只通过现有 RPC 使用 session 的客户端不需要迁移。

### 7. 安装、运行与安全

- 全套 package 版本从 `0.1.0-rc.8` 提升为 `0.1.1-rc.2`，应整体安装，不能把核心 workspace 包拆成混合版本。
- 官方修复 standalone pnpm entrypoint 在 Windows 下的运行路径，源码安装和发布包的 pnpm 调用更稳定。[Windows standalone pnpm 修复合并](https://github.com/deepseek-ai/deepseek-harness/commit/d508a09952ac4b39577d644d55befbcdead2190f)
- Bubblewrap 使用私有 PID namespace，堵住经 `/proc/<pid>/root` 等 magic link 跨出文件隔离范围的问题；不支持该 namespace 的主机会在探测时回退到下一后端。[Bubblewrap 安全决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/.agents/notes/implemented/bug-fix/2026-08-06-bwrap-private-pid-namespace.md)
- permission preset 的 copy/default 改动在 `rc.2` 前被整体回滚，因此不应把中途提交里的权限默认行为当作最终版本能力。[回滚提交](https://github.com/deepseek-ai/deepseek-harness/commit/7ce85283b5c61557bac316765b9ac74fd0b0ee3b)

## 对本地扩展的影响

### 投标工作台

本地 `packages/business/bid-studio` 主要依赖 `dsh-api-remotes` 与 `dsh-workflow`，而官方没有修改 workflow 源码，API remote 也没有业务 RPC 重构。因此标书生成流程、Ontology Inspector 和工作台业务状态不需要因本次上游能力重新设计。

风险主要在 Web 组合层：本地工作台向 sidebar/client slot 注入页面，官方同时调整了 client modules、sidebar 周边 UI、Web boot 和主题注入。没有同文件的业务源码冲突，但需要浏览器回归验证菜单挂载、路由、主题、对话卡片和宽表布局。

### Ontology Kernel

本地 `packages/ontology/*` 没有与官方变更路径重叠，也没有直接依赖 attachment、LLM、credentials 或 session-projection。Object/Relation/Action/Function 定义与运行时不受这次官方升级直接影响。

新的视觉能力可以成为未来 Function/Action 的可选模型能力，例如识别招标扫描件或投标截图；新的 credentials/authorization seam 可以替代业务插件自建 OAuth/令牌存储。但它们是可复用基础设施，不会自动进入 Ontology Kernel，也不会把本体流程变成官方 Workflow。

### Electron

官方区间没有 `apps/desktop`，也没有新增 Electron 能力。本地 Electron 是 supervisor：启动独立 Web runtime，再通过 loopback URL 打开 BrowserWindow，所以新的 Web index injection 会走标准 HTTP 路径；不需要把本地壳改成官方假想的 `file://`/IPC 方案。

升级后要重跑进程启动、ready URL、窗口退出、child graceful shutdown、外链拦截和单实例验证。由于整套包版本上升，Electron 打包产物必须与升级后的 Web runtime 同一次构建，不能继续携带 rc.8 的预构建 client 资源。

### `dsh-univer-office`

当前本机 `dsh-univer-office@0.2.6` 精确依赖 rc.6 的四个 DSH peers；`0.1.1-rc.2` 不满足这个声明。上游 `webserver/index-inject` 保留 raw tap，且 client module boot 的目标是让 Web/worker 注入一致，理论上对 Univer 的 sidebar/conversation/Viewer 注入是正向变化；但这不构成二进制兼容承诺。

建议把 Univer 作为独立升级门：先查插件发布方是否已有明确支持 `0.1.1-rc.2` 的版本；没有则在复制 profile 中安装并验证启动、`/univer-api/status`、五类 Unit、worktree ready/merge/discard、Office 导入导出和进程清理。任何 peer 警告、重复核心包或 Client 模块装载失败都应阻止进入主 profile。

## 合并风险实测

本地从 rc.8 后改动 159 个文件，官方改动 2,416 个文件，路径交集 37 个。交集主要是 package manifest、锁文件、生成目录与双语文档；源码交集只有生成的 client slot/API catalog。使用 `git merge-tree --write-tree HEAD upstream/master` 做无工作树写入的三方模拟，得到 20 个内容冲突，全部位于 Agent Note、架构/配置/子系统文档、package/bundle/sidebar/workflow README 及其 i18n pairing；没有业务 TypeScript 源码内容冲突。

这说明合并不是高风险业务重写，但也不能直接 fast-forward。文档冲突涉及本地新增 Ontology、投标 bundle 和扩展 Workflow 说明，必须保留两侧事实并重新运行 pairing/catalog 生成器，不能简单选择 ours 或 theirs。

## 建议升级顺序

1. 从当前 HEAD 建升级分支，记录 `dsh-v0.1.0-rc.8` 与本地两个提交作为回退点；不要在正在运行的主 profile 上直接替换。
2. 合并 `dsh-v0.1.1-rc.2`，人工解决 20 个文档/i18n 冲突；保留本地 Ontology、Bid Studio、Electron 与 Workflow 扩展，同时采用上游新的 package 分组、文档链接和生成输出。
3. 重新生成并校验 cordis catalog、module graph、config catalog 和 translation pairing；然后做定向 typecheck/build。
4. 先验证官方 Web/headless：启动、对话、多行问题、Subagent 切换、会话恢复、DeepSeek 文本请求；有视觉 key 时再验 Vision/Files fallback。
5. 再验证本地链路：Ontology runtime → Bid workflow → Bid Studio UI → Electron supervisor。
6. 最后在复制的 `web` profile 中验证 `dsh-univer-office`；只有 peer 组合和实际回归都通过，才替换当前 3081 服务。

## 本次未执行

本调研没有合并上游、没有修改产品代码、没有改 profile、没有重启服务，也没有声称测试通过。`merge-tree` 只创建临时 Git tree objects 并报告潜在冲突，工作树仍保持 `master...origin/master [ahead 2]` 且无未提交修改（本报告除外）。
