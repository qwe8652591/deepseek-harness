# Aiko 与云遥完整发行包

[English](README.md) | 中文

本文介绍内置 profile、应用插件和单一主题的品牌安装包。[源码部署](../README.zh.md)继续用于插件开发。平台地址由用户填写；品牌和更新位置由安装包确定。

## 构建输入

在工作台单仓库执行 `corepack pnpm run prepare:desktop-products --output <new-directory> --channel beta`；加 `--releases <https-directory/>` 时发布到自建的发布目录而不是 GitHub。命令构建并打包工作台、市场及其目录模块，以及 Markdown 编辑器、Visio、draw.io、PPT、生图和批注六个内部插件，然后输出 `aiko.json`、`yunyao.json` 及通过 SHA-512 固定的归档。目录模块是市场的被动依赖。Kit 不包含在内。标书、Code 和知识库应用等应用插件不打进安装包，用户在工作台应用中心安装。每个 profile 只包含所选主题。

在 Host 仓库中，将 `apps/desktop/.env.windows.example` 复制为 `.env.windows` 并配置生产签名。未签名本地构建需要该文件，但无需签名凭据。执行：

```powershell
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/aiko.json
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/yunyao.json
```

Windows 签名构建使用 `package:win:x64`；macOS 在配置好签名和公证的 Mac 上使用 `package:mac:arm64` 或 `package:mac:x64`。`--build-version <semver>` 指定递增的应用发布版本。打包命令在准备完整运行时前验证归档身份与完整性。未签名构建的文件名带有 `-unsigned` 后缀。产品发布命令只在产品使用自建发布目录时发布这类构建；它们保留更新源，只靠 HTTPS 和 SHA-512 校验，没有发布者签名。

默认下载源较慢时，打包前在命令行设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，并在 `.env.windows` 写 `DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com`；两者只改变构建下载 Electron 和运行时包的位置。验收时让产品目录的路径和真实安装一样长（例如放在 `%LOCALAPPDATA%Programs` 下），因为账号目录和插件依赖路径都要保持在 Windows 路径长度限制以内。

输出分别位于 `apps/desktop/.desktop-build/products/<brand>/<target>/artifacts` 或 `unsigned-artifacts`。原生图标、应用 ID、协议、应用名、更新缓存和用户数据目录按品牌区分。内置插件从不可变的应用运行时解析，启动时不安装到用户目录。部署最后一层覆盖配置保留插件菜单、清单、配置和启停控制，页面隐藏包操作。Host 保持自带的包不变：只安装包名不属于自带包的本地插件包文件（由工作台应用中心从平台下载），拒绝 registry 和远程 spec。这些插件包离线安装，必须自带依赖。市场启用入口和 Code 的独立更新仍禁用。

产品 Host 从声明所有内置插件的运行时清单解析模块，并使用操作系统分配的回环端口。不同品牌应用和开发版 Host 可以同时运行，无需共用固定监听端口。

## Windows 安装验证

品牌 Windows 安装包保留共用的长路径解压与目录替换机制。安装器先在目标目录旁准备完整应用，再替换目录；替换失败时恢复原目录。品牌页面和图标不改变这一机制。卸载删除应用目录并保留用户数据。

在 Windows x64 上，分别为每个品牌执行 `node apps/desktop/scripts/test-product-installer.mjs --product <product.json> --output <evidence-directory>`。命令构建独立的原生测试安装器，使用超过 260 字符的依赖路径验证首次安装、覆盖安装和卸载。它保留构建证据，使用唯一的应用注册信息且不创建快捷方式。还应安装完整发行文件并核验其中的文件；小型测试包不能代替完整负载或生产签名验证。

## 平台设置与数据保留

首次启动填写平台源地址；产品清单设置了 `platform`（HTTPS 源地址，对应工作台准备命令的 `--platform`）时会预先填好，已保存的选择始终优先。保存后打开所选品牌的登录页；主动关闭配置或登录窗口会退出应用。可选认证源地址默认沿用平台地址。远程地址要求 HTTPS；开发可使用 `http://127.0.0.1`。这些值是公开连接设置，不是凭据。对接平台需要实现 Desktop PKCE 登录和能力 API。

退出登录后，登录页的“平台设置”可修改地址。服务源地址的哈希选择独立的加密账号存储；已验证的发行者和用户标识选择其工作目录。切回原平台会保留数据。应用升级保留所属品牌的 Electron 用户数据、平台选择、账号目录、对话和用户覆盖配置。通过故障恢复禁用的 bundle 保持禁用。Aiko 和云遥使用独立用户数据目录，可同时存在。

