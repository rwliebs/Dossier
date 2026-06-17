# Desktop build and distribution

How Dossier currently produces desktop installers (Windows `.exe`, Linux `.deb`, macOS `.dmg`) and publishes them for update checks.

## Artifact formats

| Platform | Format | Use |
|----------|--------|-----|
| Windows | `Dossier Setup X.Y.Z.exe` (+ `.nupkg`, `RELEASES`) | Direct download, Squirrel auto-update |
| Linux | `Dossier_X.Y.Z_arch.deb` | Direct download, .deb-based stores |
| macOS | `Dossier-X.Y.Z-arm64.dmg` (or x64) | Direct download, notarized for Gatekeeper |

Version `X.Y.Z` comes from `package.json` `version`.

## Current behavior (as implemented)

The source of truth is:

- `.github/workflows/desktop-build.yml`
- `package.json` (`electron:make`)
- `forge.config.js`
- `electron/main.ts` (`updateElectronApp`)

### What CI does today

- Builds installers on three runners (`ubuntu-latest`, `windows-latest`, `macos-latest`).
- Uses `pnpm install --frozen-lockfile`.
- Runs `pnpm run electron:make`, which runs:
  1. `pnpm run build`
  2. `pnpm run electron:prepare-node`
  3. `pnpm run electron:compile`
  4. `electron-forge make`
- Uploads each runner's `out/make/` as an artifact.
- Creates a GitHub Release only for `v*` tag pushes.

### Signing/notarization status

Signing and notarization are currently **disabled by default** in source:

- CI signing env and prep steps are commented out in `.github/workflows/desktop-build.yml`.
- Forge signing/notarization options are commented out in `forge.config.js`.

Result: default CI outputs are unsigned installers unless signing is explicitly re-enabled in code.

## Auto-update

The app uses [update.electronjs.org](https://update.electronjs.org) (free for open-source apps on GitHub). When you create a **GitHub Release** with the built installers:

- **macOS / Windows:** The app checks for updates at startup and periodically; users get a prompt to restart when a new version is available.
- **Linux:** .deb installs do not use the same auto-update feed; users upgrade via re-download or package manager.

**To enable auto-update:** Push a version tag (e.g. `v0.5.3`) so the workflow runs. The **release** job creates a GitHub Release and attaches the Windows, Linux, and macOS artifacts. Ensure `package.json` `version` matches the tag (e.g. `0.5.3` for tag `v0.5.3`).

## Signing and notarization (prepared, currently disabled)

The workflow and Forge config include commented templates for signing/notarization. If you decide to enable them, use the following secrets and uncomment the corresponding blocks in:

- `.github/workflows/desktop-build.yml`
- `forge.config.js`

### macOS (code sign + notarization)

Choose **one** of these two methods.

**Option A – App-specific password (simplest)**

| Secret | Description |
|--------|-------------|
| `APPLE_ID` | Apple ID email (Developer account) |
| `APPLE_APP_SPECIFIC_PASSWORD` | [App-specific password](https://support.apple.com/en-us/HT204397) (not your normal Apple ID password) |
| `APPLE_TEAM_ID` | Team ID from [developer.apple.com/account](https://developer.apple.com/account/#/membership) |

**Option B – App Store Connect API key**

| Secret | Description |
|--------|-------------|
| `APPLE_API_KEY_ID` | 10-character Key ID (e.g. from `AuthKey_XXXXXXXXXX.p8`) |
| `APPLE_API_ISSUER` | Issuer UUID from App Store Connect → Users and Access → Integrations → API Keys |
| `APPLE_API_KEY_BASE64` | Base64-encoded contents of your `.p8` key file (download from App Store Connect; only available once) |

The template workflow decodes this to a temporary file and sets `APPLE_API_KEY_PATH` before the build. Do not commit the `.p8` file.

### Windows (Squirrel code signing)

Windows signing is **active**. Set the following repository secrets and the CI build will sign the installer automatically. When the secrets are absent, an unsigned installer is produced (acceptable for development and testing).

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE_PFX_BASE64` | Base64-encoded `.pfx` (or `.p12`) code signing certificate |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the PFX |

The template workflow decodes the base64 to `cert.pfx` on the Windows runner before building. Do not commit `cert.pfx`; it is in `.gitignore`.

## Building on demand (CI)

The **Desktop installers** workflow builds all three platforms and (on tag push) creates a GitHub Release.

1. **Trigger**
   - **Manual:** Actions → **Desktop installers** → **Run workflow**. Uses the version in `package.json` on the chosen branch. Artifacts are uploaded; no release is created.
   - **Release (auto-update):** Bump `version` in `package.json`, commit, push, then push a tag `v*` (e.g. `v0.5.3`). The workflow builds, uploads artifacts, and the **release** job creates a GitHub Release with all installers attached.

2. **Download**
   - Open the run → **Summary** → **Artifacts**.
   - Download `dossier-windows-<version>`, `dossier-linux-<version>`, `dossier-macos-<version>`.
   - For tagged runs, the same files are attached to the GitHub Release.

3. **Use for distribution**
   - Attach installer files from artifacts/release to your website or release process.
   - If you need signed/notarized builds, enable signing in workflow + Forge first (see section above).

## Building locally

Electron Forge only produces installers for the **current OS** (no cross-compilation).

- **macOS:** `pnpm run electron:make` → `out/make/*.dmg`.
- **Windows:** Same command on Windows → `out/make/*.exe` (+ Squirrel artifacts).
- **Linux:** Same command on Linux → `out/make/*.deb`.

By default, local outputs are unsigned because signing/notarization config is commented out in `forge.config.js`.

To get all three platforms from one place, use the CI workflow.

## Troubleshooting and common pitfalls

### Linux `.deb` maker fails on CI

Symptom: Debian packaging step fails on Ubuntu runners.

Cause: `fakeroot` missing.

Current fix in workflow: Ubuntu job installs `fakeroot` before `electron:make`.

### Windows build exits with heap/OOM errors

Symptom: `electron:make` fails on Windows runner with memory-related errors.

Cause: Windows builds may require higher Node heap. Also, setting `NODE_OPTIONS` via `GITHUB_ENV` is blocked by GitHub Actions.

Current fix in workflow: set `NODE_OPTIONS=--max-old-space-size=4096` only on the **Build desktop installers** step for Windows.

### Tag pushed but release artifacts mismatch

Symptom: release job cannot find artifacts (download step fails).

Cause: release job expects artifacts named with the version extracted from `refs/tags/v*`. If the tag/version flow is inconsistent, names can diverge.

Check:

- `package.json` version matches tag (`0.5.2` -> `v0.5.2`)
- build artifacts exist:
  - `dossier-windows-<version>`
  - `dossier-linux-<version>`
  - `dossier-macos-<version>`

## Configuration

- **Version:** Set in root `package.json` → `version`. Must match the release tag (e.g. `0.5.3` for `v0.5.3`) for auto-update and clear artifact naming.
- **Makers / publishers:** Defined in `forge.config.js` (DMG, Squirrel, deb; GitHub publisher for releases). To add more makers (e.g. Linux AppImage), add the Forge maker and any required tools in CI.
- **Repo for auto-update:** In `electron/main.ts`, `updateElectronApp({ repo: "rwliebs/Dossier" })`. Change if the repo owner/name changes.

## See also

- [ADR 0014: Releases and distribution](../adr/0014-releases-and-distribution.md)
- [Electron Forge: Code signing (macOS)](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Electron Forge: Auto update](https://www.electronforge.io/advanced/auto-update)
- [update.electronjs.org](https://update.electronjs.org)
