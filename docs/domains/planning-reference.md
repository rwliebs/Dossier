---
document_id: doc.planning
last_verified: 2026-05-25
tokens_estimate: 1100
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
    summary: "Chat -> Agent SDK/CLI -> stream-action-parser -> actions"
  - id: auth-and-tools
    summary: "Credentialed users use Agent SDK; CLI fallback only when no credential exists"
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
- ALLOWED: read-only repo inspection through Agent SDK Read/Glob/Grep when a connected repo has been cloned
- FORBIDDEN: Generating implementation/production code; triggering builds; writing to GitHub; creating real files

---

## Implementation

### Modes
| Mode | When | Output |
|------|------|--------|
| scaffold | Map empty or no workflows | updateProject + createWorkflow only |
| populate | Workflows exist, activities/cards sparse | createActivity, createStep, createCard |
| full | Map has structure | All action types; refinements, links, planned files |
| finalize | Map fully planned; user approves project | createContextArtifact project docs and scaffold spec |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message -> POST /chat/stream
  -> buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  -> credentialed: Agent SDK query() (streaming or final result)
     OR no credential + Claude CLI installed: claude -p subprocess
  -> stream-action-parser (parse JSON blocks)
  -> PlanningAction[] emitted
  -> POST /actions (validate + apply)
```

### Auth and Tooling

Planning has two execution paths, as accepted in [ADR 0016](../adr/0016-planning-agent-two-auth-paths.md):

| Scenario | Credential source | Execution path | Tool availability |
|----------|-------------------|----------------|-------------------|
| API key or OAuth token exists | `ANTHROPIC_API_KEY` from env, `~/.dossier/config`, or `~/.claude/settings.json`; OAuth tokens from Claude settings set `ANTHROPIC_AUTH_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN` | `@anthropic-ai/claude-agent-sdk` `query()` via `planning-sdk-runner.ts` | `WebSearch` always; `Read`, `Glob`, `Grep` when `cwd` is set |
| No extractable credential, Claude CLI installed | `resolvePlanningCredential()` returns null and `isClaudeCliAvailable()` succeeds | `claude -p` subprocess via `claude-client.ts` | CLI-managed behavior; no controlled repo tool allowlist |

`isLikelyApiKey()` is no longer a planning router. It remains exported for tests, but all credentialed users take the Agent SDK path.

### Repo-Aware Planning

When a project has a non-placeholder `repo_url`, `chat/stream` clones or reuses `~/.dossier/repos/<projectId>/`, reads lightweight repo context, and passes the clone path as `cwd` into the planning SDK call. That enables read-only `Read`, `Glob`, and `Grep` tools for scaffold/populate planning without allowing Bash, Write, or Edit.

If no repo is connected, planning still runs with `WebSearch` so the agent can research product and technology patterns without local code access.

### Project Finalize Flow

```
User approves project -> POST /chat/stream with mode=finalize
  -> runFinalizeMultiStep()
  -> FINALIZE_DOC_SPECS creates 6 project artifacts in parallel
     architectural-summary, data-contracts, domain-summaries,
     user-workflow-summaries, design-system, project-scaffold
  -> optional repo side effects for connected repos:
     create root folders, write scaffold files, push default branch
  -> set project.finalized_at
```

Project finalize is separate from card approval. It creates project-level context and, after the LLM has emitted context artifacts, the route may write generated scaffold files into the local clone and push the configured default branch when a real repo is connected.

### Per-Card Finalize Flow
```
User clicks "Finalize" on card -> POST /cards/[cardId]/finalize
  -> Validate project.finalized_at, card requirements, and planned files
  -> Link project-wide docs to the card
  -> Generate e2e test context artifact via LLM
  -> Set card.finalized_at -> card is build-ready
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning auth router; Agent SDK path plus CLI fallback |
| `lib/llm/planning-credential.ts` | Resolves planning credential from env, ~/.dossier/config, or Claude settings |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK `query()` runner and read-only planning tool allowlist |
| `lib/llm/planning-sdk-bridge.ts` | Converts SDK result text into planning response shape |
| `lib/llm/run-finalize-multistep.ts` | Parallel project finalize document generation |
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
