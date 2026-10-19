# Agent Note: Complete branded Desktop products

Status: implemented

English | [中文](2026-10-03-complete-branded-desktop-products.zh.md)

## Problem

Application installers and independently upgraded business plugins can carry different tested versions. Startup theme selection alone does not isolate native application identity, local account storage or release updates.

## Decision

The product build manifest binds one brand profile to hashed plugin archives, native artwork and a channel in either a GitHub repository or a [self-hosted release directory](2026-10-16-self-hosted-product-releases.md). The installer embeds that complete runtime and its final management policy. Profiles resolve packaged modules without copying them into account directories or creating links into ASAR. Editable platform origins select separate credential directories; installation identity and update destinations are not platform settings.

Version releases contain immutable binaries. Separate brand/channel releases contain per-target metadata pointing at those binaries. Publication validates the signed completion record and checksums before uploading binaries, then advances metadata. A clean checkout is required for publication. [Product distribution](../../../../apps/desktop/workbench/products/README.md) owns the operator procedure.

Windows products share the Host's long-path extraction and staged directory replacement adapter while supplying their own NSIS presentation. Full plugin dependencies exceed the legacy Windows copy-path limit. The stock copy step can misreport those failures as an application shutdown failure or omit files during silent installation. Native installation qualification covers long dependency paths, replacement and uninstall for both brands.

Desktop admission keeps Electron alive across the asynchronous transitions between platform settings and sign-in until the main shell owns window closure. Explicit cancellation still exits. Qualification uses the real startup entry without a fixture-owned last-window listener, which would conceal premature exit between admission windows.

The product runtime manifest is the Host's installation anchor. The CLI package's dependency graph omits product bundle entry packages, even when their files and transitive plugins are present beside it; using that anchor causes partial plugin activation. Product Hosts request an OS-assigned loopback port so separate brand and development instances do not contend for one listener. Packaged Host qualification activates the installation's product metadata, checks client assets, and covers concurrent profiles and restart independently of admission-window tests.

## Alternatives considered

Knowledge authorization requests native window activation only after the Host verifies the grant and the Client saves its configuration. The existing polling exchange remains authoritative; a provider page closing does not prove that Desktop saved the connection. A trusted-main-frame IPC activates the originating shell without navigation or a brand-specific callback URL. Failed or cancelled attempts do not activate, and a native focus failure does not invalidate a saved grant. Browser-only Hosts omit this optional operation.

Whole-application updates restrict package mutations, not inspection or activation. Disabling Plugin Manager removes the Remote endpoints consumed by Workbench settings and the sidebar entry. The managed overlay keeps those services active and advertises application-supplied bundles on the plugin page. It first rejected every installation and removal; [app-center packages](2026-10-13-app-center-packages-in-complete-products.md) now admits local package files for packages the installation does not supply. Packaged qualification exercises the inventory RPC and, with `--ui`, menu navigation, component details, knowledge configuration and module disable/enable in an isolated renderer.

Individual plugin upgrades preserve independent delivery but invalidate whole-application qualification. GitHub's repository-wide latest release cannot distinguish two brands and three architectures. External development junctions do not work inside packaged ASAR resources.

## Consequences

Users update one application. Brand products have independent native identity and data directories. Publishing every supported target costs more build time and requires signing credentials. Platform changes preserve old account homes without sharing credentials. Local unsigned qualification does not prove installed signed upgrade behavior.
