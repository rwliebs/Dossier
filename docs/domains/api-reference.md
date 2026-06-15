---
document_id: doc.api-reference
last_verified: 2026-06-15
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
| Setup | `/api/setup`, `/api/setup/status` | Local credential setup status and config writes |
| GitHub | `/api/github/*` | OAuth, token disconnect, user/repo lookup, repo creation |
| Map | `/api/projects/[id]/map` | Canonical Workflow → Activity → Card snapshot |
| Actions | `/api/projects/[id]/actions` | Submit planning actions |
| Chat | `/api/projects/[id]/chat`, `/chat/stream` | Planning LLM |
| Artifacts | `/api/projects/[id]/artifacts` | Context artifacts |
| Card finalize | `/api/projects/[id]/cards/[cardId]/finalize` | Card finalization package and SSE finalization |
| Card knowledge | `/api/projects/[id]/cards/[cardId]/{requirements,facts,assumptions,questions}` | Knowledge items |
| Planned files | `/api/projects/[id]/cards/[cardId]/planned-files` | Card planned files |
| Card context links | `/api/projects/[id]/cards/[cardId]/context-artifacts` | Context artifacts linked to a card |
| Card outputs | `/api/projects/[id]/cards/[cardId]/produced-files`, `/push` | Changed files and feature-branch push |
| Files | `/api/projects/[id]/files` | File tree (planned or repo); `?source=repo` for produced code |
| Repository sync | `/api/projects/[id]/repo/sync` | Align local clone default branch with GitHub |
| Memory | `/api/projects/[id]/memory` | Project memory units and local storage paths |
| Orchestration | `/api/projects/[id]/orchestration/*` | Build runs, assignments, checks, approvals, PR candidates |

## Related
- [data-contracts-reference.md](data-contracts-reference.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
