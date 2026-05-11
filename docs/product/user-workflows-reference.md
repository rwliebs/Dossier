---
document_id: doc.user-workflows
last_verified: 2026-05-11
tokens_estimate: 1200
tags:
  - ux
  - workflows
  - user-journey
anchors:
  - id: new-software
    summary: "New software: idea → workflows → build → review → push → iterate"
  - id: existing-software
    summary: "Existing software: add repo → map → change → review → merge"
  - id: github-integration-now
    summary: "GitHub: push from Dossier, PR/merge on GitHub, local clone vs map (SQLite)"
ttl_expires_on: null
---
# User Workflows Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md#overview](../SYSTEM_ARCHITECTURE.md#overview)

## Contract

### Invariants
- INVARIANT: Map structure is Workflow → Activity → Step → Card; all mutations via PlanningAction
- INVARIANT: Build cannot trigger without finalized cards; card finalization requires at least one requirement and at least one planned file or folder. For new builds, the agent may propose folder paths (e.g. components/auth/) where files should go.
- INVARIANT: Project must be finalized before cards can be finalized
- INVARIANT: Build cannot trigger without card.finalized_at set (card finalization confirmed)
- INVARIANT: Knowledge items (requirements, facts, assumptions, questions) are used when they exist; no approval step

### Boundaries
- ALLOWED: User edits map, approves planned files, triggers builds, approves PRs
- FORBIDDEN: Auto-merge to main; approval request before required checks pass

---

## GitHub integration: what works today

This section is the **current suggested workflow** for the approve → build → push → merge loop with GitHub. It matches [ADR 0011: Push and Merge Flow](../adr/0011-push-and-merge-flow.md) and the live UI (card **Merge** runs push, then opens the repo in a new tab).

### End-to-end loop (recommended)

| Step | Where | What happens |
|------|--------|----------------|
| 1 | Dossier | Approve project, connect or create a GitHub repo, finalize cards, run **Build** — agents work on a **feature branch** per card in the local clone (`~/.dossier/repos/<projectId>/`). |
| 2 | Dossier | When the build is ready to share, use the card’s **Merge** control (or equivalent push). That **pushes the feature branch** to `origin` using your configured GitHub token (Connect GitHub or `GITHUB_TOKEN`). |
| 3 | GitHub (browser) | **Create the pull request** yourself. Dossier does not create PRs via the GitHub API yet. |
| 4 | GitHub (browser) | **Review and merge** the PR into your default branch (usually `main`). |
| 5 | Dossier (optional) | Use **Sync with GitHub** in the sidebar if you want the **local clone’s default branch** to match the remote after merges. This updates **git state on disk** for the next fetch/checkout during builds. |
| 6 | Dossier | The **map** (workflows, activities, cards, planned files) lives in **SQLite**; merging on GitHub does **not** automatically change the map. That separation is intentional at this stage: the product record and the repo evolve on different timelines. |

### What “Sync with GitHub” does and does not do

- **Does**: `git fetch` and reset the local default branch (from project settings, default `main`) to `origin/<that branch>` when that remote ref exists — so the next **build** starts from an up-to-date base on disk.
- **Does not**: Re-import or rewrite the story map from the repository; refresh planned-file rows from `main`; or create PRs.

### Known gaps and sharp edges (March 2026)

- **Upstream / downstream with coders**: GitHub is the system of record for merged code; Dossier is the system of record for intent and structure. Today you bridge them by pushing branches from Dossier and merging on GitHub — not by expecting the map to mirror `main` after every merge.
- **Default branch name**: If the linked repo uses `master` (or another name) but the project is still set to `main`, sync and some git operations may not match what you expect. Align the project’s default branch with the repo when needed.
- **PR automation**: Opening the repo after push is supported; **opening or merging PRs from Dossier** is not implemented yet (`PullRequestCandidate` in the DB is not wired to the GitHub API).

