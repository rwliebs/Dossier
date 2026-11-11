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
