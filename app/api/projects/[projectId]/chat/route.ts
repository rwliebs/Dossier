import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/db/map-snapshot";
import { claudePlanningRequest } from "@/lib/llm/claude-client";
import { parsePlanningResponse } from "@/lib/llm/parse-planning-response";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import { pipelineApply } from "@/lib/db/mutations";
import {
  buildConversationMessages,
  buildPlanningSystemPrompt,
  buildPlanningUserMessage,
  buildScaffoldSystemPrompt,
  buildScaffoldUserMessage,
  formatConversationTranscript,
} from "@/lib/llm/planning-prompt";
import { runPopulateWorkflow } from "@/lib/llm/run-populate-workflow";
import { runFinalizeMultiStep } from "@/lib/llm/run-finalize-multistep";
import { getArtifactsByProject, getProject } from "@/lib/db/queries";
import { parseRootFoldersFromArchitecturalSummary } from "@/lib/orchestration/parse-root-folders";
import { parseScaffoldFiles } from "@/lib/orchestration/parse-scaffold-files";
import {
  ensureClone,
  createRootFoldersInRepo,
  writeScaffoldFilesToRepo,
  pushBranch,
} from "@/lib/orchestration/repo-manager";
import { getRepoContextForPrompt } from "@/lib/orchestration/repo-reader";
import { getWorkflowActivities } from "@/lib/schemas/planning-state";
import { json } from "@/lib/api/response-helpers";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatRequestSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";

// Only trigger auto-populate when user explicitly requests workflow population.
// Avoid broad patterns: "fill in" and "add cards" match common unrelated phrases.
const POPULATE_INTENT = /\b(populate|add activities|activities and cards|functionality cards)\b/i;

export interface ChatResponse {
  status: "success" | "error";
  responseType: "clarification" | "actions" | "mixed";
  message?: string;
  applied: number;
  workflow_ids_created: string[];
  workflow_id?: string;
  artifacts_created?: number;
  errors?: Array<{ action_type: string; reason: string }>;
}

