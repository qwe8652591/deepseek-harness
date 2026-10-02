# Aiko Desktop deployment

English | [中文](README.zh.md)

This reference covers source-based Aiko/Yunyao deployments of Desktop 0.2.0-rc.2. The official profile runner, Web UI, native adapters and Office runtime remain the application. Plugin source remains in the separate Aiko Workbench monorepo; this fork consumes its published archives. Signed installers and custom update distribution are outside this local deployment.

## Configuration

Set `DSH_DESKTOP_DEPLOYMENT` to an absolute JSON path before launching. Omit it for ordinary upstream Desktop. The file contains:

```json
{
  "profile": "yunyao",
  "identityConfig": "D:/private/desktop/identity.json",
  "pluginRuntime": "D:/runtime/desktop-plugins",
  "profilePatch": "D:/private/desktop/profile.patch.yml"
}
```

`profile` selects `aiko` or `yunyao` from the installed Workbench package's `./profiles/aiko` or `./profiles/yunyao` JSON export. Both enable the same business bundles and exactly one theme, which supplies welcome assets. Platform adapters ship in the Workbench platform component. Kit is optional; runtime preparation retains its archive only when the supplied deployment explicitly includes it. Desktop retains its reserved `profiles/desktop` directory and built-in base bundles. Legacy `brand`-only deployments remain supported; when both fields are present they must match. `identityConfig` and `pluginRuntime` are absolute paths. The optional `profilePatch` seeds an empty profile once; existing nonempty patches require an explicit operator merge. Subsequent starts preserve plugin removals, recovery state and user patches. A different plugin runtime requires a separate deployment profile; startup refuses to replace an unmanaged installation.

When the installed Workbench contains `workdsh-plugin-platform`, profile preparation migrates the legacy `workdsh` row's `name: aiko-dsh-workbench` assertion to that component. Its configuration and disabled state remain unchanged. Other row assertions and older installations are left intact.

The identity file contains `gatewayOrigin`, `websiteOrigin`, an absolute `storageDirectory`, and integer `loginTimeoutMs` and `checkIntervalMs` between 1,000 and 300,000. Origins must be HTTPS, except `http://127.0.0.1` for local development. The gateway implements the existing platform Desktop PKCE endpoints and capability API. Do not put passwords or bearer credentials in either configuration file.

Electron verifies an encrypted saved session or opens the platform in the system browser. Credentials remain in Electron main, encrypted through OS storage. A state-bound loopback callback redeems the PKCE code. Each process creates a bearer-protected capability relay for Host plugins. The renderer receives public profile fields and fixed account actions only. Credential expiry stops the Host and returns through login; temporary verification failures also stop admission. Native logout revokes this Desktop session without logging out other browser sessions.

The verified `issuer` and `subject` select `storageDirectory/accounts/<digest>` as `DSH_HOME`. Use a separate `storageDirectory` and `DSH_DESKTOP_USER_DATA_DIR` for concurrent development instances. Electron user data owns the encryption key on Windows: preserve it together with `account.enc`. Changing it requires a new platform login. No existing browser workspace or credential is imported automatically.

## Development procedure

1. Install the official workspace with `corepack pnpm install --frozen-lockfile`, then run `corepack pnpm run build`.
2. Prepare the Workbench, tender, knowledge, Code, market, plugin catalog and both theme archives from the Workbench monorepo; include Kit only when shared resources are needed. A source-runtime `package.json` must list the selected archives as absolute `file:...tgz` dependencies. The catalog is a passive dependency of the market, not an activated profile bundle. The Workbench account launcher must use a priority distinct from the official account launcher.
3. Run the preparation command below from the repository root. It links framework dependencies to this exact workspace, preventing duplicate Cordis and React instances. pnpm 10.34.5 is required for this external linked-plugin graph; the official workspace retains its own package manager.

```powershell
corepack pnpm@10.34.5 --dir apps/desktop run prepare:aiko --source-runtime D:/runtime/plugin-input --output D:/runtime/desktop-plugins
$env:DSH_DESKTOP_DEPLOYMENT = 'D:/private/desktop/deployment.json'
$env:DSH_DESKTOP_USER_DATA_DIR = 'D:/private/desktop/electron'
corepack pnpm run start:desktop
```

The preparation command installs plugins before application startup. It is not an application launcher. Fully quit this Desktop before replacing its runtime archives. `start:desktop` verifies the bundled primary runtime and launches the official Electron application. Use `dev:desktop` when rebuilding the whole application is necessary. The first startup activates the Agent Teams profile required by Workbench. Profile composition runs under the official profile write lock.

The deployment pins its plugins and passive catalog to runtime directories through profile package-manager overrides. Installing community plugins retains these links and unrelated overrides. Deployment plugins are updated from the prepared archives; their local catalog entries do not offer public-source replacement.

## Native icons at packaging

Set `DSH_DESKTOP_BRAND=aiko` or `yunyao` and `DSH_DESKTOP_BRAND_RUNTIME` to the prepared plugin runtime in `apps/desktop/.env.windows` or `.env.macos`. That runtime must contain the selected theme's `./desktop-icon` export. These settings belong to the target dotenv file; ambient brand settings cannot override a release. Use a deployment-owned `DSH_DESKTOP_APP_ID` and the normal target packaging command. Omitting both brand settings preserves upstream icons.

The packaging hook reads only the selected theme, renders a 1024-pixel PNG and a multi-size ICO, and includes them in the application. Windows executable, installer, uninstaller, shortcuts, taskbar, tray and About use that artwork; macOS packaging consumes the PNG for its app icon. The technical application filename and upstream installer banner remain unchanged. Startup rejects a deployment theme that differs from the packaged icon. Source launchers prepare the same assets from `DSH_DESKTOP_DEPLOYMENT` before opening Electron; the development Electron executable itself remains upstream.

For a Yunyao build, add:

```dotenv
DSH_DESKTOP_BRAND=yunyao
DSH_DESKTOP_BRAND_RUNTIME=D:/runtime/desktop-plugins
```

Run `corepack pnpm run package:desktop:win:x64:unsigned` for a local unsigned Windows package using the existing release configuration; signed packaging still requires signing credentials. Icon selection does not configure an update feed or bundle a platform login deployment. Prepare the platform configuration separately and qualify a custom update service before distribution.

## Verification

Run `corepack pnpm exec vitest run apps/desktop/tests/desktop-brand.spec.ts apps/desktop/tests/installer-packaging.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts` for native artwork generation, packaged resource selection, theme mismatch rejection and release setting isolation. Native asset selection has owner-local snapshots. Signed installer, update-channel and macOS visual qualification remain release-operator checks.

Run `corepack pnpm exec vitest run apps/desktop/tests/aiko-deployment.spec.ts apps/desktop/tests/project-manager.spec.ts` for brand selection, unmanaged-path rejection, recovery preservation and profile locking. The selected welcome copy has an owner-local snapshot. The existing Desktop build checks its bundled imports and TypeScript programs.

For a real local platform, run Electron with `apps/desktop/scripts/test-aiko-login.mjs`, followed by an isolated identity file, a private JSON file containing the test account's `username` and `password`, and its Electron user-data directory. Run it only while that Desktop is closed. This opt-in test performs real PKCE login, encrypted restore, relay authentication, capabilities access and logout, then leaves a separately issued session for interactive Desktop verification. It never prints credentials. This is authentication evidence, not a model-generation or installer test.

The integration decision and retained limitations are recorded in the [Agent Note](../../../.agents/notes/implemented/architecture/2026-09-30-aiko-desktop-platform-deployment.md).
