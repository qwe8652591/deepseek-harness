# DeepSeek Harness 插件与可适配生态调研

检索日期：2026-08-18（Asia/Shanghai）

## 结论

DeepSeek Harness 已经有可用的社区原生插件市场，但未发现 DeepSeek 官方插件市场：精选目录 `awesome-dsh-plugin` 当日收录 1,305 个插件，`dsh-market` 提供 Harness 内搜索和安装；GitHub `dsh-plugin` topic 同时返回约 6,900 个仓库，但夹杂大量只打标签、并非可安装插件的项目。因此发现入口应优先使用精选目录，GitHub topic 只作补充检索。[精选目录原始数据](https://awesome-dsh-plugin.com/plugins.json)；[GitHub topic 搜索 API](https://api.github.com/search/repositories?q=topic%3Adsh-plugin&sort=stars&order=desc&per_page=100)

最值得优先投入的外部生态是 MCP。仓库已有 `@deepseek-ai/dsh-mcp-client`，能把 stdio 或 Streamable HTTP MCP server 的工具注册成 Harness 原生工具；Playwright、GitHub、Context7、Firecrawl、Notion、Supabase 和 Sentry 都可以先通过配置接入，不必各写一套 Cordis 插件。[DSH MCP bridge](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/mcp/mcp-client)；[官方 MCP Registry](https://registry.modelcontextprotocol.io/)

第二优先级是 Agent Skills。Harness 的 filesystem skill provider 能读取单层 `<name>/SKILL.md` 和 flat Markdown，因此 Anthropic Skills、Superpowers 等仓库可以按技能逐个筛选和导入；Claude 插件的 commands、agents、hooks 和 manifest 不能因包含 `SKILL.md` 就整体视为兼容。[DSH skill provider](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/skill/skill-filesystem)

Koishi/Cordis 生态只能作为需求验证和源码移植池。DeepSeek Harness 使用经 vendor、rescope 和本地修订的 `@deepseek-ai/cordis`；上游 `cordis`、`@cordisjs/*` 和依赖 Koishi Context/services 的插件不是可直接安装的 Harness 插件。[vendor/rescope 说明](https://github.com/deepseek-ai/deepseek-harness/blob/main/vendor/README.md)；[新增 vendored package 指南](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/cookbook/adding-a-vendored-package.md)

## 数据口径

- “Stars”取 2026-08-18 GitHub REST API 或精选目录当日快照；它衡量仓库关注度，不等于安装量、活跃用户或质量。
- DSH 原生插件的 npm 数值取 npm 官方 downloads API 的最近完整周 `2026-08-09` 至 `2026-08-15`；MCP 候选取最近完整月。npm 下载包含 CI、缓存、镜像和传递依赖，不能解释为独立用户数。
- 名称含 `#` 的条目位于 monorepo 子目录，目录展示的 stars 继承整个母仓库，表中以 `*` 标记；不能把母仓库热度归因给单个 DSH integration。
- 官方 MCP Registry 提供发布与发现，不提供统一下载榜或评分榜；下文 MCP 顺序是根据 GitHub stars、npm 下载和对 Harness 的增量价值综合排序，不是 Registry 官方排名。
- DSH 自身刚进入 release-candidate 阶段，原生插件数据变化很快；安装前应重新读取插件的 `peerDependencies`、latest version 和源码提交。

## DSH 原生市场 Top

下表优先展示精选目录中有 npm 分发、功能边界清晰且热度靠前的条目，按最近完整周 npm 下载量排序。Stars 来自当日精选目录；`*` 表示 monorepo 子目录继承母仓库 stars。

| 排名 | 插件 | 主要能力 | npm 周下载 | Stars | 直接来源 |
|---:|---|---|---:|---:|---|
| 1 | `@liustack/modlens` | 给纯文本模型增加 OCR、布局与图像理解 | 14,280 | 2,890 | [源码](https://github.com/liustack/modlens) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40liustack%2Fmodlens) |
| 2 | `dshmarket` | Harness 内插件市场、诊断、更新、备份恢复 | 11,862 | 889 | [源码](https://github.com/dsh-market/dsh-market) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/dshmarket) |
| 3 | `@linxin666/dsh-web-ui-all` | Web UI、任务板、Git 图、侧栏等合集 | 11,175 | 4,254* | [插件子目录](https://github.com/zhu1090093659/dsh-web-ui/tree/main/packages/dsh-web-ui-all) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40linxin666%2Fdsh-web-ui-all) |
| 4 | `dsh-better-sidebar` | 文件、终端、Git、子代理的可扩展侧栏 | 7,486 | 2,026 | [源码](https://github.com/omdsh-dev/DSH-better-sidebar) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/dsh-better-sidebar) |
| 5 | `@deepseek-harness-tui/dsh-tui` | Claude Code 风格交互式 TUI | 3,360 | 1,866 | [源码](https://github.com/ccch1mneyyy/dsh-TUI) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40deepseek-harness-tui%2Fdsh-tui) |
| 6 | `dsh-vision-router` | 免费视觉链、视觉问答、grounding 与像素工具 | 2,682 | 670 | [源码](https://github.com/ysr666/dsh-vision-router) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/dsh-vision-router) |
| 7 | `@nanmicoder/dsh-agent-teams` | captain/member/task/message 多代理团队协作 | 2,546 | 507 | [源码](https://github.com/NanmiCoder/dsh-agent-teams) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40nanmicoder%2Fdsh-agent-teams) |
| 8 | `@vectorize-io/hindsight-coding-agents` | 跨会话记忆的 DSH integration | 2,310 | 20,122* | [插件子目录](https://github.com/vectorize-io/hindsight/tree/main/hindsight-integrations/coding-agents) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40vectorize-io%2Fhindsight-coding-agents) |
| 9 | `@anionex/dsh-vision-toolkit` | 多图问答、OCR、UI 还原、pixel diff 与 Web UI | 1,764 | 648 | [源码](https://github.com/Anionex/dsh-vision-toolkit) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40anionex%2Fdsh-vision-toolkit) |
| 10 | `dsh-context` | 上下文组成、演进、压缩和用量可视化 | 1,022 | 234 | [源码](https://github.com/bowenliang123/dsh-context) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/dsh-context) |
| 11 | `@struktoai/mirage-dsh` | Agent 虚拟文件系统的 DSH integration | 570 | 3,502* | [插件子目录](https://github.com/strukto-ai/mirage/tree/main/typescript/packages/dsh) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40struktoai%2Fmirage-dsh) |
| 12 | `@tt-a1i/archify-dsh` | 可验证的架构、流程与时序图 | 367 | 13,970* | [插件子目录](https://github.com/tt-a1i/archify/tree/main/integrations/deepseek-harness) · [npm 下载](https://api.npmjs.org/downloads/point/last-week/%40tt-a1i%2Farchify-dsh) |

GitHub stars 最高但需要单独看 integration 质量的其他子目录插件包括 OpenViking memory plugin（母仓库 28,939 stars）和 Ouroboros workflow plugin（母仓库 5,517 stars）。它们值得评估，但不应排在独立插件前面只因为继承了母仓库 stars。[OpenViking DSH integration](https://github.com/volcengine/OpenViking/tree/main/examples/dsh-memory-plugin)；[Ouroboros DSH integration](https://github.com/Q00/ouroboros/tree/main/integrations/dsh-plugin)

### 原生插件推荐顺序

1. 先安装或评估 `dshmarket`，把精选目录、来源校验、更新和诊断能力放进 Harness；这能降低后续发现成本，但“被收录”仍不代表背书。
2. 通用开发工作优先评估 `dsh-better-sidebar`、`dsh-context` 和 `dsh-web-ui-all`；它们改善的是日常工作台，而不是单一模型能力。
3. DeepSeek/GLM 等文本模型确有图像输入需求时，在 `modlens`、`dsh-vision-router` 和 `dsh-vision-toolkit` 中选一个，避免同时注册重复视觉工具和重复付费链路。
4. 多代理任务确有 captain、成员通信和依赖图需求时再引入 `dsh-agent-teams`；简单委派优先使用 Harness 自带 subagent seam，减少提示词和工具 schema 成本。
5. TUI、记忆和虚拟文件系统会改变运行入口或状态所有权，应在独立 profile 验证后再进入主工作流。

## 可直接桥接的 MCP Top

Harness 的 MCP bridge 已覆盖 stdio 与 Streamable HTTP，并为外部工具加 server namespace；因此这些候选的主要工作是配置、凭据、权限与输出评估，而不是重写插件。MCP bridge 当前只消费 Tools，Resources 和 Prompts 暂不进入 Harness。[bridge 行为与限制](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/mcp/mcp-client/README.md)

| 综合优先级 | MCP server | GitHub Stars | npm 最近完整月下载 | 适合 Harness 的价值 | 直接来源 |
|---:|---|---:|---:|---|---|
| 1 | Microsoft Playwright MCP | 36,223 | 25,444,935 | 浏览器自动化、Web UI 测试和可访问性快照 | [源码](https://github.com/microsoft/playwright-mcp) · [Stars API](https://api.github.com/repos/microsoft/playwright-mcp) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/%40playwright%2Fmcp) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.microsoft%2Fplaywright-mcp/versions/latest) |
| 2 | GitHub official MCP | 32,321 | 无 npm | 仓库、Issue、PR、Actions 与安全告警 | [源码](https://github.com/github/github-mcp-server) · [Stars API](https://api.github.com/repos/github/github-mcp-server) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.github%2Fgithub-mcp-server/versions/latest) |
| 3 | Context7 | 60,903 | 4,575,966 | 获取版本相关的最新库文档和示例 | [源码](https://github.com/upstash/context7) · [Stars API](https://api.github.com/repos/upstash/context7) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/%40upstash%2Fcontext7-mcp) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.upstash%2Fcontext7/versions/latest) |
| 4 | Firecrawl MCP | 7,261 | 522,503 | 搜索、抓取与网页内容提取 | [源码](https://github.com/firecrawl/firecrawl-mcp-server) · [Stars API](https://api.github.com/repos/firecrawl/firecrawl-mcp-server) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/firecrawl-mcp) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.firecrawl%2Ffirecrawl-mcp-server/versions/latest) |
| 5 | Notion official MCP | 4,593 | 753,273 | 知识库、页面和数据库协作 | [源码](https://github.com/makenotion/notion-mcp-server) · [Stars API](https://api.github.com/repos/makenotion/notion-mcp-server) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/%40notionhq%2Fnotion-mcp-server) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/com.notion%2Fmcp/versions/latest) |
| 6 | Supabase official MCP | 2,867 | 420,532 | 数据库、项目和开发环境管理 | [源码](https://github.com/supabase/mcp) · [Stars API](https://api.github.com/repos/supabase/mcp) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/%40supabase%2Fmcp-server-supabase) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/com.supabase%2Fmcp/versions/latest) |
| 7 | Sentry official MCP | 820 | 436,434 | Issue、trace 和生产故障定位 | [源码](https://github.com/getsentry/sentry-mcp) · [Stars API](https://api.github.com/repos/getsentry/sentry-mcp) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/%40sentry%2Fmcp-server) |
| 8 | MongoDB official MCP | 1,102 | 436,387 | MongoDB schema、查询和项目操作 | [源码](https://github.com/mongodb-js/mongodb-mcp-server) · [Stars API](https://api.github.com/repos/mongodb-js/mongodb-mcp-server) · [npm 下载](https://api.npmjs.org/downloads/point/last-month/mongodb-mcp-server) · [Registry 搜索](https://registry.modelcontextprotocol.io/v0.1/servers?search=mongodb&version=latest) |
| 9 | Cloudflare MCP | 4,088 | 142,590（旧 npm 包） | Workers、日志、可观测性和 Cloudflare 平台；优先官方 remote endpoint | [源码](https://github.com/cloudflare/mcp-server-cloudflare) · [Stars API](https://api.github.com/repos/cloudflare/mcp-server-cloudflare) · [Registry](https://registry.modelcontextprotocol.io/v0.1/servers/com.cloudflare.mcp%2Fmcp/versions/latest) |

`modelcontextprotocol/servers` 母仓库有 89,647 stars，filesystem server 最近完整月约 190.8 万下载，但 Harness 已有原生文件系统、shell、memory/session 和 agent 能力。重复桥接这些 reference servers 会增加权限面与工具 schema，商业增量通常低于 GitHub、Notion、Sentry、Supabase 等外部系统连接器。[参考服务器源码](https://github.com/modelcontextprotocol/servers)；[filesystem npm 下载](https://api.npmjs.org/downloads/point/last-month/%40modelcontextprotocol%2Fserver-filesystem)

## Agent Skills、Claude Code 与 Codex 候选

| 候选 | Stars | 适配判断 | 直接来源 |
|---|---:|---|---|
| `obra/superpowers` | 273,340 | 高热度工作流技能库；逐个检查 frontmatter、资源相对路径和副作用后导入 | [源码](https://github.com/obra/superpowers) · [Stars API](https://api.github.com/repos/obra/superpowers) |
| `anthropics/skills` | 170,099 | 官方 `SKILL.md` 技能样例和技能库；格式最接近 Harness filesystem provider | [源码](https://github.com/anthropics/skills) · [Stars API](https://api.github.com/repos/anthropics/skills) |
| `wshobson/agents` | 38,881 | 多 harness marketplace；技能可筛选，Claude-specific agents/commands 不可整体直装 | [源码](https://github.com/wshobson/agents) · [Stars API](https://api.github.com/repos/wshobson/agents) |
| `anthropics/claude-plugins-official` | 33,636 | 适合挖掘市场需求和工作流；只复用可独立成立的 skills，hooks/manifest 需走 Harness 自有桥或重写 | [源码](https://github.com/anthropics/claude-plugins-official) · [Stars API](https://api.github.com/repos/anthropics/claude-plugins-official) |

`openai/skills` README 已标记 deprecated，并指向的 `openai/plugins` 于 2026-08-16 归档，不应列为当前首选来源；历史内容仍可用于格式对照。[OpenAI skills](https://github.com/openai/skills)；[归档的 OpenAI plugins](https://github.com/openai/plugins)

## Cordis/Koishi 市场：只能移植

Koishi 官方 mirror 当日包含 4,531 个有市场元数据的条目。按 `downloads.lastMonth` 排序，`@koishijs/plugin-server` 4,747、`@koishijs/plugin-http` 4,653、QQ adapter 2,931、Discord adapter 2,774、SQLite 2,641、Puppeteer 2,605、Telegram adapter 2,521；这些数值表明网络、消息平台、数据库和浏览器仍是成熟插件市场的高需求类别。[Koishi 官方 market mirror](https://registry.koishi.chat/index.json)；[Koishi 官方插件目录](https://koishi.chat/en-US/plugins/)

这些包不能直接加入 Harness：`@koishijs/*` 通常依赖 Koishi 的 bot、database、console、HTTP 等服务；`@cordisjs/*` 又使用上游 npm scope，而 Harness 的 Cordis 基础层已 vendor/rescope。可取的做法是用它们验证需求、复用协议知识或挑选维护良好的依赖，再按 Harness 的 Service Definition / Provider / Consumer capability seam 重写。[Koishi market 文档](https://koishi.chat/en-US/plugins/console/market)；[Harness capability seam](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md#capability-seams)

名称含 DeepSeek 不代表相关性。比如 `chatluna-deepseek-adapter` 是 Koishi ChatLuna 的模型 adapter，依赖的是 Koishi/ChatLuna 运行时，不是 DeepSeek Harness plugin；本调研未因名称相似把它列入推荐。

## 当前 checkout 的兼容性警告

当前 checkout `47f943859bef60e4160492346772ded9b24f765a` 的 CLI 是 `@deepseek-ai/dsh` `0.1.0-rc.5`。[该提交的 package.json](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/package.json)

不要在这个 checkout 直接照上述 latest package 的安装命令执行。`dsh-better-sidebar`、`dsh-vision-toolkit`、`dsh-agent-teams` 和 `dsh-vision-router` 的 latest manifest 要求若干 `^0.1.0-rc.6` peer；`@deepseek-harness-tui/dsh-tui` 要求 rc.7 peers；`dshmarket` 的 latest manifest 要求 `@deepseek-ai/dsh-settings ^0.1.0-rc.7`。应先升级 Harness 到匹配版本，或在 npm versions 与 Git tag 中选定声明兼容 rc.5 的旧版本并锁定，不要让包管理器静默拉入多套核心包。[sidebar manifest](https://github.com/omdsh-dev/DSH-better-sidebar/blob/main/package.json)；[TUI manifest](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/package.json)；[market manifest](https://github.com/dsh-market/dsh-market/blob/main/package.json)；[vision toolkit manifest](https://github.com/Anionex/dsh-vision-toolkit/blob/main/package.json)；[agent teams manifest](https://github.com/NanmiCoder/dsh-agent-teams/blob/main/package.json)

## 安全与选型检查

1. 第三方 DSH plugin、MCP server 和 skill 都是可执行代码或能诱导执行的指令；安装前检查仓库所有者、许可证、release/tag、package scripts、网络与文件权限、凭据读取和遥测行为。
2. 对 GitHub-only 插件锁定 commit；对 npm 插件锁定精确版本和 lockfile。Stars、精选目录收录和 npm 下载都不是安全审计或官方背书。
3. 先在独立 profile 和测试 workspace 启用，尤其是 shell、浏览器、数据库写入、GitHub write、自动更新、长期记忆、TUI/桌面入口和多代理插件。
4. MCP 连接器优先使用最小 scope token、只读模式或单仓库/单项目授权；高热度连接器往往也是权限面最大的连接器。
5. 避免同类工具重复注册：三个视觉插件、多个 filesystem MCP、多个 memory 层或多个 browser controller 会扩大 prompt schema、产生路由歧义，并让审计与故障归因变困难。
6. `dsh-market` 说明 pnpm 10 默认阻止 build scripts，按包放行需要显式选择；这能降低风险但不能替代源码审查。[dsh-market 安全说明](https://github.com/dsh-market/dsh-market#security)

## 建议的最小落地组合

- 市场与诊断：升级到兼容 rc 后评估 `dshmarket`。
- 通用研发：`dsh-better-sidebar` + `dsh-context`，避免先装整套 UI 合集。
- 外部连接：GitHub MCP + Context7；确有 Web 操作再加 Playwright MCP。
- 生产排障：Sentry MCP；数据库按实际栈在 Supabase、MongoDB 或其他官方 server 中只选一个。
- 多模态：在三个高热视觉插件中做一次对比测试，只保留一个。
- Skills：从 Anthropic Skills 或 Superpowers 按单技能导入，不整体复制 Claude marketplace。

这套组合覆盖市场发现、工作台、代码协作、最新文档、浏览器、生产排障和技能复用，同时避免重复接入 Harness 已有的 filesystem、shell、session 与 subagent 能力。
