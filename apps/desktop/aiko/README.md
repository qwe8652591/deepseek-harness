# Aiko Desktop deployment

English | [中文](README.zh.md)

This reference covers source-based Aiko/Yunyao deployments of Desktop 0.2.0-rc.2. The official profile runner, Web UI, native adapters and Office runtime remain the application. Plugin source remains in the separate Aiko Workbench monorepo; this fork consumes its published archives. Signed installers and custom update distribution are outside this local deployment.

## Configuration

Set `DSH_DESKTOP_DEPLOYMENT` to an absolute JSON path before launching. Omit it for ordinary upstream Desktop. The file contains:

```json
{
  "brand": "yunyao",
  "identityConfig": "D:/private/desktop/identity.json",
  "pluginRuntime": "D:/runtime/desktop-plugins",
  "profilePatch": "D:/private/desktop/profile.patch.yml"
}
```

`brand` is required and accepts `aiko` or `yunyao`. Only that theme is linked into the Desktop profile and supplies welcome assets. `identityConfig` and `pluginRuntime` are absolute paths. The optional `profilePatch` seeds an empty profile once; existing nonempty patches require an explicit operator merge. Subsequent starts preserve plugin removals, recovery state and user patches. A different plugin runtime requires a separate deployment profile; startup refuses to replace an unmanaged installation.

The identity file contains `gatewayOrigin`, `websiteOrigin`, an absolute `storageDirectory`, and integer `loginTimeoutMs` and `checkIntervalMs` between 1,000 and 300,000. Origins must be HTTPS, except `http://127.0.0.1` for local development. The gateway implements the existing platform Desktop PKCE endpoints and capability API. Do not put passwords or bearer credentials in either configuration file.

Electron verifies an encrypted saved session or opens the platform in the system browser. Credentials remain in Electron main, encrypted through OS storage. A state-bound loopback callback redeems the PKCE code. Each process creates a bearer-protected capability relay for Host plugins. The renderer receives public profile fields and fixed account actions only. Credential expiry stops the Host and returns through login; temporary verification failures also stop admission. Native logout revokes this Desktop session without logging out other browser sessions.

The verified `issuer` and `subject` select `storageDirectory/accounts/<digest>` as `DSH_HOME`. Use a separate `storageDirectory` and `DSH_DESKTOP_USER_DATA_DIR` for concurrent development instances. Electron user data owns the encryption key on Windows: preserve it together with `account.enc`. Changing it requires a new platform login. No existing browser workspace or credential is imported automatically.

## Development procedure

1. Install the official workspace with `corepack pnpm install --frozen-lockfile`, then run `corepack pnpm run build`.
2. Prepare the Workbench, Kit, tender, knowledge, Code and both theme archives. A source-runtime `package.json` must list them as absolute `file:...tgz` dependencies. The Workbench account launcher must use a priority distinct from the official account launcher.
3. Run the preparation command below from the repository root. It links framework dependencies to this exact workspace, preventing duplicate Cordis and React instances. pnpm 10.34.5 is required for this external linked-plugin graph; the official workspace retains its own package manager.

```powershell
corepack pnpm@10.34.5 --dir apps/desktop run prepare:aiko --source-runtime D:/runtime/plugin-input --output D:/runtime/desktop-plugins
$env:DSH_DESKTOP_DEPLOYMENT = 'D:/private/desktop/deployment.json'
$env:DSH_DESKTOP_USER_DATA_DIR = 'D:/private/desktop/electron'
corepack pnpm run start:desktop
```

The preparation command installs plugins before application startup. It is not an application launcher. Fully quit this Desktop before replacing its runtime archives. `start:desktop` verifies the bundled primary runtime and launches the official Electron application. Use `dev:desktop` when rebuilding the whole application is necessary. The first startup activates the Agent Teams profile required by Workbench. Profile composition runs under the official profile write lock.

## Verification

Run `corepack pnpm exec vitest run apps/desktop/tests/aiko-deployment.spec.ts apps/desktop/tests/project-manager.spec.ts` for brand selection, unmanaged-path rejection, recovery preservation and profile locking. The selected welcome copy has an owner-local snapshot. The existing Desktop build checks its bundled imports and TypeScript programs.

For a real local platform, run Electron with `apps/desktop/scripts/test-aiko-login.mjs`, followed by an isolated identity file, a private JSON file containing the test account's `username` and `password`, and its Electron user-data directory. Run it only while that Desktop is closed. This opt-in test performs real PKCE login, encrypted restore, relay authentication, capabilities access and logout, then leaves a separately issued session for interactive Desktop verification. It never prints credentials. This is authentication evidence, not a model-generation or installer test.

The integration decision and retained limitations are recorded in the [Agent Note](../../../.agents/notes/implemented/architecture/2026-09-30-aiko-desktop-platform-deployment.md).
