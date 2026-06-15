---
document_id: doc.planning
last_verified: 2026-06-15
tokens_estimate: 900
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
    summary: "Chat → Agent SDK or CLI fallback → stream-action-parser → actions"
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
| populate | Workflows exist, activities/cards sparse | createActivity, createCard |
| full | Map has structure | All action types; refinements, links, planned files |
| finalize | Map fully planned; user triggers | createContextArtifact (project docs + card e2e tests) |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message → POST /chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  → claude-client.ts
      → credential found: Agent SDK query() via planning-sdk-runner.ts
      → no credential + Claude CLI available: claude -p fallback
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → POST /actions (validate + apply)
```

Credentialed planning always uses `@anthropic-ai/claude-agent-sdk` `query()`.
Tool availability is based on repository context:
- Repo connected (`cwd` provided): `Read`, `Glob`, `Grep`, `WebSearch`
- No repo context: `WebSearch`
- CLI fallback has no managed read tools; it receives the system prompt and user message via stdin.

### Per-Card Finalize Flow
```
User opens finalize panel → GET /cards/[cardId]/finalize
  → Assemble: project-wide docs + linked card context + requirements + planned files
  → Return finalization package for review

User clicks "Finalize" on card → POST /cards/[cardId]/finalize
  → Validate project.finalized_at
  → Validate card has at least one requirement
  → Validate card has at least one planned file/folder
  → Link project-wide docs to the card
  → Generate e2e test artifact via LLM when planning LLM is enabled
  → Set card.finalized_at → card is build-ready
  → Stream SSE events: finalize_progress, action, error, done
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning LLM routing: Agent SDK for credentials; Claude CLI fallback |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` wrapper and read-only planning tool policy |
| `lib/llm/planning-credential.ts` | Resolves ANTHROPIC_API_KEY from env or ~/.dossier/config |
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
