/**
 * Planning timeouts are activity-based, not wall-clock based.
 * - Idle limit (timeoutMs / PLANNING_IDLE_TIMEOUT_MS): resets on every agent action.
 * - Overall limit (overallTimeoutMs / PLANNING_OVERALL_TIMEOUT_MS): hard ceiling per call.
 * Both the request path (claudePlanningRequest) and the streaming path (claudeStreamingRequest) are covered.
 */

/* Some mocked streams model an agent that only emits activity and never yields text, so they intentionally have no `yield`. */
/* eslint-disable require-yield */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/llm/planning-sdk-runner", () => ({
  runPlanningQuery: vi.fn(),
  streamPlanningQuery: vi.fn(),
}));

import { runPlanningQuery, streamPlanningQuery } from "@/lib/llm/planning-sdk-runner";
import {
  claudePlanningRequest,
  claudeStreamingRequest,
  type ClaudePlanningRequestInput,
} from "@/lib/llm/claude-client";

const minimalMapSnapshot = {
  project: { id: "p1", name: "P", description: "" },
  workflows: new Map(),
  activities: new Map(),
  cards: new Map(),
  contextArtifacts: new Map(),
} as ClaudePlanningRequestInput["mapSnapshot"];

const planningInput: ClaudePlanningRequestInput = {
  userRequest: "rebuild workflows from the real code",
  mapSnapshot: minimalMapSnapshot,
};

const streamInput = { systemPrompt: "system", userMessage: "user" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readAll(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += value;
  }
}

/** Agent that performs `steps` actions, `gapMs` apart, then returns `result`. */
function activeAgentRunner(steps: number, gapMs: number, result: string) {
  return async (opts: { onActivity?: (label: string) => void }) => {
    for (let i = 0; i < steps; i++) {
      await sleep(gapMs);
      opts.onActivity?.("tool Read");
    }
    return result;
  };
}

describe("planning timeouts: request path (claudePlanningRequest)", () => {
  beforeEach(() => {
    vi.mocked(runPlanningQuery).mockReset();
    delete process.env.PLANNING_IDLE_TIMEOUT_MS;
    delete process.env.PLANNING_OVERALL_TIMEOUT_MS;
  });

  afterEach(() => {
    delete process.env.PLANNING_IDLE_TIMEOUT_MS;
    delete process.env.PLANNING_OVERALL_TIMEOUT_MS;
  });

  it("does not time out while the agent keeps acting, even past the idle limit", async () => {
    // 10 actions * 30ms = 300ms total, well past the 100ms idle limit, but never idle that long.
    vi.mocked(runPlanningQuery).mockImplementation(activeAgentRunner(10, 30, "final answer"));

    const res = await claudePlanningRequest(planningInput, {
      apiKey: "sk-ant-api-key",
      timeoutMs: 100,
      overallTimeoutMs: 10_000,
    });

    expect(res.text).toBe("final answer");
  });

  it("fails with an idle error when the agent goes silent", async () => {
    vi.mocked(runPlanningQuery).mockImplementation(() => new Promise(() => {}));

    await expect(
      claudePlanningRequest(planningInput, { apiKey: "sk-ant-api-key", timeoutMs: 50, overallTimeoutMs: 10_000 }),
    ).rejects.toThrow(/timed out after 50ms without agent activity.*Try again/);
  });

  it("names the last agent action in the idle error", async () => {
    vi.mocked(runPlanningQuery).mockImplementation(async (opts) => {
      opts.onActivity?.("tool Glob");
      return new Promise<string>(() => {});
    });

    await expect(
      claudePlanningRequest(planningInput, { apiKey: "sk-ant-api-key", timeoutMs: 50, overallTimeoutMs: 10_000 }),
    ).rejects.toThrow(/last: tool Glob/);
  });

  it("enforces the overall limit even while the agent is still active", async () => {
    vi.mocked(runPlanningQuery).mockImplementation(async (opts) => {
      for (;;) {
        await sleep(20);
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        opts.onActivity?.("tool Read");
      }
    });

    await expect(
      claudePlanningRequest(planningInput, { apiKey: "sk-ant-api-key", timeoutMs: 100, overallTimeoutMs: 200 }),
    ).rejects.toThrow(/overall limit of 200ms.*Try again/);
  });

  it("reads the overall limit from PLANNING_OVERALL_TIMEOUT_MS when no option is given", async () => {
    process.env.PLANNING_OVERALL_TIMEOUT_MS = "150";
    vi.mocked(runPlanningQuery).mockImplementation(async (opts) => {
      for (;;) {
        await sleep(20);
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        opts.onActivity?.("tool Read");
      }
    });

    await expect(
      claudePlanningRequest(planningInput, { apiKey: "sk-ant-api-key", timeoutMs: 10_000 }),
    ).rejects.toThrow(/overall limit of 150ms/);
  });

  it("reads the idle limit from PLANNING_IDLE_TIMEOUT_MS when no option is given", async () => {
    process.env.PLANNING_IDLE_TIMEOUT_MS = "50";
    vi.mocked(runPlanningQuery).mockImplementation(() => new Promise(() => {}));

    await expect(
      claudePlanningRequest(planningInput, { apiKey: "sk-ant-api-key", overallTimeoutMs: 10_000 }),
    ).rejects.toThrow(/timed out after 50ms without agent activity/);
  });
});

