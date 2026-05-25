---
document_id: doc.system-architecture
last_verified: 2026-05-25
tokens_estimate: 1150
tags:
  - architecture
  - system
  - overview
anchors:
  - id: overview
    summary: "Desktop Next.js + Electron app; SQLite, Claude Agent SDK, RuVector"
  - id: data-model
    summary: "Project → Workflow → Activity → Card; knowledge items; orchestration entities"
  - id: data-flow
    summary: "Chat -> Agent SDK/CLI -> actions -> SQLite; Build -> clone -> dispatch -> feature branch"
  - id: boundaries
    summary: "Planning LLM cannot build; build agents cannot merge; humans gate all merges"
ttl_expires_on: null
---
# System Architecture — As Built

## Contract

### Invariants
- INVARIANT: All map mutations flow through `POST /api/projects/[id]/actions`; no direct DB writes from UI
- INVARIANT: Planning LLM never generates production code or triggers builds
- INVARIANT: Build agents write to feature branches only; PR merge is user-gated
- INVARIANT: Every action batch validates schema, referential integrity, and policy before apply
- INVARIANT: Card finalization must precede build dispatch

### Boundaries
- ALLOWED: Planning LLM creates workflows, activities, cards; proposes planned files; links context artifacts
- FORBIDDEN: Planning LLM writes to GitHub, creates real files, triggers code execution
- FORBIDDEN: Build agents merge to main, skip checks, or auto-approve PRs

---

## Overview

