---
document_id: doc.configuration
last_verified: 2026-04-13
tokens_estimate: 600
tags:
  - configuration
  - env
  - config
anchors:
  - id: precedence
    summary: "process.env > .env.local > ~/.dossier/config"
  - id: required
    summary: "ANTHROPIC_API_KEY, GITHUB_TOKEN"
  - id: optional
    summary: "DB_DRIVER, DOSSIER_DATA_DIR, feature flags"
ttl_expires_on: null
---
# Configuration Reference

**Anchors**: [development-reference.md](../development-reference.md)

## Contract

- INVARIANT: Config precedence: `process.env` > `.env.local` > `~/.dossier/config`
- INVARIANT: Self-deploy uses `~/.dossier/config`; dev uses `.env.local`
- Anthropic credential: we accept **API key** first (env, then `~/.dossier/config`). If none is set, we use your **installed Claude CLI** config: `~/.claude/settings.json` (or `CLAUDE_CONFIG_DIR`/settings.json). We read `env.ANTHROPIC_API_KEY` or `env.ANTHROPIC_AUTH_TOKEN` from that file so you don’t need to paste a key if Claude Code is already configured.

---

## Required

Anthropic credential (API key or Claude CLI config) and GitHub token:

| Variable | Purpose |
|----------|---------|
| ANTHROPIC_API_KEY | Planning LLM and build (set in env or `~/.dossier/config`; or we use your Claude CLI `~/.claude/settings.json` when no key is set) |
| GITHUB_TOKEN | Push branches, list/create repos, HTTPS git; classic PAT from [tokens](https://github.com/settings/tokens) (`repo` scope), or written by **Connect GitHub** OAuth into `~/.dossier/config` |

### GitHub OAuth (local / desktop)

| Variable | Purpose |
|----------|---------|
| GITHUB_OAUTH_CLIENT_ID | OAuth App client ID for authorization code + PKCE ([new OAuth App](https://github.com/settings/applications/new)). Callback: `http://127.0.0.1:<port>/api/github/oauth/callback` — loopback allows a runtime port that differs from the one registered. |
| GITHUB_OAUTH_CLIENT_SECRET | Optional; include in `.env.local` / server env if your token exchange requires it. Do not ship in public client builds. |
| NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID | Optional; same ID as above for in-app links (e.g. GitHub “authorized applications” revoke URL). |
| DOSSIER_GITHUB_IGNORE_ENV | Written by the app (not hand-set): when `1`/`true`/`yes`, `GITHUB_TOKEN` in **environment** is ignored and only `~/.dossier/config` `GITHUB_TOKEN` is used—so **Disconnect** works even if `.env.local` still defines `GITHUB_TOKEN`. Cleared on Connect / PAT save. |

---

## Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| DB_DRIVER | sqlite | `sqlite` (implemented) or `postgres` (currently not implemented) |
| DATABASE_URL | — | Required only if testing future Postgres adapter paths |
| DOSSIER_DATA_DIR | ~/.dossier | Data directory |
| SQLITE_PATH | ~/.dossier/dossier.db | Override SQLite path |
| EMBEDDING_MODEL | all-MiniLM-L6-v2 | RuVector embedding model |
| PLANNING_LLM_MODEL | claude-haiku-4-5-20251001 | Planning LLM model |
| DOSSIER_STALE_RUN_MINUTES | 0 | Minutes before marking stuck runs as failed. 0 = disabled (no timeout). |

Current implementation note:
- `DB_DRIVER=postgres` will throw at startup (`lib/db/index.ts`): "Postgres adapter not yet implemented."
- Use SQLite for local and production-like runs until a Postgres adapter is shipped.

---

## Feature Flags (NEXT_PUBLIC_*)

| Variable | Default | Purpose |
|----------|---------|---------|
| NEXT_PUBLIC_PLANNING_LLM_ENABLED | true | Planning chat |
| NEXT_PUBLIC_BUILD_ORCHESTRATOR_ENABLED | true | Build triggers |
| NEXT_PUBLIC_MEMORY_PLANE_ENABLED | true | Memory ingestion/retrieval |

---

## Test-Only

| Variable | Purpose |
|----------|---------|
| PLANNING_MOCK_ALLOWED | 1 = mock LLM in planning tests |

---

## Config File Format

`~/.dossier/config` or `.env.local`:

```
KEY=value
KEY="value with spaces"
# comments ignored
```

---

## Verification
- [ ] Required vars set before running
- [ ] /setup writes to ~/.dossier/config

## Related
- [.env.example](../../.env.example)
- [lib/config/data-dir.ts](../../lib/config/data-dir.ts)