Contributors improving this flow should treat the above as **success criteria** for future work: clearer post-merge UX, optional map/repo reconciliation, and/or GitHub API PR helpers — without changing the human gate on merge until product intent says otherwise.

---

## New Software

Workflows for building software from scratch in Dossier.

### 1. Turning a Brand New Idea into Workflows and Finalizing Project-Level Details

**User intent**: Turn a product idea into a visual, editable story map and lock in project-level context.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Submits idea via chat |
| 2 | Planning LLM | May ask follow-up questions in chat (target users, core problem, key goals) before generating the map |
| 3 | User | Responds to questions; provides additional context as needed |
| 4 | Planning LLM | Produces workflows (backbone structure) via scaffold |
| 5 | User | Sees map on canvas; edits, reorders, refines |
| 6 | User | Clicks **Finalize Project** when ready |
| 7 | System | Creates and links remote repo (user creates via Connect Repository or links existing) |
| 8 | Planning LLM (finalize mode) | Produces required project artifacts: architectural summary, data contracts, domain summaries, workflow summaries, design system, and project scaffold |
| 9 | System | Persists via PlanningAction; refresh retains state |

**Success outcomes**:
- Workflows created (backbone); activities and cards added in Workflow 2
- Remote repo created and linked at finalization
- Project-level context artifacts and runnable scaffold files created
- User can refresh and see persisted state

**Data flow**: `User chat → POST /chat/stream → Agent SDK/CLI → stream-action-parser → validatePlanningOutput → pipelineApply → DbAdapter`; repo connection via Connect Repository, with scaffold/root writes during project finalization when a real repo is connected

---

### 2. Adding User Actions and Functionality Ideas to Workflows

**User intent**: Define what users can do per workflow and per card; add functionality ideas.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent | Defines a first pass of user actions per workflow and per card (e.g. View Details & Edit, Monitor, Reply, Test, Build) |
| 2 | User | Reviews and edits the proposed actions via chat or map — before functionality cards are planned |
| 3 | Planning LLM | Plans functionality cards from the finalized actions; links context artifacts |
| 4 | User | Links context artifacts as needed; refines further |

**Success outcomes**:
- User actions and functionality ideas captured in workflows and cards
- Context linked via CardContextArtifact where relevant

**Data flow**: `linkContextArtifact`, `createCard`, `updateCard` actions

---

### 3. Adding/Editing Functionality Details and Triggering a Build

**User intent**: Specify requirements, planned files, and other details per card; finalize and build.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent | Proposes requirements, planned files, knowledge items; user can add or edit any directly |
| 2 | User | Reviews and edits agent-proposed planned files or folders per card (at least one is required; agent may propose folder paths for new builds) |
| 3 | User | Clicks **Finalize** on each card (validates requirements and planned files/folders; generates e2e test/context artifacts; sets finalized_at) |
| 4 | User | Clicks **Build** on a card (or Build All for workflow) |
| 5 | System | Validates: card has finalized_at; rejects with toast if not |
| 6 | System | Clones repo, creates feature branch per card build, runs agents, executes checks |
| 7 | System | Auto-commits agent-produced files; Files tab shows produced code |

**Build button states** (per card):
- **Build** — Ready; click to trigger
- **Queued...** — Build submitted, waiting to start
- **Building...** — Agent actively executing
- **Blocked — answer questions** — Agent paused; answer card questions to unblock

**Success outcomes**:
- Card finalized; build triggered
- Feature branch created per card build
- Agent writes files to worktree; auto-commit makes them visible in Files tab
- Required checks run before approval requested

**Data flow**: `ensureClone → OrchestrationRun → CardAssignment[] → agentic-flow (cwd=clone) → auto-commit → GET /files?source=repo`

---

### 4. Reviewing the Product, Asking for Changes, and Accepting Results

