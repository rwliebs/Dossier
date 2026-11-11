import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import type { DbAdapter } from "@/lib/db/adapter";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/db/map-snapshot";
import {
  buildScaffoldSystemPrompt,
  buildScaffoldUserMessage,
} from "@/lib/llm/planning-prompt";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatStreamRequestSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";
import { sseEvent } from "@/lib/api/sse";
import { runLlmSubStep, type Emitter } from "@/lib/llm/run-llm-substep";
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

/**
 * POST /api/projects/[projectId]/chat/stream
 * Streaming planning endpoint. Returns SSE with actions as they are parsed and applied.
 * Supports scaffold, populate, and finalize modes.
 *
 * Finalize mode runs multiple LLM sub-steps (project docs + per-card tests)
 * to avoid timeout on large projects.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!PLANNING_LLM) {
    return new Response(
      JSON.stringify({
        error: "Planning LLM is disabled",
        message: "Set NEXT_PUBLIC_PLANNING_LLM_ENABLED=true to enable.",
      }),
      { status: 503 },
    );
  }

  const { projectId } = await params;
  if (!projectId) {
    return new Response(JSON.stringify({ error: "Project ID required" }), {
      status: 400,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const parsed = chatStreamRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body", details: zodErrorDetails(parsed.error) }),
      { status: 400 },
    );
  }

  const { message, mode, workflow_id, mock_response } = parsed.data;

  let db: DbAdapter;
  try {
    db = getDb();
  } catch {
    return new Response(
      JSON.stringify({ error: "Database not configured" }),
      { status: 500 },
    );
  }

  const state = await fetchMapSnapshot(db, projectId);
  if (!state) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit: Emitter = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          closed = true;
        }
      };

      try {
        if (mode === "finalize") {
          const finalizeResult = await runFinalizeMultiStep({
            db,
            projectId,
            state,
            emit,
            mockResponse: mock_response,
          });
          if (finalizeResult.failedDocs.length > 0 || finalizeResult.artifactsCreated < finalizeResult.totalDocs) {
            emit("error", {
              reason: `Finalize failed: required context documents were not created (${finalizeResult.failedDocs.join(", ") || "unknown"}).`,
              artifacts_created: finalizeResult.artifactsCreated,
              failed_docs: finalizeResult.failedDocs,
            });
            emit("phase_complete", {
              responseType: "finalize_failed",
              artifacts_created: finalizeResult.artifactsCreated,
              failed_docs: finalizeResult.failedDocs,
            });
            emit("done", {});
            return;
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
              // Use the branch the remote actually has (e.g. master when saved as main) and correct the project record.
              const branch = cloneResult.baseBranch ?? baseBranch;
              if (branch !== baseBranch) {
                await db.updateProject(projectId, { default_branch: branch });
              }
              if (rootFolders.length > 0) {
                const folderResult = createRootFoldersInRepo(clonePath, rootFolders, branch);
                if (!folderResult.success) {
                  console.warn("[chat/stream] Root folder creation failed:", folderResult.error);
                }
              }
              const scaffoldArtifact = artifacts.find(
                (a: Record<string, unknown>) => (a.name as string) === "project-scaffold"
              );
              const scaffoldContent = (scaffoldArtifact as { content?: string } | undefined)?.content ?? "";
              const scaffoldFiles = parseScaffoldFiles(scaffoldContent);
              if (scaffoldFiles.length > 0) {
                const scaffoldResult = writeScaffoldFilesToRepo(clonePath, scaffoldFiles, branch);
                if (!scaffoldResult.success) {
                  console.warn("[chat/stream] Project scaffold write failed:", scaffoldResult.error);
                }
              }
              const pushResult = pushBranch(projectId, branch, repoUrl);
              if (!pushResult.success) {
                console.warn(
                  "[chat/stream] Push main (directory structure) to origin failed:",
                  pushResult.error
                );
              }
            }
          } else if (!repoUrl || repoUrl.includes("placeholder")) {
            console.warn("[chat/stream] No repo connected; skipping root folder and scaffold creation");
          }

          const now = new Date().toISOString();
          await db.updateProject(projectId, { finalized_at: now });

          emit("phase_complete", {
            responseType: "finalize_complete",
            artifacts_created: finalizeResult.artifactsCreated,
          });
          emit("done", {});
          return;
        }

        if (mode === "populate" && workflow_id) {
          const workflow = Array.from(state.workflows.values()).find((w) => w.id === workflow_id);
          if (!workflow) {
            emit("error", { reason: "Workflow not found" });
            emit("done", {});
            return;
          }
          await runPopulateWorkflow({
            db,
            projectId,
            workflowId: workflow_id,
            workflowTitle: workflow.title,
            workflowDescription: workflow.description ?? null,
            userRequest: message,
            state,
            emit,
            mockResponse: mock_response,
          });
          emit("phase_complete", {
            responseType: "populate_complete",
            workflow_id,
          });
          emit("done", {});
          return;
        }

        const linkedArtifacts = getLinkedArtifactsForPrompt(state, 3);
        let repoContext: string | null = null;
        let planningCwd: string | undefined;
        const repoUrl = (state.project as { repo_url?: string | null }).repo_url;
        const baseBranch =
          (state.project as { default_branch?: string }).default_branch ?? "main";
        if (repoUrl && typeof repoUrl === "string" && !repoUrl.includes("placeholder")) {
          const cloneResult = ensureClone(projectId, repoUrl, null, baseBranch);
          if (cloneResult.success && cloneResult.clonePath) {
            planningCwd = cloneResult.clonePath;
            repoContext = getRepoContextForPrompt(cloneResult.clonePath, cloneResult.baseBranch ?? baseBranch);
          }
        }
        const systemPrompt = buildScaffoldSystemPrompt();
        const userMessage = buildScaffoldUserMessage(
          message,
          state,
          linkedArtifacts,
          repoContext,
        );

        const result = await runLlmSubStep({
          db,
          projectId,
          systemPrompt,
          userMessage,
          state,
          emit,
          mockResponse: mock_response,
          ...(planningCwd && { cwd: planningCwd }),
        });

        if (mode === "scaffold") {
          const finalState = await fetchMapSnapshot(db, projectId);
          const workflowIds = finalState
            ? Array.from(finalState.workflows.values())
                .filter((w) => !state.workflows.has(w.id))
                .map((w) => w.id)
            : [];
          emit("phase_complete", {
            responseType: "scaffold_complete",
            workflow_ids: workflowIds,
          });
        }

        if (!mock_response && process.env.PLANNING_DEBUG === "1" && mode === "scaffold" && result.actionCount === 0) {
          console.log("[planning] scaffold produced 0 actions");
        }

        emit("done", {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        console.error("[chat/stream] Error:", msg);
        emit("error", { reason: msg });
      } finally {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
