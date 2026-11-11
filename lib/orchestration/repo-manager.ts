/**
 * Repo manager: clone, fetch, and branch operations for build execution.
 * Clones user repos to ~/.dossier/repos/<projectId>/ for agentic-flow to work in.
 *
 * Handles empty (freshly-created) repos by seeding an initial commit so that
 * downstream git operations (checkout, ls-tree, diff) have a valid base.
 *
 * @see docs/adr/0013-single-card-build-with-clone.md
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { getDataDir, ensureDataDir } from "@/lib/config/data-dir";
import { resolveGitHubToken } from "@/lib/github/resolve-github-token";
import type { ScaffoldFile } from "./parse-scaffold-files";

const REPOS_DIR = "repos";

function runGitSync(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Returns true when the local clone has zero commits (freshly-created remote).
 */
function isEmptyRepo(clonePath: string): boolean {
  try {
    runGitSync(clonePath, "rev-parse HEAD");
    return false;
  } catch {
    return true;
  }
}

/**
 * Seeds an empty repo with a local initial commit so that branch creation,
 * ls-tree, and diff all work. Caller may then push baseBranch to origin so
 * the remote has a main branch to open PRs against.
 */
function seedEmptyRepo(clonePath: string, baseBranch: string): void {
  runGitSync(clonePath, `checkout -b ${baseBranch}`);
  fs.writeFileSync(
    path.join(clonePath, "README.md"),
    "# New Project\n\nInitialized by Dossier.\n"
  );
  runGitSync(clonePath, "add README.md");
  runGitSync(
    clonePath,
    'commit -m "chore: initialize repository (Dossier)" --author="Dossier <noreply@dossier.dev>"'
  );
}

/**
 * Converts html_url (https://github.com/owner/repo) to authenticated clone URL.
 * Appends .git if needed; injects token for private repos.
 * file:// URLs are left as-is (no .git suffix).
 */