**User intent**: Review produced code, test on local server, request changes via agent, trigger a new build cycle.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Reviews code in **Files** tab (Repository mode) with diff indicators (added/modified/deleted) |
| 2 | User | Clicks a frontend file; system shows HTML preview on local server — or clicks a non-UI file; system shows terminal view |
| 3 | User | Optionally runs full app locally (clone path in ~/.dossier/repos/&lt;projectId&gt;/) to verify behavior |
| 4 | User | Prompts agent via chat with change requests (e.g. "make the button blue", "add validation") |
| 5 | Planning LLM | Updates requirements, knowledge items, or planned files; may create new cards |
| 6 | User | Re-finalizes affected cards if needed; triggers new build |
| 7 | User | Accepts the result when satisfied |

**Success outcomes**:
- User can inspect produced files and diffs
- Clicking a frontend file shows HTML preview on local server; clicking a non-UI file shows terminal view
- User can iterate via chat and trigger rebuilds
- User accepts result in-app; push and merge happen in Workflow 5

**Data flow**: `GET /files?source=repo` (tree, content, diff) → chat → PlanningAction[] → trigger build

---

### 5. Pushing the Software Live

**User intent**: Push built software to the remote repo (created at project finalization) and publish.

| Step | Actor | Action |
|------|-------|--------|
| 1 | System | Repo already exists from project finalization (user created or linked at that step) |
| 2 | User | From a completed card, use **Merge** (or push flow): branch is pushed to `origin`; browser opens the repo URL so you can **open a PR on GitHub** (PR creation is manual; see [GitHub integration: what works today](#github-integration-what-works-today)) |
| 3 | User | Creates PR on GitHub, reviews, and merges; canonical code is now on the default branch remotely |

**Success outcomes**:
- Repo created at finalization; builds clone and work in that repo
- Feature branches reach GitHub via push; merge happens on GitHub under user control

**Data flow**: `POST .../cards/[cardId]/push` → `git push` → user creates PR and merges on GitHub → optional sidebar **Sync with GitHub** updates local clone for later builds

---

### 6. Adding User Feedback and Iterating

**User intent**: Incorporate new feedback as context and trigger a rebuild.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Adds feedback via chat (e.g. "users want a dark mode toggle", "the form should validate email"); can target a specific card |
| 2 | System | Adds user feedback to the specified card as context; Planning LLM creates/updates requirements, knowledge items, or cards |
| 3 | User | Reviews changes; re-finalizes cards if needed |
| 4 | User | Triggers rebuild |
| 5 | Agent | Executes with updated context; produces new code |
| 6 | User | Reviews, accepts, or iterates again |

**Success outcomes**:
- System can add user feedback to a specific card as context
- Feedback captured as card requirements, knowledge items, or linked artifacts
- Rebuild uses updated context; iteration loop continues

**Data flow**: `chat → upsertCardRequirement` / `upsertCardKnowledgeItem` / `linkContextArtifact` → trigger build

---

## Existing Software

Workflows for evolving software that already exists (codebase in a repo).

### 1. Adding an Existing Repo and Mapping the Product

**User intent**: Connect an existing codebase and have the agent map it to a story map.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Creates project; clicks **Connect Repository**; links existing GitHub repo (Link existing → select from list) |
| 2 | System | Dossier pulls down a copy from remote to create the local directory (~/.dossier/repos/&lt;projectId&gt;/) |
| 3 | User | Optionally selects files for context (e.g. key modules, README); describes the product or asks agent to map from the repo |
| 4 | Agent | Examines the repo; produces workflows, activities, cards that reflect existing functionality |
| 5 | System | Persists map; repo files available as context for future changes |

**Success outcomes**:
- Repo linked; local copy pulled from remote
- Map reflects existing product structure (agent examines repo to create map)

**Data flow**: `linkRepo` → `ensureClone` (pull from remote) → chat (agent examines repo) → PlanningAction[]

---

### 2. Making Changes to Existing Functionality

**User intent**: Represent desired changes through a card that describes the new state.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Describes the change via chat (e.g. "refactor the login to use OAuth", "add pagination to the list") |
| 2 | Planning LLM | Creates or updates a card with requirements and planned files that represent the new state |
| 3 | User | Reviews card; adds/edits requirements, links relevant existing files as context |
| 4 | User | Finalizes card; triggers build |
| 5 | Agent | Edits existing files per card scope; produces changes |

**Success outcomes**:
- Card captures "before → after" intent
- Build modifies existing files in place

**Data flow**: `chat → createCard` / `updateCard` → `linkContextArtifact` (existing files) → finalize → trigger build

---

### 3. Adding Functionality to an Existing Workflow

**User intent**: Add new workflows, activities, or cards amidst the existing map.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Describes new functionality via chat (e.g. "add a workflow for exporting data", "add a card for bulk delete under Manage Items") |
| 2 | Planning LLM | Creates workflows, activities, steps, or cards in the appropriate place |
| 3 | User | Edits map (reorder, refine); links context artifacts |
| 4 | User | Finalizes new cards; triggers build |
| 5 | Agent | Implements new functionality; may create new files or extend existing ones |

**Success outcomes**:
- New structure integrated into existing map
- Build adds or extends code without breaking existing flows

**Data flow**: `chat → createWorkflow` / `createActivity` / `createCard` → PlanningAction[] → finalize → trigger build

---

### 4. Reviewing Changes and Iterating

**User intent**: Review agent-produced changes, request edits via chat, accept the result — same flow as New Software Workflow 4.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Reviews code in **Files** tab (Repository mode) with diff indicators (added/modified/deleted) |
| 2 | User | Clicks a frontend file; system shows HTML preview on local server — or clicks a non-UI file; system shows terminal view |
| 3 | User | Optionally runs full app locally to verify behavior |
| 4 | User | Prompts agent via chat with change requests |
| 5 | Planning LLM | Updates requirements, knowledge items, or planned files; may create new cards |
| 6 | User | Re-finalizes affected cards if needed; triggers new build |
| 7 | User | Accepts the result when satisfied |

**Success outcomes**:
- Same review/iterate flow as New Software Workflow 4
- User accepts result in-app; push and merge happen in Workflow 5

**Data flow**: `GET /files?source=repo` (tree, content, diff) → chat → PlanningAction[] → trigger build

---

### 5. Pushing and Merging into the Existing Repo

**User intent**: Push accepted changes to remote and merge into main — same flow as New Software Workflow 5.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Push feature branch from Dossier (card **Merge** / push), then **create and merge the PR on GitHub** |
| 2 | User | After merge, optionally **Sync with GitHub** so the local clone’s default branch matches remote before the next build |
| 3 | System | The next **build** runs `ensureClone` / fetch as part of setup, so agents generally see newer remote refs when the clone and default branch align; the **map** in SQLite is unchanged by the merge unless you update it via planning chat |

**Success outcomes**:
- Same push/merge flow as New Software Workflow 5
- Remote default branch carries merged work; local clone can be aligned with sync or the next clone/fetch cycle

**Data flow**: `POST .../push` → GitHub PR → user merge → optional `POST .../repo/sync` → `ensureClone` on subsequent builds

---

## Knowledge Items (Cross-Cutting)

**What they are**: Card-level requirements, facts, assumptions, and questions — used as build context when they exist.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent or user | Creates knowledge items via chat or card UI |
| 2 | User | Edits requirements directly in card |
| 3 | System | Orchestration uses all existing items for build context; no approval step |

**Data flow**: `upsertCardKnowledgeItem` (create/edit)

---

## Verification
- [ ] Each workflow traceable through API routes and services
- [ ] Success outcomes achievable end-to-end
- [ ] Error states handled (validation, policy violations)

## Related
- [.cursor/agents/strategy-fidelity-voc.md](../../.cursor/agents/strategy-fidelity-voc.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
