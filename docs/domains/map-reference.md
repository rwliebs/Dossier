---
document_id: doc.map
last_verified: 2026-06-01
tokens_estimate: 650
tags:
  - map
  - snapshot
  - story-map
anchors:
  - id: contract
    summary: "Map = Project + Workflow→Activity→Card tree; PlanningState in memory"
  - id: build
    summary: "GET /map performs batched queries and returns nested API response"
  - id: queries
    summary: "getWorkflowsByProject, getActivitiesByProject, getCardsByProject"
ttl_expires_on: null
---
# Map Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Map structure: Project → Workflow[] → WorkflowActivity[] → Card[]
- INVARIANT: Cards belong directly to a workflow activity through `workflow_activity_id`
- INVARIANT: PlanningState uses Map<string, Entity> for O(1) lookup during validation

### Boundaries
- ALLOWED: `fetchMapSnapshot` for planning/validation state; `GET /map` batched queries for UI JSON
- FORBIDDEN: Reintroducing step-scoped cards or bypassing PlanningState for action validation

---

## Implementation

### Data Shape
- **PlanningState**: In-memory; used by validate-action, apply-action, chat
- **Map API response**: Nested tree for UI; `workflows[].activities[].cards`

### Build Flow
```
GET /api/projects/[id]/map
  → getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject
  → group activities by workflow_id and cards by workflow_activity_id
  → sort workflows/activities by position; sort cards by priority
  → return Workflow → Activity → Card JSON
```

`fetchMapSnapshot()` remains the source for planning prompts and action validation. It creates `PlanningState` Maps for workflows, activities, cards, context artifacts, card links, requirements, and planned files.

### Key Files
| File | Purpose |
|------|---------|
| `lib/db/map-snapshot.ts` | fetchMapSnapshot for planning and validation state |
| `lib/schemas/planning-state.ts` | PlanningState interface, createEmptyPlanningState |
| `lib/db/queries.ts` | getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject |
| `app/api/projects/[id]/map/route.ts` | Map endpoint |

### Tree Structure
- Workflows ordered by position
- Activities ordered by position within workflow
- Cards belong directly to activities and are ordered by priority

---

## Verification
- [ ] Map snapshot matches DB state after actions applied
- [ ] `GET /map` returns Workflow → Activity → Card with no `steps` node
- [ ] PlanningState sufficient for validate-action refs

## Related
- [mutation-reference.md](mutation-reference.md)
- [planning-reference.md](planning-reference.md)
