# API Endpoints Reference

REST API for the Dossier planning and build system. All routes under `/api`. SQLite (default) stores data in `~/.dossier/dossier.db`. Migrations run automatically on first use.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Anthropic credential: set `ANTHROPIC_API_KEY` **or** rely on installed Claude CLI settings.
3. GitHub credential: use Connect GitHub OAuth (`GITHUB_OAUTH_CLIENT_ID`) or set `GITHUB_TOKEN`.
4. Database: SQLite (default) stores data in `~/.dossier/dossier.db`. Migrations run automatically on first use.

## Base URL

- Local: `http://localhost:3000`
- All routes are under `/api`

## Error Response Format

All errors return JSON:

```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "details": { "field": ["specific issue"] }
}
```

| HTTP Status | Error Code       | When                                      |
|-------------|------------------|-------------------------------------------|
| 400         | validation_failed | Malformed payload, schema mismatch        |
| 404         | not_found        | Resource doesn't exist                    |
| 409         | conflict         | Referential integrity error               |
| 422         | action_rejected  | Action rejected (e.g. code-gen intent)    |
| 500         | internal_error   | Database or unexpected error              |

---

## Project Management

### GET /api/projects

List all projects.

**Response:** `200` — Array of project objects

```json
[
  { "id": "uuid", "name": "string", "repo_url": "string|null", "default_branch": "string", "created_at": "string", "updated_at": "string" }
]
```

### POST /api/projects

Create a project.

**Request body:**
```json
{
  "name": "string (required)",
  "repo_url": "string|null (optional)",
  "default_branch": "string (optional, default: main)"
}
```

**Response:** `201` — Created project object

### GET /api/projects/[projectId]

Get project details.

**Response:** `200` — Project object | `404` — Not found

### PATCH /api/projects/[projectId]

Update project.

**Request body:** Same as POST, all fields optional

**Response:** `200` — Updated project object

---

## Setup & GitHub Integration

### GET /api/setup/status

Returns whether setup is incomplete and which keys are still required.

**Response:** `200`
```json
{
  "needsSetup": true,
  "missingKeys": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"],
  "configPath": "/home/<user>/.dossier/config",
  "anthropicViaCli": false
}
```

Notes:
- Anthropic is considered configured when a key is found in env/config **or** Claude CLI credentials are available.
- GitHub is considered configured when `resolveGitHubToken()` succeeds.

### POST /api/setup

Save API credentials to local config (`~/.dossier/config`) and inject into process env for immediate use.

**Request body:**
```json
{
  "anthropicApiKey": "sk-ant-...",
  "githubToken": "ghp_..."
}
```

Constraints:
- At least one of `anthropicApiKey` or `githubToken` must be non-empty.
- If `githubToken` is provided, `DOSSIER_GITHUB_IGNORE_ENV` is cleared so the new token is used.

**Responses:**
- `200` `{ "success": true, "configPath": "..." }`
- `400` `{ "success": false, "error": "At least one key is required" }`

### GET /api/github/oauth/meta

Returns whether GitHub OAuth is configured server-side.

**Response:** `200`
```json
{ "oauthConfigured": true }
```

### GET /api/github/oauth/start

Starts GitHub OAuth authorization-code + PKCE flow and redirects to GitHub.

**Query params:**
- `return_to` (optional): same-origin path to return to (`/setup`, `/`, etc.)
- `port` (optional): loopback callback port override (used for Electron/CLI loopback flows)

Behavior:
- Sets short-lived HttpOnly cookies for OAuth state/verifier/return path.
- Redirects to `https://github.com/login/oauth/authorize` with `scope=repo`.

**Errors:**
- `503` when `GITHUB_OAUTH_CLIENT_ID` is not configured.

### GET /api/github/oauth/callback

Handles OAuth callback, exchanges code for token, persists `GITHUB_TOKEN`, then redirects back.

**Success redirect query:**
- `github_oauth=success`

