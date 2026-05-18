---
document_id: doc.planning
last_verified: 2026-05-18
tokens_estimate: 950
tags:
  - planning
  - llm
  - chat
anchors:
  - id: contract
    summary: "Planning LLM converts ideas to PlanningAction[]; never code-gen"
  - id: modes
    summary: "Scaffold, populate, full, finalize; mode selected by map state"
  - id: flow
    summary: "Chat → Agent SDK or CLI → stream-action-parser → actions"
ttl_expires_on: null
---
# Planning Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Planning LLM outputs PlanningAction[] only; never production code or file contents
- INVARIANT: Code-generation intents rejected; respond with clarification redirect
- INVARIANT: IDs in actions must exist in current map state; new entities get fresh UUIDs

### Boundaries
- ALLOWED: createWorkflow, createActivity, createCard, updateCard, linkContextArtifact, upsertCardPlannedFile, createContextArtifact, etc.
- ALLOWED (finalize mode only): createContextArtifact with type 'test' containing e2e test code
- FORBIDDEN: Generating implementation/production code; triggering builds; writing to GitHub; creating real files

---

## Implementation

### Modes
| Mode | When | Output |
|------|------|--------|
| scaffold | Map empty or no workflows | updateProject + createWorkflow only |
| populate | Workflows exist, activities/cards sparse | createActivity, createStep, createCard |
| full | Map has structure | All action types; refinements, links, planned files |
| finalize | Map fully planned; user triggers | createContextArtifact (project docs + card e2e tests) |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message → POST /api/projects/[projectId]/chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  → resolvePlanningCredential()
  → if credential exists: planning-sdk-runner query()
     - WebSearch always
     - Read, Glob, Grep only when repo cwd is available
  → else if Claude CLI is authenticated: claude -p --output-format stream-json
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → POST /api/projects/[projectId]/actions (validate + apply)
```

### Per-Card Finalize Flow
```
GET /api/projects/[projectId]/cards/[cardId]/finalize
  → Assemble review package: project docs + card artifacts + requirements + planned files

User clicks "Finalize" on card → POST /api/projects/[projectId]/cards/[cardId]/finalize
  → SSE finalize_progress: link project docs to card
  → SSE action: createContextArtifact for generated e2e/context artifacts
  → SSE finalize_progress: set card.finalized_at and ingest memory when enabled
  → SSE phase_complete: card_finalize_complete
  → SSE done
```

Constraints enforced before POST streaming starts:
- Card must belong to the project and not already be finalized.
- Project must be finalized first.
- Card must have at least one requirement and one planned file.
- `NEXT_PUBLIC_PLANNING_LLM_ENABLED=true` must enable the planning LLM.

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning auth routing; Agent SDK path with CLI subprocess fallback |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` runner; read-only planning tools |
| `lib/llm/planning-sdk-bridge.ts` | Converts SDK result text into planning response shape |
| `lib/llm/planning-credential.ts` | Resolves env/config/Claude CLI credentials for planning |
| `lib/llm/run-llm-substep.ts` | Finalize sub-step runner that filters generated actions |
| `app/api/projects/[id]/chat/route.ts` | Non-streaming chat |
| `app/api/projects/[id]/chat/stream/route.ts` | Streaming chat (scaffold, populate, finalize) |
| `app/api/projects/[id]/cards/[cardId]/finalize/route.ts` | GET review package and POST SSE card finalization |

### Response Types
- `clarification`: Questions only; `actions: []`
- `actions`: PlanningAction[]; optional message
- `mixed`: Both message and partial actions

---

## Verification
- [ ] No action proposes code generation (validate-action rejects)
- [ ] Prompt instructs LLM to use existing IDs from context
- [ ] User actions follow-up after populate (agent prompts for View Details, Build, etc.)
- [ ] Finalize docs match GET package plus POST SSE behavior; no separate confirm route

## Related
- [mutation-reference.md](mutation-reference.md)