Single-user desktop app. Next.js serves UI + API. Electron wraps it. SQLite stores all state locally. RuVector stores embeddings locally. Planning and build agents run through Anthropic via `@anthropic-ai/claude-agent-sdk`, with a Claude CLI fallback for planning when no extractable credential exists.

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Shell                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js 15 (standalone)                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │   │
│  │  │ React 19 │  │ API      │  │ Claude Agent SDK  │   │   │
│  │  │ UI       │──│ Routes   │──│ (in-process,      │   │   │
│  │  │          │  │ /api/*   │  │  streaming query)  │   │   │
│  │  └──────────┘  └────┬─────┘  └─────────┬─────────┘   │   │
│  │                     │                   │             │   │
│  │  ┌──────────────────┴───────┐   ┌──────┴──────┐      │   │
│  │  │ SQLite (better-sqlite3)  │   │ RuVector    │      │   │
│  │  │ ~/.dossier/dossier.db    │   │ (WASM,      │      │   │
│  │  │                          │   │  384-dim)   │      │   │
│  │  └──────────────────────────┘   └─────────────┘      │   │
│  └──────────────────────────────────────────────────────┘   │
│            │                                                 │
│  ┌─────────┴──────────┐                                     │
│  │ Local Git Repos    │──── push ────▶ GitHub                │
│  │ ~/.dossier/repos/  │                                      │
│  └────────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
     Anthropic API
```

| Layer | Technology | Location |
|-------|-----------|----------|
| Desktop shell | Electron + Forge | `electron/` |
| UI | React 19 + Tailwind v4 + shadcn/ui | `app/`, `components/` |
| API | Next.js App Router (route handlers) | `app/api/` |
| Database | SQLite via better-sqlite3 (local, no Supabase) | `lib/db/` |
| Planning LLM | Claude Agent SDK `query()` for credentialed users; Claude CLI fallback | `lib/llm/` |
| Build agents | `@anthropic-ai/claude-agent-sdk` `query()` (streaming, in-process) | `lib/orchestration/` |
| Agent definitions | agentic-flow registry (system prompts only) | `node_modules/agentic-flow/` |
| Embeddings | all-MiniLM-L6-v2 (ONNX WASM, local) | `lib/memory/embedding.ts` |
| Vector store | ruvector-core (native, local) | `lib/ruvector/` |
| Memory | SQLite content + RuVector vectors | `lib/memory/` |
| Schemas | Zod (slice-a, slice-b, slice-c) | `lib/schemas/` |

---

## Data Model

```
Project 1──* Workflow 1──* WorkflowActivity 1──* Card
Card 1──* CardRequirement, CardKnownFact, CardAssumption, CardQuestion, CardPlannedFile
Card *──* ContextArtifact  (via card_context_artifact)
Project 1──* ContextArtifact, PlanningAction, SystemPolicyProfile (0..1)

OrchestrationRun *──1 Project
OrchestrationRun 1──* CardAssignment 1──* AgentExecution, AgentCommit
OrchestrationRun 1──* RunCheck, ApprovalRequest, PullRequestCandidate (0..1)
Project 1──* EventLog

MemoryUnit *──* Entity (via memory_unit_relation)
```

Full schema details: [data-contracts-reference.md](domains/data-contracts-reference.md)

---

## Data Flow (Summaries)

### Planning
`User chat -> Agent SDK query() or Claude CLI fallback -> stream-action-parser -> PlanningAction[] -> validate -> apply -> SQLite`

Detail: [planning-reference.md](domains/planning-reference.md)

### Map
`GET /map → fetchMapSnapshot → PlanningState → buildMapTree → nested JSON for UI`

Detail: [map-reference.md](domains/map-reference.md)

### Mutation
`PlanningAction[] → schema + semantic + guardrail validation → per-action DB writes in transaction`

Detail: [mutation-reference.md](domains/mutation-reference.md)

### Build
`User trigger → git clone → createRun → per card: feature branch → dispatch → Claude Agent SDK query() (streaming) → agent writes + commits → auto-commit → checks → approval → PR`

Detail: [orchestration-reference.md](domains/orchestration-reference.md)

### Memory
`Card finalize → embed (all-MiniLM-L6-v2) → RuVector insert + SQLite row → Build dispatch retrieves card-scoped then project-scoped`

Detail: [memory-reference.md](domains/memory-reference.md)

---

## LLM Connection Models

Two distinct connection patterns exist.

| Concern | Planning LLM | Build Agent |
|---------|-------------|-------------|
| Auth | Credential from env, `~/.dossier/config`, or `~/.claude/settings.json`; CLI fallback only when no credential exists | `ANTHROPIC_API_KEY` |
| SDK | `@anthropic-ai/claude-agent-sdk` for credentialed users | `@anthropic-ai/claude-agent-sdk` |
| Call style | `query()` via `planning-sdk-runner.ts`; `claude -p` subprocess fallback | `query()` async iterator |
| Streaming | Streaming endpoint yields final structured result chunks; non-streaming calls return final SDK result text | Always streaming (`for await` over messages) |
| Tools | `WebSearch` always; `Read`, `Glob`, `Grep` only when a repo `cwd` is supplied | Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch |
| CWD | Optional cloned repo path for read-only planning inspection | `worktree_path` (repo clone) |
| Lifecycle | Request-response per chat/finalize step; no persisted SDK session | Fire-and-forget; result via in-process webhook callback |
| Model | `claude-haiku-4-5-20251001` (configurable; CLI fallback default is `claude-sonnet-4-6`) | `claude-sonnet-4-5-20250929` (configurable) |

---

## Key Directories

| Path | Purpose |
|------|---------|
| `app/` | Next.js pages + API route handlers |
| `components/dossier/` | Domain UI (story map, cards, chat, sidebar) |
| `components/ui/` | shadcn/ui primitives |
| `lib/actions/` | validate, apply, preview actions |
| `lib/db/` | DbAdapter, SQLite adapter, migrations |
| `lib/llm/` | Planning prompts, credential resolution, Agent SDK runner, stream parser, skills |
| `lib/orchestration/` | Build runs, assignments, dispatch, checks, approvals, PRs |
| `lib/memory/` | Ingestion, retrieval, embedding, harvest |
| `lib/ruvector/` | RuVector client (vector DB) |
| `lib/schemas/` | Zod schemas (slice-a/b/c, action-payloads) |
| `lib/hooks/` | React hooks (project, map, actions, build, knowledge) |
| `electron/` | Electron main, preload, runtime, window lifecycle |

---

## Data Directory (`~/.dossier/`)

| Path | Content |
|------|---------|
| `config` | Key=value config (API keys, overrides) |
| `dossier.db` | SQLite database (all state) |
| `repos/<projectId>/` | Git clones for build |
| `logs/` | Electron main process logs |

---

## Domain References

| Domain | Doc |
|--------|-----|
| Data contracts | [data-contracts-reference.md](domains/data-contracts-reference.md) |
| Planning | [planning-reference.md](domains/planning-reference.md) |
| Mutation | [mutation-reference.md](domains/mutation-reference.md) |
| Map | [map-reference.md](domains/map-reference.md) |
| Orchestration | [orchestration-reference.md](domains/orchestration-reference.md) |
| Memory | [memory-reference.md](domains/memory-reference.md) |
| API endpoints | [api-reference.md](domains/api-reference.md) |

---

## Verification
- [ ] DbAdapter is single seam for all persistence
- [ ] All map mutations go through actions pipeline
- [ ] Planning vs Build boundaries enforced in prompts, tool allowlists, and validation
- [ ] No Supabase, Postgres, or external DB references in source code
- [ ] Planning uses Agent SDK for credentialed users and CLI only as no-credential fallback
- [ ] Build agents use streaming SDK `query()`, not HTTP webhook from external service
