---
document_id: doc.mutation
last_verified: 2026-06-15
tokens_estimate: 800
tags:
  - mutation
  - actions
  - pipeline
anchors:
  - id: contract
    summary: "All map changes via PlanningAction; validate → apply in transaction"
  - id: pipeline
    summary: "validate-action → apply-action; idempotency via key"
  - id: state
    summary: "PlanningState from DB; reconstruct from actions for validation"
ttl_expires_on: null
---
# Mutation Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: All map mutations flow through `apply-action`; no direct DB writes from UI
- INVARIANT: Actions validated against PlanningState before apply; first failure rejects batch
- INVARIANT: Idempotency: same `idempotency_key` within project → skip duplicate apply

### Boundaries
- ALLOWED: validate-action, apply-action, preview-action; DbAdapter.transaction
- FORBIDDEN: Direct insert/update on workflow, activity, card, etc. outside apply-action

---

## Implementation

### Pipeline
```
PlanningAction[] → validateAction() → [errors] | []
  → applyAction(db, projectId, action) per action
  → DbAdapter.transaction(fn)
  → insert/update via adapter
```

### Validation Steps
1. **Schema**: planningActionSchema, payloadSchemaByActionType, targetRefSchemaByActionType
2. **Semantic**: workflowExists, activityExists, cardExists, contextArtifactExists
3. **Guardrails**: containsCodeGenerationIntent → reject

### Apply Flow
- Load PlanningState from DB (or reconstruct from actions)
- For each action: validate against state → mutate state → persist via adapter
- Increment project action_sequence on success

### PlanningAction Inventory

Map/planning mutations accepted by `lib/schemas/slice-a.ts` and applied by `lib/db/mutations.ts`:

| Category | Action types |
|----------|--------------|
| Project | `updateProject` |
| Map create/update | `createWorkflow`, `createActivity`, `createCard`, `updateCard`, `reorderCard` |
| Map delete | `deleteWorkflow`, `deleteActivity`, `deleteCard` |
| Context | `createContextArtifact`, `linkContextArtifact` |
| Card planning | `upsertCardPlannedFile`, `upsertCardKnowledgeItem` |

Non-actions:
- Planned-file approval uses `PATCH /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]`.
- Knowledge-item status edits use the specific requirements/facts/assumptions/questions routes.
- The Step layer is removed; no mutation path should emit `createStep` or target `step_id`.

### Key Files
| File | Purpose |
|------|---------|
| `lib/actions/validate-action.ts` | Schema + semantic + guardrail validation |
| `lib/actions/apply-action.ts` | Apply single action; delegate to persist-planning-state |
| `lib/actions/preview-action.ts` | Dry-run apply; return proposed state diff |
| `lib/actions/reconstruct-state.ts` | Build PlanningState from action history |
| `lib/db/persist-planning-state.ts` | DB writes per action type |
| `lib/db/mutations.ts` | applyAction entry point |

### Idempotency
- `planning_action.idempotency_key` unique per (project_id, key)
- Re-submit with same key → skip apply; return existing result

---

## Verification
- [ ] Batch: first invalid action stops; no partial apply
- [ ] Transaction: rollback on any apply failure
- [ ] Code-gen intent rejected with action_rejected

## Related
- [planning-reference.md](planning-reference.md)
- [map-reference.md](map-reference.md)
