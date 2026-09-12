# Agent Note: Aiko npm catalog content

Status: implemented

English | [中文](2026-09-12-aiko-npm-catalog-content.zh.md)

## Problem

Publishing runtime packages to npm does not remove a market's dependency on public plugin repositories when its guides, screenshots and dependency identities still use repository URLs. Downloading the Office runtime merely to display its guide also imposes an unnecessary large download.

## Decision

The public `aiko-dsh-plugin-catalog` npm data package carries exact npm installation targets, plugin dependency references, localized Markdown and embedded raster previews. The Aiko market reads it through `additionalRegistryPackages`; the host verifies archive integrity and size before exposing content to either client. Markdown renders without raw HTML or repository image requests. The catalog does not execute code or activate a profile bundle.

Repository URLs remain compatibility identifiers for catalog merging and dependencies. Separate public homepage and feedback fields own navigation. Npm installations match package names and retain their explicit sources. Existing GitHub installations require explicit migration; deleting a repository cannot redirect their lockfile URLs. The [desktop seed](../../../../apps/desktop/preinstalled-plugins.json) pins the market version that consumes npm content.

## Alternatives considered

**Keep help in public plugin repositories.** This leaves those repositories necessary for ordinary product use and prevents their retirement.

**Read every runtime archive to display help.** Office includes interpreters for three platforms. A lightweight catalog avoids downloading those resources before installation.

**Replace every repository identifier with an npm page URL.** Current consumers use repository identifiers for merging and dependency references. Independent presentation fields preserve that behavior while removing network access to the identified repositories.

## Consequences

Plugin runtime and presentation updates use independently versioned npm packages. Catalog publication follows verification of all referenced runtime versions. The catalog package includes image license notices and only data files. Private development, public npm runtime distribution and public Mac client downloads retain the ownership described by the [distribution decision](../process/2026-09-11-aiko-private-source-distribution.md).
