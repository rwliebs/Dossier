---
document_id: doc.data-contracts
last_verified: 2026-06-01
tokens_estimate: 1800
tags:
  - schemas
  - types
  - api
  - contracts
anchors:
  - id: contract
    summary: "Zod schemas in lib/schemas/; slice-a/b/c + action-payloads"
  - id: core-entities
    summary: "Project, Workflow, WorkflowActivity, Card hierarchy"
  - id: card-context
    summary: "ContextArtifact, CardPlannedFile, knowledge items"
  - id: actions
    summary: "PlanningAction payloads and target_ref per action_type"
ttl_expires_on: null
---
# Data Contracts Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md#overview](../SYSTEM_ARCHITECTURE.md#overview)

## Contract

### Invariants
- INVARIANT: All domain types derive from Zod schemas in `lib/schemas/`
- INVARIANT: PlanningAction payload and target_ref validated per action_type before apply
- INVARIANT: ContextArtifact requires at least one of: content, uri, integration_ref

### Boundaries
- ALLOWED: Import types from `lib/schemas/` or `lib/types/ui.ts`
- FORBIDDEN: Ad-hoc types for domain entities; bypassing action validation

---

## Schema Slices

| Slice | File | Entities |
|-------|------|----------|
| A | `lib/schemas/slice-a.ts` | Project, Workflow, WorkflowActivity, Card, PlanningAction |
| B | `lib/schemas/slice-b.ts` | ContextArtifact, CardRequirement, CardKnownFact, CardAssumption, CardQuestion, CardPlannedFile |
| C | `lib/schemas/slice-c.ts` | OrchestrationRun, CardAssignment, RunCheck, ApprovalRequest, PullRequestCandidate |
| Actions | `lib/schemas/action-payloads.ts` | Payload + target_ref per action type |

---

## Core Entities (Slice A)

### Hierarchy
```
Project
  └── Workflow[] (position-ordered)
        └── WorkflowActivity[] (position-ordered)
              └── Card[] (activity-level)
```

### Project
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| name | string (min 1) | |
| description | string \| null | optional |
| repo_url | url \| null | optional |
| default_branch | string | default "main" |

### Workflow
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| project_id | uuid | |
| title | string (min 1) | |
| description | string \| null | optional |
| build_state | runStatus \| null | queued\|running\|blocked\|failed\|completed\|cancelled |
| position | int | |

### WorkflowActivity
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| workflow_id | uuid | |
| title | string (min 1) | |
| color | enum \| null | yellow\|blue\|purple\|green\|orange\|pink |
| position | int | |

### Card
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| workflow_activity_id | uuid | |
| title | string (min 1) | |
| description | string \| null | optional |
| status | enum | todo\|active\|questions\|review\|production |
| priority | int | |
| position | int | |
| quick_answer | string \| null | optional |
| finalized_at | datetime \| null | optional |

---

## Card Context (Slice B)

### ContextArtifact
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| project_id | uuid | |
| name | string (min 1) | |
| type | enum | doc\|design\|code\|research\|link\|image\|skill\|mcp\|cli\|api\|prompt\|spec\|runbook\|test |
| content | string \| null | at least one of content, uri, integration_ref |
| uri | string \| null | |
| integration_ref | object \| null | |
| title, locator, mime_type, checksum | various | optional |

### CardPlannedFile
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| card_id | uuid | |
| logical_file_name | string (min 1) | |
| artifact_kind | enum | component\|endpoint\|service\|schema\|hook\|util\|middleware\|job\|config |
| action | enum | create \| edit |
| intent_summary | string (min 1) | |
| contract_notes | string \| null | optional |
| status | enum | proposed\|user_edited\|approved |

### Knowledge Items (shared shape)
CardRequirement, CardKnownFact, CardAssumption, CardQuestion:
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| card_id | uuid | |
| text | string (min 1) | |
| status | enum | draft\|approved\|rejected |
| source | enum | agent\|user\|imported |
| confidence | number 0-1 \| null | optional |
| position | int (≥0) | |

---

## Planning Actions

All actions: `{ id, project_id, action_type, target_ref, payload }`

| action_type | target_ref | payload |
|-------------|------------|---------|
| updateProject | `{ project_id }` | `{ name?, description?, customer_personas?, tech_stack?, deployment?, design_inspiration? }` |
| createWorkflow | `{ project_id }` | `{ title, description?, position }` |
| createActivity | `{ workflow_id }` | `{ id?, title, color?, position? }` |
| createCard | `{ workflow_activity_id }` | `{ title, description?, status, priority, position }` |
| updateCard | `{ card_id }` | `{ title?, description?, status?, priority?, quick_answer? }` |
| reorderCard | `{ card_id }` | `{ new_position }` |
| deleteWorkflow | `{ workflow_id }` | `{}` |
| deleteActivity | `{ workflow_activity_id }` | `{}` |
| deleteCard | `{ card_id }` | `{}` |
| linkContextArtifact | `{ card_id }` | `{ context_artifact_id, linked_by?, usage_hint? }` |
| createContextArtifact | `{ project_id }` | `{ name, type, title?, content, card_id? }` |
| upsertCardPlannedFile | `{ card_id }` | `{ logical_file_name, artifact_kind, action, intent_summary, contract_notes?, position, planned_file_id? }` |
| upsertCardKnowledgeItem | `{ card_id }` | `{ item_type, text, evidence_source?, confidence?, position, knowledge_item_id? }` |

---

## Orchestration (Slice C)

### OrchestrationRun
| Field | Type | Notes |
|-------|------|-------|
| scope | workflow \| card | workflow → workflow_id required; card → card_id required |
| trigger_type | card \| workflow \| manual | |
| status | runStatus | |
| repo_url, base_branch | string | |
| system_policy_snapshot, run_input_snapshot | object | immutable |

### CardAssignment
| Field | Type | Notes |
|-------|------|-------|
| run_id, card_id | uuid | |
| feature_branch | string | |
| allowed_paths | string[] (min 1) | |
| forbidden_paths | string[] \| null | optional |

---

## Verification
- [ ] New domain types added to appropriate slice
- [ ] Action payloads validated via payloadSchemaByActionType
- [ ] UI imports from lib/types/ui.ts or lib/schemas/

## Related
- [lib/schemas/](../../lib/schemas/)
- [lib/schemas/action-payloads.ts](../../lib/schemas/action-payloads.ts)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
