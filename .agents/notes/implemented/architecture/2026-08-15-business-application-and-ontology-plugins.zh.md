# Agent Note: 业务应用通过 UI slot 与本体插件组合

Status: implemented

[English](2026-08-15-business-application-and-ontology-plugins.md) | 中文

## Problem

Web Client 已能通过 slot 组合对话功能，但可安装的业务应用无法同时增加侧边栏入口和中间栏页面。标书工作台只能替换对话、修改侧边栏包或另做一套前端，这些方式都会把业务域耦合到核心客户端，也无法让插件安装与热更新完整拥有功能生命周期。

标书域还需要稳定的对象、关系和 Action 定义，同时不能把定义绑定到 Electron 或单一存储位置。若将本体状态放进桌面壳，未来的平台 Provider 就会变成第二套应用架构，而不是一次 Provider 替换。

## Decision

`ui-layout` 声明根作用域的 keyed `main` slot；`ctx.layout.selectPanel(id)` 选择已注册面板，`selectPanel(null)` 返回对话。`ui-sidebar` 声明可叠加的 `sidebar.panellist` list slot，并持有导航按钮。业务插件用同一个品牌化面板 ID 注册带本地化标签的图标和主页面，两项注册都随插件 effect 释放。

`@deepseek-ai/dsh-ontology` 定义与 Provider 无关的 `ctx.ontology` API、品牌化 ID、对象／关系／Function／Action 描述、不可变图快照、校验更新和适配器约定。Function 是只读的，返回声明过的标量、对象或对象列表；Action 可以改变对象与关系，也可以调用 Function。Workflow 不是本体原语，而是位于 Function 和 Action 之上的独立编排能力。`@deepseek-ai/dsh-ontology-local` 通过既有 `storage-domain` 能力保存对象与关系快照，在启动时重建不可变缓存，强制关系端点和基数，并分发贡献方持有的适配器。Action 的 `machine`、`workflow`、`agent` 或 `human` driver 记录预期执行者；缺少适配器时会明确失败。`@deepseek-ai/dsh-ontology-remote` 把定义、图读取、Function 执行和返回对象的 Action 分发投影给浏览器 Consumer，且不让浏览器绑定本地 Provider。

`@deepseek-ai/dsh-bid-studio` 同时消费 Host 和浏览器能力。Host 端注册覆盖项目、来源、分析、证据、应答、人工审核、流程状态和制品的十三种对象、十二种可追溯关系类型、三项 Function、十一项 Action、八步标准应答流程，以及三个模型工具。流程通过 `ctx.workflowEngine` 运行：脚本调用带命名空间的宿主 activity，activity 执行本体 Action，匹配步骤在记录结果前调用证据覆盖率 Function。这些 Action 除了写入非规范化外键 id，也会创建持久化关系实例。本地验证 composition 通过可重复适配器执行标记为 agent 的解析与生成步骤，记录每个流程步骤，并在人工批准审核对象之前阻止导出。浏览器端注册“投标工作台”菜单和工作页面，执行并观察同一流程，展示要求到应答的追溯，记录审核结论，并预览或下载正式 Markdown 制品。`@deepseek-ai/dsh-bid-studio-bundle` 用一个 profile 层安装 Provider、Remote、工作流引擎和 Consumer。

[官方 Electron 应用](../../../../apps/desktop/README.zh.md)持有窗口与运行时生命周期。业务定义与执行仍是可安装插件；桌面壳不包含本体或标书行为。

Bid Studio 分别编译 Host 和浏览器入口。Host 入口为工具注册及本体适配器保留共享插件 peer dependencies，采用与 API controller 相同的依赖分类。浏览器入口通过标准 locale 服务注册有类型约束的中英文词典；已存储的业务记录和本体标签保留原始语言。本体包与标书 bundle 不发布 invariant companion，因为除既有校验与注册表所有权外，它们没有独立可观测的关系。

标书 bundle 是可选的 Web profile 层。Desktop 持有独立的可执行包图和插件安装策略；启用 Web bundle 不会隐式将其安装进桌面 profile。

本体定义属于业务插件，本体运行时属于可替换 Provider，Electron 只负责窗口和进程生命周期。因此，平台 Provider 可以替换本地存储与执行，而不改写标书定义或页面注册。

## Verification

布局与侧边栏客户端测试固定 slot 声明、导航观察、渲染、释放和快照。Local Provider 测试固定对象／关系持久化重载、基数、校验更新、定义释放、Function 执行、Action 分发和缺少适配器时的失败；工作流集成测试在没有父 agent 的情况下通过真实 worker 执行宿主 activity；Remote 测试固定类型化投影。Bid Studio Host 测试通过注册的 Function／Action 接口执行导入、分析、评分、证据匹配、风险／任务创建、应答生成、审核批准和正式导出，并断言创建的图；浏览器测试固定菜单／页面注册、本体视图、导航和 effect 释放。桌面生命周期与传输验证由官方应用的测试负责。

## Alternatives considered

- **把标书工作台写死在 Electron 中**：不采用，因为业务定义、运行状态和导航会共享桌面发布生命周期，无法独立安装或热更新。
- **让每个业务插件替换 conversation slot**：不采用，因为 single slot 只能有一个持有者，而且业务页会销毁对话状态而不是与其共存。
- **把本体定义存放在 Local Provider 中**：不采用，因为更换 Provider 时还需要重新定义所有业务类型和 Action。定义由业务域持有，存储和执行由 Provider 持有。
- **首版本直接建设平台本体运行时**：本地优先的产品切片不采用；与 Provider 无关的 API 保留了该路线，同时不要求打开工作台前先依赖平台。

## Consequences

业务插件通过标准面板 slot 增加菜单和完整页面，Cordis effect 释放持有每项注册的生命周期。Web profile 支持热重载。官方桌面应用独立于业务插件管理包更新，其匹配的运行时和客户端资源遵循桌面发布策略。

Local Provider 会保存关系实例并支持带筛选条件的图读取，但多写 Action 尚未形成一个存储事务。Bid Studio 保留部分外键 id 属性作为非规范化查询字段，关系则是权威的追溯边。第一版 Remote 支持已声明的 Function 返回联合、返回对象的 Action 和变更后刷新，而不是开放的 Action 返回联合或订阅流。验证 composition 接收文本，使用可重复的 agent 步骤适配器，每个项目只允许运行一次流程，并导出 Markdown。真实模型路由、权限、审计事件、PDF/DOCX 摄取、事务恢复、重跑与驳回返工，以及 Office 导出仍是明确的能力增量，不会隐式塞进桌面壳。
