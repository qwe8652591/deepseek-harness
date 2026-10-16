# Agent Note: Self-hosted product releases

Status: implemented

English | [中文](2026-10-16-self-hosted-product-releases.zh.md)

## Problem

[Complete branded products](2026-10-03-complete-branded-desktop-products.md) read their update feed from GitHub channel releases, and only signed builds carried a feed or could be published. The Yunyao deployment distributes its installer from its own HTTPS server, and its first production release has no Windows code-signing certificate yet. Under those rules the release could ship only without automatic updates, so every later version would need a manual reinstall.

## Decision

A product manifest names exactly one update location: a GitHub `repository` or a self-hosted `releases` directory, which must be an HTTPS URL without credentials, query or fragment and must end in `/`. The feed is `<releases><profile>-<channel>/`, and payloads live in the immutable `<releases><profile>-v<version>/` directory, the same layout as the GitHub channel and version releases.

An unsigned Windows build of a self-hosted product keeps its generic-provider feed and writes a completion record with `signed: false`. electron-builder emits no `publisherName`, so electron-updater checks the SHA-512 in the channel file but no publisher signature. The product release command accepts unsigned records only for self-hosted products; it stages the version directory and channel file locally and refuses version rollback by reading the published channel file. GitHub products still require signed builds.

## Alternatives considered

Shipping the unsigned release without a feed would leave every installed client on 0.2.0 until users reinstall by hand. Waiting for an EV certificate would delay the production release. Keeping GitHub releases would make clients download from a host outside the deployment and would need a public repository for the installer assets.

## Consequences

Update integrity for unsigned self-hosted products rests on HTTPS to the release server and the SHA-512 in the channel file: anyone who can write that directory can ship code to clients. The server must keep the directory writable only by release operators. Once a certificate is available, signed builds of the same product use the same feed, and electron-updater then also verifies the publisher.
