# Agent Note: Complete branded Desktop products

Status: implemented

English | [中文](2026-10-03-complete-branded-desktop-products.zh.md)

## Problem

Application installers and independently upgraded business plugins can carry different tested versions. Startup theme selection alone does not isolate native application identity, local account storage or release updates.

## Decision

The product build manifest binds one brand profile to hashed plugin archives, native artwork and a GitHub repository/channel. The installer embeds that complete runtime and its final management policy. Profiles resolve packaged modules without copying them into account directories or creating links into ASAR. Editable platform origins select separate credential directories; installation identity and update destinations are not platform settings.

Version releases contain immutable binaries. Separate brand/channel releases contain per-target metadata pointing at those binaries. Publication validates the signed completion record and checksums before uploading binaries, then advances metadata. A clean checkout is required for publication. [Product distribution](../../../../apps/desktop/aiko/products/README.md) owns the operator procedure.

## Alternatives considered

Individual plugin upgrades preserve independent delivery but invalidate whole-application qualification. GitHub's repository-wide latest release cannot distinguish two brands and three architectures. External development junctions do not work inside packaged ASAR resources.

## Consequences

Users update one application. Brand products have independent native identity and data directories. Publishing every supported target costs more build time and requires signing credentials. Platform changes preserve old account homes without sharing credentials. Local unsigned qualification does not prove installed signed upgrade behavior.
