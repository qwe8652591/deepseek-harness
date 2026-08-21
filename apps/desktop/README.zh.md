# @deepseek-ai/dsh-desktop

[English](README.md) | 中文

本地投标工作台组合的 Electron 监管壳。Electron 主进程在独立 Node 子进程中启动标准 Web profile 与标书插件包，等待其回环地址就绪，再打开经过加固的 BrowserWindow。窗口生命周期、运行时生命周期和业务插件彼此分离。

应用只允许一个桌面实例，把运行时输出写入 Electron 日志目录，退出时先请求子进程正常关闭，并在子进程五秒无响应后终止它。子进程继承 Harness 的标准环境和存储位置。

启动客户端前先构建仓库：

```powershell
pnpm run build
pnpm --filter @deepseek-ai/dsh-desktop start
```

使用 `pnpm --filter @deepseek-ai/dsh-desktop dist` 创建安装包。正式发布前仍需对各平台安装包做验证。

当前 Demo 客户端中的插件与 profile 变更会在重启后生效；受监管运行时没有启用 Cordis 模块监听。
