/**
 * O9: Integration tests for trigger-build.
 * - Single-build lock (O10.6)
 * - Full trigger flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { triggerBuild } from "@/lib/orchestration/trigger-build";
import * as orchestrationQueries from "@/lib/db/queries/orchestration";
import * as queries from "@/lib/db/queries";
import * as createRunModule from "@/lib/orchestration/create-run";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

vi.mock("@/lib/orchestration/create-run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orchestration/create-run")>();
  return { ...actual, createRun: vi.fn(actual.createRun) };
});

const projectId = "11111111-1111-1111-1111-111111111111";
const workflowId = "22222222-2222-2222-2222-222222222222";
const cardId = "33333333-3333-3333-3333-333333333333";

const mockPolicy = {
  id: "55555555-5555-5555-5555-555555555555",
  project_id: projectId,
  required_checks: ["lint"],
  protected_paths: [],
  forbidden_paths: [],
  dependency_policy: {},
  security_policy: {},
  architecture_policy: {},
  approval_policy: {},
  updated_at: new Date().toISOString(),
};

vi.mock("@/lib/db/queries/orchestration", () => ({
  listOrchestrationRunsByProject: vi.fn(),
  getSystemPolicyProfileByProject: vi.fn(),
  getCardAssignment: vi.fn(),
  getOrchestrationRun: vi.fn(),
  getCardAssignmentsByRun: vi.fn(),
  updateCardAssignmentStatus: vi.fn(),
  getAgentExecutionsByAssignment: vi.fn(),
  getRunChecksByRun: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getProject: vi.fn(),
  getCardIdsByWorkflow: vi.fn(),
  getCardPlannedFiles: vi.fn(),
  getCardById: vi.fn(),
  getCardRequirements: vi.fn(),
  getCardContextArtifacts: vi.fn().mockResolvedValue([]),
  getArtifactById: vi.fn(),
}));

vi.mock("@/lib/orchestration/repo-manager", () => ({
  ensureClone: vi.fn().mockReturnValue({
    success: true,
    clonePath: "/tmp/dossier/repos/test-project",
  }),
  createFeatureBranch: vi.fn().mockReturnValue({ success: true }),
}));

vi.mock("@/lib/orchestration/agentic-flow-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/orchestration/agentic-flow-client")>();
  return {
    ...original,
    createAgenticFlowClient: vi.fn(() => ({
      dispatch: vi.fn().mockResolvedValue({ success: true, execution_id: `test-exec-${Date.now()}` }),
      status: vi.fn().mockResolvedValue({ success: true, status: { status: "completed" } }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    })),
  };
});

describe("Trigger build - single-build lock (O10.6)", () => {
  beforeEach(() => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(orchestrationQueries.getSystemPolicyProfileByProject).mockResolvedValue(
      mockPolicy as never
    );
    vi.mocked(queries.getProject).mockResolvedValue({
      id: projectId,
      repo_url: "https://github.com/test/repo",
      default_branch: "main",
    } as never);
    vi.mocked(queries.getCardIdsByWorkflow).mockResolvedValue([cardId]);
    vi.mocked(queries.getCardById).mockResolvedValue({
      id: cardId,
      finalized_at: new Date().toISOString(),
    } as never);
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([
      { id: "pf-1", status: "approved", logical_file_name: "src/index.ts" },
    ] as never);
  });

  it("rejects when a build is already running", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([
      { id: "run-1", project_id: projectId, status: "running" },
    ] as never);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Build in progress");
    expect(result.validationErrors).toContain(
      "A build is already running for this project. Wait for it to complete."
    );
  });

  it("rejects when a run is queued but not yet dispatched", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockImplementation(
      async (_db, _projectId, options) =>
        options?.status === "queued"
          ? ([{ id: "run-q", project_id: projectId, status: "queued", created_at: new Date().toISOString() }] as never)
          : ([] as never)
    );

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Build in progress");
  });

  it("clears an abandoned queued run older than the timeout and proceeds", async () => {
    const oldRun = {
      id: "run-abandoned",
      project_id: projectId,
      status: "queued",
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    // First list call is the stale-queued sweep; later calls (active-run check) see nothing.
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject)
      .mockResolvedValueOnce([oldRun] as never)
      .mockResolvedValue([] as never);
    const updateOrchestrationRun = vi.fn().mockResolvedValue(undefined);

    const mockDb = createMockDbAdapter({ updateOrchestrationRun });
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(updateOrchestrationRun).toHaveBeenCalledWith(
      "run-abandoned",
      expect.objectContaining({ status: "failed" })
    );
    expect(result.error).not.toBe("Build in progress");
  });

  it("reports build-in-progress when the database rejects a second active run", async () => {
    // Simulate the race: another trigger inserted an active run after our check passed.
    vi.mocked(createRunModule.createRun).mockResolvedValueOnce({
      success: false,
      error: "UNIQUE constraint failed: orchestration_run.project_id",
    } as never);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Build in progress");
  });

  it("builds from the resolved clone branch and corrects the project default branch", async () => {
    const repoManager = await import("@/lib/orchestration/repo-manager");
    vi.mocked(repoManager.ensureClone).mockReturnValueOnce({
      success: true,
      clonePath: "/tmp/dossier/repos/test-project",
      baseBranch: "master",
    } as never);
    vi.mocked(createRunModule.createRun).mockResolvedValueOnce({
      success: true,
      runId: "run-master",
    } as never);
    const updateProject = vi.fn().mockResolvedValue(undefined);

    const mockDb = createMockDbAdapter({ updateProject });
    await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(updateProject).toHaveBeenCalledWith(projectId, { default_branch: "master" });
    expect(vi.mocked(createRunModule.createRun)).toHaveBeenLastCalledWith(
      mockDb,
      expect.objectContaining({ base_branch: "master" })
    );
  });

  it("closes the run when the feature branch cannot be created, so it does not block later builds", async () => {
    vi.mocked(createRunModule.createRun).mockResolvedValueOnce({
      success: true,
      runId: "run-branch-fail",
    } as never);
    const repoManager = await import("@/lib/orchestration/repo-manager");
    vi.mocked(repoManager.createFeatureBranch).mockReturnValueOnce({
      success: false,
      error: "origin/main not found",
    } as never);
    const updateOrchestrationRun = vi.fn().mockResolvedValue(undefined);

    const mockDb = createMockDbAdapter({ updateOrchestrationRun });
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(updateOrchestrationRun).toHaveBeenCalledWith(
      "run-branch-fail",
      expect.objectContaining({ status: "failed" })
    );
  });

  it("does not reject with build-in-progress when no run is running", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    // Lock check passes: we should not get "Build in progress"
    expect(result.error).not.toBe("Build in progress");
    expect(result.validationErrors).not.toContain(
      "A build is already running for this project. Wait for it to complete."
    );
  });

  it("rejects when no repository is connected", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(queries.getProject).mockResolvedValue({
      id: projectId,
      repo_url: null,
      default_branch: "main",
    } as never);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "card",
      card_id: cardId,
      trigger_type: "card",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No repository connected");
    expect(result.validationErrors).toContain(
      "Connect a GitHub repository in the project settings before triggering a build."
    );
  });

  it("rejects when card(s) lack finalized_at", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(queries.getCardById).mockResolvedValue({
      id: cardId,
      finalized_at: null,
    } as never);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "card",
      card_id: cardId,
      trigger_type: "card",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Card(s) not approved");
    expect(result.validationErrors).toContain(
      "Build requires approved cards. Approve each card (review context and confirm) before triggering build."
    );
  });

  it("rejects when card has no approved planned files", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(queries.getCardById).mockResolvedValue({
      id: cardId,
      finalized_at: new Date().toISOString(),
    } as never);
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([]);

    const mockDb = createMockDbAdapter({});
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "card",
      card_id: cardId,
      trigger_type: "card",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.validationErrors?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
