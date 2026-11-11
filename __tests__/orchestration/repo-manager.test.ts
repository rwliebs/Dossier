/**
 * Tests for repo-manager: clone path, URL conversion, ensureClone, createFeatureBranch.
 * Uses a local temp git repo for ensureClone (file:// URL).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync, execFileSync } from "node:child_process";
import {
  getClonePath,
  repoUrlToCloneUrl,
  ensureClone,
  createFeatureBranch,
  writeScaffoldFilesToRepo,
  syncMainBranch,
} from "@/lib/orchestration/repo-manager";

describe("repo-manager", () => {
  let tempDir: string;
  let remoteDir: string;

  beforeEach(() => {
    tempDir = path.join(
      require("node:os").tmpdir(),
      `dossier-repo-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    remoteDir = path.join(tempDir, "remote");
    fs.mkdirSync(remoteDir, { recursive: true });
    execSync("git init", { cwd: remoteDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: remoteDir, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: remoteDir, stdio: "pipe" });
    fs.writeFileSync(path.join(remoteDir, "README.md"), "# Test\n", "utf-8");
    execSync("git add README.md", { cwd: remoteDir, stdio: "pipe" });
    execSync("git commit -m 'Initial'", { cwd: remoteDir, stdio: "pipe" });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("getClonePath", () => {
    it("returns path under data dir", () => {
      const p = getClonePath("proj-123");
      expect(p).toContain("repos");
      expect(p).toContain("proj-123");
    });
  });

  describe("repoUrlToCloneUrl", () => {
    it("appends .git when missing", () => {
      expect(repoUrlToCloneUrl("https://github.com/u/r")).toBe(
        "https://github.com/u/r.git"
      );
    });
    it("keeps .git when present", () => {
      expect(repoUrlToCloneUrl("https://github.com/u/r.git")).toBe(
        "https://github.com/u/r.git"
      );
    });
    it("injects token when provided", () => {
      const url = repoUrlToCloneUrl("https://github.com/u/r", "secret");
      expect(url).toBe("https://secret@github.com/u/r.git");
    });
  });

  describe("ensureClone", () => {
    it("clones when DOSSIER_DATA_DIR points to temp", () => {
      const projectId = "test-project";
      const dataDir = path.join(tempDir, "dossier-data");
      fs.mkdirSync(dataDir, { recursive: true });
      const fileUrl = pathToFileURL(remoteDir).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const result = ensureClone(projectId, fileUrl, null);
        if (!result.success) {
          throw new Error(result.error);
        }
        expect(result.clonePath).toBeDefined();
        const clonePath = result.clonePath!;
        expect(fs.existsSync(path.join(clonePath, "README.md"))).toBe(true);
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });
  });

  describe("createFeatureBranch", () => {
    it("creates branch from origin/base", () => {
      const clonePath = path.join(tempDir, "clone");
      execSync(`git clone "${remoteDir}" "${clonePath}"`, { stdio: "pipe" });
      execSync("git fetch origin", { cwd: clonePath, stdio: "pipe" });

      const result = createFeatureBranch(clonePath, "feat/test", "main");

      expect(result.success).toBe(true);
      const branch = execSync("git branch --show-current", {
        cwd: clonePath,
        encoding: "utf-8",
      }).trim();
      expect(branch).toBe("feat/test");
    });
  });

  describe("writeScaffoldFilesToRepo", () => {
    it("writes files and commits on base branch", () => {
      const clonePath = path.join(tempDir, "clone-scaffold");
      execSync(`git clone "${remoteDir}" "${clonePath}"`, { stdio: "pipe" });
      const files = [
        { path: "package.json", content: '{"name":"app"}' },
        { path: "src/app/page.tsx", content: "export default function Page() {}" },
      ];
      const result = writeScaffoldFilesToRepo(clonePath, files, "main");
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(clonePath, "package.json"))).toBe(true);
      expect(fs.readFileSync(path.join(clonePath, "package.json"), "utf-8")).toBe('{"name":"app"}');
      expect(fs.existsSync(path.join(clonePath, "src/app/page.tsx"))).toBe(true);
      const log = execSync("git log -1 --oneline", { cwd: clonePath, encoding: "utf-8" }).trim();
      expect(log).toContain("project scaffold");
    });

    it("skips files that already exist", () => {
      const clonePath = path.join(tempDir, "clone-skip");
      execSync(`git clone "${remoteDir}" "${clonePath}"`, { stdio: "pipe" });
      fs.writeFileSync(path.join(clonePath, "package.json"), '{"existing":true}', "utf-8");
      execSync("git add package.json", { cwd: clonePath, stdio: "pipe" });
      execSync("git commit -m 'existing'", { cwd: clonePath, stdio: "pipe" });
      const files = [
        { path: "package.json", content: '{"overwrite":false}' },
        { path: "new.txt", content: "new" },
      ];
      const result = writeScaffoldFilesToRepo(clonePath, files, "main");
      expect(result.success).toBe(true);
      expect(fs.readFileSync(path.join(clonePath, "package.json"), "utf-8")).toBe('{"existing":true}');
      expect(fs.readFileSync(path.join(clonePath, "new.txt"), "utf-8")).toBe("new");
    });

    it("returns success when files array is empty", () => {
      const clonePath = path.join(tempDir, "clone-empty");
      execSync(`git clone "${remoteDir}" "${clonePath}"`, { stdio: "pipe" });
      const result = writeScaffoldFilesToRepo(clonePath, [], "main");
      expect(result.success).toBe(true);
    });
  });

  describe("syncMainBranch", () => {
    it("syncs local main to match origin after remote commit", () => {
      const projectId = "sync-test";
      const dataDir = path.join(tempDir, "dossier-data-sync");
      fs.mkdirSync(dataDir, { recursive: true });
      const fileUrl = pathToFileURL(remoteDir).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const clone1 = ensureClone(projectId, fileUrl, null);
        expect(clone1.success).toBe(true);

        fs.writeFileSync(path.join(remoteDir, "new-file.txt"), "hello", "utf-8");
        execSync("git add new-file.txt", { cwd: remoteDir, stdio: "pipe" });
        execSync("git commit -m 'add new-file'", { cwd: remoteDir, stdio: "pipe" });

        const result = syncMainBranch(projectId, fileUrl, "main");
        expect(result.success).toBe(true);
        expect(result.branch).toBe("main");

        const clonePath = clone1.clonePath!;
        expect(fs.existsSync(path.join(clonePath, "new-file.txt"))).toBe(true);
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });

    it("returns error when origin/<baseBranch> does not exist and no origin/HEAD", () => {
      const projectId = "sync-no-branch";
      const dataDir = path.join(tempDir, "dossier-data-nobranch");
      fs.mkdirSync(dataDir, { recursive: true });

      const bareDir = path.join(tempDir, "bare-remote");
      fs.mkdirSync(bareDir, { recursive: true });
      execSync("git init --bare", { cwd: bareDir, stdio: "pipe" });
      const fileUrl = pathToFileURL(bareDir).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const clone1 = ensureClone(projectId, fileUrl, null);
        expect(clone1.success).toBe(true);

        const result = syncMainBranch(projectId, fileUrl, "nonexistent");
        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });

    it("ensureClone reports the remote default branch when the saved branch is missing", () => {
      const projectId = "clone-master-default";
      const dataDir = path.join(tempDir, "dossier-data-clone-master");
      fs.mkdirSync(dataDir, { recursive: true });
      const masterRemote = path.join(tempDir, "clone-master-remote");
      fs.mkdirSync(masterRemote, { recursive: true });
      execFileSync("git", ["init", "-q", "-b", "master"], { cwd: masterRemote });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: masterRemote });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: masterRemote });
      fs.writeFileSync(path.join(masterRemote, "README.md"), "# Master\n", "utf-8");
      execFileSync("git", ["add", "README.md"], { cwd: masterRemote });
      execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: masterRemote });
      const fileUrl = pathToFileURL(masterRemote).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const result = ensureClone(projectId, fileUrl, null, "main");
        expect(result.success).toBe(true);
        expect(result.baseBranch).toBe("master");
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });

    it("uses the remote's default branch when the saved branch is missing (master-default repo)", () => {
      const projectId = "sync-master-default";
      const dataDir = path.join(tempDir, "dossier-data-master");
      fs.mkdirSync(dataDir, { recursive: true });
      const masterRemote = path.join(tempDir, "master-remote");
      fs.mkdirSync(masterRemote, { recursive: true });
      execFileSync("git", ["init", "-q", "-b", "master"], { cwd: masterRemote });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: masterRemote });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: masterRemote });
      fs.writeFileSync(path.join(masterRemote, "README.md"), "# Master\n", "utf-8");
      execFileSync("git", ["add", "README.md"], { cwd: masterRemote });
      execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: masterRemote });
      const fileUrl = pathToFileURL(masterRemote).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const result = syncMainBranch(projectId, fileUrl, "main");
        expect(result.success).toBe(true);
        expect(result.branch).toBe("master");

        const clonePath = getClonePath(projectId);
        expect(fs.existsSync(path.join(clonePath, "README.md"))).toBe(true);
        const current = execFileSync("git", ["branch", "--show-current"], {
          cwd: clonePath,
          encoding: "utf-8",
        }).trim();
        expect(current).toBe("master");
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });

    it("does not execute shell syntax embedded in a remote default branch name", () => {
      const projectId = "sync-branch-injection";
      const dataDir = path.join(tempDir, "dossier-data-injection");
      fs.mkdirSync(dataDir, { recursive: true });
      const evilRemote = path.join(tempDir, "evil-remote");
      fs.mkdirSync(evilRemote, { recursive: true });
      execFileSync("git", ["init", "-q", "-b", "master"], { cwd: evilRemote });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: evilRemote });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: evilRemote });
      execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: evilRemote });
      // Git allows $, (, ), > in branch names (but not ':' or spaces). If the name reaches a shell, the marker file is created.
      const marker = path.join(tempDir, "pwned-marker");
      const evilBranch = `x$(>${marker})`;
      execFileSync("git", ["branch", evilBranch], { cwd: evilRemote });
      execFileSync("git", ["symbolic-ref", "HEAD", `refs/heads/${evilBranch}`], { cwd: evilRemote });
      // Remove 'master' so the remote has no 'main' and no 'master': only the malicious default branch exists.
      execFileSync("git", ["branch", "-D", "master"], { cwd: evilRemote });
      const fileUrl = pathToFileURL(evilRemote).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const result = syncMainBranch(projectId, fileUrl, "main");
        expect(result.success).toBe(false);
        expect(fs.existsSync(marker)).toBe(false);
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });

    it("returns error for placeholder repo URL", () => {
      const result = syncMainBranch("any-id", "placeholder", "main");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No repository connected");
    });
  });
});
