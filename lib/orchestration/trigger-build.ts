/**
 * Full build trigger: create run, create assignments, dispatch.
 * Orchestrates the full lifecycle for Build button and Build All.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { createRun } from "./create-run";
import { createAssignment } from "./create-assignment";
import { dispatchAssignment } from "./dispatch";
import { logEvent } from "./event-logger";
import { ensureClone, createFeatureBranch } from "./repo-manager";
import {
  getCardById,
  getCardIdsByWorkflow,
  getCardPlannedFiles,
  getProject,
} from "@/lib/db/queries";
import { listOrchestrationRunsByProject } from "@/lib/db/queries/orchestration";
import { recoverStaleRuns, abandonStaleQueuedRuns } from "./recover-stale-runs";

/** Error text SQLite reports when the one-active-run-per-project partial unique index rejects an insert. */
const ACTIVE_RUN_CONFLICT_MARKER = "UNIQUE constraint failed: orchestration_run.project_id";

function buildInProgressResult(): TriggerBuildResult {
  return {
    success: false,
    error: "Build in progress",
    validationErrors: ["A build is already running for this project. Wait for it to complete."],
    outcomeType: "error",
    message: "A build is already running for this project. Wait for it to complete.",
  };
}

/** A project has an active run when a run is queued (not yet dispatched) or running. */
async function hasActiveRun(db: DbAdapter, projectId: string): Promise<boolean> {
  for (const status of ["running", "queued"] as const) {
    const runs = await listOrchestrationRunsByProject(db, projectId, { status, limit: 1 });
    if (runs.length > 0) return true;
  }
  return false;
}

export interface TriggerBuildInput {
  project_id: string;
  scope: "workflow" | "card";
  workflow_id?: string | null;
  card_id?: string | null;
  trigger_type: "card" | "workflow" | "manual";
  initiated_by: string;
}

export interface TriggerBuildResult {
  success: boolean;
  runId?: string;
  assignmentIds?: string[];
  error?: string;
  validationErrors?: string[];
  outcomeType?: "success" | "error" | "decision_required";
  message?: string;
}

/**
 * Triggers a full build: creates run, assignments for each card, dispatches each.
 * Enforces single-build lock: rejects if any run with status=running exists for project.
 */