/**
 * POST /api/projects/[projectId]/chat
 *
 * Unified planning chat endpoint.
 * - mode=finalize → run finalize multi-step (context artifacts).
 * - mode=populate + workflow_id → add activities/cards to one workflow.
 * - mode=scaffold → always scaffold prompt (updateProject + createWorkflow only); only those actions are applied.
 * - No mode or other → empty map → scaffold prompt; map has structure → full planning prompt (all action types).
 *
 * Actions are validated and applied directly to the DB.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!PLANNING_LLM) {
    return json(
      { status: "error", error: "Planning LLM is disabled" },
      503,
    );
  }

  const { projectId } = await params;
  if (!projectId) {
    return json({ status: "error", message: "Project ID required" }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body" }, 400);
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(
      { status: "error", message: "Invalid request body", details: zodErrorDetails(parsed.error) },
      400,
    );
  }

  const { message, mock_response, mode, workflow_id, conversationHistory } = parsed.data;

  let db;
  try {
    db = getDb();
  } catch {
    return json({ status: "error", message: "Database not configured" }, 500);
  }

  const state = await fetchMapSnapshot(db, projectId);
  if (!state) {
    return json({ status: "error", message: "Project not found" }, 404);
  }

  const noopEmit = () => {};

  if (mode === "finalize") {
    try {
      const finalizeResult = await runFinalizeMultiStep({
        db,
        projectId,
        state,
        emit: noopEmit,
        mockResponse: mock_response,
      });
      if (finalizeResult.failedDocs.length > 0 || finalizeResult.artifactsCreated < finalizeResult.totalDocs) {
        const failed =
          finalizeResult.failedDocs.length > 0
            ? finalizeResult.failedDocs.join(", ")
            : "unknown";
        return json(
          {
            status: "error",
            message: `Finalize failed: required context documents were not created (${failed}).`,
            artifacts_created: finalizeResult.artifactsCreated,
            failed_docs: finalizeResult.failedDocs,
          },
          502,
        );
      }

      const artifacts = await getArtifactsByProject(db, projectId);
      const archSummary = artifacts.find(
        (a: Record<string, unknown>) => (a.name as string) === "architectural-summary"
      );
      const content = (archSummary as { content?: string } | undefined)?.content ?? "";
      const rootFolders = parseRootFoldersFromArchitecturalSummary(content);

      const project = await getProject(db, projectId);
      const repoUrl = (project as { repo_url?: string })?.repo_url;
      const baseBranch = (project as { default_branch?: string })?.default_branch ?? "main";
      if (repoUrl && !repoUrl.includes("placeholder")) {
        const cloneResult = ensureClone(projectId, repoUrl, null, baseBranch);
        if (cloneResult.success && cloneResult.clonePath) {
          const clonePath = cloneResult.clonePath;
          if (rootFolders.length > 0) {
            const folderResult = createRootFoldersInRepo(clonePath, rootFolders, baseBranch);
            if (!folderResult.success) {
              console.warn("[chat] Root folder creation failed:", folderResult.error);
            }
          }
          const scaffoldArtifact = artifacts.find(
            (a: Record<string, unknown>) => (a.name as string) === "project-scaffold"
          );
          const scaffoldContent = (scaffoldArtifact as { content?: string } | undefined)?.content ?? "";
          const scaffoldFiles = parseScaffoldFiles(scaffoldContent);
          if (scaffoldFiles.length > 0) {
            const scaffoldResult = writeScaffoldFilesToRepo(clonePath, scaffoldFiles, baseBranch);
            if (!scaffoldResult.success) {
              console.warn("[chat] Project scaffold write failed:", scaffoldResult.error);
            }
          }
          const pushResult = pushBranch(projectId, baseBranch, repoUrl);
          if (!pushResult.success) {
            console.warn(
              "[chat] Push main (directory structure) to origin failed:",
              pushResult.error
            );
          }
        }
      } else if (!repoUrl || repoUrl.includes("placeholder")) {
        console.warn("[chat] No repo connected; skipping root folder and scaffold creation");
      }

      const now = new Date().toISOString();
      await db.updateProject(projectId, { finalized_at: now });
      return json({
        status: "success",
        responseType: "actions" as const,
        message: `Created ${finalizeResult.artifactsCreated} context artifact(s).`,
        applied: finalizeResult.artifactsCreated,
        workflow_ids_created: [],
        artifacts_created: finalizeResult.artifactsCreated,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Finalize failed";
      console.error("[chat] Finalize error:", msg);
      return json({ status: "error", message: msg }, 502);
    }
  }

  if (mode === "populate" && workflow_id) {
    const workflow = Array.from(state.workflows.values()).find((w) => w.id === workflow_id);
    if (!workflow) {
      return json({ status: "error", message: "Workflow not found" }, 404);
    }
    try {
      const result = await runPopulateWorkflow({
        db,
        projectId,
        workflowId: workflow_id,
        workflowTitle: workflow.title,
        workflowDescription: workflow.description ?? null,
        userRequest: message,
        state,
        emit: noopEmit,
        mockResponse: mock_response,
      });
      return json({
        status: "success",
        responseType: "actions" as const,
        message: result.actionCount > 0 ? `Added ${result.actionCount} activity/card action(s).` : "No actions generated.",
        applied: result.actionCount,
        workflow_ids_created: [],
        workflow_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Populate failed";
      console.error("[chat] Populate error:", msg);
      return json({ status: "error", message: msg }, 502);
    }
  }

  // When workflows exist but have no activities, and user asks to populate — route to populate per workflow
  const emptyWorkflows = Array.from(state.workflows.values()).filter(
    (wf) => getWorkflowActivities(state, wf.id).length === 0,
  );
  if (
    !mode &&
    emptyWorkflows.length > 0 &&
    POPULATE_INTENT.test(message)
  ) {
    let totalApplied = 0;
    let currentState = state;
    for (const workflow of emptyWorkflows) {
      try {
        const result = await runPopulateWorkflow({
          db,
          projectId,
          workflowId: workflow.id,
          workflowTitle: workflow.title,
          workflowDescription: workflow.description ?? null,
          userRequest: message,
          state: currentState,
          emit: noopEmit,
          mockResponse: mock_response,
        });
        totalApplied += result.actionCount;
        if (result.actionCount > 0) {
          const fresh = await fetchMapSnapshot(db, projectId);
          if (fresh) currentState = fresh;
        }
      } catch (err) {
        console.error("[chat] Populate workflow error:", err);
      }
    }
    return json({
      status: "success",
      responseType: "actions" as const,
      message:
        totalApplied > 0
          ? `Added activities and functionality cards to ${emptyWorkflows.length} workflow(s).`
          : "No activities or cards were generated. Try adding more context.",
      applied: totalApplied,
      workflow_ids_created: [],
    });
  }

  const linkedArtifacts = getLinkedArtifactsForPrompt(state, 5);
  const hasStructure = state.workflows.size >= 1;

  const useScaffold = mode === "scaffold" || !hasStructure;
  let repoContext: string | null = null;
  let planningCwd: string | undefined;
  const repoUrl = (state.project as { repo_url?: string | null }).repo_url;
  const baseBranch =
    (state.project as { default_branch?: string }).default_branch ?? "main";
  if (repoUrl && typeof repoUrl === "string" && !repoUrl.includes("placeholder")) {
    const cloneResult = ensureClone(projectId, repoUrl, null, baseBranch);
    if (cloneResult.success && cloneResult.clonePath) {
      planningCwd = cloneResult.clonePath;
      if (useScaffold) {
        repoContext = getRepoContextForPrompt(cloneResult.clonePath, baseBranch);
      }
    }
  }

  let systemPrompt: string;
  let contextMessage: string;

  if (mode === "scaffold") {
    systemPrompt = buildScaffoldSystemPrompt();
    contextMessage = buildScaffoldUserMessage(message, state, linkedArtifacts, repoContext);
  } else if (hasStructure) {
    systemPrompt = buildPlanningSystemPrompt();
    contextMessage = buildPlanningUserMessage(message, state, linkedArtifacts);
  } else {
    systemPrompt = buildScaffoldSystemPrompt();
    contextMessage = buildScaffoldUserMessage(message, state, linkedArtifacts, repoContext);
  }

  // Prior chat turns from the UI, so follow-ups ("now mark those done") resolve against them.
  const userMessage =
    conversationHistory.length > 0
      ? formatConversationTranscript(
          buildConversationMessages(message, state, linkedArtifacts, conversationHistory, contextMessage),
        )
      : contextMessage;

  // --- LLM call ---
  const useMock =
    process.env.PLANNING_MOCK_ALLOWED === "1" &&
    typeof mock_response === "string" &&
    mock_response.length > 0;

  let llmText: string;

  if (useMock) {
    llmText = mock_response!;
  } else {
    try {
      const llmResponse = await claudePlanningRequest({
        userRequest: message,
        mapSnapshot: state,
        linkedArtifacts,
      }, {
        systemPromptOverride: systemPrompt,
        userMessageOverride: userMessage,
        ...(planningCwd && { cwd: planningCwd }),
      });
      llmText = llmResponse.text;
    } catch (e) {
      const err = e instanceof Error ? e.message : "Planning service error";
      console.error("[chat] Planning LLM error:", err);

      let userMsg: string;
      if (err.includes("ANTHROPIC_API_KEY")) {
        userMsg = "Planning LLM not configured. Set ANTHROPIC_API_KEY.";
      } else if (err.includes("timed out") || err.includes("aborted")) {
        userMsg = "Planning request timed out. Try again.";
      } else if (err.includes("credit balance") || err.includes("billing")) {
        userMsg = "Anthropic API credit balance is too low.";
      } else if (err.includes("401") || err.includes("authentication")) {
        userMsg = "Anthropic API key is invalid.";
      } else if (err.includes("429") || err.includes("rate limit")) {
        userMsg = "Rate limit exceeded. Please try again in a moment.";
      } else {
        userMsg = "Planning service temporarily unavailable.";
      }
      return json({ status: "error", message: userMsg }, 502);
    }
  }

  // --- Parse ---
  const parseResult = parsePlanningResponse(llmText);

  if (parseResult.responseType === "clarification" && parseResult.actions.length === 0) {
    const response: ChatResponse = {
      status: "success",
      responseType: "clarification",
      message: parseResult.message,
      applied: 0,
      workflow_ids_created: [],
    };
    return json(response);
  }

  // --- Validate ---
  const projectIdValue = state.project.id;
  const actionsWithProjectId = parseResult.actions.map((a) => {
    const targetRef = a.target_ref as Record<string, unknown>;
    if (a.action_type === "createWorkflow" && !targetRef.project_id) {
      targetRef.project_id = projectIdValue;
    }
    return {
      ...a,
      project_id: a.project_id || projectIdValue,
      target_ref: targetRef,
    };
  });

  const { valid, rejected } = validatePlanningOutput(actionsWithProjectId, state);

  if (rejected.length > 0) {
    console.error(
      `[chat] ${rejected.length} actions rejected:`,
      rejected.map((r) => `${r.action.action_type}: ${r.reason}`),
    );
  }

  // When mode is scaffold, only apply updateProject and createWorkflow (ignore any other types from LLM)
  const scaffoldOnly = mode === "scaffold";
  const toApply = scaffoldOnly
    ? valid.filter((a) => a.action_type === "updateProject" || a.action_type === "createWorkflow")
    : valid;

  // --- Apply ---
  let applied = 0;
  const workflowIdsCreated: string[] = [];

  if (toApply.length > 0) {
    const applyResult = await pipelineApply(db, projectId, toApply);
    if (applyResult.failedAt !== undefined) {
      console.error("[chat] pipelineApply failed at index", applyResult.failedAt, applyResult.rejectionReason);
    }
    applied = applyResult.applied;

    // Collect created workflow IDs for scaffold → populate flow
    const finalState = await fetchMapSnapshot(db, projectId);
    if (finalState) {
      for (const wf of finalState.workflows.values()) {
        if (!state.workflows.has(wf.id)) {
          workflowIdsCreated.push(wf.id);
        }
      }
    }
  }

  const response: ChatResponse = {
    status: valid.length > 0 || rejected.length === 0 ? "success" : "error",
    responseType: parseResult.responseType,
    message: parseResult.message,
    applied,
    workflow_ids_created: workflowIdsCreated,
    errors:
      rejected.length > 0
        ? rejected.map((r) => ({ action_type: r.action.action_type, reason: r.reason }))
        : undefined,
  };

  return json(response);
}
