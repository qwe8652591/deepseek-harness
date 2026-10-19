# Complete Aiko and Yunyao distributions

English | [中文](README.zh.md)

This reference covers branded installers with an embedded profile, application plugins and one theme. [Source deployment](../README.md) remains available for plugin development. Platform addresses are entered by the user; the installer fixes the brand and update location.

## Build inputs

In the Workbench monorepo, run `corepack pnpm run prepare:desktop-products --output <new-directory> --channel beta`; add `--releases <https-directory/>` to publish to a self-hosted release directory instead of GitHub. The command builds and packs Workbench, the market and its catalog, and the Markdown editor, Visio, draw.io, PPT and image generation plugins, then writes `aiko.json`, `yunyao.json` and their SHA-512-pinned archives. The catalog is a passive market dependency. Kit is not included. Application plugins such as Tender, Code and the knowledge apps are not bundled; users install them from the Workbench app center. A profile contains only its selected theme.

From this Host repository, copy `apps/desktop/.env.windows.example` to `.env.windows` and configure signing for production. An unsigned local build needs that file but no signing credentials. Run:

```powershell
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/aiko.json
corepack pnpm --dir apps/desktop run package:win:x64:unsigned --product D:/release-inputs/yunyao.json
```

Signed Windows builds use `package:win:x64`; macOS uses `package:mac:arm64` or `package:mac:x64` on a Mac with signing and notarization configured. `--build-version <semver>` selects the increasing application release version. The package command verifies archive identity and integrity before preparing the complete runtime. Unsigned builds have an `-unsigned` filename suffix. The product release command publishes them only for a product with a self-hosted release directory; such builds keep their update feed and are verified by HTTPS and SHA-512 only, with no publisher signature.

Where the default download hosts are slow, set `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` in the shell before packaging and `DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com` in `.env.windows`; they change only where the build fetches Electron and runtime packages. Qualify a product from a directory whose path is as long as a real installation (for example under `%LOCALAPPDATA%Programs`), because account homes and plugin dependency paths must stay under the Windows path limit.

Outputs are isolated under `apps/desktop/.desktop-build/products/<brand>/<target>/artifacts` or `unsigned-artifacts`. The native icon, application ID, protocol, application name, updater cache and user-data directory differ by brand. Bundled plugins resolve from the immutable application runtime; startup does not install them into user homes. The final deployment overlay retains the Plugins menu, inventory, configuration and activation controls and hides the page's package actions. The Host keeps bundled packages fixed: it installs only local package files that name other packages, which the Workbench app center downloads from the platform, and refuses registry and remote specs. Those packages install offline, so each one carries its own dependencies. Marketplace activation and Code's independent updater remain disabled.

The product Host resolves modules from the runtime manifest, which declares all bundled plugins, and requests an OS-assigned loopback port. Separate branded applications and development Hosts can run concurrently without sharing a fixed listener.

## Windows installation qualification

Branded Windows installers retain the shared long-path extraction and directory replacement mechanism. They stage the complete application beside the destination before replacing it; a failed replacement restores the previous directory. Brand-specific pages and icons do not change this mechanism. Uninstall removes the application directory and retains user data.

On Windows x64, run `node apps/desktop/scripts/test-product-installer.mjs --product <product.json> --output <evidence-directory>` for each brand. The command builds an isolated native installer and checks fresh installation, replacement and uninstall with a dependency path longer than 260 characters. It retains build evidence and uses a unique application registration without shortcuts. Also install the full release artifact and verify its packaged files; the small fixture does not qualify the complete payload or production signing.

## Platform settings and retained data

First launch asks for the platform origin; a product manifest that sets `platform` (an HTTPS origin, `--platform` in the Workbench prepare command) fills it in, and a saved choice always wins. Saving opens the selected brand's sign-in page; closing either admission window explicitly exits the application. The optional authentication origin defaults to the platform origin. Remote origins require HTTPS; `http://127.0.0.1` is available for development. These values are public connection settings, not credentials. The existing platform must implement Desktop PKCE login and the capability API.

After logout, **Platform settings** on the login page changes the addresses. A service-origin hash selects an independent encrypted account store; the verified issuer and subject select its work directory. Returning to a previous platform preserves its data. Application upgrades retain the brand's Electron user data, saved platform selection, account homes, conversations and user patches. Recovery-disabled bundles remain disabled. Aiko and Yunyao use separate user-data directories and can coexist.