**Error redirect query (`github_error`):**
- `access_denied` - user canceled auth
- `invalid_state` - missing/mismatched state/verifier cookie
- `misconfigured` - OAuth client id missing
- `server` - token exchange or config write failed

### DELETE /api/github/auth (also supports POST)

Disconnect GitHub by removing stored `GITHUB_TOKEN` and setting `DOSSIER_GITHUB_IGNORE_ENV=1` in config.

Why this matters: if `.env.local` still has `GITHUB_TOKEN`, disconnect still behaves as disconnected until reconnect/save.

### GET /api/github/user

Returns the current GitHub login for the resolved token.

**Responses:**
- `200` `{ "login": "octocat" }`
- `401` token invalid/expired
- `503` token not configured

### GET /api/github/repos

Lists repositories for authenticated user.

**Response:** `200`
```json
{
  "repos": [
    {
      "full_name": "owner/repo",
      "html_url": "https://github.com/owner/repo",
      "clone_url": "https://github.com/owner/repo.git",
      "private": true
    }
  ]
}
```

### POST /api/github/repos

Creates a repository for authenticated user.

**Request body:**
```json
{
  "name": "new-repo",
  "private": false
}
```

Constraints:
- `name` required, regex: `^[a-zA-Z0-9._-]+$`

Common statuses:
- `201` created
- `401` invalid/expired token
- `422` invalid name / already exists
- `503` token not configured

---

## Planning Chat

### POST /api/projects/[projectId]/chat

Non-streaming planning endpoint. Validates the request, fetches the current map snapshot, runs planning, parses the final response, validates actions, and applies accepted actions.

**Request body:**
```json
{
  "message": "string",
  "conversationHistory": [{ "role": "user|agent", "content": "string" }],
  "mode": "scaffold|populate|finalize (optional)",
  "workflow_id": "uuid (required when mode=populate)",
  "mock_response": "string (test-only; requires PLANNING_MOCK_ALLOWED=1)"
}
```

Behavior:
- `mode=scaffold`: applies only `updateProject` and `createWorkflow`.
- `mode=populate`: runs the two-phase populate flow for one workflow.
- `mode=finalize`: creates required context artifacts and marks the project finalized.
- No `mode`: empty maps scaffold; maps with structure use the full planning prompt. If workflows are empty and the message explicitly asks to populate, the endpoint populates those workflows.

**Response:** `200`
```json
{
  "status": "success",
  "responseType": "clarification|actions|mixed",
  "message": "string",
  "applied": 3,
  "workflow_ids_created": ["uuid"],
  "workflow_id": "uuid",
  "artifacts_created": 5,
  "errors": [{ "action_type": "updateCard", "reason": "string" }]
}
```

### POST /api/projects/[projectId]/chat/stream

Streaming planning endpoint. Returns Server-Sent Events while parsing and applying actions.

**Request body:** same as `/chat`, except `conversationHistory` is not accepted and `mode` defaults to `scaffold`.

**SSE events:**
- `message`: chat copy emitted by the planner.
- `action`: an applied planning action and apply result.
- `error`: rejected action or sub-step failure.
- `phase_complete`: scaffold/populate/finalize completion metadata.
- `done`: stream finished.

Planning auth uses the Agent SDK for resolved credentials and falls back to `claude -p` only when no credential is extractable and the CLI is available. See [planning-reference.md](../domains/planning-reference.md).

---

## Map & Actions

### GET /api/projects/[projectId]/map

Canonical map snapshot: Workflow → WorkflowActivity → Card tree.

**Response:** `200`
```json
{
  "project": { "id", "name", "repo_url", "default_branch" },
  "workflows": [
    {
      "id", "project_id", "title", "description", "build_state", "position",
      "activities": [
        {
          "id", "workflow_id", "title", "color", "position",
          "cards": [
            {
              "id", "workflow_activity_id", "title", "description", "status",
              "priority", "quick_answer", "finalized_at", "build_state",
              "last_built_at", "last_build_ref", "last_build_error"
            }
          ]
        }
      ]
    }
  ]
}
```

