/**
 * chat route: conversationHistory from the UI reaches the planning LLM prompt.
 * The LLM and DB are mocked; we assert on the user message the route hands to claudePlanningRequest.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const claudePlanningRequest = vi.fn();
vi.mock("@/lib/llm/claude-client", () => ({
  claudePlanningRequest: (...args: unknown[]) => claudePlanningRequest(...args),
}));

const fetchMapSnapshot = vi.fn();
vi.mock("@/lib/db/map-snapshot", () => ({
  fetchMapSnapshot: (...args: unknown[]) => fetchMapSnapshot(...args),
  getLinkedArtifactsForPrompt: () => [],
}));

vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/db/queries", () => ({
  getArtifactsByProject: async () => [],
  getProject: async () => null,
}));
vi.mock("@/lib/db/mutations", () => ({ pipelineApply: async () => ({ applied: 0 }) }));
vi.mock("@/lib/llm/run-populate-workflow", () => ({ runPopulateWorkflow: async () => ({ actionCount: 0 }) }));
vi.mock("@/lib/llm/run-finalize-multistep", () => ({ runFinalizeMultiStep: async () => ({}) }));
vi.mock("@/lib/orchestration/repo-manager", () => ({
  ensureClone: () => ({ success: false }),
  createRootFoldersInRepo: () => ({ success: true }),
  writeScaffoldFilesToRepo: () => ({ success: true }),
  pushBranch: () => ({ success: true }),
}));
vi.mock("@/lib/orchestration/repo-reader", () => ({ getRepoContextForPrompt: () => "" }));

import { POST } from "@/app/api/projects/[projectId]/chat/route";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function stateWithWorkflow() {
  return {
    project: { id: PROJECT_ID, name: "Todo", description: "", repo_url: null, default_branch: "main" },
    workflows: new Map([["w1", { id: "w1", title: "Manage tasks", description: null, position: 0 }]]),
    activities: new Map(),
    cards: new Map(),
    contextArtifacts: new Map(),
  };
}

function stateEmpty() {
  return {
    project: { id: PROJECT_ID, name: "Idea", description: "", repo_url: null, default_branch: "main" },
    workflows: new Map(),
    activities: new Map(),
    cards: new Map(),
    contextArtifacts: new Map(),
  };
}

async function callChat(body: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ projectId: PROJECT_ID }) });
}

function promptSent(): string {
  const [, options] = claudePlanningRequest.mock.calls[0] as [unknown, { userMessageOverride?: string }];
  return options.userMessageOverride ?? "";
}

beforeEach(() => {
  claudePlanningRequest.mockReset();
  fetchMapSnapshot.mockReset();
  claudePlanningRequest.mockResolvedValue({
    text: JSON.stringify({ type: "clarification", message: "Got it.", actions: [] }),
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "test",
  });
});

describe("POST /api/projects/[projectId]/chat with conversationHistory", () => {
  it("passes prior turns into the planning prompt on the planning (has-structure) path", async () => {
    fetchMapSnapshot.mockResolvedValue(stateWithWorkflow());

    const res = await callChat({
      message: "now mark those done",
      conversationHistory: [
        { role: "user", content: "Add cards for login and signup" },
        { role: "agent", content: "I added: Login form, Signup form." },
      ],
    });

    expect(res.status).toBe(200);
    expect(claudePlanningRequest).toHaveBeenCalledTimes(1);
    const prompt = promptSent();
    expect(prompt).toContain("## Conversation so far");
    expect(prompt).toContain("User: Add cards for login and signup");
    expect(prompt).toContain("Assistant: I added: Login form, Signup form.");
    expect(prompt).toContain("## User Request\nnow mark those done");
    expect(prompt.indexOf("Login form")).toBeLessThan(prompt.indexOf("now mark those done"));
  });

  it("passes prior turns on the scaffold (no-structure) path too", async () => {
    fetchMapSnapshot.mockResolvedValue(stateEmpty());

    const res = await callChat({
      message: "It is for designers and clients",
      conversationHistory: [
        { role: "user", content: "I want a marketplace" },
        { role: "agent", content: "Who are the users?" },
      ],
    });

    expect(res.status).toBe(200);
    const prompt = promptSent();
    expect(prompt).toContain("User: I want a marketplace");
    expect(prompt).toContain("Assistant: Who are the users?");
    expect(prompt).toContain("It is for designers and clients");
  });

  it("sends the unchanged single-turn prompt when no history is provided", async () => {
    fetchMapSnapshot.mockResolvedValue(stateWithWorkflow());

    const res = await callChat({ message: "add a search card" });

    expect(res.status).toBe(200);
    const prompt = promptSent();
    expect(prompt).not.toContain("## Conversation so far");
    expect(prompt).toContain("## User Request\nadd a search card");
  });
});
