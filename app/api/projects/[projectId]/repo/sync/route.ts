/**
 * POST /api/projects/[projectId]/repo/sync
 * Fetches from origin and updates the local base branch (e.g. main) to match.
 * Use after merging PRs on GitHub so the Dossier clone stays in sync.
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getProject } from "@/lib/db/queries";
import { syncMainBranch } from "@/lib/orchestration/repo-manager";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();

    const project = await getProject(db, projectId);
    if (!project) return notFoundError("Project not found");

    const repoUrl = (project as { repo_url?: string | null }).repo_url ?? null;
    if (!repoUrl || repoUrl.includes("placeholder")) {
      return json(
        { error: "Connect a repository in project settings first." },
        400
      );
    }

    const baseBranch =
      (project as { default_branch?: string }).default_branch ?? "main";

    const result = syncMainBranch(projectId, repoUrl, baseBranch);

    if (result.success) {
      const branch = result.branch ?? baseBranch;
      // The saved branch was missing on origin, so the remote default was used.
      // Persist it so later clones, builds, and PRs target the branch that exists.
      if (branch !== baseBranch) {
        await db.updateProject(projectId, { default_branch: branch });
      }
      return json({ success: true, branch });
    }

    const status =
      result.error?.includes("GITHUB_TOKEN") ||
      result.error?.includes("Authentication")
        ? 401
        : result.error?.includes("No repository") ||
            result.error?.includes("not found")
          ? 400
          : 502;

    return json({ error: result.error ?? "Sync failed." }, status);
  } catch (err) {
    console.error("POST repo/sync error:", err);
    return internalError();
  }
}
