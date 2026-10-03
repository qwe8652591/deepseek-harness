# Complete Aiko and Yunyao distributions

English | [中文](README.zh.md)

This reference covers branded installers with an embedded profile, application plugins and one theme. [Source deployment](../README.md) remains available for plugin development. Platform addresses are entered by the user; the installer fixes the brand and update repository.

## Build inputs

In the Workbench monorepo, run `corepack pnpm run prepare:desktop-products --output <new-directory> --channel beta`. The command builds and packs the modules, then writes `aiko.json`, `yunyao.json` and their SHA-512-pinned archives. The catalog is a passive market dependency. Kit is not included. A profile contains only its selected theme.

From this Host repository, copy `apps/desktop/.env.windows.example` to `.env.windows` and configure signing for production. An unsigned local build needs that file but no signing credentials. Run:

```powershell
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/aiko.json
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/yunyao.json
```

Signed Windows builds use `package:win:x64`; macOS uses `package:mac:arm64` or `package:mac:x64` on a Mac with signing and notarization configured. `--build-version <semver>` selects the increasing application release version. The package command verifies archive identity and integrity before preparing the complete runtime. Unsigned builds have an `-unsigned` filename suffix and cannot be published by the product release command.

Outputs are isolated under `apps/desktop/.desktop-build/products/<brand>/<target>/artifacts` or `unsigned-artifacts`. The native icon, application ID, protocol, application name, updater cache and user-data directory differ by brand. Bundled plugins resolve from the immutable application runtime; startup does not install them into user homes. Plugin management and marketplace activation are disabled by the final deployment overlay. Code's independent package updater is also disabled. Developer distributions retain their module controls.

## Windows installation qualification

Branded Windows installers retain the shared long-path extraction and directory replacement mechanism. They stage the complete application beside the destination before replacing it; a failed replacement restores the previous directory. Brand-specific pages and icons do not change this mechanism. Uninstall removes the application directory and retains user data.

On Windows x64, run `node apps/desktop/scripts/test-product-installer.mjs --product <product.json> --output <evidence-directory>` for each brand. The command builds an isolated native installer and checks fresh installation, replacement and uninstall with a dependency path longer than 260 characters. It retains build evidence and uses a unique application registration without shortcuts. Also install the full release artifact and verify its packaged files; the small fixture does not qualify the complete payload or production signing.

## Platform settings and retained data

First launch asks for the platform origin. The optional authentication origin defaults to it. Remote origins require HTTPS; `http://127.0.0.1` is available for development. These values are public connection settings, not credentials. The existing platform must implement Desktop PKCE login and the capability API.

After logout, **Platform settings** on the login page changes the addresses. A service-origin hash selects an independent encrypted account store; the verified issuer and subject select its work directory. Returning to a previous platform preserves its data. Application upgrades retain the brand's Electron user data, saved platform selection, account homes, conversations and user patches. Recovery-disabled bundles remain disabled. Aiko and Yunyao use separate user-data directories and can coexist.

## GitHub release publication

The input repository defaults to `aiko-dsh-plugins/deepseek-harness`. Binary assets live in immutable releases named `aiko-v<version>` or `yunyao-v<version>`. Update metadata lives in the separate `aiko-beta`, `yunyao-beta`, `aiko-stable` or `yunyao-stable` channel release. Each filename includes its brand and architecture; macOS adds the updater's `-mac.yml` suffix. The client does not use GitHub's global latest-release redirect or DeepSeek's feed.

For example, Aiko Windows beta reads `https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/aiko-beta/aiko-beta-win-x64.yml`. Its payload URL names the immutable version release. The configured repository must be publicly readable by clients; their platform credentials are never sent to GitHub.

After a successful signed build from a clean checkout, review the generated plan:

```powershell
corepack pnpm --dir apps/desktop run publish:product --record <artifacts>/win-x64-release.json
```

Add `--publish` to publish through authenticated `gh`. The publisher verifies the completed signed build, product identity, version, feed, payload size and SHA-512. It uploads payloads before replacing that architecture's channel metadata, refuses existing payload filenames and rejects channel rollback. Stable channels reject prereleases. Publish each target serially; do not run two writers against the same channel. Never edit published installer assets in place.

Windows production requires the configured signing certificate and token; macOS requires signing and notarization. The local Electron qualification exercises public settings IPC, brand-specific HTTP feeds and downloads with inert bytes. It does not establish production signing, Gatekeeper/SmartScreen acceptance or installation of a real update. Qualify those on installed signed builds before public release.
