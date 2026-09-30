# Aiko 桌面部署

[English](README.md) | 中文

本参考说明覆盖基于源码的 Desktop 0.2.0-rc.2 Aiko／云遥部署。应用继续使用官方 profile runner、Web UI、原生适配及 Office 运行时。插件源码仍由独立的 Aiko Workbench monorepo 维护，本分支使用其发布压缩包。签名安装包及自定义更新分发不在本地部署范围内。

## 配置

启动前将 `DSH_DESKTOP_DEPLOYMENT` 设为 JSON 文件的绝对路径；不设置时使用普通上游 Desktop。文件内容：

```json
{
  "brand": "yunyao",
  "identityConfig": "D:/private/desktop/identity.json",
  "pluginRuntime": "D:/runtime/desktop-plugins",
  "profilePatch": "D:/private/desktop/profile.patch.yml"
}
```

`brand` 必填，可选 `aiko` 或 `yunyao`。只有所选主题链接进 Desktop profile 并提供欢迎页资源。`identityConfig` 和 `pluginRuntime` 必须是绝对路径。可选的 `profilePatch` 仅在首次启动时写入空 profile；已有非空 patch 必须由维护者明确合并。后续启动保留插件移除、恢复状态和用户 patch。更换插件运行时需使用独立部署 profile；启动时拒绝替换非本部署管理的安装。

身份文件包含 `gatewayOrigin`、`websiteOrigin`、绝对路径 `storageDirectory`，以及取值在 1,000 至 300,000 之间的整数 `loginTimeoutMs` 和 `checkIntervalMs`。Origin 必须使用 HTTPS，本地开发允许 `http://127.0.0.1`。网关提供既有平台 Desktop PKCE 接口和能力 API。两个配置文件均不保存密码或 bearer 凭据。

Electron 验证加密保存的会话，或在系统浏览器中打开平台。凭据只留在 Electron 主进程，通过系统存储加密。绑定 state 的本机回调兑换 PKCE code。每个进程为 Host 插件创建受 bearer 保护的能力转接服务。渲染进程只接收公开账号字段和固定账号动作。凭据失效会停止 Host 并返回登录流程；临时验证失败也会停止准入。原生退出只撤销此 Desktop 会话，不退出其他浏览器会话。

已验证的 `issuer` 和 `subject` 决定 `storageDirectory/accounts/<digest>`，并以此作为 `DSH_HOME`。并行开发实例应使用独立 `storageDirectory` 和 `DSH_DESKTOP_USER_DATA_DIR`。Windows 的加密密钥属于 Electron 用户数据目录，须与 `account.enc` 一起保留；更换目录后需要重新登录平台。不会自动导入已有浏览器工作区或凭据。

## 开发步骤

1. 运行 `corepack pnpm install --frozen-lockfile` 安装官方 workspace，再运行 `corepack pnpm run build`。
2. 准备工作台、Kit、标书、知识库、Code 及两个主题的压缩包。输入运行时的 `package.json` 必须以绝对 `file:...tgz` 依赖列出这些包。工作台账号入口的优先级必须与官方账号入口不同。
3. 从仓库根目录执行以下准备命令。它将框架依赖链接到当前 workspace，避免重复 Cordis 和 React 实例。此外部链接插件依赖图要求 pnpm 10.34.5；官方 workspace 保留自己的包管理器版本。

```powershell
corepack pnpm@10.34.5 --dir apps/desktop run prepare:aiko --source-runtime D:/runtime/plugin-input --output D:/runtime/desktop-plugins
$env:DSH_DESKTOP_DEPLOYMENT = 'D:/private/desktop/deployment.json'
$env:DSH_DESKTOP_USER_DATA_DIR = 'D:/private/desktop/electron'
corepack pnpm run start:desktop
```

准备命令在应用启动前安装插件，不是应用启动器。更换运行时压缩包前须完全退出此 Desktop。`start:desktop` 检查捆绑主运行时并启动官方 Electron 应用；需要重建整个应用时使用 `dev:desktop`。首次启动启用工作台依赖的 Agent Teams profile。Profile 组合使用官方 profile 写锁。

## 验证

运行 `corepack pnpm exec vitest run apps/desktop/tests/aiko-deployment.spec.ts apps/desktop/tests/project-manager.spec.ts`，检查品牌选择、拒绝非托管路径、保留恢复配置和 profile 锁。所选欢迎文案有本模块快照。既有 Desktop 构建检查 bundle 导入及 TypeScript 程序。

连接真实本地平台时，使用 Electron 运行 `apps/desktop/scripts/test-aiko-login.mjs`，依次传入隔离的身份文件、包含测试账号 `username` 和 `password` 的私有 JSON 文件，以及其 Electron 用户数据目录。只在该 Desktop 关闭时执行。这个按需测试执行真实 PKCE 登录、加密恢复、转接鉴权、能力访问和退出，再保留单独签发的会话供 Desktop 交互验收；不输出凭据。这项验证覆盖认证，不代表模型生成或安装包测试。

集成决策及限制见 [Agent Note](../../../.agents/notes/implemented/architecture/2026-09-30-aiko-desktop-platform-deployment.zh.md)。
