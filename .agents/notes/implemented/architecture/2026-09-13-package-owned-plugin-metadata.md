# Agent Note: Package-owned plugin metadata and desktop compatibility

Status: implemented

English | [中文](2026-09-13-package-owned-plugin-metadata.zh.md)

## Problem

A directory that repeats plugin versions and help requires a second publication for every plugin release. Existing desktop profiles also retain GitHub artifact URLs after repositories are deleted; resolving another dependency can revisit those URLs and fail with 404. Component peer declarations do not express the application's supported release interval.

## Decision

Aiko directory schema 2 contains only npm package names. Each plugin publishes display resources in `dsh.market` and a semver host requirement in `dsh.compatibility.host`; `dsh.compatibility.plugins` declares required plugin packages and version ranges. Market reads each package's npm manifest and revalidates it independently of directory publication. Metadata failures disable the affected package while preserving other entries. Bilingual Markdown and embedded raster previews require no runtime archive download. This replaces the content ownership in the [npm catalog decision](2026-09-12-aiko-npm-catalog-content.md).

The [desktop manager](../../../../apps/desktop/src/project-manager.ts) validates staged declarations against the exact application release and installed plugin versions before activation. The market obtains the application version through the isolated preload bridge and blocks incompatible proposals. Legacy plugins without a declaration remain unverified; successful startup does not prove every feature compatible. Reusing a release number for different custom builds cannot be distinguished by a semver requirement.

The manager repairs the four retired Aiko GitHub artifact sources together before dependency resolution. The old `dshmarket` identity moves to `aiko-dsh-market`; existing official npm market installations below the schema-2 baseline also advance to that baseline. The migration applies on same-version startup as well as dependency transactions. Other publishers, forks, unrelated plugins, session data and workspaces retain their identities. Migration uses npm and may require network access; failed resolution or health validation preserves the active installation.

## Alternatives considered

**Keep exact versions in the directory.** This retains duplicate release ownership and the second publication step.

**Read help from each runtime archive.** Office includes three interpreters; its npm manifest carries the much smaller presentation data.

**Change only the selected plugin's source.** pnpm resolves the surrounding dependency graph and can still request another retired artifact. The explicit first-party migration covers all affected installed packages in one staged transaction.

**Treat all peer mismatches as an application incompatibility.** Component versions are independent of the desktop release; optional peers and broad historical declarations are insufficient for a reliable application interval.

## Consequences

Ordinary plugin releases need no directory publication. Adding or removing an allowed package still publishes the directory. Compatibility enforcement and automatic repair require the updated desktop installer; updating the directory alone cannot repair an old installer. Four Aiko plugins initially declare the exact tested `0.1.5-alpha.2` application release. A later release expands its range only with matching validation.

The installer records each selected exact registry version and combines it with existing exact release-age approvals for that package into one exact-version union because pnpm uses the first matching package rule. Tags and HTTPS artifacts receive no exemption. The installer preserves approved versions and rejects ranges or wildcards. The Apple Silicon repair reuses the digest-pinned Mac runtime and core package set, updates the shell and npm seed, refreshes ASAR integrity, and signs the test bundle ad hoc. Native checks cover offline first launch, editing shortcuts, failed-staging preservation and startup migration; the release remains unnotarized with automatic updates disabled.
