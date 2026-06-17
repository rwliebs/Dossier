---
document_id: doc.development
last_verified: 2026-06-16
tokens_estimate: 700
tags:
  - development
  - setup
  - workflow
anchors:
  - id: setup
    summary: "Node 20+, npm/pnpm install, /setup or config file"
  - id: scripts
    summary: "dev, build, test, dossier, rebuild"
  - id: ports
    summary: "3000 app; 3001-3010 project preview via restart-and-open"
  - id: github-connect
    summary: "OAuth PKCE + PAT fallback + disconnect behavior"
  - id: troubleshooting
    summary: "setup loops, oauth callback mismatches, preview port collisions"
ttl_expires_on: null
---
# Development Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [reference/configuration-reference.md](reference/configuration-reference.md)

## Contract

- INVARIANT: Dossier is a single Next.js app (UI + API route handlers) served on port 3000; there is no separate backend service/port
- INVARIANT: Kill and restart the dev server rather than moving to higher ports (the built-app "View on server" preview uses 3001+ for project clones)
- INVARIANT: Run tests before commit; type-check before push

---

## Setup

### Prerequisites
- Node.js 20+
- Anthropic credential (API key **or** local Claude CLI config)
- GitHub credential for repo operations (OAuth Connect GitHub or PAT with `repo` scope)

### Install

Use **pnpm** or **npm** to install dependencies (pnpm recommended if npm has auth/token issues):

```bash
pnpm install   # or: npm install
```

### Configuration
- **Development**: Copy `.env.example` to `.env.local`; minimally set `GITHUB_OAUTH_CLIENT_ID` (for OAuth) or `GITHUB_TOKEN` (PAT). Set `ANTHROPIC_API_KEY` unless Claude CLI already provides one.
- **Self-deploy**: Use `/setup` or edit `~/.dossier/config`
- Precedence: `process.env` > `.env.local` > `~/.dossier/config`

### Setup flow (`/setup`)

`/setup` checks `/api/setup/status` and redirects to `/` when both credentials are satisfied.

Anthropic is satisfied by either:
- `ANTHROPIC_API_KEY` (env/config), or
- installed Claude CLI config (`~/.claude/settings.json` / `CLAUDE_CONFIG_DIR`).

GitHub is satisfied when `resolveGitHubToken()` can resolve a token from env/config.

---

## GitHub Connect and Token Lifecycle

### Connect GitHub (OAuth PKCE)

1. UI calls `/api/github/oauth/start?return_to=...`
2. Server stores PKCE verifier + state cookies and redirects to GitHub authorize URL (`scope=repo`)
3. Callback `/api/github/oauth/callback` exchanges code for token and writes `GITHUB_TOKEN` into `~/.dossier/config`
4. User returns with `?github_oauth=success`

For local development, configure:
- `GITHUB_OAUTH_CLIENT_ID` (required)
- `GITHUB_OAUTH_CLIENT_SECRET` (optional, but commonly needed for token exchange)

Loopback callback supports dynamic local ports (for Electron/CLI paths) using:
`http://127.0.0.1:<port>/api/github/oauth/callback`

### PAT fallback

Users can provide a PAT in Setup/API Keys UI; it is written to `~/.dossier/config` as `GITHUB_TOKEN`.

### Disconnect semantics

Disconnect (`DELETE /api/github/auth`) removes stored token and writes:
- `DOSSIER_GITHUB_IGNORE_ENV=1`

This intentionally ignores `process.env.GITHUB_TOKEN` until reconnect, so “disconnect” stays effective even if `.env.local` still contains an old token.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server (port 3000) |
| `npm run build` | Production build + postbuild (standalone) |
| `npm run start` | Start production server |
| `npm run dossier` | Run standalone CLI (opens browser) |
| `npm run test` | Run Vitest suite |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |
| `npm run rebuild` | Rebuild and restart (dev) |
| `npm run rebuild:prod` | Rebuild and restart (prod) |

---

## Data Directory

Default: `~/.dossier/`

```
~/.dossier/
  config              # API keys, settings (KEY=VALUE)
  dossier.db          # SQLite database (relational state)
  ruvector/vectors.db # RuVector vector store (native ruvector-core; 384-dim embeddings)
  repos/<projectId>/  # Git clones used for builds
  logs/               # Electron main process logs
```

Override: `DOSSIER_DATA_DIR` or `SQLITE_PATH`

Inspect memory contents via:
- `GET /api/projects/<projectId>/memory`
- [domains/memory-reference.md](domains/memory-reference.md)

---

## Workflow

1. Create feature branch: `git checkout -b feature/task-name`
2. Make changes; run `npm run test` and `npm run lint`
3. Commit with descriptive message
4. Rebase on main before merge

---

## Developer Runbook

### Keep local clone in sync after PR merge

When a PR is merged outside Dossier, sync the project clone before next build:

```bash
curl -X POST "http://localhost:3000/api/projects/<projectId>/repo/sync"
```

Expected: `{ "success": true, "branch": "<default_branch>" }`

### Resume blocked orchestration runs

If a card build is blocked awaiting decisions:

```bash
curl -X POST "http://localhost:3000/api/projects/<projectId>/orchestration/resume-blocked" \
  -H "Content-Type: application/json" \
  -d '{"card_id":"<cardId>","actor":"user"}'
```

Expected: `202` with `assignmentId`, `runId`, and `outcome_type`.

### View built project in a separate dev server

Use `/api/dev/restart-and-open` to start a cloned project server on ports `3001..3010` without touching the main Dossier app on `3000`.

Common responses:
- `200` started successfully
- `409` clone missing (build at least once first)
- `503` no free preview port in range
- `404` route disabled (hosted runtime / missing enable flag)

On standalone/Electron/CLI production builds, set `DOSSIER_ALLOW_PROJECT_DEV_SERVER=1` to allow this route.

---

## Troubleshooting

### Setup keeps redirecting back to `/setup`

Check:
- `GET /api/setup/status` `missingKeys`
- `~/.dossier/config` file permissions and values
- whether `DOSSIER_GITHUB_IGNORE_ENV=1` is still set after a deliberate disconnect

### GitHub OAuth callback fails

Typical causes:
- missing `GITHUB_OAUTH_CLIENT_ID`
- callback mismatch in OAuth app settings
- stale/expired state cookies (retry Connect GitHub)
- user cancelled consent (`github_error=access_denied`)

### Preview server does not open

Check:
- project clone exists under `~/.dossier/repos/<projectId>`
- free port exists in `3001..3010`
- runtime allows route (`NODE_ENV=development` or `DOSSIER_ALLOW_PROJECT_DEV_SERVER=1`, and not hosted cloud detection)

## Verification
- [ ] `npm run dev` starts on 3000
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds

## Related
- [testing-reference.md](testing-reference.md)
- [reference/configuration-reference.md](reference/configuration-reference.md)
- [README.md](../README.md)
