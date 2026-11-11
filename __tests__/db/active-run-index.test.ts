/**
 * Single-build lock enforced by the database (migration 013).
 * At most one active (queued or running) orchestration run per project.
 * Uses a real in-memory SQLite database with the production migrations.
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, MIGRATIONS } from "@/lib/db/migrate";

const MIGRATION_013 = MIGRATIONS.find(
  (m) => m.name === "013_single_active_run_per_project.sql"
);

type Status = "queued" | "running" | "failed" | "completed";

function openDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  runMigrations(db);
  // runMigrations re-enables foreign keys. Turn them off so rows can be inserted without
  // full policy/card fixtures. The unique index under test does not depend on foreign keys.
  db.pragma("foreign_keys = OFF");
  return db;
}

function insertRun(
  db: InstanceType<typeof Database>,
  id: string,
  projectId: string,
  status: Status,
  createdAt: string = new Date().toISOString()
): void {
  db.prepare(
    `INSERT INTO orchestration_run
      (id, project_id, scope, card_id, trigger_type, status, initiated_by, repo_url, base_branch,
       system_policy_profile_id, system_policy_snapshot, run_input_snapshot, created_at, updated_at)
     VALUES (?, ?, 'card', 'card-1', 'card', ?, 'test', 'https://github.com/o/r', 'main',
       'policy-1', '{}', '{}', ?, ?)`
  ).run(id, projectId, status, createdAt, createdAt);
}

function statusOf(db: InstanceType<typeof Database>, id: string): string {
  return (db.prepare("SELECT status FROM orchestration_run WHERE id = ?").get(id) as { status: string }).status;
}

describe("single active run per project (migration 013)", () => {
  it("rejects a second queued run for the same project", () => {
    const db = openDb();
    insertRun(db, "run-a", "proj-1", "queued");
    expect(() => insertRun(db, "run-b", "proj-1", "queued")).toThrow(
      "UNIQUE constraint failed: orchestration_run.project_id"
    );
  });

  it("rejects a queued run while another run for the project is running", () => {
    const db = openDb();
    insertRun(db, "run-a", "proj-1", "running");
    expect(() => insertRun(db, "run-b", "proj-1", "queued")).toThrow(
      "UNIQUE constraint failed: orchestration_run.project_id"
    );
  });

  it("allows one active run per project, independently across projects", () => {
    const db = openDb();
    insertRun(db, "run-a", "proj-1", "queued");
    insertRun(db, "run-b", "proj-2", "running");
    expect(() => insertRun(db, "run-c", "proj-3", "queued")).not.toThrow();
  });

  it("allows a new run once the previous run has ended", () => {
    const db = openDb();
    insertRun(db, "run-a", "proj-1", "running");
    db.prepare("UPDATE orchestration_run SET status = 'failed' WHERE id = ?").run("run-a");
    expect(() => insertRun(db, "run-b", "proj-1", "queued")).not.toThrow();
  });

  it("allows many finished runs per project", () => {
    const db = openDb();
    insertRun(db, "run-a", "proj-1", "completed");
    insertRun(db, "run-b", "proj-1", "failed");
    insertRun(db, "run-c", "proj-1", "completed");
    expect(() => insertRun(db, "run-d", "proj-1", "queued")).not.toThrow();
  });

  it("migration keeps the newest active run per project and fails older duplicates", () => {
    expect(MIGRATION_013).toBeDefined();
    const db = openDb();
    // Simulate a database from before the index existed.
    db.exec("DROP INDEX IF EXISTS idx_orchestration_run_one_active_per_project");
    insertRun(db, "old-queued", "proj-1", "queued", "2026-01-01T10:00:00.000Z");
    insertRun(db, "new-running", "proj-1", "running", "2026-01-02T10:00:00.000Z");
    insertRun(db, "other-project", "proj-2", "queued", "2026-01-01T09:00:00.000Z");

    db.exec(MIGRATION_013!.sql);

    expect(statusOf(db, "old-queued")).toBe("failed");
    expect(statusOf(db, "new-running")).toBe("running");
    expect(statusOf(db, "other-project")).toBe("queued");
    expect(() => insertRun(db, "run-x", "proj-1", "queued")).toThrow(
      "UNIQUE constraint failed: orchestration_run.project_id"
    );
  });
});
