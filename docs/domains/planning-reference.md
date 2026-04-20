---
document_id: doc.planning
last_verified: 2026-04-20
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
    summary: "Chat → Planning SDK/CLI → stream-action-parser → actions"
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
User message → POST /chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  → claude-client (Agent SDK query/stream for credentialed users; CLI fallback when no extractable credential)
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → POST /actions (validate + apply)
```

### Auth and execution paths
- Primary path: `runPlanningQuery()` / `streamPlanningQuery()` from `planning-sdk-runner.ts` using `@anthropic-ai/claude-agent-sdk`.
- Credential resolution order: env `ANTHROPIC_API_KEY` → `~/.dossier/config` → `~/.claude/settings.json` (`ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`).
- CLI fallback: when no extractable credential is available but `claude` CLI is installed/authenticated.
- Planning tool access depends on repo context (`cwd`), not credential type:
  - Repo connected: `Read`, `Glob`, `Grep`, `WebSearch`
  - No repo connected: `WebSearch` only

### Per-Card Finalize Flow
```
User clicks "Finalize" on card → POST /cards/[cardId]/finalize
  → Assemble: project-wide docs + card context + e2e tests
  → Return finalization package for review
  → User edits (optional)
  → POST /cards/[cardId]/finalize/confirm
  → Set card.finalized_at → card is build-ready
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning client orchestrator (SDK primary path + CLI fallback) |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` / streaming execution and planning tool policy |
| `lib/llm/planning-credential.ts` | Resolves planning credential from env/config/Claude CLI settings |
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
- [ ] Planning credential routing stays two-path (Agent SDK or CLI fallback); no Messages API routing in planning

## Related
- [mutation-reference.md](mutation-reference.md)