### GET /api/projects/[projectId]/actions

Action history for the project.

**Response:** `200` — Array of PlanningAction records

### POST /api/projects/[projectId]/actions

Submit planning actions. Validates, applies, and persists. Rejects on first failure.

**Request body:**
```json
{
  "actions": [
    {
      "id": "uuid (optional)",
      "action_type": "updateProject|createWorkflow|createActivity|createCard|updateCard|reorderCard|deleteWorkflow|deleteActivity|deleteCard|linkContextArtifact|createContextArtifact|upsertCardPlannedFile|upsertCardKnowledgeItem",
      "target_ref": {},
      "payload": {}
    }
  ]
}
```

**Response:** `201` — `{ "applied": number, "results": [...] }` | `422` — Action rejected

**Supported action types:**

| Action | Description |
|--------|-------------|
| `updateProject` | Update project metadata |
| `createWorkflow` | Create a new workflow in the project |
| `createActivity` | Create a workflow activity |
| `createCard` | Create a card in an activity |
| `updateCard` | Update card title, description, status, or priority |
| `reorderCard` | Move card to a new position |
| `deleteWorkflow` | Delete a workflow and cascaded activities/cards |
| `deleteActivity` | Delete an activity and cascaded cards |
| `deleteCard` | Delete a card |
| `linkContextArtifact` | Link a context artifact to a card |
| `createContextArtifact` | Create a project context artifact, optionally linked to a card |
| `upsertCardPlannedFile` | Create or update a planned file for a card |
| `upsertCardKnowledgeItem` | Create or update a requirement, fact, assumption, or question |

Code-generation intents are rejected.

---

## Context Artifacts

### GET /api/projects/[projectId]/artifacts

List project artifacts.

**Response:** `200` — Array of ContextArtifact

### POST /api/projects/[projectId]/artifacts

Create artifact. Requires at least one of: `content`, `uri`, `integration_ref`.

**Request body:**
```json
{
  "name": "string",
  "type": "doc|design|code|research|link|image|skill|mcp|cli|api|prompt|spec|runbook",
  "title": "string|null",
  "content": "string|null",
  "uri": "string|null",
  "locator": "string|null",
  "mime_type": "string|null",
  "integration_ref": "object|null"
}
```

**Response:** `201` — Created artifact

### GET /api/projects/[projectId]/artifacts/[artifactId]

Get single artifact.

### PATCH /api/projects/[projectId]/artifacts/[artifactId]

Update artifact. All fields optional.

### DELETE /api/projects/[projectId]/artifacts/[artifactId]

Delete artifact. **Response:** `204`

---

## Card Knowledge Items

All knowledge routes require the card to belong to the project (via workflow → activity).

### Requirements

- `GET /api/projects/[projectId]/cards/[cardId]/requirements`
- `POST /api/projects/[projectId]/cards/[cardId]/requirements`
- `PATCH /api/projects/[projectId]/cards/[cardId]/requirements/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/requirements/[itemId]`

### Facts

- `GET /api/projects/[projectId]/cards/[cardId]/facts`
- `POST /api/projects/[projectId]/cards/[cardId]/facts`
- `PATCH /api/projects/[projectId]/cards/[cardId]/facts/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/facts/[itemId]`

### Assumptions

- `GET /api/projects/[projectId]/cards/[cardId]/assumptions`
- `POST /api/projects/[projectId]/cards/[cardId]/assumptions`
- `PATCH /api/projects/[projectId]/cards/[cardId]/assumptions/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/assumptions/[itemId]`

### Questions

- `GET /api/projects/[projectId]/cards/[cardId]/questions`
- `POST /api/projects/[projectId]/cards/[cardId]/questions`
- `PATCH /api/projects/[projectId]/cards/[cardId]/questions/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/questions/[itemId]`

