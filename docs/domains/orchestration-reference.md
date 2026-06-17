---
document_id: doc.orchestration
last_verified: 2026-06-16
tokens_estimate: 950
tags:
  - orchestration
  - build
  - runs
anchors:
  - id: contract
    summary: "OrchestrationRun → CardAssignment; checks before approval; PR user-gated"
  - id: flow
    summary: "createRun → assignments → agentic-flow → auto-commit → checks; PR candidate is a DB record, PR opened/merged manually on GitHub"
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
- INVARIANT: Build agents push feature branches only; PR creation and merge happen manually on GitHub — Dossier does not call the GitHub PR API and never auto-merges to main

### Boundaries
- ALLOWED: createRun, createAssignment, execute checks, create approval request, create PR candidate
- FORBIDDEN: Auto-merge; skipping required checks; merging without user action

---

## Implementation

### Run Lifecycle
```
User trigger (card | workflow)
  → reject any card without finalized_at (decision_required)
  → ensureClone (repo to ~/.dossier/repos/<projectId>/) — one clone per run
  → createRun (validate policy, capture snapshots; worktree_root = clone path)
  → per card: createFeatureBranch `feat/run-<run8>-<card8>` (new branch each rebuild)
  → createAssignment per card (feature_branch, worktree_path, allowed_paths, forbidden_paths)
  → dispatch to agentic-flow (cwd = worktree_path)
  → agents write files, commit to feature branch
  → on completion: processWebhook() auto-commits agent output, runs checks, harvests memory
  → GET /api/projects/[id]/files?source=repo surfaces produced files with diff status
```
Both `scope=card` and `scope=workflow` are supported (a workflow build clones once and creates one branch per card).

Approval requests, the PR candidate record, and push/merge are NOT part of the automatic post-run chain. They are reached on demand:
- **Approval** (`POST /orchestration/approvals`) — guarded so it only succeeds after required checks pass.
- **PR candidate** (`POST /orchestration/pull-requests`) — inserts a `PullRequestCandidate` DB row with status `not_created`. It is NOT a GitHub PR and does not call the GitHub API.
- **Push** (`POST /cards/[cardId]/push`, surfaced as the card "Merge feature" control) — pushes the card's feature branch to `origin` and opens the repo URL in the browser. The user creates and merges the PR on GitHub.

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
| `lib/orchestration/repo-manager.ts` | ensureClone, createFeatureBranch, pushBranch, syncMainBranch; clone to ~/.dossier/repos/ |
| `lib/orchestration/repo-reader.ts` | getRepoFileTree, getChangedFiles, getFileContent, getFileDiff |
| `lib/orchestration/create-run.ts` | createRun; policy validation; snapshot capture |
| `lib/orchestration/create-assignment.ts` | CardAssignment per card |
| `lib/orchestration/trigger-build.ts` | Entry point; clones repo, creates branch, populates worktree_path |
| `lib/orchestration/dispatch.ts` | Dispatch to agentic-flow |
| `lib/orchestration/execute-checks.ts` | Run required checks |
| `lib/orchestration/approval-gates.ts` | Check pass before approval request |
| `lib/orchestration/create-approval-request.ts` | ApprovalRequest creation |
| `lib/orchestration/create-pull-request-candidate.ts` | Inserts a `PullRequestCandidate` DB row (status `not_created`); no GitHub API call |
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