Knowledge authorization completes through the Host's existing polling and credential exchange. Once the connection configuration is saved, the trusted product main frame can call `dshDesktop.activate()` to restore and focus its current application window without navigation. Other windows, child frames and external pages cannot invoke this operation. Aiko and Yunyao each activate their own shell; the native bridge accepts no callback URL or credential. Run `node apps/desktop/scripts/test-window-activation.mjs` after building Desktop to qualify hidden/minimized restoration, focus, document preservation and sender rejection in isolated native windows.

After building Desktop, run `node apps/desktop/scripts/test-product-admission.mjs --resources <packaged-application>/resources` for each brand. It exercises the real startup entry in Electron with private application data, including first setup, changing platforms from sign-in, reopening saved settings and explicit cancellation. Use `--main <packaged-application>/resources/app.asar/lib/main.js` to qualify the packaged entry instead of the local build. The fixture retains evidence under `.desktop-build/qualification` and does not log in to a remote account.

Run `corepack pnpm exec tsx apps/desktop/scripts/test-product-host.ts --installed <application-directory>` for each installed product; on macOS the application directory is the bundle's `Contents` directory. This separate qualification starts two account profiles concurrently through the packaged Host, verifies every enabled bundled application client and its served script, and restarts a profile after graceful shutdown. It reads product metadata from the installation, retains evidence under `.desktop-build/qualification`, and needs no platform credentials. Add `--ui` to exercise the plugin menu, component details, module configuration and knowledge-module activation in an isolated Electron renderer. The test supplies a local account relay fixture, verifies that registry specs and installation-supplied package names are refused and bundled packages cannot be removed, and installs and removes a fixture application package from a local file. Admission and Host qualification cover different startup stages; both must pass.

## GitHub release publication

The input repository defaults to `aiko-dsh-plugins/deepseek-harness`. Binary assets live in immutable releases named `aiko-v<version>` or `yunyao-v<version>`. Update metadata lives in the separate `aiko-beta`, `yunyao-beta`, `aiko-stable` or `yunyao-stable` channel release. Each filename includes its brand and architecture; macOS adds the updater's `-mac.yml` suffix. The client does not use GitHub's global latest-release redirect or DeepSeek's feed.

For example, Aiko Windows beta reads `https://github.com/aiko-dsh-plugins/deepseek-harness/releases/download/aiko-beta/aiko-beta-win-x64.yml`. Its payload URL names the immutable version release. The configured repository must be publicly readable by clients; their platform credentials are never sent to GitHub.

After a successful signed build from a clean checkout, review the generated plan:

```powershell
corepack pnpm --dir apps/desktop run publish:product --record <artifacts>/win-x64-release.json
```

Add `--publish` to publish through authenticated `gh`. The publisher verifies the completed signed build, product identity, version, feed, payload size and SHA-512. It uploads payloads before replacing that architecture's channel metadata, refuses existing payload filenames and rejects channel rollback. Stable channels reject prereleases. Publish each target serially; do not run two writers against the same channel. Never edit published installer assets in place.

## Self-hosted release publication

A product whose manifest sets `releases` (an HTTPS directory URL ending in `/`) instead of `repository` reads its feed from `<releases><profile>-<channel>/`, for example `https://downloads.example.com/dsh/releases/yunyao-stable/yunyao-stable-win-x64.yml`. Payloads live in the immutable `<releases><profile>-v<version>/` directory, and the channel file names their absolute URLs. The server must serve that directory read-only over HTTPS; it receives no platform credentials.

After a clean build, stage the release locally:

```powershell
corepack pnpm --dir apps/desktop run publish:product --record <artifacts>/win-x64-release.json --output <staging-directory>
```

For a Mac target the channel file also carries `installer` (`url`, `sha512`, `size`) for the dmg in the version directory; electron-updater ignores it and download pages offer the dmg from it. The command applies the same verification as GitHub publication, reads the published channel file to refuse version rollback, refuses a version directory that is already staged, and prints the files in upload order. Copy the version directory to the server first and the channel file last. Never replace files inside a published version directory.

Windows production requires the configured signing certificate and token; macOS requires signing and notarization. The local Electron qualification exercises public settings IPC, brand-specific HTTP feeds and downloads with inert bytes. It does not establish production signing, Gatekeeper/SmartScreen acceptance or installation of a real update. Qualify those on installed signed builds before public release.
