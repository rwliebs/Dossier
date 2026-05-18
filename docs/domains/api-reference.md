---
document_id: doc.api-reference
last_verified: 2026-05-18
tokens_estimate: 500
tags:
  - api
  - endpoints
anchors:
  - id: endpoints
    summary: "REST API under /api; projects, docs, setup, orchestration"
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
| Setup & GitHub | `/api/setup`, `/api/github/*` | Local credentials and GitHub OAuth/PAT flows |
| Docs | `/api/docs` | Docs panel index and doc content under `docs/` |
| Map | `/api/projects/[id]/map` | Canonical map snapshot |
| Actions | `/api/projects/[id]/actions` | Submit planning actions |
| Chat | `/api/projects/[id]/chat`, `/chat/stream` | Planning LLM |
| Artifacts | `/api/projects/[id]/artifacts` | Context artifacts |
| Card knowledge | `/api/projects/[id]/cards/[cardId]/{requirements,facts,assumptions,questions}` | Knowledge items |
| Planned files | `/api/projects/[id]/cards/[cardId]/planned-files` | Card planned files |
| Files | `/api/projects/[id]/files` | File tree (planned or repo); `?source=repo` for produced code |
| Orchestration | `/api/projects/[id]/orchestration/*` | Build trigger, resume, approvals, PR candidates |
| Developer utilities | `/api/dev/restart-and-open` | Local-only project preview server |

## Related
- [data-contracts-reference.md](data-contracts-reference.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
