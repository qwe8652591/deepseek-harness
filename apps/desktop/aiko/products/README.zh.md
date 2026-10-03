# Aiko 与云遥完整发行包

[English](README.md) | 中文

本文介绍内置 profile、应用插件和单一主题的品牌安装包。[源码部署](../README.zh.md)继续用于插件开发。平台地址由用户填写；品牌和更新仓库由安装包确定。

## 构建输入

在工作台单仓库执行 `corepack pnpm run prepare:desktop-products --output <new-directory> --channel beta`。命令构建并打包各模块，然后输出 `aiko.json`、`yunyao.json` 及通过 SHA-512 固定的归档。目录模块是市场的被动依赖。Kit 不包含在内。每个 profile 只包含所选主题。

在 Host 仓库中，将 `apps/desktop/.env.windows.example` 复制为 `.env.windows` 并配置生产签名。未签名本地构建需要该文件，但无需签名凭据。执行：

```powershell
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/aiko.json
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/yunyao.json
```

Windows 签名构建使用 `package:win:x64`；macOS 在配置好签名和公证的 Mac 上使用 `package:mac:arm64` 或 `package:mac:x64`。`--build-version <semver>` 指定递增的应用发布版本。打包命令在准备完整运行时前验证归档身份与完整性。未签名构建的文件名带有 `-unsigned` 后缀，产品发布命令拒绝发布这类构建。

输出分别位于 `apps/desktop/.desktop-build/products/<brand>/<target>/artifacts` 或 `unsigned-artifacts`。原生图标、应用 ID、协议、应用名、更新缓存和用户数据目录按品牌区分。内置插件从不可变的应用运行时解析，启动时不安装到用户目录。部署最后一层覆盖配置保留插件菜单、清单、配置和启停控制；Host 拒绝单独安装和卸载包，页面隐藏相应操作。市场启用入口和 Code 的独立更新仍禁用。

产品 Host 从声明所有内置插件的运行时清单解析模块，并使用操作系统分配的回环端口。不同品牌应用和开发版 Host 可以同时运行，无需共用固定监听端口。

## Windows 安装验证

品牌 Windows 安装包保留共用的长路径解压与目录替换机制。安装器先在目标目录旁准备完整应用，再替换目录；替换失败时恢复原目录。品牌页面和图标不改变这一机制。卸载删除应用目录并保留用户数据。

在 Windows x64 上，分别为每个品牌执行 `node apps/desktop/scripts/test-product-installer.mjs --product <product.json> --output <evidence-directory>`。命令构建独立的原生测试安装器，使用超过 260 字符的依赖路径验证首次安装、覆盖安装和卸载。它保留构建证据，使用唯一的应用注册信息且不创建快捷方式。还应安装完整发行文件并核验其中的文件；小型测试包不能代替完整负载或生产签名验证。

## 平台设置与数据保留

首次启动填写平台源地址。保存后打开所选品牌的登录页；主动关闭配置或登录窗口会退出应用。可选认证源地址默认沿用平台地址。远程地址要求 HTTPS；开发可使用 `http://127.0.0.1`。这些值是公开连接设置，不是凭据。对接平台需要实现 Desktop PKCE 登录和能力 API。

退出登录后，登录页的“平台设置”可修改地址。服务源地址的哈希选择独立的加密账号存储；已验证的发行者和用户标识选择其工作目录。切回原平台会保留数据。应用升级保留所属品牌的 Electron 用户数据、平台选择、账号目录、对话和用户覆盖配置。通过故障恢复禁用的 bundle 保持禁用。Aiko 和云遥使用独立用户数据目录，可同时存在。

构建 Desktop 后，分别为每个品牌执行 `node apps/desktop/scripts/test-product-admission.mjs --resources <packaged-application>/resources`。它使用独立应用数据，在 Electron 中执行真实启动入口，覆盖首次配置、从登录页修改平台、重新打开已保存配置和主动取消。添加 `--main <packaged-application>/resources/app.asar/lib/main.js` 可验证打包入口，而不是本地构建。测试将证据保留在 `.desktop-build/qualification`，不会登录远程账号。

为每个已安装产品执行 `corepack pnpm exec tsx apps/desktop/scripts/test-product-host.ts --installed <application-directory>`。这项独立验证通过打包 Host 同时启动两个账号配置，检查每个已启用内置应用的客户端和所提供的脚本，并在正常关闭后重启其中一个配置。它从安装目录读取产品元数据，将证据保留在 `.desktop-build/qualification`，无需平台凭据。添加 `--ui` 可在隔离的 Electron 渲染器中验证插件菜单、组件详情、模块配置和知识库模块开关。测试提供本地账号中继夹具，并验证单个包的安装和卸载请求被拒绝。登录窗口验证与 Host 验证覆盖不同启动阶段，两者都必须通过。

## GitHub Release 发布

输入仓库默认为 `aiko-dsh-plugins/deepseek-harness`。二进制资产存放在名为 `aiko-v<version>` 或 `yunyao-v<version>` 的不可变版本发布中。更新元数据存放在独立的 `aiko-beta`、`yunyao-beta`、`aiko-stable` 或 `yunyao-stable` 通道发布中。每个文件名包含品牌和架构；macOS 额外使用更新器要求的 `-mac.yml` 后缀。客户端不使用 GitHub 全局最新发布跳转或 DeepSeek 更新源。

例如，Aiko Windows beta 读取 `https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/aiko-beta/aiko-beta-win-x64.yml`。其中的下载地址指向不可变版本发布。配置的仓库必须允许客户端公开读取；平台凭据不会发送给 GitHub。

从干净检出成功完成签名构建后，检查生成的发布计划：

```powershell
corepack pnpm --dir apps/desktop run publish:product --record <artifacts>/win-x64-release.json
```

添加 `--publish` 后通过已认证的 `gh` 发布。发布器验证已完成的签名构建、产品身份、版本、更新源、文件大小和 SHA-512。它先上传文件，再替换对应架构的通道元数据，拒绝已存在的文件名和通道版本回退。稳定通道拒绝预发布版本。各目标应串行发布，不要让两个进程同时写入同一通道。禁止原地修改已发布安装包。

Windows 生产发布需要配置的签名证书和令牌；macOS 需要签名和公证。本地 Electron 验证覆盖公开设置 IPC、分品牌 HTTP 更新源和无执行能力的测试文件下载。它不代表生产签名、Gatekeeper/SmartScreen 认可或真实更新安装已经验证。公开发布前应在已安装的签名版本上验证这些项目。