export async function triggerBuild(
  db: DbAdapter,
  input: TriggerBuildInput
): Promise<TriggerBuildResult> {
  // O10.6: Single-build lock — strategy-mandated safety
  // Optionally recover runs stuck in "running" (set DOSSIER_STALE_RUN_MINUTES > 0).
  await recoverStaleRuns(db, input.project_id);
  await abandonStaleQueuedRuns(db, input.project_id);
  if (await hasActiveRun(db, input.project_id)) {
    return buildInProgressResult();
  }

  const project = await getProject(db, input.project_id);
  if (!project) {
    return {
      success: false,
      error: "Project not found",
      outcomeType: "error",
      message: "Project not found.",
    };
  }

  const repoUrl = (project as { repo_url?: string }).repo_url;
  const baseBranch =
    (project as { default_branch?: string }).default_branch ?? "main";

  if (!repoUrl || repoUrl.includes("placeholder")) {
    return {
      success: false,
      error: "No repository connected",
      validationErrors: [
        "Connect a GitHub repository in the project settings before triggering a build.",
      ],
      outcomeType: "error",
      message: "No repository connected. Connect a GitHub repository in project settings.",
    };
  }

  const cardIds =
    input.scope === "card" && input.card_id
      ? [input.card_id]
      : input.scope === "workflow" && input.workflow_id
        ? await getCardIdsByWorkflow(db, input.workflow_id)
        : [];

  if (cardIds.length === 0) {
    return {
      success: false,
      validationErrors: ["No cards in scope"],
      outcomeType: "error",
      message: "No cards in scope for this build.",
    };
  }

  const cardsWithoutFinalized: string[] = [];
  for (const cardId of cardIds) {
    const card = await getCardById(db, cardId);
    const finalizedAt = (card as { finalized_at?: string | null } | null)?.finalized_at;
    if (!finalizedAt) {
      cardsWithoutFinalized.push(cardId);
    }
  }
  if (cardsWithoutFinalized.length > 0) {
    return {
      success: false,
      error: "Card(s) not approved",
      validationErrors: [
        "Build requires approved cards. Approve each card (review context and confirm) before triggering build.",
        ...(cardsWithoutFinalized.length <= 3
          ? [`Cards not approved: ${cardsWithoutFinalized.join(", ")}`]
          : [`${cardsWithoutFinalized.length} cards not approved`]),
      ],
      outcomeType: "decision_required",
      message:
        cardsWithoutFinalized.length <= 3
          ? `Approval required before build. Cards: ${cardsWithoutFinalized.join(", ")}`
          : `Approval required before build for ${cardsWithoutFinalized.length} cards.`,
    };
  }

  // Clone repo for every build so the agent always has a valid cwd (worktree_path).
  // Without this, multi-card builds left worktree_path null → agent ran in Dossier app root → exit 1.
  const cloneResult = ensureClone(input.project_id, repoUrl, null, baseBranch);
  if (!cloneResult.success) {
    return {
      success: false,
      error: cloneResult.error,
      validationErrors: [cloneResult.error ?? "Repo clone failed"],
      outcomeType: "error",
      message: cloneResult.error ?? "Repository clone failed.",
    };
  }
  const clonePath = cloneResult.clonePath ?? null;

  // The clone resolves the branch the remote actually has (e.g. master when the project was saved as main).
  // Build from that branch and correct the project record so later steps agree.
  const resolvedBaseBranch = cloneResult.baseBranch ?? baseBranch;
  if (resolvedBaseBranch !== baseBranch) {
    await db.updateProject(input.project_id, { default_branch: resolvedBaseBranch });
  }

  // Code file creation (planned files) is optional — all finalized cards are buildable
  const runResult = await createRun(db, {
    project_id: input.project_id,
    scope: input.scope,
    workflow_id: input.workflow_id ?? null,
    card_id: input.card_id ?? null,
    trigger_type: input.trigger_type,
    initiated_by: input.initiated_by,
    repo_url: repoUrl,
    base_branch: resolvedBaseBranch,
    run_input_snapshot: {
      card_ids: cardIds,
      card_id: input.card_id ?? null,
      workflow_id: input.workflow_id ?? null,
      triggered_at: new Date().toISOString(),
    },
    worktree_root: clonePath,
  });

  if (!runResult.success) {
    // A concurrent trigger inserted an active run between our check and insert: the index rejected this one.
    if (runResult.error?.includes(ACTIVE_RUN_CONFLICT_MARKER)) {
      return buildInProgressResult();
    }
    return {
      success: false,
      error: runResult.error,
      validationErrors: runResult.validationErrors,
      outcomeType: "error",
      message: runResult.error ?? "Failed to initialize build run.",
    };
  }

  const runId = runResult.runId!;

  await logEvent(db, {
    project_id: input.project_id,
    run_id: runId,
    event_type: "run_initialized",
    actor: input.initiated_by,
    payload: { scope: input.scope, card_ids: cardIds },
  });

  const assignmentIds: string[] = [];
  const assignmentErrors: string[] = [];

  for (const cardId of cardIds) {
    const plannedFiles = await getCardPlannedFiles(db, cardId);
    const allowedPaths = plannedFiles.map(
      (f) => (f as { logical_file_name: string }).logical_file_name
    );

    await db.updateCard(cardId, { build_state: "queued" });
    const runIdShort = runId.slice(0, 8);
    const cardIdShort = cardId.slice(0, 8);
    const featureBranch = `feat/run-${runIdShort}-${cardIdShort}`;

    let worktreePath: string | null = null;
    if (clonePath) {
      const branchResult = createFeatureBranch(
        clonePath,
        featureBranch,
        resolvedBaseBranch
      );
      if (!branchResult.success) {
        // No agent was dispatched for this run: close it so it does not block future builds.
        if (assignmentIds.length === 0) {
          await db.updateOrchestrationRun(runId, {
            status: "failed",
            ended_at: new Date().toISOString(),
          });
        }
        return {
          success: false,
          error: branchResult.error,
          validationErrors: [branchResult.error ?? "Create branch failed"],
          outcomeType: "error",
          message: branchResult.error ?? "Failed to create feature branch.",
        };
      }
      worktreePath = clonePath;
    }

    const assignResult = await createAssignment(db, {
      run_id: runId,
      card_id: cardId,
      agent_role: "coder",
      agent_profile: "default",
      feature_branch: featureBranch,
      worktree_path: worktreePath,
      allowed_paths: allowedPaths,
      forbidden_paths: null,
      assignment_input_snapshot: {
        card_id: cardId,
        planned_file_ids: plannedFiles.map((f) => (f as { id: string }).id),
      },
    });

    if (!assignResult.success) {
      const err = assignResult.error ?? "unknown error";
      assignmentErrors.push(`Card ${cardId}: failed to create assignment (${err})`);
      await db.updateCard(cardId, {
        build_state: "failed",
        last_build_error: `Failed to create assignment: ${err}`,
      });
      continue;
    }

    if (assignResult.assignmentId) {
      const dispatchResult = await dispatchAssignment(db, {
        assignment_id: assignResult.assignmentId,
        actor: input.initiated_by,
      });

      if (!dispatchResult.success) {
        const err = dispatchResult.error ?? "unknown error";
        assignmentErrors.push(`Card ${cardId}: dispatch failed (${err})`);
        await db.updateCard(cardId, {
          build_state: "failed",
          last_build_error: `Dispatch failed: ${err}`,
        });
        await db.updateCardAssignment(assignResult.assignmentId, { status: "failed" });
      } else {
        assignmentIds.push(assignResult.assignmentId);
      }
    }
  }

  if (assignmentErrors.length > 0) {
    const uniqueErrors = Array.from(new Set(assignmentErrors));
    const message = `Build could not start for all cards: ${uniqueErrors.join("; ")}`;
    if (assignmentIds.length === 0) {
      await db.updateOrchestrationRun(runId, {
        status: "failed",
        ended_at: new Date().toISOString(),
      });
    }
    return {
      success: false,
      runId,
      assignmentIds,
      error: "Build dispatch failed",
      validationErrors: uniqueErrors,
      outcomeType: "error",
      message,
    };
  }

  // No agent was actually dispatched (e.g. createAssignment returned no id, or all dispatches failed without pushing)
  if (assignmentIds.length === 0) {
    await db.updateOrchestrationRun(runId, {
      status: "failed",
      ended_at: new Date().toISOString(),
    });
    return {
      success: false,
      runId,
      assignmentIds: [],
      error: "No agent was dispatched",
      outcomeType: "error",
      message: "Build could not start — no agent was dispatched.",
    };
  }

  return {
    success: true,
    runId,
    assignmentIds,
    outcomeType: "success",
    message: `Build started for ${assignmentIds.length} assignment${assignmentIds.length === 1 ? "" : "s"}.`,
  };
}
