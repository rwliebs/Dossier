import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  getProject,
  getPlannedFilesByProject,
} from "@/lib/db/queries";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";
import {
  getRepoFileTree,
  getRepoFileTreeWithStatus,
  getFileContent,
  getWorkingFileContent,
  getWorkingTreeFileTreeWithStatus,
  getFileDiff,
  type FileNode,
} from "@/lib/orchestration/repo-reader";
import { getClonePath } from "@/lib/orchestration/repo-manager";
import * as fs from "node:fs";

export type { FileNode };

type RouteParams = { params: Promise<{ projectId: string }> };

function buildTree(rows: { logical_file_name: string }[]): FileNode[] {
  const byPath = new Map<string, FileNode>();
  for (const row of rows) {
    const path = "/" + row.logical_file_name.replace(/^\/+/, "").trim();
    const segments = path.split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      if (byPath.has(currentPath)) continue;
      const node: FileNode = {
        name: segment,
        type: isLast ? "file" : "folder",
        path: currentPath,
      };
      if (!isLast) node.children = [];
      byPath.set(currentPath, node);
      if (i > 0) {
        const parts = currentPath.split("/").filter(Boolean);
        const parentPath = "/" + parts.slice(0, -1).join("/");
        const parent = byPath.get(parentPath);
        if (parent?.children && !parent.children.some((c) => c.path === currentPath)) {
          parent.children.push(node);
        }
      }
    }
  }
  const roots: FileNode[] = [];
  byPath.forEach((node) => {
    const depth = (node.path.match(/\//g) ?? []).length;
    if (depth === 1) roots.push(node);
  });
  roots.sort((a, b) => a.name.localeCompare(b.name));
  return roots;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();
    const project = await getProject(db, projectId);
    if (!project) return notFoundError("Project not found");

    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") ?? "planned";
    const cardId = searchParams.get("cardId") ?? null;

    if (source === "repo") {
      const runs = await listOrchestrationRunsByProject(db, projectId, {
        limit: 20,
      });
      const runWithWorktree = runs.find(
        (r) => (r as { worktree_root?: string }).worktree_root
      );

      // Fallback: if no build yet but repo is connected and clone exists (e.g. after finalization),
      // show the clone's file tree so users see the directory structure created by finalization.
      if (!runWithWorktree) {
        const repoUrl = (project as { repo_url?: string })?.repo_url;
        const baseBranch =
          (project as { default_branch?: string })?.default_branch ?? "main";
        if (
          repoUrl &&
          !repoUrl.includes("placeholder") &&
          !cardId // card-specific view needs a run
        ) {
          const clonePath = getClonePath(projectId);
          if (fs.existsSync(clonePath)) {
            const result = getRepoFileTree(clonePath, baseBranch);
            if (result.success && result.tree) {
              return json(result.tree);
            }
          }
        }
        return json(
          { error: "No build with repository available. Trigger a build first." },
          404
        );
      }
      const defaultRun = runWithWorktree as {
        worktree_root: string;
        base_branch: string;
        id: string;
      };

      let assignment: { feature_branch: string; worktree_path?: string | null } | null = null;
      let effectiveRun = defaultRun;

      if (cardId) {
        for (const run of runs) {
          const wt = (run as { worktree_root?: string }).worktree_root;
          if (!wt) continue;
          const assignments = await getCardAssignmentsByRun(db, (run as { id: string }).id);
          const found = assignments.find(
            (a) =>
              (a as { card_id: string }).card_id === cardId &&
              (a as { worktree_path?: string }).worktree_path
          ) as { feature_branch: string; worktree_path?: string | null } | undefined;
          if (found) {
            assignment = found;
            effectiveRun = run as { worktree_root: string; base_branch: string; id: string };
            break;
          }
        }
      } else {
        for (const run of runs) {
          const wt = (run as { worktree_root?: string }).worktree_root;
          if (!wt) continue;
          const assignments = await getCardAssignmentsByRun(db, (run as { id: string }).id);
          const hasCompleted = assignments.some(
            (a) =>
              (a as { status?: string }).status === "completed" &&
              (a as { worktree_path?: string }).worktree_path
          );
          if (hasCompleted) {
            effectiveRun = run as { worktree_root: string; base_branch: string; id: string };
            break;
          }
        }
      }

      const useMainBranch = !assignment;
      const effectiveBranch = useMainBranch
        ? effectiveRun.base_branch
        : assignment!.feature_branch;
      const repoPath = assignment?.worktree_path ?? effectiveRun.worktree_root;

      const filePath = searchParams.get("path");
      const wantContent = searchParams.get("content") === "1";
      const wantDiff = searchParams.get("diff") === "1";

      if (wantContent && filePath) {
        if (!useMainBranch) {
          const workingContent = getWorkingFileContent(repoPath, filePath);
          if (workingContent.success) {
            return new Response(workingContent.content ?? "", {
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
        }
        const contentResult = getFileContent(
          repoPath,
          effectiveBranch,
          filePath
        );
        if (!contentResult.success) {
          return json(
            { error: contentResult.error ?? "Failed to read file" },
            404
          );
        }
        return new Response(contentResult.content ?? "", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      if (wantDiff && filePath) {
        if (useMainBranch) {
          return new Response("", {
            headers: { "Content-Type": "text/x-diff; charset=utf-8" },
          });
        }
        const diffResult = getFileDiff(
          repoPath,
          effectiveRun.base_branch,
          effectiveBranch,
          filePath
        );
        if (!diffResult.success) {
          return json(
            { error: diffResult.error ?? "Failed to get diff" },
            404
          );
        }
        return new Response(diffResult.diff ?? "", {
          headers: { "Content-Type": "text/x-diff; charset=utf-8" },
        });
      }

      if (useMainBranch) {
        const result = getRepoFileTree(repoPath, effectiveRun.base_branch);
        if (!result.success) {
          return json(
            { error: result.error ?? "Failed to read repository files" },
            500
          );
        }
        return json(result.tree ?? []);
      }

      let result: { success: boolean; tree?: FileNode[]; error?: string };
      let useWorkingTree = false;
      try {
        const { spawnSync } = await import("node:child_process");
        const head = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: repoPath,
          encoding: "utf-8",
        });
        if (head.error) throw head.error;
        if (head.status !== 0) {
          throw new Error(head.stderr?.trim() || "git rev-parse failed");
        }
        const currentBranch = head.stdout.trim();
        useWorkingTree = currentBranch === effectiveBranch;
      } catch {
        useWorkingTree = false;
      }
      if (useWorkingTree) {
        result = getWorkingTreeFileTreeWithStatus(
          repoPath,
          effectiveBranch,
          effectiveRun.base_branch
        );
      } else {
        result = getRepoFileTreeWithStatus(
          repoPath,
          effectiveBranch,
          effectiveRun.base_branch
        );
      }
      if (!result.success && useWorkingTree) {
        result = getRepoFileTreeWithStatus(
          repoPath,
          effectiveBranch,
          effectiveRun.base_branch
        );
      }
      if (!result.success) {
        return json(
          { error: result.error ?? "Failed to read repository files" },
          500
        );
      }
      return json(result.tree ?? []);
    }

    const rows = await getPlannedFilesByProject(db, projectId);
    const tree = buildTree(rows as { logical_file_name: string }[]);
    return json(tree);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/files error:", err);
    return internalError();
  }
}
