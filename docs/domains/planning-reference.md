---
document_id: doc.planning
last_verified: 2026-06-01
tokens_estimate: 1050
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
    summary: "Chat → Agent SDK or Claude CLI → parser → actions"
ttl_expires_on: null
---
# Planning Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Planning LLM outputs PlanningAction[] only; never production code or file contents
- INVARIANT: Code-generation intents rejected; respond with clarification redirect
- INVARIANT: IDs in actions must exist in current map state; new entities get fresh UUIDs
- INVARIANT: Credentialed planning uses `@anthropic-ai/claude-agent-sdk` `query()`; the Messages API path is not used for planning

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
| populate | Workflows exist, activities/cards sparse | createActivity, createCard, upsertCardKnowledgeItem, upsertCardPlannedFile |
| full | Map has structure | All action types; refinements, links, planned files |
| finalize | Map fully planned; user triggers | createContextArtifact (project docs + card e2e tests) |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message → POST /chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  → claudeStreamingRequest()
      → Agent SDK query() when a credential is resolved
      → claude -p CLI fallback only when no credential is extractable and the CLI is available
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → POST /actions (validate + apply)
```

Non-streaming `POST /chat` uses the same auth routing through `claudePlanningRequest()`, then parses the final text with `parsePlanningResponse()` before validation and apply.

### Planning Auth and Tools

Planning follows [ADR 0016](../adr/0016-planning-agent-two-auth-paths.md):

| Scenario | Credential resolution | Execution path |
|----------|-----------------------|----------------|
| API key in env or `~/.dossier/config` | `resolvePlanningCredential()` returns `ANTHROPIC_API_KEY` | Agent SDK `query()` |
| API key or OAuth token in `~/.claude/settings.json` | `resolvePlanningCredential()` reads `env.ANTHROPIC_API_KEY` or `env.ANTHROPIC_AUTH_TOKEN`; OAuth tokens are exposed as `CLAUDE_CODE_OAUTH_TOKEN` | Agent SDK `query()` |
| No extractable credential, but `claude` binary is available | `isClaudeCliAvailable()` succeeds | `claude -p` subprocess fallback |

Agent SDK planning tools are read-only. `WebSearch` is always enabled. `Read`, `Glob`, and `Grep` are enabled only when a connected repository clone provides `cwd`; planning never enables write tools or Bash.

### Per-Card Finalize Flow
```
User clicks "Finalize" on card → POST /cards/[cardId]/finalize
  → Validate project finalized + card has requirements and planned files
  → Link project-wide docs to the card
  → Generate card e2e test artifact via planning sub-step
  → Set card.finalized_at and ingest card context into memory when enabled
  → Emit SSE phase_complete with card_finalize_complete
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Auth routing, Agent SDK invocation wrapper, and CLI fallback |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` runner and planning tool allowlist |
| `lib/llm/planning-sdk-bridge.ts` | Converts Agent SDK result text to the planning response contract |
| `lib/llm/run-llm-substep.ts` | Streams, parses, validates, and applies one planning sub-step |
| `lib/llm/run-populate-workflow.ts` | Two-phase populate flow: activities first, then cards/details per activity |
| `lib/llm/planning-credential.ts` | Resolves credentials from env, `~/.dossier/config`, or Claude CLI settings |
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
