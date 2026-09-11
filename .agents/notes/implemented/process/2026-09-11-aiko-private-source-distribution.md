# Agent Note: Aiko private source and public distribution

Status: implemented

English | [中文](2026-09-11-aiko-private-source-distribution.zh.md)

## Problem

Aiko clients install plugins from public GitHub Release URLs. Restricting those URLs would break installation without adding authentication to every client. Public forks also retain published source history, while ongoing development requires restricted access.

## Decision

Independent private repositories own active client and plugin development. Public repositories retain published history and immutable release assets; the public organization catalog keeps its distribution identities and download URLs. Local checkouts use a private `source` push remote and retain the official upstream remote. Aiko plugin packages omit optional TypeScript source and browser source maps; executable JavaScript and required Python remain distributed. Core packages retain their upstream publication manifests.

The [Mac test workflow](../../../../.github/workflows/aiko-macos-test.yml) builds the selected private client commit. Its cache identity includes that commit, architecture and the pinned public Office test revision. Office fixtures exercise the plugin installed from its published tarball; they do not supply client implementation. Private artifacts contain checksums and provenance. Maintainers publish validated binaries to the public client repository without pushing private implementation commits or embedding GitHub credentials in the application.

The test application retains an independent data directory and no update feed. Ad-hoc signatures allow native validation without changing production signing requirements. The workflow verifies ZIP extraction, signatures, offline first launch, native clipboard shortcuts in the composer, the market entry and installed Office document operations on both Mac architectures. Electron's standard Edit menu owns editing actions and platform shortcuts; renderer-only key handlers cannot supply the macOS application menu. Clipboard validation owns the hosted runner's initially empty clipboard and clears its test data before completion.

## Alternatives considered

**Make distribution repositories private.** This would invalidate anonymous downloads and does not convert an existing public fork into an independent private repository.

**Build clients from an Office-owned upstream patch.** That duplicates client ownership and can omit private client changes. Client builds use their own checkout; the public Office revision supplies only released verification fixtures.

**Replace published packages in place.** Existing clients and lockfiles depend on their bytes and checksums. Updated artifacts use new versions; relocation copies existing bytes and preserves old URLs.

## Consequences

New source commits stay private while users keep anonymous installation. Repository privacy does not hide historical public code or executable plugin code. Cross-repository publication remains an explicit maintainer operation. Native smoke results qualify test builds; Developer ID signing and notarization remain prerequisites for production Mac distribution.
