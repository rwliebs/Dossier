-- Add finalized_at to project for project-before-cards gate
ALTER TABLE project ADD COLUMN finalized_at TEXT;
