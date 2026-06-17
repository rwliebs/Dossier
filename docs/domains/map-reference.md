---
document_id: doc.map
last_verified: 2026-06-15
tokens_estimate: 650
tags:
  - map
  - snapshot
  - story-map
anchors:
  - id: contract
    summary: "Map = Project + Workflow→Activity→Card tree; PlanningState in memory"
  - id: build
    summary: "GET /map batches project/workflow/activity/card queries into nested API response"
  - id: queries
    summary: "getWorkflowsByProject, getActivitiesByProject, getCardsByProject"
ttl_expires_on: null
---
# Map Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Map structure: Project → Workflow[] → WorkflowActivity[] → Card[]
- INVARIANT: Cards belong directly to a workflow activity via `workflow_activity_id`
- INVARIANT: PlanningState uses Map<string, Entity> for O(1) lookup during validation

### Boundaries
- ALLOWED: `fetchMapSnapshot` for planning state; map route response assembly via DbAdapter queries
- FORBIDDEN: Building map from ad-hoc queries; bypassing PlanningState shape

---

## Implementation

### Data Shape
- **PlanningState**: In-memory; used by validate-action, apply-action, chat
- **Map API response**: Nested tree for UI; `workflows[].activities[].cards`

### Build Flow
```
GET /api/projects/[id]/map
  → getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject
  → group activities by workflow_id
  → group cards by workflow_activity_id
  → nested JSON: project + workflows[].activities[].cards

Chat/planning endpoints use:
  → fetchMapSnapshot(db, projectId)
  → getProject, workflows, activities, cards, artifacts, card context links, requirements, planned files
  → createEmptyPlanningState + populate Maps
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/db/map-snapshot.ts` | fetchMapSnapshot for PlanningState used by chat/planning |
| `lib/schemas/planning-state.ts` | PlanningState interface, createEmptyPlanningState |
| `lib/db/queries.ts` | getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject |
| `app/api/projects/[id]/map/route.ts` | UI map endpoint; assembles nested workflow/activity/card response |

### Tree Structure
- Workflows ordered by position
- Activities ordered by position within workflow
- Cards ordered by priority within activity in the map response
- The Step layer was removed; do not introduce `step_id` in new map contracts

---

## Verification
- [ ] Map snapshot matches DB state after actions applied
- [ ] `GET /api/projects/[id]/map` returns workflows with activities and cards only
- [ ] PlanningState sufficient for validate-action refs

## Related
- [mutation-reference.md](mutation-reference.md)
- [planning-reference.md](planning-reference.md)
