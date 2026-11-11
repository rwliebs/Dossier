# Strategy: Cross-Platform Install & First-Run (Windows Focus)

## Context

A real Windows user installed the npm package and eventually succeeded — but only with significant manual intervention. The five issues below are ordered by severity (first = most likely to cause abandonment).

## Status

- **P0 fixes shipped:** `open` npm package for browser auto-open, README Windows prerequisites
- **P1 native addon:** `better-sqlite3` postinstall is left as-is — no prebuild bundling
- **P2 sql.js fallback:** deferred unless real-world breakage recurs

## Issue Analysis

### 1. better-sqlite3 native addon fails on Windows

**Current state:**
- `bin/postinstall.mjs` runs `npm install better-sqlite3 --no-save` in `.next/standalone/`
- This triggers `node-gyp` compilation, which requires Visual Studio Build Tools + C++ workload
- `better-sqlite3` uses `prebuild-install` to fetch prebuilt binaries from GitHub releases — this works reliably when invoked via a normal `npm install`
- The README now documents Visual Studio Build Tools as a Windows prerequisite

**Decision:** We are _not_ shipping custom prebuild scripts or bundling `.node` binaries in the npm tarball. The reasons:
1. `prebuild-install` already handles fetching prebuilds for standard installs
2. Custom prebuild bundling adds significant maintenance burden across Node ABI versions and platforms
3. The README now documents the prerequisite, which unblocks the majority of users
4. If this continues to be a friction point, the correct fix is migrating to `libsql` (API-compatible with `better-sqlite3`, ships platform binaries via npm `optionalDependencies` — zero compilation needed)

### 2. .next/standalone ships without compiled binary

Same root cause as #1. `scripts/postbuild.mjs` skips `better-sqlite3` because platform-specific binaries can't be cross-bundled. The postinstall handles installing them fresh. If the existing `prebuild-install` mechanism works (and it does for standard Node.js installations with network access), this is not an issue.

### 3. `spawn('start', [url])` breaks on Windows Command Prompt — FIXED

Replaced with the `open` npm package in both `bin/dossier.mjs` and `app/api/dev/restart-and-open/route.ts`. Cross-platform, battle-tested, no shell assumptions.

### 4. README missing Windows prerequisites — FIXED

Added Windows callout with Visual Studio Build Tools instructions and a one-liner PowerShell command.

### 5. sql.js (WASM) fallback — DEFERRED

Not needed if `better-sqlite3`'s existing `prebuild-install` works. Only revisit if:
- Multiple users report install failures despite following README prerequisites
- We need to support platforms without prebuilt binaries (ARM Linux, etc.)

If needed, `libsql` is a better path than sql.js — it's a synchronous API-compatible drop-in for `better-sqlite3` with proper cross-platform binary distribution.

## Future: libsql migration (if needed)

If `better-sqlite3` installation continues to cause friction:
- `libsql` is a fork of SQLite with an API compatible with `better-sqlite3`
- Ships platform-specific prebuilt binaries via npm `optionalDependencies` (e.g., `@libsql/win32-x64-msvc`)
- Zero compilation required on any platform
- Drop-in replacement for our `sqlite-adapter.ts` usage (`all`, `exec`, `get`, `pragma`, `prepare`, `run`)
- Estimated effort: ~1 hour for the swap
