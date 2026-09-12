# Agent Note: Aiko private source and public distribution

Status: implemented

English | [中文](2026-09-11-aiko-private-source-distribution.zh.md)

## Problem

Aiko clients install plugins from public GitHub Release URLs. Restricting those URLs would break installation without adding authentication to every client. Public forks also retain published source history, while ongoing development requires restricted access.

## Decision

Independent private repositories own active client and plugin development. Aiko plugins publish built packages under independent names on public npm; Mac application ZIPs remain public GitHub Releases. The organization catalog separates npm installations from its legacy GitHub feed, whose immutable download URLs remain valid. Local checkouts use a private `source` push remote and retain the official upstream remote. Aiko plugin packages omit optional TypeScript source and browser source maps; executable JavaScript and required Python remain distributed. Core packages retain their upstream publication manifests.

The [Mac test workflow](../../../../.github/workflows/aiko-macos-test.yml) builds the selected private client commit. Its cache identity includes that commit and architecture. The client owns its Playwright dependency and requires no Office checkout. Private artifacts contain checksums and provenance. Maintainers publish validated binaries to the public client repository without pushing private implementation commits or embedding GitHub credentials in the application.

The test application retains an independent data directory and no update feed. Ad-hoc signatures allow native validation without changing production signing requirements. The workflow verifies ZIP extraction, signatures, offline first launch, native clipboard shortcuts in the composer, the market entry and Office's absence from the fresh profile on both Mac architectures. Electron's standard Edit menu owns editing actions and platform shortcuts; renderer-only key handlers cannot supply the macOS application menu. Clipboard validation retains the original clipboard items inside Electron and restores them before completion.

Fresh profiles preinstall only an exact npm version of `aiko-dsh-market`. pnpm records registry integrity in the seed lockfile; direct HTTPS tarballs are downloaded and receive integrity before the offline store is populated. Office is an optional market download so its document runtimes do not enter every client seed. Release reconciliation preserves existing plugin names and sources, because changing defaults does not authorize replacing user plugins. Users remove `dshmarket` through the native manager before adding `aiko-dsh-market`; the packages cannot coexist. Office's own platform workflow owns document and skill verification.

pnpm records explicit fresh-version installations in `minimumReleaseAgeExclude`. Desktop compares parsed workspace settings so pnpm formatting and exact non-core exclusions do not invalidate an otherwise unchanged core mapping. Historical exact exclusions remain valid after removal; broader selectors and changes to owned settings fail validation. This preserves pnpm's release-age policy without globally disabling it.

Installed-plugin records carry explicit npm or HTTPS specs. An absent npm spec makes the market treat a registry installation as an unknown source; the desktop owner resolves that identity before exposing the record to either renderer.

## Alternatives considered

**Make distribution repositories private.** This would invalidate anonymous downloads and does not convert an existing public fork into an independent private repository.

**Build clients from an Office-owned upstream patch.** That duplicates client ownership and can omit private client changes. Client builds and smoke dependencies belong to the client checkout.

**Replace published packages in place.** Existing clients and lockfiles depend on their bytes and checksums. Updated artifacts use new versions; relocation copies existing bytes and preserves old URLs.

## Consequences

New source commits stay private while users keep anonymous installation. Repository privacy does not hide historical public code or executable plugin code. Cross-repository publication remains an explicit maintainer operation. Native smoke results qualify test builds; Developer ID signing and notarization remain prerequisites for production Mac distribution.
