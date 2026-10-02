# Agent Note: Aiko platform admission on official Desktop

Status: implemented

English | [中文](2026-09-30-aiko-desktop-platform-deployment.zh.md)

## Problem

The private Aiko Desktop has browser platform login and encrypted credentials on an older shell. Its Workbench plugins already consume DSH 0.2.0-rc.2. Replacing the official desktop entry with that older shell loses current native adapters, runtime preparation and recovery behavior.

## Decision

The fork keeps the complete official Desktop and adds optional startup deployment configuration. Electron main admits a verified platform account before creating its Host; the account's issuer and subject choose its data directory. The selected theme package provides passive welcome assets, while fixed preload operations retain credential ownership in main. Product IPC checks the owning application window and main frame.

Operator-prepared peer plugins share this workspace's DSH, Cordis and React packages. Startup composes their Desktop profile under the existing write lock. Initial composition enables Workbench's Agent Teams dependency; later composition retains user removals and native recovery. Only the selected theme is linked into the profile. Workbench uses an explicit slot priority to coexist with the official DeepSeek account settings.

The market uses the official PluginManager Remote. Its organization directory is a passive package in the same plugin monorepo, not a Cordis bundle. Profile overrides pin deployment-owned packages to their prepared directories: subsequent package operations retain shared runtime identity and do not query npm for an unpublished directory version. Unrelated overrides remain operator-owned. An isolated real Host installation/removal verified that these links survive package operations.

## Alternatives considered

Named Aiko and Yunyao product profiles come from the installed Workbench package's JSON exports rather than another application launcher. Desktop retains its reserved physical profile and signed base composition. Brand-only configurations remain compatible; conflicting profile and brand selections fail before login. The first named-profile migration removes Kit resource activation while retaining user business-plugin choices and recovery state. Platform adapters now ship in the Workbench platform component, so new deployments do not require Kit. Runtime preparation retains an explicitly supplied Kit archive for optional shared resources and legacy preset paths; it never deletes existing user data.

**Port the old main window wholesale.** This discards upstream browser, directory, shortcut, update and recovery behavior, making each upgrade a larger fork.

**Run the existing browser service inside Electron.** This preserves an additional application wrapper and bypasses the official Desktop profile and native adapters. It also risks concurrent writes to a browser workspace.

**Let each plugin install a separate framework runtime.** Cordis service identity and React hooks must belong to the running Host and Client. The external development graph therefore links exact workspace packages instead of resolving separate npm copies.

## Consequences

Native artwork comes from the selected theme's passive `./desktop-icon` export. Target-local packaging settings select one brand before electron-builder renders its PNG and multi-size ICO; installed applications read only bundled resources and reject a conflicting deployment theme. Source launchers prepare the same assets before opening Electron. This keeps approved artwork with its theme while making executable and installer icons immutable for each build. Runtime theme switching cannot rewrite signed executable resources.

Source launches distinguish unavailable application updates from a failed release check. Missing development update metadata cannot be repaired by retrying, so it produces an informational dialog without a sidebar retry badge. Packaged releases retain the missing-source error, preventing deployment configuration failures from being presented as successful checks. Business plugins remain independently managed; this distinction does not provision or qualify a custom installer feed.

The existing platform owns identity and authorizes capability access. Native logout revokes only its Desktop session; credentials never enter a product renderer. Per-process relay files prevent one client from overwriting another's live bridge. Independent data and Electron user-data directories preserve concurrently running browser services, but existing conversations and model settings are not automatically migrated.

This is a source deployment, with no signed custom installer or custom update channel qualification. Windows encrypted credentials depend on the matching Electron user-data key. The linked plugin graph is prepared using pnpm 10.34.5 because pnpm 11.7.0 fails in its peer graph traversal; the official workspace remains on its own version. Release identity and installer banner artwork remain operator-managed.

## Verification

Owner-local tests cover deployment rejection, single-theme selection, preserving unmanaged files, user patches, recovery state and profile-lock exclusion. An opt-in built Electron test exercises real platform PKCE, encrypted restore, unauthorized relay rejection, authenticated capability access and logout. It issues a separate Desktop session for interactive verification; it does not certify model output or signed installers. Configuration and commands live in [Aiko deployment](../../../../apps/desktop/aiko/README.md).
