---
document_id: doc.planning
last_verified: 2026-06-16
tokens_estimate: 750
tags:
  - planning
  - llm
  - chat
anchors:
  - id: contract
    summary: "Planning LLM converts ideas to PlanningAction[]; never code-gen"
  - id: modes
    summary: "Scaffold, populate, full; mode selected by map state"
  - id: flow
    summary: "Chat → Claude → stream-action-parser → actions"
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
- ALLOWED (per-card finalize only): createContextArtifact with type 'test' containing e2e test code
- FORBIDDEN: Generating implementation/production code; triggering builds; writing to GitHub; creating real files

---

## Implementation

### Modes
| Mode | When | Output |
|------|------|--------|
| scaffold | Map empty or no workflows | updateProject + createWorkflow only |
| populate | Workflows exist, activities/cards sparse | createActivity, createCard |
| full | Map has structure | All action types; refinements, links, planned files |
| finalize | Map fully planned; user triggers | createContextArtifact (six project-wide docs; see Project Finalize Flow) |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message → POST /chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt()
  → Agent SDK query() (credentialed) or `claude` CLI subprocess (fallback)
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → applied in-process via pipelineApply() (validate + apply); no HTTP round-trip to /actions
```

### Project Finalize Flow
```
User clicks "Finalize Project" → POST /chat (or /chat/stream) with mode: "finalize"
  → runFinalizeMultiStep()
  → Promise.all over FINALIZE_DOC_SPECS (six docs, generated in parallel):
      architectural-summary, data-contracts, domain-summaries,
      user-workflow-summaries, design-system, project-scaffold
  → each via buildFinalizeDocSystemPrompt(spec) → createContextArtifact
  → parse arch summary for root folders; write scaffold files to clone (if repo connected)
  → set project.finalized_at
```
Note: the project finalize step does NOT generate per-card e2e tests; those are generated at per-card finalize (below).

### Per-Card Finalize Flow
```
User clicks "Finalize"/"Approve" on card → POST /cards/[cardId]/finalize (SSE)
  Preconditions (400 if unmet): project.finalized_at set; card not already finalized;
    >= 1 requirement; >= 1 planned file or folder (status not checked)
  → Step 1: link project-wide context docs to the card
  → Step 2: generate one e2e test artifact for the card via LLM (best-effort)
  → Step 3: set card.finalized_at → card is build-ready
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning LLM client; routes credentialed users to Agent SDK, others to `claude` CLI |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` runner (`runPlanningQuery`, `streamPlanningQuery`); default model `claude-haiku-4-5-20251001` |
| `lib/llm/run-finalize-multistep.ts` | Parallel project finalize (one LLM call per `FINALIZE_DOC_SPECS` entry) |
| `lib/llm/planning-credential.ts` | Resolves ANTHROPIC_API_KEY / OAuth token from env or ~/.dossier/config |
| `app/api/projects/[id]/chat/route.ts` | Non-streaming chat |
| `app/api/projects/[id]/chat/stream/route.ts` | Streaming chat (scaffold, populate, finalize) |
| `app/api/projects/[id]/cards/[cardId]/finalize/route.ts` | Per-card finalize endpoint |

### Response Types
- `clarification`: Questions only; `actions: []`
- `actions`: PlanningAction[]; optional message
- `mixed`: Both message and partial actions

---

## Verification
- [ ] No action proposes code generation (validate-action rejects)
- [ ] Prompt instructs LLM to use existing IDs from context
- [ ] User actions follow-up after populate (agent prompts for View Details, Build, etc.)

## Related
- [mutation-reference.md](mutation-reference.md)