**Create payload (e.g. requirements):**
```json
{
  "text": "string",
  "status": "draft|approved|rejected (optional)",
  "source": "agent|user|imported",
  "confidence": "number 0-1 (optional)",
  "position": "number (optional)"
}
```

---

## Card Planned Files

### GET /api/projects/[projectId]/cards/[cardId]/planned-files

List planned files for a card.

### POST /api/projects/[projectId]/cards/[cardId]/planned-files

Create planned file.

**Request body:**
```json
{
  "logical_file_name": "string",
  "module_hint": "string|null",
  "artifact_kind": "component|endpoint|service|schema|hook|util|middleware|job|config",
  "action": "create|edit",
  "intent_summary": "string",
  "contract_notes": "string|null",
  "status": "proposed|user_edited|approved (optional)",
  "position": "number (optional)"
}
```

### PATCH /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]

Update or approve planned file. Use `{ "status": "approved" }` for approval.

### DELETE /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]

Delete planned file.

---

## Card Context, Finalization, Produced Files, and Push

### GET /api/projects/[projectId]/cards/[cardId]/context-artifacts

List context artifacts linked to a card. Returns `404` if the card does not belong to the project.

### GET /api/projects/[projectId]/cards/[cardId]/finalize

Assemble the finalization package for review: the card, project docs (`doc|spec|design`), linked card artifacts, requirements, planned files, and current `finalized_at`.

### POST /api/projects/[projectId]/cards/[cardId]/finalize

Streaming SSE endpoint that approves a card.

Constraints:
- Project must already be finalized.
- Card must have at least one requirement.
- Card must have at least one planned file or folder.
- Planning LLM must be enabled.

Behavior:
- Links project-wide context docs to the card.
- Generates an e2e test context artifact via the planning sub-step.
- Sets `card.finalized_at`.
- Ingests card context into memory when the memory plane is enabled.

**SSE events:** `finalize_progress`, `action`, `error`, `phase_complete`, `done`.

### GET /api/projects/[projectId]/cards/[cardId]/produced-files

Returns files added or modified by the most recent completed assignment for the card.

**Response:** `200`
```json
[
  { "path": "src/index.ts", "status": "added" }
]
```

Returns `[]` when no completed build with a worktree is available.

### POST /api/projects/[projectId]/cards/[cardId]/push

Pushes the card's completed feature branch from the local clone to the connected GitHub repository. The user still opens and merges the pull request in GitHub.

Common statuses:
- `200` `{ "success": true, "branch": "feature/card-..." }`
- `400` project has no connected repository
- `401` GitHub token missing or invalid
- `409` no completed build for the card
- `502` git push failed

---

## Project Files (Planned + Repository)

### GET /api/projects/[projectId]/files

File tree for the project. Two modes via `source` query param.

**Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `source` | `planned` (default) | Planned files from `card_planned_file` (intent, not produced code) |
| `source` | `repo` | Actual files from cloned repo (after build); includes diff status |
| `content` | `1` | With `source=repo` and `path`: return file content as `text/plain` |
| `diff` | `1` | With `source=repo` and `path`: return unified diff vs base branch as `text/x-diff` |
| `path` | `src/foo.ts` | Required when `content=1` or `diff=1`; file path (with or without leading slash) |

**Default (`source=planned`):** Returns hierarchical file tree built from `card_planned_file.logical_file_name`.

**`source=repo`:** Returns file tree from the latest build's cloned repo (feature branch). Requires at least one completed or running build with `worktree_root` set. Nodes include optional `status`: `added`, `modified`, `deleted`.

**`source=repo&content=1&path=...`:** Returns raw file content. `404` if file not found.

**`source=repo&diff=1&path=...`:** Returns `git diff base...feature -- path`. `404` if file unchanged or not found.

