# Agent Note: App-center packages in complete products

Status: implemented

English | [中文](2026-10-13-app-center-packages-in-complete-products.zh.md)

## Problem

[Complete branded products](2026-10-03-complete-branded-desktop-products.md) refused every package installation and removal so that one installer carried one qualified plugin set. The Workbench app center installs the plugins of platform-registered applications on demand; Tender, Code and the knowledge apps are no longer preinstalled. With every installation refused, a branded product could install no application plugin.

## Decision

Plugin Manager accepts `packageChanges: 'local-files'`. In that mode `installBundle` accepts only an absolute local package file whose manifest, read before pnpm runs, names a package the installation does not supply. Registry, Git and remote tarball specs, unreadable files and installation-supplied names are refused with `managed-installation` and a diagnostic, so a refusal changes no profile file. Removal keeps the ordinary rule: installation-supplied packages are never removable. The product policy selects this mode and keeps the page's package actions hidden.

The platform stores each reviewed plugin package by name and version and serves it to members who opened the application. The Workbench verifies the downloaded file's SHA-512, name and version before passing its path to `installBundle`, so application packages are never resolved by name from a registry. Their dependencies still resolve through pnpm's configured registries.

## Alternatives considered

Permitting all package changes would let registry specs shadow bundled packages; an installation-supplied package in an account profile stops the next product start. A private npm registry would need publishing credentials, a registry service, and either public read access or registry credentials in pnpm configuration, and name resolution would stay exposed to public fallbacks. Preinstalling every application plugin would need a new installer for each plugin release and would delay developer applications until the next product release.

## Consequences

Bundled packages still change only with the application. Application plugins change independently, pinned by the platform registration that members confirm. Product qualification installs and removes a fixture package from a local file and checks that registry specs and installation-supplied names are refused. pnpm keeps a reference to each installed package file, so the Workbench retains the file of every installed version.
