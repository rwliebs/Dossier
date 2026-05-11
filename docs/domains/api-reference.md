---
document_id: doc.api-reference
last_verified: 2026-05-11
tokens_estimate: 400
tags:
  - api
  - endpoints
anchors:
  - id: endpoints
    summary: "REST API under /api; projects, docs, chat, finalize, orchestration"
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
| Docs | `/api/docs` | Docs index and document content for the Docs panel |
| Chat | `/api/projects/[id]/chat`, `/chat/stream` | Planning LLM; scaffold, populate, project finalize |
| Card finalize | `/api/projects/[id]/cards/[cardId]/finalize` | Card finalization package and SSE approval |
| Artifacts | `/api/projects/[id]/artifacts` | Context artifacts |
| Card knowledge | `/api/projects/[id]/cards/[cardId]/{requirements,facts,assumptions,questions}` | Knowledge items |
| Planned files | `/api/projects/[id]/cards/[cardId]/planned-files` | Card planned files |
| Files | `/api/projects/[id]/files` | File tree (planned or repo); `?source=repo` for produced code |

## Related
- [data-contracts-reference.md](data-contracts-reference.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
