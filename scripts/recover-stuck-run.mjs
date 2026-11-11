#!/usr/bin/env node
/**
 * Marks a stuck "running" run as failed so a new build can start.
 * Usage: node scripts/recover-stuck-run.mjs [run_id]
 * If run_id is omitted, marks the most recent running run for the project that has one.
 *
 * Requires: SQLITE_PATH or ~/.dossier/dossier.db
 *
 * Operator maintenance tool. It runs raw SQL against better-sqlite3 directly,
 * outside the DB adapter in lib/db. This is an accepted exception to the
 * adapter seam: it's a one-off repair tool, not business logic. Keep it to
 * maintenance; app code must go through lib/db.
 */

import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const dbPath =
  process.env.SQLITE_PATH ||
  join(process.env.DOSSIER_DATA_DIR || join(homedir(), ".dossier"), "dossier.db");

if (!existsSync(dbPath)) {
  console.error("DB not found:", dbPath);
  process.exit(1);
}

// Use better-sqlite3 if available (same as app), else sqlite3 shell
let runId = process.argv[2];

async function main() {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbPath);

    if (!runId) {
      const row = db
        .prepare(
          "SELECT id, project_id, created_at FROM orchestration_run WHERE status = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get("running");
      if (!row) {
        console.log("No run with status=running found.");
        db.close();
        return;
      }
      runId = row.id;
      console.log("Found running run:", runId, "project:", row.project_id, "created:", row.created_at);
    }

    const assignments = db.prepare("SELECT id, card_id FROM card_assignment WHERE run_id = ?").all(runId);
    const now = new Date().toISOString();

    for (const a of assignments) {
      db.prepare("UPDATE card_assignment SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
        "failed",
        a.id
      );
      db
        .prepare(
          "UPDATE card SET build_state = ?, last_build_error = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run("failed", "Build recovered (stuck run cleared so you can start a new build)", a.card_id);
    }

    db
      .prepare(
        "UPDATE orchestration_run SET status = ?, ended_at = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run("failed", now, runId);

    console.log("Marked run", runId, "and", assignments.length, "assignment(s) / card(s) as failed. You can start a new build.");
    db.close();
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" || e.message?.includes("better-sqlite3")) {
      console.log("Run this from the project root with dependencies installed, or use SQL directly:");
      console.log("");
      console.log("  sqlite3", dbPath, "<<EOF");
      console.log("  UPDATE orchestration_run SET status = 'failed', ended_at = datetime('now') WHERE id = '" + (runId || "<RUN_ID>") + "';");
      console.log("  UPDATE card_assignment SET status = 'failed' WHERE run_id = '" + (runId || "<RUN_ID>") + "';");
      console.log("  UPDATE card SET build_state = 'failed', last_build_error = 'Stuck run cleared' WHERE id IN (SELECT card_id FROM card_assignment WHERE run_id = '" + (runId || "<RUN_ID>") + "');");
      console.log("  EOF");
      process.exit(1);
    }
    throw e;
  }
}

main();
