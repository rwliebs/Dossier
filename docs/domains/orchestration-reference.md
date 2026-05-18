---
document_id: doc.orchestration
last_verified: 2026-05-18
tokens_estimate: 1000
tags:
  - orchestration
  - build
  - runs
anchors:
  - id: contract
    summary: "OrchestrationRun → CardAssignment; checks before approval; PR user-gated"
  - id: flow
    summary: "createRun → assignments → Agent SDK → checks → approval → PR"
  - id: policy
    summary: "SystemPolicyProfile: required_checks, protected_paths, forbidden_paths"
ttl_expires_on: null
---
# Orchestration Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: OrchestrationRun has immutable system_policy_snapshot and run_input_snapshot
- INVARIANT: Approval requested only after required checks pass
- INVARIANT: PR creation and merge remain user-gated; no auto-merge to main

### Boundaries
- ALLOWED: createRun, createAssignment, execute checks, create approval request, create PR candidate
- FORBIDDEN: Auto-merge; skipping required checks; merging without user action

---

## Implementation

### Run Lifecycle
```
User trigger (card | workflow)
  → ensureClone (repo to ~/.dossier/repos/<projectId>/) — single-card only for MVP
  → createRun (validate policy, capture snapshots; worktree_root = clone path)
  → createFeatureBranch per card
  → createAssignment per card (feature_branch, worktree_path, allowed_paths, forbidden_paths)
  → dispatch to in-process Claude Agent SDK (cwd = worktree_path)
  → agents write files, commit to feature branch
  → GET /api/projects/[id]/files?source=repo surfaces produced files with diff status
  → execute checks (dependency, security, policy, lint, unit, integration, e2e)
  → approval gates: request approval only if checks pass
  → createPullRequestCandidate (draft)
  → user reviews, approves merge
```

### Scope Rules
- `scope=workflow` → workflow_id required, card_id null
- `scope=card` → card_id required

### Dispatch → Agent Connection

Build agents run **in-process** via `@anthropic-ai/claude-agent-sdk` `query()`. There is no external agentic-flow HTTP service or webhook-based connection.

```
dispatch.ts → createAgenticFlowClient() → SDK query()
  → async iterator (streaming): for await (const msg of result)
  → agent uses tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch
  → agent commits to feature branch (cwd = worktree_path)
  → execution completes → in-process callback to processWebhook()
```

- **Agent definitions**: loaded from agentic-flow's `getAgent("coder")` (system prompt only)
- **Execution**: SDK `query()` with `permissionMode: "bypassPermissions"`, `persistSession: false`
- **Model**: `claude-sonnet-4-5-20250929` (configurable via `COMPLETION_MODEL`)
- **Retry**: 2 retries with exponential backoff
- **Lifecycle**: fire-and-forget async; tracked in in-memory `executionRegistry`; result posted via `processWebhook()` internally

### Key Files
| File | Purpose |
|------|---------|
| `lib/orchestration/repo-manager.ts` | ensureClone, createFeatureBranch; clone to ~/.dossier/repos/ |
| `lib/orchestration/repo-reader.ts` | getRepoFileTree, getChangedFiles, getFileContent, getFileDiff |
| `lib/orchestration/create-run.ts` | createRun; policy validation; snapshot capture |
| `lib/orchestration/create-assignment.ts` | CardAssignment per card |
| `lib/orchestration/trigger-build.ts` | Entry point; clones repo, creates branch, populates worktree_path |
| `lib/orchestration/dispatch.ts` | Build assignment payload and dispatch to execution client |
| `lib/orchestration/agentic-flow-client.ts` | Direct Agent SDK `query()` execution using agentic-flow prompts |
| `lib/orchestration/execute-checks.ts` | Run required checks |
| `lib/orchestration/approval-gates.ts` | Check pass before approval request |
| `lib/orchestration/create-approval-request.ts` | ApprovalRequest creation |
| `lib/orchestration/create-pull-request-candidate.ts` | Draft PR creation |
| `lib/orchestration/run-validation.ts` | validateRunInputAgainstPolicy |

### Policy Profile
- required_checks: runCheckType[]
- protected_paths, forbidden_paths
- dependency_policy, security_policy, architecture_policy, approval_policy

---

## Verification
- [ ] Run input validated against active policy before create
- [ ] Assignment snapshots immutable
- [ ] No approval request without required checks completed

## Related
- [memory-reference.md](memory-reference.md)