知识库授权沿用 Host 的轮询和凭据交换。连接配置保存成功后，可信产品主框架可调用 `dshDesktop.activate()`，还原并聚焦当前应用窗口，不执行页面导航。其他窗口、子框架和外部页面不能调用此操作。Aiko 和云遥各自唤起自己的客户端；原生桥接不接收回调地址或凭据。构建 Desktop 后执行 `node apps/desktop/scripts/test-window-activation.mjs`，可在隔离的原生窗口中验证隐藏和最小化还原、聚焦、页面状态保留以及调用方拒绝。

构建 Desktop 后，分别为每个品牌执行 `node apps/desktop/scripts/test-product-admission.mjs --resources <packaged-application>/resources`。它使用独立应用数据，在 Electron 中执行真实启动入口，覆盖首次配置、从登录页修改平台、重新打开已保存配置和主动取消。添加 `--main <packaged-application>/resources/app.asar/lib/main.js` 可验证打包入口，而不是本地构建。测试将证据保留在 `.desktop-build/qualification`，不会登录远程账号。

为每个已安装产品执行 `corepack pnpm exec tsx apps/desktop/scripts/test-product-host.ts --installed <application-directory>`；macOS 上应用目录是应用包的 `Contents` 目录。这项独立验证通过打包 Host 同时启动两个账号配置，检查每个已启用内置应用的客户端和所提供的脚本，并在正常关闭后重启其中一个配置。它从安装目录读取产品元数据，将证据保留在 `.desktop-build/qualification`，无需平台凭据。添加 `--ui` 可在隔离的 Electron 渲染器中验证插件菜单、组件详情、模块配置和知识库模块开关。测试提供本地账号中继夹具，验证 registry spec 和自带包名的安装被拒绝、自带的包不能卸载，并从本地文件安装、卸载一个夹具应用插件包。登录窗口验证与 Host 验证覆盖不同启动阶段，两者都必须通过。

## GitHub Release 发布

输入仓库默认为 `aiko-dsh-plugins/deepseek-harness`。二进制资产存放在名为 `aiko-v<version>` 或 `yunyao-v<version>` 的不可变版本发布中。更新元数据存放在独立的 `aiko-beta`、`yunyao-beta`、`aiko-stable` 或 `yunyao-stable` 通道发布中。每个文件名包含品牌和架构；macOS 额外使用更新器要求的 `-mac.yml` 后缀。客户端不使用 GitHub 全局最新发布跳转或 DeepSeek 更新源。

例如，Aiko Windows beta 读取 `https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/aiko-beta/aiko-beta-win-x64.yml`。其中的下载地址指向不可变版本发布。配置的仓库必须允许客户端公开读取；平台凭据不会发送给 GitHub。

从干净检出成功完成签名构建后，检查生成的发布计划：

```powershell
corepack pnpm --dir apps/desktop run publish:product --record <artifacts>/win-x64-release.json
```

添加 `--publish` 后通过已认证的 `gh` 发布。发布器验证已完成的签名构建、产品身份、版本、更新源、文件大小和 SHA-512。它先上传文件，再替换对应架构的通道元数据，拒绝已存在的文件名和通道版本回退。稳定通道拒绝预发布版本。各目标应串行发布，不要让两个进程同时写入同一通道。禁止原地修改已发布安装包。

## 自建发布目录

产品清单设置 `releases`（以 `/` 结尾的 HTTPS 目录地址）而不是 `repository` 时，从 `<releases><profile>-<channel>/` 读取更新源，例如 `https://downloads.example.com/dsh/releases/yunyao-stable/yunyao-stable-win-x64.yml`。安装包放在不可变的 `<releases><profile>-v<version>/` 目录里，通道文件写它们的完整地址。服务器只需用 HTTPS 只读提供这个目录，不接收平台凭据。

干净构建完成后，先在本地整理发布文件：

```powershell
corepack pnpm --dir apps/desktop run publish:product --record <artifacts>/win-x64-release.json --output <staging-directory>
```

Mac 目标的通道文件另带 `installer`（`url`、`sha512`、`size`），指向版本目录里的 dmg；electron-updater 忽略这个字段，下载页据此提供 dmg。命令做与 GitHub 发布相同的校验，读取已发布的通道文件以拒绝版本回退，拒绝已整理过的版本目录，并按上传顺序列出文件。先把版本目录复制到服务器，最后复制通道文件。禁止替换已发布版本目录里的文件。

Windows 生产发布需要配置的签名证书和令牌；macOS 需要签名和公证。本地 Electron 验证覆盖公开设置 IPC、分品牌 HTTP 更新源和无执行能力的测试文件下载。它不代表生产签名、Gatekeeper/SmartScreen 认可或真实更新安装已经验证。公开发布前应在已安装的签名版本上验证这些项目。