**Response (tree):** `200` — Array of `FileNode`:
```json
[
  {
    "name": "src",
    "type": "folder",
    "path": "/src",
    "status": "modified",
    "children": [
      { "name": "index.ts", "type": "file", "path": "/src/index.ts", "status": "added" }
    ]
  }
]
```

**Response (content/diff):** `200` — `text/plain` or `text/x-diff` body. `404` — Error JSON if no build or file not found.

---

## Repository Sync

### POST /api/projects/[projectId]/repo/sync

Syncs the local clone's base branch with `origin/<default_branch>`.

Use this after merging PRs on GitHub so subsequent builds branch from an up-to-date base.

**Response:**
- `200` `{ "success": true, "branch": "main" }`

**Common failures:**
- `400` project missing repo URL / repo not found
- `401` GitHub authentication/token failure
- `502` upstream sync error

---

## Orchestration Coordination

### Build Trigger

#### POST /api/projects/[projectId]/orchestration/build

Starts orchestration for a workflow or card scope.

**Request body:**
```json
{
  "scope": "workflow|card",
  "workflow_id": "uuid (required when scope=workflow)",
  "card_id": "uuid (required when scope=card)",
  "trigger_type": "card|workflow|manual (optional)",
  "initiated_by": "string (required actor identifier)"
}
```

**Response:** `202`
```json
{
  "runId": "uuid",
  "assignmentIds": ["uuid"],
  "message": "Build started",
  "outcome_type": "success"
}
```

When decision/validation issues block immediate execution, response remains structured with `outcome_type` and message.

#### POST /api/projects/[projectId]/orchestration/resume-blocked

Resumes a previously blocked assignment after user input is provided.

**Request body:**
```json
{
  "card_id": "uuid",
  "actor": "user (optional)"
}
```

**Response:** `202`
```json
{
  "assignmentId": "uuid",
  "runId": "uuid",
  "message": "Build resumed",
  "outcome_type": "success"
}
```

### Approval Requests

- `GET /api/projects/[projectId]/orchestration/approvals?run_id=<runId>` - list approvals for run
- `POST /api/projects/[projectId]/orchestration/approvals` - create approval request (`run_id`, `approval_type=create_pr|merge_pr`, `requested_by`)
- `GET /api/projects/[projectId]/orchestration/approvals/[approvalId]` - read single request
- `PATCH /api/projects/[projectId]/orchestration/approvals/[approvalId]` - resolve request (`status=approved|rejected`, `resolved_by`, optional `notes`)

### Pull Request Candidates

- `GET /api/projects/[projectId]/orchestration/pull-requests?run_id=<runId>` - fetch PR candidate for run
- `POST /api/projects/[projectId]/orchestration/pull-requests` - create candidate (`run_id`, `base_branch`, `head_branch`, `title`, `description`)
- `GET /api/projects/[projectId]/orchestration/pull-requests/[prId]` - read single candidate
- `PATCH /api/projects/[projectId]/orchestration/pull-requests/[prId]` - update status (`status=not_created|draft_open|open|merged|closed`, optional `pr_url`)

---

## Developer Utilities

### POST /api/dev/restart-and-open

Starts a built project's dev server from its local clone and opens a browser tab.

**Request body:**
```json
{ "projectId": "uuid" }
```

Behavior and constraints:
- Tries ports `3001..3010`; returns `503` if all are occupied.
- Returns `409` if project repo clone does not exist yet (build at least once first).
- Route is disabled on known hosted/cloud runtimes.
- Route is enabled locally in `NODE_ENV=development` or when `DOSSIER_ALLOW_PROJECT_DEV_SERVER=1`.

**Response:** `200`
```json
{
  "ok": true,
  "message": "Starting project server on port 3003 and opening new tab. Page will load in ~10 seconds."
}
```

---

## As-Built Notes

- **Mutations**: All map changes go through the actions endpoint; no direct writes.
- **Auth**: No auth/RLS; endpoints use anon access (single-user desktop app).
- **Database**: SQLite only; no Supabase or Postgres.