describe("planning timeouts: streaming path (claudeStreamingRequest)", () => {
  beforeEach(() => {
    vi.mocked(streamPlanningQuery).mockReset();
    delete process.env.PLANNING_IDLE_TIMEOUT_MS;
    delete process.env.PLANNING_OVERALL_TIMEOUT_MS;
  });

  afterEach(() => {
    delete process.env.PLANNING_IDLE_TIMEOUT_MS;
    delete process.env.PLANNING_OVERALL_TIMEOUT_MS;
  });

  it("streams the final text without timing out while the agent keeps acting", async () => {
    vi.mocked(streamPlanningQuery).mockImplementation(async function* (opts: {
      onActivity?: (label: string) => void;
    }) {
      for (let i = 0; i < 10; i++) {
        await sleep(30);
        opts.onActivity?.("tool Read");
      }
      yield "final streamed text";
    } as never);

    const stream = await claudeStreamingRequest(streamInput, {
      apiKey: "sk-ant-api-key",
      timeoutMs: 100,
      overallTimeoutMs: 10_000,
    });

    expect(await readAll(stream)).toBe("final streamed text");
  });

  it("errors with an idle error when the stream goes silent", async () => {
    vi.mocked(streamPlanningQuery).mockImplementation(async function* () {
      await new Promise(() => {});
      yield "never";
    } as never);

    const stream = await claudeStreamingRequest(streamInput, {
      apiKey: "sk-ant-api-key",
      timeoutMs: 50,
      overallTimeoutMs: 10_000,
    });

    await expect(readAll(stream)).rejects.toThrow(/timed out after 50ms without agent activity.*Try again/);
  });

  it("enforces the overall limit even while the agent is still active", async () => {
    vi.mocked(streamPlanningQuery).mockImplementation(async function* (opts: {
      signal?: AbortSignal;
      onActivity?: (label: string) => void;
    }) {
      for (;;) {
        await sleep(20);
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        opts.onActivity?.("tool Read");
      }
    } as never);

    const stream = await claudeStreamingRequest(streamInput, {
      apiKey: "sk-ant-api-key",
      timeoutMs: 100,
      overallTimeoutMs: 200,
    });

    await expect(readAll(stream)).rejects.toThrow(/overall limit of 200ms.*Try again/);
  });

  it("aborts the agent run when the consumer cancels the stream", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(streamPlanningQuery).mockImplementation(async function* (opts: {
      signal?: AbortSignal;
      onActivity?: (label: string) => void;
    }) {
      capturedSignal = opts.signal;
      for (;;) {
        await sleep(20);
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        opts.onActivity?.("tool Read");
      }
    } as never);

    const stream = await claudeStreamingRequest(streamInput, {
      apiKey: "sk-ant-api-key",
      timeoutMs: 10_000,
      overallTimeoutMs: 10_000,
    });
    const reader = stream.getReader();
    await sleep(30);
    await reader.cancel();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
