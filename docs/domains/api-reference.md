---
document_id: doc.api-reference
last_verified: 2026-06-01
tokens_estimate: 550
tags:
  - api
  - endpoints
anchors:
  - id: endpoints
    summary: "REST API under /api/projects; map, actions, artifacts, cards"
ttl_expires_on: null
---
# API Reference

**Full reference**: [api-endpoints.md](../reference/api-endpoints.md)

## Contract

- INVARIANT: All routes under `/api`; project-scoped routes use `[projectId]`
- INVARIANT: Errors return JSON `{ error, message, details? }`

## Endpoint Groups

| Group | Base Path | Purpose |
|-------|-----------|---------|
| Projects | `/api/projects` | CRUD projects |
| Map | `/api/projects/[id]/map` | Canonical map snapshot |
| Actions | `/api/projects/[id]/actions` | Submit planning actions |
| Chat | `/api/projects/[id]/chat`, `/api/projects/[id]/chat/stream` | Planning LLM, scaffold/populate/finalize modes |
| Artifacts | `/api/projects/[id]/artifacts` | Context artifacts |
| Card knowledge/context | `/api/projects/[id]/cards/[cardId]/{requirements,facts,assumptions,questions,context-artifacts}` | Knowledge items and linked context |
| Card finalize | `/api/projects/[id]/cards/[cardId]/finalize` | Per-card package, approval SSE, and test artifact generation |
| Planned files | `/api/projects/[id]/cards/[cardId]/planned-files` | Card planned files |
| Produced files / push | `/api/projects/[id]/cards/[cardId]/{produced-files,push}` | Completed build file summary and feature-branch push |
| Files | `/api/projects/[id]/files` | File tree (planned or repo); `?source=repo` for produced code |
| Setup | `/api/setup`, `/api/setup/status` | Credential gating and local config writes |
| GitHub | `/api/github/*` | OAuth, user, repository list/create, disconnect |
| Repository sync | `/api/projects/[id]/repo/sync` | Reset local clone default branch to origin |
| Orchestration | `/api/projects/[id]/orchestration/*` | Build trigger, blocked resume, approvals, PR candidates |
| Developer utilities | `/api/dev/restart-and-open` | Local project dev server launcher; disabled on hosted runtimes |

## Related
- [data-contracts-reference.md](data-contracts-reference.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
