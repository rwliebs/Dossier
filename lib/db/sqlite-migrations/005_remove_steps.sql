UPDATE card SET step_id = NULL WHERE step_id IS NOT NULL;
DROP INDEX IF EXISTS idx_step_workflow_activity_id;
DROP INDEX IF EXISTS idx_step_position;
DROP INDEX IF EXISTS idx_card_step_id;
DROP INDEX IF EXISTS idx_card_step_priority;
DROP TABLE IF EXISTS step;
ALTER TABLE card DROP COLUMN step_id;
