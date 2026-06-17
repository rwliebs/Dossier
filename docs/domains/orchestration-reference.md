---
document_id: doc.orchestration
last_verified: 2026-06-16
tokens_estimate: 1300
tags:
  - orchestration
  - build
  - runs
anchors:
  - id: contract
    summary: "OrchestrationRun → CardAssignment; checks before approval; PR user-gated"
  - id: flow
    summary: "triggerBuild gates → clone → run → assignments → SDK dispatch → auto-commit → checks; PR candidate is a DB record, PR opened/merged manually on GitHub"
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
  → recover stale runs when DOSSIER_STALE_RUN_MINUTES > 0
  → enforce single-build lock (no existing running run for project)
  → validate project, repo URL, cards in scope, and card finalization (reject any card without finalized_at → decision_required)
  → ensureClone (repo to ~/.dossier/repos/<projectId>/) — one clone per run
  → createRun (validate policy, capture snapshots; worktree_root = clone path)
  → per card: createFeatureBranch `feat/run-<run8>-<card8>` from baseBranch (new branch each rebuild)
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

### Pre-Trigger Gates

`triggerBuild()` returns before creating a run unless these checks pass:

1. `recoverStaleRuns()` clears timed-out `running` runs only when `DOSSIER_STALE_RUN_MINUTES` is greater than `0`.
2. No other `OrchestrationRun` for the project has `status="running"`.
3. Project exists and has a non-placeholder repository URL.
4. Scope resolves to at least one card.
5. Every card in scope has `finalized_at`; missing approval returns `outcome_type="decision_required"`.
6. Repository clone/fetch succeeds.

After the run is created, each card gets a branch named `feat/run-{runId8}-{cardId8}`. `worktree_root` on the run and `worktree_path` on assignments both point at the project clone root; this implementation does not provision per-card git worktrees.

Current assignment constraint: planned files are used as `allowed_paths`, and `createAssignment()` rejects empty `allowed_paths`. In practice, finalized cards still need at least one planned file before dispatch can start.

### Outcomes and Failure Semantics

Build routes expose `outcome_type` so the UI can distinguish normal validation failures from user decisions:

| Outcome | Meaning |
|---------|---------|
| `success` | Run and at least one assignment dispatched. |
| `decision_required` | User action is required before dispatch, currently unfinalized cards. |
| `error` | Validation, clone, branch, assignment, or dispatch failure. |

Partial card failures are possible in workflow scope. Assignment or dispatch failures are collected per card; if at least one assignment dispatches, the response includes the successful `assignmentIds` plus an error message for failed cards. If zero agents dispatch, the run is marked `failed`.

### Blocked and Stale Runs

- `POST /api/projects/[projectId]/orchestration/resume-blocked` finds a blocked assignment for a card in a running run, requeues it, and dispatches it again.
- `DOSSIER_STALE_RUN_MINUTES=0` disables stale-run recovery. When set above zero, stale running runs are marked failed and non-terminal assignments/cards are updated before the single-build lock is checked.

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
| `lib/orchestration/recover-stale-runs.ts` | Optional crash/stale-run recovery before lock check |
| `lib/orchestration/resume-blocked.ts` | Requeue and redispatch blocked card assignments |
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
- [ ] `triggerBuild()` gate order still matches this reference
- [ ] `resume-blocked` runbook matches API route and domain behavior

## Related
- [memory-reference.md](memory-reference.md)
- [api-endpoints.md](../reference/api-endpoints.md#orchestration-coordination)
- [development-reference.md](../development-reference.md#developer-runbook)
- [configuration-reference.md](../reference/configuration-reference.md#optional)
- [ADR 0013: Single-Card Build with Clone](../adr/0013-single-card-build-with-clone.md)
