import { NextRequest } from "next/server";
import { resolveGitHubToken } from "@/lib/github/resolve-github-token";
import { json, internalError } from "@/lib/api/response-helpers";

const GITHUB_API = "https://api.github.com";

/**
 * Branch names from GitHub are stored as project.default_branch and later used in
 * git commands. Only pass through names with a conservative charset; anything else
 * is omitted so the client keeps the existing value instead of saving it.
 */
function safeDefaultBranch(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith("-") && !name.includes("..")
    ? name
    : undefined;
}

/** GET /api/github/repos — list repositories for the authenticated user (uses GITHUB_TOKEN) */
export async function GET(_request: NextRequest) {
  try {
    const token = resolveGitHubToken();
    if (!token) {
      return json(
        {
          error:
            "GitHub isn't connected. Use Connect GitHub or a PAT in Setup / API keys, or set GITHUB_TOKEN in the environment.",
        },
        503
      );
    }

    const res = await fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("GitHub API list repos error:", res.status, text);
      if (res.status === 401) {
        return json({ error: "GitHub token is invalid or expired." }, 401);
      }
      return json(
        { error: "Failed to list repositories." },
        res.status >= 500 ? 502 : 400
      );
    }

    const data = (await res.json()) as Array<{
      full_name: string;
      html_url: string;
      clone_url: string;
      private: boolean;
      default_branch: string;
    }>;

    const repos = data.map((r) => ({
      full_name: r.full_name,
      html_url: r.html_url,
      clone_url: r.clone_url,
      private: r.private,
      default_branch: safeDefaultBranch(r.default_branch),
    }));

    return json({ repos });
  } catch (err) {
    console.error("GET /api/github/repos error:", err);
    return internalError();
  }
}

/** POST /api/github/repos — create a new repository (uses GITHUB_TOKEN) */
export async function POST(request: NextRequest) {
  try {
    const token = resolveGitHubToken();
    if (!token) {
      return json(
        {
          error:
            "GitHub isn't connected. Use Connect GitHub or a PAT in Setup / API keys, or set GITHUB_TOKEN in the environment.",
        },
        503
      );
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const isPrivate = typeof body?.private === "boolean" ? body.private : false;

    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      return json(
        { error: "Repository name is required and may only contain letters, numbers, ., _, -." },
        400
      );
    }

    const res = await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        private: isPrivate,
        auto_init: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("GitHub API create repo error:", res.status, text);
      if (res.status === 401) {
        return json({ error: "GitHub token is invalid or expired." }, 401);
      }
      if (res.status === 422) {
        try {
          const err = JSON.parse(text) as { message?: string; errors?: Array<{ message?: string }> };
          const msg = err.message ?? err.errors?.[0]?.message ?? "Repository name may already exist or be invalid.";
          return json({ error: msg }, 422);
        } catch {
          return json({ error: "Repository name may already exist or be invalid." }, 422);
        }
      }
      return json(
        { error: "Failed to create repository." },
        res.status >= 500 ? 502 : 400
      );
    }

    const repo = (await res.json()) as {
      full_name: string;
      html_url: string;
      clone_url: string;
      private: boolean;
      default_branch: string;
    };

    return json({
      full_name: repo.full_name,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      private: repo.private,
      default_branch: safeDefaultBranch(repo.default_branch),
    });
  } catch (err) {
    console.error("POST /api/github/repos error:", err);
    return internalError();
  }
}
