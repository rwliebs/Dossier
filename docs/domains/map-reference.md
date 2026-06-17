---
document_id: doc.map
last_verified: 2026-06-16
tokens_estimate: 550
tags:
  - map
  - snapshot
  - story-map
anchors:
  - id: contract
    summary: "Map = Project + Workflow→Activity→Card tree; PlanningState in memory"
  - id: build
    summary: "fetchMapSnapshot → PlanningState; buildMapTree → nested API response"
  - id: queries
    summary: "getWorkflowsByProject, getActivitiesByProject, getCardsByProject"
ttl_expires_on: null
---
# Map Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Map structure: Project → Workflow[] → WorkflowActivity[] → Card[] (the `step` table was removed in migration 005)
- INVARIANT: Cards belong to an activity (`workflow_activity_id`)
- INVARIANT: PlanningState uses Map<string, Entity> for O(1) lookup during validation

### Boundaries
- ALLOWED: fetchMapSnapshot, buildMapTree; queries via DbAdapter
- FORBIDDEN: Building map from ad-hoc queries; bypassing PlanningState shape

---

## Implementation

### Data Shape
- **PlanningState**: In-memory; used by validate-action, apply-action, chat
- **Map API response**: Nested tree for UI; `workflows[].activities[].cards`

### Build Flow
```
GET /api/projects/[id]/map
  → fetchMapSnapshot(db, projectId)
  → getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject, getArtifactsByProject, getCardContextLinksByProject
  → createEmptyPlanningState + populate Maps
  → buildMapTree(state) → nested JSON
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/db/map-snapshot.ts` | fetchMapSnapshot, buildMapTree |
| `lib/schemas/planning-state.ts` | PlanningState interface, createEmptyPlanningState |
| `lib/db/queries.ts` | getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject |
| `lib/db/queries/workflows.ts` | Workflow + activity + card tree queries |
| `app/api/projects/[id]/map/route.ts` | Map endpoint |

### Tree Structure
- Workflows ordered by position
- Activities ordered by position within workflow
- Cards ordered by position within activity

---

## Verification
- [ ] Map snapshot matches DB state after actions applied
- [ ] buildMapTree produces valid nested structure for UI
- [ ] PlanningState sufficient for validate-action refs

## Related
- [mutation-reference.md](mutation-reference.md)
- [planning-reference.md](planning-reference.md)
