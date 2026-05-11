---
document_id: doc.planning
last_verified: 2026-05-11
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
    summary: "Chat → Agent SDK/CLI → stream-action-parser → actions"
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
User message → POST /chat or /chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  → claude-client resolves auth path
  → Agent SDK query() for credentialed users, or claude -p CLI fallback
  → stream-action-parser (parse JSON blocks)
  → validatePlanningOutput()
  → pipelineApply() persists accepted PlanningAction[]
```

Planning actions are applied by the chat routes and `runLlmSubStep`; clients do not need to re-submit emitted actions to `POST /actions` for those flows.

### Runtime and Tooling

| Case | Execution path | Tools |
|------|----------------|-------|
| Credential found in env/config/Claude settings | `runPlanningQuery()` / `streamPlanningQuery()` via Agent SDK `query()` | WebSearch always; Read, Glob, Grep when a repo clone is connected as `cwd` |
| No extractable credential, Claude CLI available | `claude -p` subprocess | CLI-managed context only; no Dossier-controlled repo tools |

The planning agent is read-only with respect to source code: it may inspect a connected repo, but it cannot use Write/Edit/Bash tools, trigger builds, or write to GitHub.

### Project Finalize Flow
```
User clicks "Finalize Project" → POST /chat or /chat/stream with mode="finalize"
  → runFinalizeMultiStep() creates six required project artifacts
  → If any required artifact is missing, return/emit failure and do not set project.finalized_at
  → Parse architectural-summary for root folders and project-scaffold for root files
  → If a real repo is connected, update the base clone and push the default branch
  → Set project.finalized_at → cards may now be finalized
```

Required artifact names are `architectural-summary`, `data-contracts`, `domain-summaries`, `user-workflow-summaries`, `design-system`, and `project-scaffold`.

### Per-Card Finalize Flow
```
GET /cards/[cardId]/finalize
  → Return current package: card, project docs, linked card artifacts, requirements, planned files, finalized_at

POST /cards/[cardId]/finalize
  → Validate card belongs to project, card is not already finalized, and project.finalized_at is set
  → Require at least one requirement and at least one planned file/folder
  → Link project doc/spec/design artifacts to the card
  → Generate e2e test/context artifacts through the planning LLM
  → Set card.finalized_at and ingest card context into memory when enabled
```

There is no `/finalize/confirm` route. The POST endpoint is the approval action and returns SSE events: `finalize_progress`, `action`, `error`, `phase_complete`, and `done`.

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection; finalize artifact specs |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` runner and allowed read-only tools |
| `lib/llm/claude-client.ts` | Planning auth routing; Agent SDK path plus Claude CLI fallback |
| `lib/llm/run-llm-substep.ts` | Shared stream parse, validate, apply loop for planning sub-steps |
| `lib/llm/run-finalize-multistep.ts` | Project finalization document generation |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/planning-credential.ts` | Resolves Anthropic credentials from env, config, or Claude settings |
| `app/api/projects/[id]/chat/route.ts` | Non-streaming chat |
| `app/api/projects/[id]/chat/stream/route.ts` | Streaming chat (scaffold, populate, finalize) |
| `app/api/projects/[id]/cards/[cardId]/finalize/route.ts` | Per-card package GET and SSE approval POST |

### Response Types
- `clarification`: Questions only; `actions: []`
- `actions`: PlanningAction[]; optional message
- `mixed`: Both message and partial actions

---

## Verification
- [ ] No action proposes production code generation (validate-action rejects; finalize test artifacts are the allowed exception)
- [ ] Prompt instructs LLM to use existing IDs from context
- [ ] Credentialed planning path uses Agent SDK `query()`; CLI path only runs when no credential is available
- [ ] Card finalize POST still gates on `project.finalized_at`, requirements, and planned files

## Related
- [mutation-reference.md](mutation-reference.md)
