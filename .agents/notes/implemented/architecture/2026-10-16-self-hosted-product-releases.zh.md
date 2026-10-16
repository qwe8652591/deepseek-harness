# Agent Note: 自建发布目录的产品发布

Status: implemented

[English](2026-10-16-self-hosted-product-releases.md) | 中文

## Problem

[完整品牌 Desktop 产品](2026-10-03-complete-branded-desktop-products.zh.md)从 GitHub 通道发布读取更新源，只有签名构建带更新源、能被发布。云遥部署从自己的 HTTPS 服务器分发安装包，第一个生产版本还没有 Windows 代码签名证书。按原规则这一版只能不带自动更新发布，以后每个版本都要用户手动重装。

## Decision

产品清单只写一个更新位置：GitHub `repository` 或自建的 `releases` 目录。`releases` 必须是不带凭据、查询和片段的 HTTPS 地址，并以 `/` 结尾。更新源是 `<releases><profile>-<channel>/`，安装包放在不可变的 `<releases><profile>-v<version>/` 目录，与 GitHub 的通道发布和版本发布结构相同。

自建发布产品的 Windows 未签名构建保留 generic 更新源，并写出 `signed: false` 的完成记录。electron-builder 不写 `publisherName`，electron-updater 因此校验通道文件里的 SHA-512，不校验发布者签名。产品发布命令只对自建发布产品接受未签名记录；它在本地整理版本目录和通道文件，并读取已发布的通道文件拒绝版本回退。GitHub 产品仍要求签名构建。

## Alternatives considered

不带更新源发布未签名版本，已安装的客户端会一直停在 0.2.0，直到用户手动重装。等 EV 证书会推迟生产发布。继续用 GitHub 发布，客户端要从部署之外的主机下载，安装包资产也需要公开仓库。

## Consequences

未签名自建发布产品的更新完整性依赖到发布服务器的 HTTPS 和通道文件里的 SHA-512：能写这个目录的人就能向客户端发布代码。服务器必须只允许发布操作员写这个目录。有了证书后，同一产品的签名构建沿用同一更新源，electron-updater 还会校验发布者。
