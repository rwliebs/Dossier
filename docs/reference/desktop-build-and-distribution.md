# Desktop build and distribution

How Dossier builds desktop installers, creates GitHub Releases for auto-update, and publishes tagged package releases to npm.

## Artifact formats

| Platform | Format | Current CI signing state |
|----------|--------|--------------------------|
| Windows | `Dossier Setup X.Y.Z.exe` (+ `.nupkg`, `RELEASES`) | Signed only when Windows certificate secrets are set |
| Linux | `Dossier_X.Y.Z_arch.deb` | Unsigned `.deb` |
| macOS | `Dossier-X.Y.Z-arm64.dmg` (or x64) | Currently unsigned and not notarized in CI |

Version `X.Y.Z` comes from `package.json` `version`.

## Auto-update

The app uses [update.electronjs.org](https://update.electronjs.org) when packaged: `electron/main.ts` calls `updateElectronApp({ repo: "rwliebs/Dossier" })`.

- **macOS / Windows:** Packaged apps check GitHub Releases for newer versions.
- **Linux:** `.deb` installs do not use the same auto-update feed; users upgrade via re-download or package manager.
- **Release trigger:** Push a `v*` tag, for example `v0.5.7`. The tag should match `package.json` `version` without the `v` prefix.

## Desktop installer CI

Workflow: `.github/workflows/desktop-build.yml` (`Desktop installers`).

### Triggers

- `workflow_dispatch`: manual build; uploads artifacts only.
- `push` tags matching `v*`: builds artifacts, then creates a GitHub Release with all installer files attached.

### Build matrix

| Runner | Artifact name prefix | Maker output |
|--------|----------------------|--------------|
| `ubuntu-latest` | `dossier-linux` | `.deb` |
| `windows-latest` | `dossier-windows` | Squirrel `.exe`, `.nupkg`, `RELEASES` |
| `macos-latest` | `dossier-macos` | `.dmg` |

### Toolchain

- `pnpm/action-setup@v4` with pnpm `10`.
- `actions/setup-node@v6` with Node `22` and `cache: pnpm`.
- Linux installs `fakeroot` for the deb maker.
- All platforms run `pnpm install --frozen-lockfile`, then `pnpm run electron:make`.
- `pnpm run electron:make` runs: build Next.js, prepare bundled Node, compile Electron TypeScript, then `electron-forge make`.

### Release job

- Runs only for `push` events whose ref starts with `refs/tags/v`.
- Downloads `dossier-windows-<version>`, `dossier-linux-<version>`, and `dossier-macos-<version>` artifacts.
- Uses `softprops/action-gh-release@v2` to create `Dossier <version>` with generated release notes and all installer artifacts.

## Signing and notarization

### Windows

Windows signing is active only when both repository secrets exist:

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE_PFX_BASE64` | Base64-encoded `.pfx` / `.p12` signing certificate |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the PFX |

The workflow decodes the certificate to `cert.pfx` on the Windows runner. `forge.config.js` adds Squirrel `certificateFile: "cert.pfx"` and `certificatePassword` only when both Windows signing environment variables are present. If either secret is missing, CI still builds an unsigned Windows installer.

### macOS

macOS signing and notarization are currently disabled in CI and Forge config:

- Apple signing/notarization environment variables are commented out in `.github/workflows/desktop-build.yml`.
- Apple API key preparation is commented out in `.github/workflows/desktop-build.yml`.
- `osxSign` and `osxNotarize` are commented out in `forge.config.js`.

Result: CI macOS `.dmg` artifacts are unsigned and not notarized, even if Apple secrets exist in the repository.

## npm package publishing

Workflow: `.github/workflows/publish.yml` (`Publish to npm`).

- Trigger: `push` tags matching `v*`.
- Auth: npm Trusted Publisher / OIDC; workflow permissions include `id-token: write` and `contents: read`.
- Toolchain: pnpm `10`, Node `22`, pnpm cache, npm registry URL set to `https://registry.npmjs.org`.
- npm CLI: installs `npm@latest` because Trusted Publishing requires npm `11.5.1+` and Node `22.14+`.
- Build: `pnpm install --frozen-lockfile`, then `pnpm run build`.
- Publish: `npm publish --no-git-checks` to the default `latest` tag.

## Dependabot

`.github/dependabot.yml` checks weekly for:

- npm dependency updates at `/`.
- GitHub Actions updates at `/`.

## Building locally

Electron Forge produces installers for the current OS only; use CI to build all three platforms from one tag or manual run.

- **macOS:** `pnpm run electron:make` -> `.dmg`; currently unsigned/not-notarized unless Forge signing config is re-enabled.
- **Windows:** `pnpm run electron:make` -> Squirrel installer artifacts; signing follows the same `forge.config.js` Windows certificate env checks.
- **Linux:** `pnpm run electron:make` -> `.deb`.

## Configuration touchpoints

- **Version:** `package.json` `version`; keep it aligned with `v*` tags.
- **Desktop scripts:** `package.json` `electron:make`, `electron:package`, `electron:publish`.
- **Makers / publishers:** `forge.config.js` defines DMG, Squirrel, deb, and GitHub publisher settings.
- **Auto-update repo:** `electron/main.ts` sets `updateElectronApp({ repo: "rwliebs/Dossier" })`.

## Troubleshooting / common pitfalls

- **macOS Gatekeeper warnings:** Expected for CI artifacts until `osxSign`, `osxNotarize`, and workflow Apple env/key preparation are uncommented and configured.
- **Unsigned Windows installer:** Confirm both Windows certificate secrets are present. The workflow only creates `cert.pfx` when `WINDOWS_CERTIFICATE_PFX_BASE64` is non-empty.
- **No GitHub Release on manual build:** Expected. Manual runs upload artifacts but the release job only runs on `v*` tag pushes.
- **Release artifacts missing:** Ensure all three matrix builds completed and artifact names match the tag version from `refs/tags/v<version>`.
- **npm publish auth failure:** Confirm the npm package has this repository/workflow registered as a Trusted Publisher and the run is on a `v*` tag.
- **npm Trusted Publisher version failure:** The workflow installs `npm@latest`; failures can indicate the resolved Node/npm versions do not satisfy npm `11.5.1+` and Node `22.14+`.

## See also

- [ADR 0014: Releases and distribution](../adr/0014-releases-and-distribution.md)
- [Electron Forge: Code signing (macOS)](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Electron Forge: Auto update](https://www.electronforge.io/advanced/auto-update)
- [update.electronjs.org](https://update.electronjs.org)
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers)