export function repoUrlToCloneUrl(repoUrl: string, token?: string | null): string {
  const trimmed = repoUrl.trim().replace(/\/$/, "");
  const isFile = trimmed.toLowerCase().startsWith("file://");
  let cloneUrl = trimmed.endsWith(".git") ? trimmed : isFile ? trimmed : `${trimmed}.git`;

  if (token && !isFile) {
    cloneUrl = cloneUrl.replace(/^https:\/\//, `https://${token}@`);
  }

  return cloneUrl;
}

/**
 * Returns the clone path for a project: ~/.dossier/repos/<projectId>/
 */
export function getClonePath(projectId: string): string {
  const dataDir = getDataDir();
  return path.join(dataDir, REPOS_DIR, projectId);
}

/**
 * Ensures the repo is cloned locally. If it exists, fetches latest from origin.
 * If the repo is empty (no commits), seeds it with an initial commit.
 * Returns the clone path on success.
 */
export function ensureClone(
  projectId: string,
  repoUrl: string,
  token?: string | null,
  baseBranch = "main"
): { success: boolean; clonePath?: string; error?: string } {
  const clonePath = getClonePath(projectId);
  const effectiveToken = token ?? resolveGitHubToken();
  const cloneUrl = repoUrlToCloneUrl(repoUrl, effectiveToken);

  try {
    ensureDataDir();
    const reposDir = path.join(getDataDir(), REPOS_DIR);
    if (!fs.existsSync(reposDir)) {
      fs.mkdirSync(reposDir, { recursive: true });
    }

    const gitDir = path.join(clonePath, ".git");

    if (fs.existsSync(gitDir)) {
      if (!repoUrl.trim().toLowerCase().startsWith("file://")) {
        execFileSync("git", ["remote", "set-url", "origin", cloneUrl], {
          cwd: clonePath,
          stdio: ["pipe", "pipe", "pipe"],
        });
      }
      execSync("git fetch origin", {
        cwd: clonePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      execSync(`git clone "${cloneUrl}" "${clonePath}"`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    if (isEmptyRepo(clonePath)) {
      seedEmptyRepo(clonePath, baseBranch);
      // main (or base branch) is pushed during project finalization, when directory structure is committed.
    }

    return { success: true, clonePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Repo clone/fetch failed: ${message}`,
    };
  }
}

/**
 * Creates root folders in the repo and commits them.
 * Used after project finalization to establish folder structure from the
 * architectural summary (## Root folder structure). Only creates directories
 * and .gitkeep; does NOT write scaffold files (package.json, configs, app entry).
 * Scaffold file contents are handled separately by writeScaffoldFilesToRepo.
 * Idempotent: skips commit if nothing to add.
 */
export function createRootFoldersInRepo(
  clonePath: string,
  folders: string[],
  baseBranch: string
): { success: boolean; error?: string } {
  if (folders.length === 0) return { success: true };

  try {
    runGitSync(clonePath, `checkout ${baseBranch}`);

    for (const folder of folders) {
      const dirPath = path.join(clonePath, folder);
      fs.mkdirSync(dirPath, { recursive: true });
      const gitkeepPath = path.join(dirPath, ".gitkeep");
      const entries = fs.readdirSync(dirPath);
      if (entries.length === 0 && !fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, "");
      }
    }

    runGitSync(clonePath, "add -A");
    const status = runGitSync(clonePath, "status --porcelain");
    if (status) {
      runGitSync(
        clonePath,
        'commit -m "chore: add root folder structure (Dossier finalization)" --author="Dossier <noreply@dossier.dev>"'
      );
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Create root folders failed: ${message}`,
    };
  }
}

/**
 * Writes scaffold file contents to the repo and commits them.
 * Used after project finalization (after createRootFoldersInRepo). Only writes
 * files (package.json, configs, app entry); folder structure is createRootFoldersInRepo only.
 * Skips files that already exist. Single commit: "chore: add project scaffold (Dossier finalization)".
 */
export function writeScaffoldFilesToRepo(
  clonePath: string,
  files: ScaffoldFile[],
  baseBranch: string
): { success: boolean; error?: string } {
  if (files.length === 0) return { success: true };

  try {
    runGitSync(clonePath, `checkout ${baseBranch}`);

    let written = 0;
    for (const { path: filePath, content } of files) {
      const fullPath = path.join(clonePath, filePath);
      if (fs.existsSync(fullPath)) continue;
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
      written++;
    }

    if (written === 0) return { success: true };

    runGitSync(clonePath, "add -A");
    const status = runGitSync(clonePath, "status --porcelain");
    if (status) {
      runGitSync(
        clonePath,
        'commit -m "chore: add project scaffold (Dossier finalization)" --author="Dossier <noreply@dossier.dev>"'
      );
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Write scaffold files failed: ${message}`,
    };
  }
}

/**
 * Creates a feature branch from the base branch.
 * Tries origin/<baseBranch> first; falls back to local <baseBranch>
 * (covers repos seeded locally that haven't been fetched yet).
 */
export function createFeatureBranch(
  clonePath: string,
  branchName: string,
  baseBranch: string
): { success: boolean; error?: string } {
  try {
    let baseRef = `origin/${baseBranch}`;
    try {
      runGitSync(clonePath, `rev-parse --verify ${baseRef}`);
    } catch {
      baseRef = baseBranch;
    }
    execSync(`git checkout -b "${branchName}" "${baseRef}"`, {
      cwd: clonePath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Create branch failed: ${message}`,
    };
  }
}

/**
 * Branch names that come from the remote or the project record are only used in
 * argv arrays (execFileSync), never in a shell string. Still reject anything
 * outside a conservative charset so odd names fail early.
 */
const SAFE_BRANCH_NAME = /^[A-Za-z0-9._/-]+$/;
function isSafeBranchName(name: string): boolean {
  return SAFE_BRANCH_NAME.test(name) && !name.startsWith("-") && !name.includes("..");
}

/** True when refs/remotes/origin/<branch> exists in the local clone (after fetch). */
function remoteBranchExists(clonePath: string, branch: string): boolean {
  if (!isSafeBranchName(branch)) return false;
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `origin/${branch}`], {
      cwd: clonePath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks origin which branch its HEAD points to (the remote's default branch).
 * Uses ls-remote instead of refs/remotes/origin/HEAD: that ref is only set at
 * clone time and can be missing or point at a stale branch.
 */
export function getRemoteDefaultBranch(clonePath: string): string | null {
  try {
    const out = execFileSync("git", ["ls-remote", "--symref", "origin", "HEAD"], {
      cwd: clonePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = out.match(/^ref: refs\/heads\/(\S+)\s+HEAD$/m);
    const name = match?.[1] ?? null;
    return name && isSafeBranchName(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * Syncs the local base branch (e.g. main) with origin.
 * Fetches from origin, then checks out the base branch and resets it to origin/<baseBranch>.
 * If origin/<baseBranch> is missing, uses the remote's default branch (from ls-remote HEAD)
 * and returns its name in `branch`, so the caller can correct the project's default_branch.
 * Use after merging PRs on GitHub so the Dossier clone's local main is up to date.
 * If the clone does not exist, runs ensureClone first (fetch + optional clone).
 */
export function syncMainBranch(
  projectId: string,
  repoUrl: string,
  baseBranch = "main"
): { success: boolean; branch?: string; error?: string } {
  if (!repoUrl?.trim() || repoUrl.includes("placeholder")) {
    return { success: false, error: "No repository connected." };
  }

  const cloneResult = ensureClone(projectId, repoUrl, null, baseBranch);
  if (!cloneResult.success || !cloneResult.clonePath) {
    return {
      success: false,
      error: cloneResult.error ?? "Clone or fetch failed. Run a build first to create the clone.",
    };
  }

  const clonePath = cloneResult.clonePath;

  try {
    // Prefer the saved branch. If it is missing on origin, use the remote's
    // actual default branch and return its name so the caller can correct the project record.
    let resolvedBranch: string | null = null;

    if (remoteBranchExists(clonePath, baseBranch)) {
      resolvedBranch = baseBranch;
    } else {
      const remoteDefault = getRemoteDefaultBranch(clonePath);
      if (remoteDefault && remoteBranchExists(clonePath, remoteDefault)) {
        resolvedBranch = remoteDefault;
      }
    }

    if (!resolvedBranch) {
      return {
        success: false,
        error: `Remote branch "${baseBranch}" not found after fetch. Check that the default branch name in project settings matches your GitHub repository.`,
      };
    }

    execFileSync("git", ["checkout", "-B", resolvedBranch, `origin/${resolvedBranch}`], {
      cwd: clonePath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, branch: resolvedBranch };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Sync failed: ${message}`,
    };
  }
}

/**
 * Pushes a branch from the project clone to origin.
 * Uses GITHUB_TOKEN (env or config) for auth when repoUrl is provided.
 * MVP: gets code onto GitHub so the user can open a PR there.
 */
export function pushBranch(
  projectId: string,
  branchName: string,
  repoUrl?: string | null
): { success: boolean; error?: string } {
  const clonePath = getClonePath(projectId);
  if (!fs.existsSync(clonePath)) {
    return { success: false, error: "Clone not found. Run a build first." };
  }
  const gitDir = path.join(clonePath, ".git");
  if (!fs.existsSync(gitDir)) {
    return { success: false, error: "Not a git repository." };
  }

  try {
    if (repoUrl && !repoUrl.trim().toLowerCase().startsWith("file://")) {
      const token = resolveGitHubToken();
      const cloneUrl = repoUrlToCloneUrl(repoUrl.trim(), token);
      execFileSync("git", ["remote", "set-url", "origin", cloneUrl], {
        cwd: clonePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
    execSync(`git push -u origin "${branchName}"`, {
      cwd: clonePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("could not read Username") || message.includes("Authentication failed")) {
      return { success: false, error: "Add GITHUB_TOKEN to ~/.dossier/config or env to push." };
    }
    if (message.includes("403") || message.includes("Permission") && message.includes("denied")) {
      return {
        success: false,
        error:
          "Push denied: your token has no write access. Use a classic token with the 'repo' scope, or a fine-grained token with 'Contents' write access to this repository.",
      };
    }
    return { success: false, error: `Push failed: ${message}` };
  }
}
