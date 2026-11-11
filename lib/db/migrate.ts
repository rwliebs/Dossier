/**
 * Migration runner for SQLite.
 * Tracks applied migrations in _migrations table.
 * Migrations are embedded as strings for standalone/Electron compatibility.
 */

import * as crypto from "node:crypto";

/** Structural type for better-sqlite3 Database (package is loosely typed in this repo). */
export interface SqliteMigrationDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
  pragma(pragma: string): unknown;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_schema.sql",
    sql: /* sql */ `
-- Projects
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  action_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_updated_at ON project(updated_at DESC);

-- Workflows
CREATE TABLE IF NOT EXISTS workflow (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  build_state TEXT CHECK (build_state IN ('queued','running','blocked','failed','completed','cancelled')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workflow_project_id ON workflow(project_id);

-- Workflow activities
CREATE TABLE IF NOT EXISTS workflow_activity (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT CHECK (color IN ('yellow','blue','purple','green','orange','pink')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workflow_activity_workflow_id ON workflow_activity(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_activity_position ON workflow_activity(workflow_id, position);

-- Steps
CREATE TABLE IF NOT EXISTS step (
  id TEXT PRIMARY KEY,
  workflow_activity_id TEXT NOT NULL REFERENCES workflow_activity(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_step_workflow_activity_id ON step(workflow_activity_id);
CREATE INDEX IF NOT EXISTS idx_step_position ON step(workflow_activity_id, position);

-- Cards
CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY,
  workflow_activity_id TEXT NOT NULL REFERENCES workflow_activity(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES step(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','active','questions','review','production')),
  priority INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  quick_answer TEXT,
  build_state TEXT CHECK (build_state IN ('queued','running','blocked','failed','completed','cancelled')),
  last_built_at TEXT,
  last_build_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_workflow_activity_id ON card(workflow_activity_id);
CREATE INDEX IF NOT EXISTS idx_card_step_id ON card(step_id);
CREATE INDEX IF NOT EXISTS idx_card_step_priority ON card(step_id, priority) WHERE step_id IS NOT NULL;

-- Planning actions
CREATE TABLE IF NOT EXISTS planning_action (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  target_ref TEXT NOT NULL DEFAULT '{}',
  payload TEXT NOT NULL DEFAULT '{}',
  validation_status TEXT NOT NULL CHECK (validation_status IN ('accepted','rejected')),
  rejection_reason TEXT,
  applied_at TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_action_idempotency
  ON planning_action(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_planning_action_project_id ON planning_action(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_action_created_at ON planning_action(project_id, created_at DESC);

-- Context artifacts
CREATE TABLE IF NOT EXISTS context_artifact (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('doc','design','code','research','link','image','skill','mcp','cli','api','prompt','spec','runbook')),
  title TEXT,
  content TEXT,
  uri TEXT,
  locator TEXT,
  mime_type TEXT,
  integration_ref TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (content IS NOT NULL OR uri IS NOT NULL OR integration_ref IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_context_artifact_project_id ON context_artifact(project_id);

-- Card context artifact (many-to-many)
CREATE TABLE IF NOT EXISTS card_context_artifact (
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  context_artifact_id TEXT NOT NULL REFERENCES context_artifact(id) ON DELETE CASCADE,
  linked_by TEXT,
  usage_hint TEXT,
  PRIMARY KEY (card_id, context_artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_card_context_artifact_card ON card_context_artifact(card_id);
CREATE INDEX IF NOT EXISTS idx_card_context_artifact_artifact ON card_context_artifact(context_artifact_id);

-- Card requirement
CREATE TABLE IF NOT EXISTS card_requirement (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_requirement_card_id ON card_requirement(card_id);

-- Card known fact
CREATE TABLE IF NOT EXISTS card_known_fact (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  evidence_source TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_known_fact_card_id ON card_known_fact(card_id);

-- Card assumption
CREATE TABLE IF NOT EXISTS card_assumption (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_assumption_card_id ON card_assumption(card_id);

-- Card question
CREATE TABLE IF NOT EXISTS card_question (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_question_card_id ON card_question(card_id);

-- Card planned file
CREATE TABLE IF NOT EXISTS card_planned_file (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  logical_file_name TEXT NOT NULL,
  module_hint TEXT,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('component','endpoint','service','schema','hook','util','middleware','job','config')),
  action TEXT NOT NULL CHECK (action IN ('create','edit')),
  intent_summary TEXT NOT NULL,
  contract_notes TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','user_edited','approved')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_planned_file_card_id ON card_planned_file(card_id);
CREATE INDEX IF NOT EXISTS idx_card_planned_file_card_status ON card_planned_file(card_id, status);
`,
  },
  {
    name: "002_orchestration.sql",
    sql: /* sql */ `
-- System policy profile
CREATE TABLE IF NOT EXISTS system_policy_profile (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES project(id) ON DELETE CASCADE,
  required_checks TEXT NOT NULL DEFAULT '[]',
  protected_paths TEXT,
  forbidden_paths TEXT,
  dependency_policy TEXT NOT NULL DEFAULT '{}',
  security_policy TEXT NOT NULL DEFAULT '{}',
  architecture_policy TEXT NOT NULL DEFAULT '{}',
  approval_policy TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_system_policy_profile_project_id ON system_policy_profile(project_id);

-- Orchestration run
CREATE TABLE IF NOT EXISTS orchestration_run (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('workflow','card')),
  workflow_id TEXT REFERENCES workflow(id) ON DELETE SET NULL,
  card_id TEXT REFERENCES card(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('card','workflow','manual')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','failed','completed','cancelled')),
  initiated_by TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  system_policy_profile_id TEXT NOT NULL REFERENCES system_policy_profile(id) ON DELETE RESTRICT,
  system_policy_snapshot TEXT NOT NULL,
  run_input_snapshot TEXT NOT NULL,
  worktree_root TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((scope != 'workflow') OR (workflow_id IS NOT NULL AND card_id IS NULL)),
  CHECK ((scope != 'card') OR (card_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_orchestration_run_project_scope_status ON orchestration_run(project_id, scope, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_run_workflow_id ON orchestration_run(workflow_id, status, created_at DESC) WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orchestration_run_card_id ON orchestration_run(card_id, status, created_at DESC) WHERE card_id IS NOT NULL;

-- Card assignment
CREATE TABLE IF NOT EXISTS card_assignment (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN ('planner','coder','reviewer','integrator','tester')),
  agent_profile TEXT NOT NULL,
  feature_branch TEXT NOT NULL,
  worktree_path TEXT,
  allowed_paths TEXT NOT NULL,
  forbidden_paths TEXT,
  assignment_input_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','failed','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, card_id, agent_profile)
);
CREATE INDEX IF NOT EXISTS idx_card_assignment_run_status ON card_assignment(run_id, status);

-- Agent execution
CREATE TABLE IF NOT EXISTS agent_execution (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES card_assignment(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','blocked','failed','completed','cancelled')),
  started_at TEXT,
  ended_at TEXT,
  summary TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_execution_assignment_id ON agent_execution(assignment_id);

-- Agent commit
CREATE TABLE IF NOT EXISTS agent_commit (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES card_assignment(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  message TEXT NOT NULL,
  committed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_commit_assignment_id ON agent_commit(assignment_id);

-- Run check
CREATE TABLE IF NOT EXISTS run_check (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (check_type IN ('dependency','security','policy','lint','unit','integration','e2e')),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped')),
  output TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_run_check_run_id ON run_check(run_id);

-- Pull request candidate
CREATE TABLE IF NOT EXISTS pull_request_candidate (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES orchestration_run(id) ON DELETE CASCADE,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_created' CHECK (status IN ('not_created','draft_open','open','merged','closed')),
  pr_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pull_request_candidate_run_id ON pull_request_candidate(run_id);

-- Approval request
CREATE TABLE IF NOT EXISTS approval_request (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('create_pr','merge_pr')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approval_request_run_id ON approval_request(run_id);

-- Event log
CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES orchestration_run(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_log_project_run_created ON event_log(project_id, run_id, created_at DESC);
`,
  },
  {
    name: "003_memory.sql",
    sql: /* sql */ `
-- MemoryUnit: content + embedding_ref (vector id in RuVector)
CREATE TABLE IF NOT EXISTS memory_unit (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('inline', 'link')),
  mime_type TEXT,
  title TEXT,
  content_text TEXT,
  link_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected')),
  embedding_ref TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((content_type != 'inline') OR (content_text IS NOT NULL)),
  CHECK ((content_type != 'link') OR (link_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_memory_unit_status_updated ON memory_unit (status, updated_at DESC);

-- MemoryUnitRelation: scope mapping
CREATE TABLE IF NOT EXISTS memory_unit_relation (
  memory_unit_id TEXT NOT NULL REFERENCES memory_unit(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'workflow', 'activity', 'step', 'card', 'schema')),
  entity_id TEXT NOT NULL,
  relation_role TEXT CHECK (relation_role IN ('source', 'supports', 'constrains')),
  PRIMARY KEY (memory_unit_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_unit_relation_entity ON memory_unit_relation (entity_type, entity_id, memory_unit_id);

-- MemoryRetrievalLog: observability
CREATE TABLE IF NOT EXISTS memory_retrieval_log (
  id TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  scope_entity_type TEXT NOT NULL CHECK (scope_entity_type IN ('project', 'workflow', 'activity', 'step', 'card', 'schema')),
  scope_entity_id TEXT NOT NULL,
  result_memory_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_log_scope ON memory_retrieval_log (scope_entity_type, scope_entity_id, created_at DESC);
`,
  },
  {
    name: "004_project_description.sql",
    sql: /* sql */ `
ALTER TABLE project ADD COLUMN description TEXT;
`,
  },
  {
    name: "005_remove_steps.sql",
    sql: /* sql */ `
UPDATE card SET step_id = NULL WHERE step_id IS NOT NULL;
DROP INDEX IF EXISTS idx_step_workflow_activity_id;
DROP INDEX IF EXISTS idx_step_position;
DROP INDEX IF EXISTS idx_card_step_id;
DROP INDEX IF EXISTS idx_card_step_priority;
DROP TABLE IF EXISTS step;
ALTER TABLE card DROP COLUMN step_id;
`,
  },
  {
    name: "006_project_context_fields.sql",
    sql: /* sql */ `
ALTER TABLE project ADD COLUMN customer_personas TEXT;
ALTER TABLE project ADD COLUMN tech_stack TEXT;
ALTER TABLE project ADD COLUMN deployment TEXT;
`,
  },
  {
    name: "007_project_design_inspiration.sql",
    sql: /* sql */ `
ALTER TABLE project ADD COLUMN design_inspiration TEXT;
`,
  },
  {
    name: "008_finalization_phase.sql",
    sql: /* sql */ `
-- Add finalized_at to cards for build readiness gate
ALTER TABLE card ADD COLUMN finalized_at TEXT;

-- Recreate context_artifact to add 'test' to the type CHECK constraint.
-- SQLite doesn't support ALTER TABLE ... ALTER COLUMN, so we rebuild.
CREATE TABLE IF NOT EXISTS context_artifact_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('doc','design','code','research','link','image','skill','mcp','cli','api','prompt','spec','runbook','test')),
  title TEXT,
  content TEXT,
  uri TEXT,
  locator TEXT,
  mime_type TEXT,
  integration_ref TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (content IS NOT NULL OR uri IS NOT NULL OR integration_ref IS NOT NULL)
);
INSERT OR IGNORE INTO context_artifact_new SELECT * FROM context_artifact;
DROP TABLE context_artifact;
ALTER TABLE context_artifact_new RENAME TO context_artifact;
CREATE INDEX IF NOT EXISTS idx_context_artifact_project_id ON context_artifact(project_id);
`,
  },
  {
    name: "009_card_last_build_error.sql",
    sql: /* sql */ `
ALTER TABLE card ADD COLUMN last_build_error TEXT;
`,
  },
  {
    name: "010_project_finalized_at.sql",
    sql: /* sql */ `
-- Add finalized_at to project for project-before-cards gate
ALTER TABLE project ADD COLUMN finalized_at TEXT;
`,
  },
  {
    name: "011_context_artifact_type_scaffold.sql",
    sql: /* sql */ `
-- Recreate context_artifact to add 'scaffold' to the type CHECK constraint.
-- SQLite doesn't support ALTER TABLE ... ALTER COLUMN, so we rebuild.
CREATE TABLE IF NOT EXISTS context_artifact_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('doc','design','code','research','link','image','skill','mcp','cli','api','prompt','spec','runbook','test','scaffold')),
  title TEXT,
  content TEXT,
  uri TEXT,
  locator TEXT,
  mime_type TEXT,
  integration_ref TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (content IS NOT NULL OR uri IS NOT NULL OR integration_ref IS NOT NULL)
);
INSERT OR IGNORE INTO context_artifact_new SELECT * FROM context_artifact;
DROP TABLE context_artifact;
ALTER TABLE context_artifact_new RENAME TO context_artifact;
CREATE INDEX IF NOT EXISTS idx_context_artifact_project_id ON context_artifact(project_id);
`,
  },
  {
    name: "012_card_assignment_session_id.sql",
    sql: /* sql */ `
ALTER TABLE card_assignment ADD COLUMN session_id TEXT;
`,
  },
  {
    // Single-build lock enforced by the database: at most one active (queued or running) run per project.
    // Keeps the newest active run per project and marks older duplicates failed so the index can be created.
    name: "013_single_active_run_per_project.sql",
    sql: /* sql */ `
UPDATE orchestration_run
SET status = 'failed', ended_at = COALESCE(ended_at, datetime('now')), updated_at = datetime('now')
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC, id DESC) AS rn
    FROM orchestration_run
    WHERE status IN ('queued', 'running')
  )
  WHERE rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orchestration_run_one_active_per_project
  ON orchestration_run(project_id)
  WHERE status IN ('queued', 'running');
`,
  },
];

