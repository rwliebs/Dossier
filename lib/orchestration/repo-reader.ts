/**
 * Repo reader: git-based file tree, diff, and content retrieval.
 * Used by the files API to surface produced code from the cloned repo.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  status?: "added" | "modified" | "deleted" | "unchanged";
  children?: FileNode[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted";
}

/** Runs git with an argv array (no shell): branch names and paths are never shell-parsed. */
function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function mapPorcelainStatus(code: string): ChangedFile["status"] | null {
  if (code === "?" || code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "M" || code === "R" || code === "C" || code === "U") {
    return "modified";
  }
  return null;
}

function getWorkingTreePaths(
  clonePath: string
): { success: boolean; paths?: string[]; error?: string } {
  try {
    const out = runGit(clonePath, [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ]);
    const paths = out ? out.split("\n").filter(Boolean) : [];
    return { success: true, paths };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

function getWorkingTreeChangedFiles(
  clonePath: string
): { success: boolean; files?: ChangedFile[]; error?: string } {
  try {
    const out = runGit(clonePath, ["status", "--porcelain"]);
    const byPath = new Map<string, ChangedFile["status"]>();
    for (const line of out ? out.split("\n").filter(Boolean) : []) {
      if (line.length < 4) continue;
      const x = line[0];
      const y = line[1];
      const rawPath = line.slice(3).trim();
      const normalizedPath = rawPath.includes(" -> ")
        ? rawPath.split(" -> ").at(-1) ?? rawPath
        : rawPath;
      const path = "/" + normalizedPath.replace(/^\/+/, "");

      const status =
        mapPorcelainStatus(x) ??
        mapPorcelainStatus(y);
      if (status) byPath.set(path, status);
    }
    const files = Array.from(byPath.entries()).map(([path, status]) => ({
      path,
      status,
    }));
    return { success: true, files };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Builds a FileNode tree from flat paths.
 * Paths are normalized to start with / (e.g. /src/foo.ts).
 */
function buildTreeFromPaths(
  paths: string[],
  statusByPath?: Map<string, ChangedFile["status"]>
): FileNode[] {
  const byPath = new Map<string, FileNode>();

  for (const raw of paths) {
    const path = "/" + raw.replace(/^\/+/, "").trim();
    const segments = path.split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      if (byPath.has(currentPath)) continue;

      const status = statusByPath?.get(currentPath);
      const node: FileNode = {
        name: segment,
        type: isLast ? "file" : "folder",
        path: currentPath,
      };
      if (status) node.status = status;
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

/**
 * Returns the file tree for a branch via git ls-tree.
 */
export function getRepoFileTree(
  clonePath: string,
  branch: string
): { success: boolean; tree?: FileNode[]; error?: string } {
  try {
    const out = runGit(clonePath, [
      "ls-tree",
      "-r",
      "--name-only",
      branch,
    ]);
    const paths = out ? out.split("\n").filter(Boolean) : [];
    const tree = buildTreeFromPaths(paths);
    return { success: true, tree };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns changed files between base and feature branch.
 */
export function getChangedFiles(
  clonePath: string,
  baseBranch: string,
  featureBranch: string
): { success: boolean; files?: ChangedFile[]; error?: string } {
  try {
    const out = runGit(clonePath, [
      "diff",
      "--name-status",
      `${baseBranch}...${featureBranch}`,
    ]);
    const files: ChangedFile[] = [];
    for (const line of out ? out.split("\n").filter(Boolean) : []) {
      const m = line.match(/^([AMD])\s+(.+)$/);
      if (m) {
        const [, code, path] = m;
        const status =
          code === "A" ? "added" : code === "M" ? "modified" : "deleted";
        files.push({ path: "/" + path.replace(/^\/+/, ""), status });
      }
    }
    return { success: true, files };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns file content at a given branch/path.
 */
export function getFileContent(
  clonePath: string,
  branch: string,
  filePath: string
): { success: boolean; content?: string; error?: string } {
  try {
    const path = filePath.replace(/^\/+/, "");
    const content = runGit(clonePath, ["show", `${branch}:${path}`]);
    return { success: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns file content from the checked-out working tree.
 * Unlike git show(branch:path), this includes uncommitted files.
 */
export function getWorkingFileContent(
  clonePath: string,
  filePath: string
): { success: boolean; content?: string; error?: string } {
  try {
    const rel = filePath.replace(/^\/+/, "");
    const absolute = path.join(clonePath, rel);
    const content = fs.readFileSync(absolute, "utf-8");
    return { success: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns unified diff for a file between base and feature branch.
 */
export function getFileDiff(
  clonePath: string,
  baseBranch: string,
  featureBranch: string,
  filePath: string
): { success: boolean; diff?: string; error?: string } {
  try {
    const path = filePath.replace(/^\/+/, "");
    const diff = runGit(clonePath, [
      "diff",
      `${baseBranch}...${featureBranch}`,
      "--",
      path,
    ]);
    return { success: true, diff };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns file tree with diff status annotations.
 * Merges ls-tree output with changed files.
 */
export function getRepoFileTreeWithStatus(
  clonePath: string,
  featureBranch: string,
  baseBranch: string
): { success: boolean; tree?: FileNode[]; error?: string } {
  const treeResult = getRepoFileTree(clonePath, featureBranch);
  if (!treeResult.success) return treeResult;

  const changedResult = getChangedFiles(clonePath, baseBranch, featureBranch);
  const statusByPath = new Map<string, ChangedFile["status"]>();
  if (changedResult.success && changedResult.files) {
    for (const f of changedResult.files) {
      statusByPath.set(f.path, f.status);
    }
  }

  // Rebuild tree with status annotations
  const paths = collectPathsFromTree(treeResult.tree!);
  const tree = buildTreeFromPaths(paths, statusByPath);
  return { success: true, tree };
}

/**
 * Returns file tree from the checked-out working tree plus status annotations.
 * Includes committed files, staged/unstaged changes, and untracked files.
 */
export function getWorkingTreeFileTreeWithStatus(
  clonePath: string,
  featureBranch: string,
  baseBranch: string
): { success: boolean; tree?: FileNode[]; error?: string } {
  const pathsResult = getWorkingTreePaths(clonePath);
  if (!pathsResult.success) return pathsResult;

  const statusByPath = new Map<string, ChangedFile["status"]>();

  // Start with committed branch-level diff.
  const committed = getChangedFiles(clonePath, baseBranch, featureBranch);
  if (committed.success && committed.files) {
    for (const f of committed.files) {
      statusByPath.set(f.path, f.status);
    }
  }

  // Overlay working-tree changes (includes untracked).
  const working = getWorkingTreeChangedFiles(clonePath);
  if (working.success && working.files) {
    for (const f of working.files) {
      statusByPath.set(f.path, f.status);
    }
  }

  const tree = buildTreeFromPaths(pathsResult.paths ?? [], statusByPath);
  return { success: true, tree };
}

function collectPathsFromTree(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  function walk(n: FileNode) {
    if (n.type === "file") paths.push(n.path.replace(/^\/+/, ""));
    for (const c of n.children ?? []) walk(c);
  }
  for (const n of nodes) walk(n);
  return paths;
}

const REPO_CONTEXT_MAX_PATHS = 250;
const REPO_CONTEXT_MAX_README = 3500;
const REPO_CONTEXT_MAX_PACKAGE_JSON = 2000;

/**
 * Builds a repository context string for LLM prompts (e.g. scaffold "create map from existing repo").
 * Includes file tree (path list) and excerpts of README and package.json when present.
 * Returns null if clone is missing, not a git repo, or tree read fails.
 */
export function getRepoContextForPrompt(
  clonePath: string,
  branch: string
): string | null {
  const treeResult = getRepoFileTree(clonePath, branch);
  if (!treeResult.success || !treeResult.tree) return null;

  const paths = collectPathsFromTree(treeResult.tree);
  const pathList =
    paths.length > REPO_CONTEXT_MAX_PATHS
      ? paths.slice(0, REPO_CONTEXT_MAX_PATHS).join("\n") +
        `\n... and ${paths.length - REPO_CONTEXT_MAX_PATHS} more files`
      : paths.join("\n");

  const sections: string[] = [`## File tree (branch: ${branch})\n${pathList}`];

  const readme = getFileContent(clonePath, branch, "README.md");
  if (readme.success && readme.content) {
    const excerpt =
      readme.content.length > REPO_CONTEXT_MAX_README
        ? readme.content.slice(0, REPO_CONTEXT_MAX_README) + "\n[... truncated]"
        : readme.content;
    sections.push(`## README (excerpt)\n${excerpt}`);
  }

  const pkg = getFileContent(clonePath, branch, "package.json");
  if (pkg.success && pkg.content) {
    const excerpt =
      pkg.content.length > REPO_CONTEXT_MAX_PACKAGE_JSON
        ? pkg.content.slice(0, REPO_CONTEXT_MAX_PACKAGE_JSON) + "\n[... truncated]"
        : pkg.content;
    sections.push(`## package.json (excerpt)\n${excerpt}`);
  }

  return sections.join("\n\n");
}
