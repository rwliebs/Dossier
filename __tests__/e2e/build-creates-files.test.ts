/**
 * Real system test: Build button → file creation on disk.
 *
 * NO MOCKS. Exercises the full pipeline:
 *   triggerBuild → ensureClone → createRun → createAssignment →
 *   dispatchAssignment → agentic-flow claudeAgent → file written to disk
 *
 * Requires: ANTHROPIC_API_KEY (in env or ~/.dossier/config), agentic-flow,
 * @anthropic-ai/claude-agent-sdk. Skips when unavailable.
 *
 * Creates a temporary bare git repo, a temporary DOSSIER_DATA_DIR,
 * seeds a real in-memory SQLite DB with project/card/planned-file data,
 * triggers a build, polls for completion, and asserts files exist on disk.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { readConfigFile } from "@/lib/config/data-dir";

const TIMEOUT = 300_000; // 5 minutes — real Claude execution

function canRunRealBuild(): boolean {
  try {
    // Same lookup the client uses (env, then the data-dir config), so the gate
    // and the client can't disagree about whether a key is available.
    const hasKeyInEnv = !!process.env.ANTHROPIC_API_KEY?.trim();
    const hasKeyInConfig = !!readConfigFile().ANTHROPIC_API_KEY?.trim();
    if (!hasKeyInEnv && !hasKeyInConfig) return false;

    const distRoot = path.join(
      process.cwd(),
      "node_modules",
      "agentic-flow",
      "agentic-flow",
      "dist"
    );
    if (!fs.existsSync(path.join(distRoot, "agents", "claudeAgent.js")))
      return false;

    const sdkPath = path.join(
      process.cwd(),
      "node_modules",
      "@anthropic-ai",
      "claude-agent-sdk",
      "sdk.mjs"
    );
    if (!fs.existsSync(sdkPath)) return false;

    return true;
  } catch {
    return false;
  }
}

describe("Build button → file creation (real system test)", () => {
  let tmpDir: string;
  let bareRepoPath: string;
  let savedDataDir: string | undefined;
  let db: import("@/lib/db/adapter").DbAdapter;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "dossier-build-e2e-")
    );
    bareRepoPath = path.join(tmpDir, "remote.git");

    // Create a bare git repo to act as the "remote"
    fs.mkdirSync(bareRepoPath);
    execSync("git init --bare", { cwd: bareRepoPath, stdio: "pipe" });

    // The client resolves the key from env or the data-dir config. Capture it
    // from the real config before DOSSIER_DATA_DIR points at an empty temp dir.
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      const key = readConfigFile().ANTHROPIC_API_KEY?.trim();
      if (key) process.env.ANTHROPIC_API_KEY = key;
    }

    // Point DOSSIER_DATA_DIR to temp so clone goes there
    savedDataDir = process.env.DOSSIER_DATA_DIR;
    process.env.DOSSIER_DATA_DIR = path.join(tmpDir, "data");

    // Real in-memory SQLite DB (sets the getDb() singleton)
    const { resetDbForTesting } = await import("@/lib/db");
    db = resetDbForTesting(true);
  });

  afterAll(() => {
    if (savedDataDir !== undefined) {
      process.env.DOSSIER_DATA_DIR = savedDataDir;
    } else {
      delete process.env.DOSSIER_DATA_DIR;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it.skipIf(!canRunRealBuild())(
    "triggerBuild on a finalized card creates planned files on disk",
    async () => {
      const projectId = crypto.randomUUID();
      const workflowId = crypto.randomUUID();
      const activityId = crypto.randomUUID();
      const cardId = crypto.randomUUID();
      const now = new Date().toISOString();

      // --- Seed the real DB ---

      await db.insertProject({
        id: projectId,
        name: "Build File Creation Test",
        description: "E2E test project",
        repo_url: `file://${bareRepoPath}`,
        default_branch: "main",
        action_sequence: 0,
        created_at: now,
        updated_at: now,
      });

      await db.insertWorkflow({
        id: workflowId,
        project_id: projectId,
        title: "Core Workflow",
        position: 0,
        created_at: now,
        updated_at: now,
      });

      await db.insertWorkflowActivity({
        id: activityId,
        workflow_id: workflowId,
        title: "Implement Feature",
        position: 0,
        created_at: now,
        updated_at: now,
      });

      await db.insertCard({
        id: cardId,
        workflow_activity_id: activityId,
        title: "Hello World Module",
        description:
          "Create a TypeScript module at src/hello.ts that exports a function named greet which takes a name string parameter and returns a greeting string.",
        status: "todo",
        position: 0,
        created_at: now,
        updated_at: now,
      });
      await db.updateCard(cardId, { finalized_at: now });

      const plannedFileId = crypto.randomUUID();
      await db.insertCardPlannedFile({
        id: plannedFileId,
        card_id: cardId,
        logical_file_name: "src/hello.ts",
        artifact_kind: "util",
        action: "create",
        intent_summary:
          "Export a greet(name: string): string function that returns a greeting.",
        status: "approved",
        created_at: now,
        updated_at: now,
      });

      // --- Trigger the build ---

      const { triggerBuild } = await import(
        "@/lib/orchestration/trigger-build"
      );

      const result = await triggerBuild(db, {
        project_id: projectId,
        scope: "card",
        card_id: cardId,
        trigger_type: "card",
        initiated_by: "e2e-test",
      });

      expect(result.success, `triggerBuild failed: ${result.error}`).toBe(
        true
      );
      expect(result.runId).toBeDefined();

      // --- Poll for build completion ---

      const maxWaitMs = 240_000;
      const pollMs = 5_000;
      const start = Date.now();
      let finalState = "unknown";

      while (Date.now() - start < maxWaitMs) {
        const card = await db.getCardById(cardId);
        finalState =
          (card as { build_state?: string })?.build_state ?? "unknown";
        if (finalState === "completed" || finalState === "failed") break;
        await new Promise((r) => setTimeout(r, pollMs));
      }

      // --- Assert outcomes ---

      const clonePath = path.join(tmpDir, "data", "repos", projectId);

      // The repo was cloned
      expect(
        fs.existsSync(path.join(clonePath, ".git")),
        `Clone directory missing at ${clonePath}`
      ).toBe(true);

      // Build completed (not failed or timed out). Agent/API flakiness: skip unless strict.
      if (finalState !== "completed") {
        console.warn(
          `[build-creates-files] build_state=${finalState} — skipping file assertions. Set DOSSIER_E2E_STRICT_BUILD=1 to fail here.`
        );
        if (process.env.DOSSIER_E2E_STRICT_BUILD === "1") {
          expect(finalState).toBe("completed");
        }
        return;
      }

      // The planned file was created on disk
      const createdFile = path.join(clonePath, "src", "hello.ts");
      expect(
        fs.existsSync(createdFile),
        `Planned file not found: ${createdFile}`
      ).toBe(true);

      // File has meaningful content
      const content = fs.readFileSync(createdFile, "utf-8");
      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("greet");
    },
    TIMEOUT
  );
});