/** One-time: replace non-UUID workflow, workflow_activity, and card ids with UUIDs so build API and DB stay in sync. */
export function runNormalizeEntityUuids(db: SqliteMigrationDb): void {
  const name = "009_normalize_entity_uuids";
  const row = db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(name);
  if (row) return;

  db.pragma("foreign_keys = OFF");

  const workflowMap = new Map<string, string>();
  const activityMap = new Map<string, string>();
  const cardMap = new Map<string, string>();

  try {
    // 1. Build workflow map and apply workflow updates
    const workflows = db.prepare("SELECT id FROM workflow").all() as Array<{ id: string }>;
    for (const { id: oldId } of workflows) {
      if (!isUuid(oldId)) {
        const newId = crypto.randomUUID();
        workflowMap.set(oldId, newId);
        db.prepare("UPDATE workflow SET id = ? WHERE id = ?").run(newId, oldId);
        db.prepare("UPDATE workflow_activity SET workflow_id = ? WHERE workflow_id = ?").run(newId, oldId);
        db.prepare("UPDATE orchestration_run SET workflow_id = ? WHERE workflow_id = ?").run(newId, oldId);
      }
    }

    // 2. Build activity map and apply activity updates
    const activities = db.prepare("SELECT id FROM workflow_activity").all() as Array<{ id: string }>;
    for (const { id: oldId } of activities) {
      if (!isUuid(oldId)) {
        const newId = crypto.randomUUID();
        activityMap.set(oldId, newId);
        db.prepare("UPDATE workflow_activity SET id = ? WHERE id = ?").run(newId, oldId);
        db.prepare("UPDATE card SET workflow_activity_id = ? WHERE workflow_activity_id = ?").run(newId, oldId);
      }
    }

    // 3. Build card map and apply card updates
    const cards = db.prepare("SELECT id FROM card").all() as Array<{ id: string }>;
    for (const { id: oldId } of cards) {
      if (!isUuid(oldId)) {
        const newId = crypto.randomUUID();
        cardMap.set(oldId, newId);
        db.prepare("UPDATE card SET id = ? WHERE id = ?").run(newId, oldId);
        db.prepare("UPDATE card_context_artifact SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE card_requirement SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE card_known_fact SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE card_assumption SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE card_question SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE card_planned_file SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE orchestration_run SET card_id = ? WHERE card_id = ?").run(newId, oldId);
        db.prepare("UPDATE card_assignment SET card_id = ? WHERE card_id = ?").run(newId, oldId);
      }
    }

    // 4. Update planning_action target_ref and payload JSON (used by reconstructStateFromDb replay)
    const planningRows = db.prepare("SELECT id, action_type, target_ref, payload FROM planning_action").all() as Array<{
      id: string;
      action_type: string;
      target_ref: string;
      payload: string;
    }>;
    const updatePlanning = db.prepare(
      "UPDATE planning_action SET target_ref = ?, payload = ? WHERE id = ?"
    );
    for (const row of planningRows) {
      let targetRef: Record<string, unknown> = {};
      let payload: Record<string, unknown> = {};
      try {
        targetRef = JSON.parse(row.target_ref || "{}") as Record<string, unknown>;
      } catch {
        /* keep {} */
      }
      try {
        payload = JSON.parse(row.payload || "{}") as Record<string, unknown>;
      } catch {
        /* keep {} */
      }
      let changed = false;
      if (typeof targetRef.workflow_id === "string" && workflowMap.has(targetRef.workflow_id)) {
        targetRef.workflow_id = workflowMap.get(targetRef.workflow_id);
        changed = true;
      }
      if (typeof targetRef.workflow_activity_id === "string" && activityMap.has(targetRef.workflow_activity_id)) {
        targetRef.workflow_activity_id = activityMap.get(targetRef.workflow_activity_id);
        changed = true;
      }
      if (typeof targetRef.card_id === "string" && cardMap.has(targetRef.card_id)) {
        targetRef.card_id = cardMap.get(targetRef.card_id);
        changed = true;
      }
      if (typeof payload.id === "string") {
        if (activityMap.has(payload.id)) {
          payload.id = activityMap.get(payload.id);
          changed = true;
        } else if (cardMap.has(payload.id)) {
          payload.id = cardMap.get(payload.id);
          changed = true;
        }
      }
      if (typeof payload.card_id === "string" && cardMap.has(payload.card_id)) {
        payload.card_id = cardMap.get(payload.card_id);
        changed = true;
      }
      if (changed) {
        updatePlanning.run(JSON.stringify(targetRef), JSON.stringify(payload), row.id);
      }
    }

    // 5. Update memory_unit_relation entity_id (workflow, activity, card)
    if (workflowMap.size > 0 || activityMap.size > 0 || cardMap.size > 0) {
      const entityTypeToMap: Record<string, Map<string, string>> = {
        workflow: workflowMap,
        activity: activityMap,
        card: cardMap,
      };
      try {
        const relRows = db.prepare("SELECT memory_unit_id, entity_type, entity_id, relation_role FROM memory_unit_relation").all() as Array<{
          memory_unit_id: string;
          entity_type: string;
          entity_id: string;
          relation_role: string | null;
        }>;
        const updateRel = db.prepare(
          "UPDATE memory_unit_relation SET entity_id = ? WHERE memory_unit_id = ? AND entity_type = ? AND entity_id = ?"
        );
        for (const r of relRows) {
          const map = entityTypeToMap[r.entity_type];
          if (map?.has(r.entity_id)) {
            updateRel.run(map.get(r.entity_id), r.memory_unit_id, r.entity_type, r.entity_id);
          }
        }
      } catch {
        /* table may not exist in older schemas */
      }

      // 6. Update memory_retrieval_log scope_entity_id
      try {
        const logRows = db.prepare("SELECT id, scope_entity_type, scope_entity_id FROM memory_retrieval_log").all() as Array<{
          id: string;
          scope_entity_type: string;
          scope_entity_id: string;
        }>;
        const updateLog = db.prepare(
          "UPDATE memory_retrieval_log SET scope_entity_id = ? WHERE id = ?"
        );
        for (const r of logRows) {
          const map = entityTypeToMap[r.scope_entity_type];
          if (map?.has(r.scope_entity_id)) {
            updateLog.run(map.get(r.scope_entity_id), r.id);
          }
        }
      } catch {
        /* table may not exist in older schemas */
      }
    }

    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(name);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function runMigrations(db: SqliteMigrationDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  for (const migration of MIGRATIONS) {
    const row = db
      .prepare("SELECT 1 FROM _migrations WHERE name = ?")
      .get(migration.name);
    if (row) continue;

    db.exec(migration.sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
  }

  runNormalizeEntityUuids(db);
}
