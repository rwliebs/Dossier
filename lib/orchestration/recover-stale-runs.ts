/**
 * Recovers runs stuck in "running" for too long (crash/disconnect recovery).
 * Updates run, assignments, and card build_state so the UI reflects reality.
 *
 * O10.6: Single-build lock — stale runs block new builds; this clears them.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";

const STALE_RUN_MINUTES = parseInt(
  process.env.DOSSIER_STALE_RUN_MINUTES ?? "0",
  10
);
const STALE_RUN_MS = STALE_RUN_MINUTES * 60 * 1000;

/**
 * A run stays "queued" only between insert and dispatch, which takes seconds in normal flow.
 * A queued run older than this was abandoned (crash or early failure) and must not block new builds.
 */
export const QUEUED_RUN_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Marks queued runs older than QUEUED_RUN_TIMEOUT_MS as failed.
 * Runs in the single-build lock (queued or running) block new builds, so abandoned queued runs must be cleared.
 */
export async function abandonStaleQueuedRuns(
  db: DbAdapter,
  projectId: string,
  nowMs: number = Date.now()
): Promise<number> {
  const queuedRuns = await listOrchestrationRunsByProject(db, projectId, {
    status: "queued",
    limit: 50,
  });

  let abandoned = 0;
  for (const run of queuedRuns) {
    const createdAt = (run as { created_at?: string }).created_at;
    if (!createdAt) continue;
    const createdMs = new Date(createdAt).getTime();
    if (Number.isNaN(createdMs) || nowMs - createdMs <= QUEUED_RUN_TIMEOUT_MS) continue;

    await db.updateOrchestrationRun((run as { id: string }).id, {
      status: "failed",
      ended_at: new Date(nowMs).toISOString(),
    });
    abandoned++;
  }
  return abandoned;
}

export async function recoverStaleRuns(
  db: DbAdapter,
  projectId: string
): Promise<number> {
  // 0 = disabled: no automatic timeout for execution runs
  if (STALE_RUN_MINUTES === 0) return 0;

  const runningRuns = await listOrchestrationRunsByProject(db, projectId, {
    status: "running",
    limit: 10,
  });

  let recovered = 0;
  for (const run of runningRuns) {
    const startedAt = (run as { started_at?: string }).started_at;
    const createdAt = (run as { created_at?: string }).created_at;
    const ts = startedAt ?? createdAt;
    if (!ts || Date.now() - new Date(ts).getTime() <= STALE_RUN_MS) continue;

    const runId = (run as { id: string }).id;

    // Update assignments and cards first so UI reflects failed state
    const assignments = await getCardAssignmentsByRun(db, runId);
    for (const a of assignments) {
      const assignmentId = (a as { id: string }).id;
      const cardId = (a as { card_id: string }).card_id;
      const status = (a as { status?: string }).status ?? "";

      // Only update non-terminal assignments (running, queued)
      if (status !== "completed" && status !== "failed" && status !== "blocked") {
        await db.updateCardAssignment(assignmentId, { status: "failed" });
        await db.updateCard(cardId, {
          build_state: "failed",
          last_build_error: `Build timed out or agent stopped (recovered after ${STALE_RUN_MINUTES}+ min)`,
        });
      }
    }

    await db.updateOrchestrationRun(runId, {
      status: "failed",
      ended_at: new Date().toISOString(),
    });
    recovered++;
  }

  return recovered;
}
