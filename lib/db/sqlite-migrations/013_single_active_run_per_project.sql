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
