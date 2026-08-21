# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

Electron supervisor for the local Bid Studio composition. The Electron main process starts the standard Web profile plus the Bid Studio bundle in an independent Node child, waits for its loopback URL, and opens a hardened BrowserWindow. Window lifecycle, runtime lifecycle, and business plugins remain separate.

The app enforces a single desktop instance, forwards runtime output to Electron's logs directory, requests graceful child shutdown, and kills an unresponsive child after five seconds. The child inherits the normal Harness environment and storage locations.

Build the repository before starting the desktop client:

```powershell
pnpm run build
pnpm --filter @deepseek-ai/dsh-desktop start
```

Create an installer with `pnpm --filter @deepseek-ai/dsh-desktop dist`. Packaging still requires platform-specific installer verification before release.

Installed plugin and profile changes take effect after restarting this demo client. The supervised runtime does not enable Cordis module watching.
