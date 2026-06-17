---
document_id: doc.memory
last_verified: 2026-06-16
tokens_estimate: 750
tags:
  - memory
  - ruvector
  - embeddings
anchors:
  - id: contract
    summary: "RuVector native (ruvector-core); embeddings ONNX-in-WASM; card-scoped first by relevance"
  - id: flow
    summary: "ingestion → store; retrieval → card/project; harvest post-build"
  - id: policy
    summary: "Units canonical when created (status=approved); retrieval ranks by relevance + scope"
  - id: embedding-workaround
    summary: "CJS copy workaround for ruvector-onnx-embeddings-wasm ESM bug"
ttl_expires_on: null
---
# Memory Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)

## Contract

### Invariants
- INVARIANT: Ingested memory units are canonical — written with `status = "approved"`; there is no separate approval step and retrieval applies no approval/rejection filter
- INVARIANT: Retrieval filters by scope (card-scoped first, then project-scoped) and ranks by semantic relevance
- INVARIANT: Card-scoped memory preferred over project-scoped for build context
- INVARIANT: MemoryStore abstracts RuVector; mock when RuVector unavailable

### Boundaries
- ALLOWED: ingest card/context; retrieve for card; harvest post-build
- FORBIDDEN: returning out-of-scope units (search restricts to card/project relations before ranking)

---

## Implementation

### Flow
```
Ingestion (ingestCardContext): card summary (title + description),
    requirements, facts, assumptions, questions, and linked context artifacts
    (planned files are NOT ingested)
  → embed via ONNX-in-WASM (all-MiniLM-L6-v2, 384-dim)
  → insert vector into RuVector (ruvector-core, native) + row into memory_unit (SQLite)
  → write memory_unit_relation rows for card / project (+ workflow/activity if provided)

Retrieval: cardId, projectId, contextSummary
  → MemoryStore.search: RuVector vector search → filter to card/project-scoped IDs
    (via memory_unit_relation) → card-scoped ranked first
  → getContentByIds fetches content from SQLite
  → return content strings for build/swarm context

Harvest: Post-build
  → extract learnings → ingestMemoryUnit (status "approved") + RuVector
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/memory/ingestion.ts` | Ingest card context for build |
| `lib/memory/retrieval.ts` | retrieveForCard |
| `lib/memory/harvest.ts` | Post-build learning extraction |
| `lib/memory/store.ts` | MemoryStore interface; real/mock |
| `lib/memory/embedding.ts` | Embedding via ruvector-onnx-embeddings-wasm |
| `lib/ruvector/client.ts` | RuVector vector DB client (ruvector-core) |

### Tables
- memory_unit: id, content_type, mime_type, title, content_text, link_url, status, embedding_ref, updated_at
- memory_unit_relation: memory_unit_id, entity_type (card | project | workflow | activity), entity_id, relation_role — scope is expressed here, not via columns on memory_unit

### Retrieval Policy
1. Vector search over RuVector, then restrict to units related to this card or project
2. Card-scoped units ranked ahead of project-scoped units
3. Order within a scope follows semantic relevance; no approval/rejection filter (all stored units are status "approved")

### Embedding: CJS Workaround
- `ruvector-onnx-embeddings-wasm` has upstream bug: declares `"type":"module"` but WASM JS glue uses CJS globals (`__dirname`, `require`, `module.exports`)
- **Fix** (`embedding.ts` → `loadWasmModuleCjs()`): copies `.js` to `.cjs`, loads via `createRequire` so Node treats it as CJS, passes pre-loaded module to `createEmbedder(model, wasmModule)`
- Singleton uses promise pattern (`_loadPromise`) so concurrent callers share one download
- Model: `all-MiniLM-L6-v2` (384-dim, ~23MB, downloaded from HuggingFace on first use)
- FORBIDDEN: Removing the CJS workaround without verifying the upstream package is fixed

---

## Where to see stored data

To verify that memory is actually being stored:

1. **API (project-scoped)**  
   `GET /api/projects/[projectId]/memory`  
   Returns `count`, `units` (id, title, content_type, status, content_preview, link_url), and `storage` paths for SQLite and RuVector. Use any project ID after at least one card has been finalized (ingest) or one build has completed (harvest).

2. **SQLite (raw)**  
   Default path: `~/.dossier/dossier.db` (or `DOSSIER_DATA_DIR/dossier.db`).  
   ```bash
   sqlite3 ~/.dossier/dossier.db "SELECT id, title, status, substr(content_text,1,120) FROM memory_unit ORDER BY updated_at DESC LIMIT 20;"
   ```
   Relations (which unit belongs to which card/project):
   ```bash
   sqlite3 ~/.dossier/dossier.db "SELECT * FROM memory_unit_relation LIMIT 20;"
   ```

3. **RuVector (vectors)**  
   Default path: `~/.dossier/ruvector/vectors.db` (or `DOSSIER_DATA_DIR/ruvector/vectors.db`).  
   This file is the HNSW index; content is in SQLite. Vector count (if supported by ruvector-core): use the app’s memory API or SQLite `memory_unit` row count.

---

## Verification
- [x] Retrieval restricts results to card/project-scoped units (via memory_unit_relation)
- [x] Mock store used when RuVector unavailable
- [x] Harvest writes new MemoryUnit with embedding_ref
- [x] Real semantic embeddings load in Vitest (not hash fallback)

## Related
- [orchestration-reference.md](orchestration-reference.md)
- [Memory System Improvements](../Feature%20Plans/memory-system-improvements.md) — 8 proposed improvements (GNN learning, observability, decay, graph queries, model upgrade, SONA, attention, cross-project)
