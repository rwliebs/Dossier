import { execFileSync, spawn } from "child_process";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { ContextArtifact } from "@/lib/schemas/slice-b";
import {
  buildPlanningSystemPrompt,
  buildPlanningUserMessage,
  buildConversationMessages,
  type ConversationMessage,
} from "./planning-prompt";
import { resolvePlanningCredential } from "./planning-credential";
import { planningResponseFromSdkText } from "./planning-sdk-bridge";
import { runPlanningQuery, streamPlanningQuery } from "./planning-sdk-runner";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Distinguishes API keys (sk-ant-api*) from OAuth tokens (sk-ant-oat*). No longer used for planning routing; kept for tests. */
export function isLikelyApiKey(credential: string): boolean {
  return credential.startsWith("sk-ant-") && !credential.startsWith("sk-ant-oat");
}
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * SDK paths: silence allowed between agent actions. The timer restarts on every SDK message
 * (tool call, tool result, text turn), so reading files does not count as idle.
 * Override with PLANNING_IDLE_TIMEOUT_MS or the `timeoutMs` option.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

/**
 * SDK paths: hard ceiling for one planning call, however active the agent is.
 * Override with PLANNING_OVERALL_TIMEOUT_MS or the `overallTimeoutMs` option.
 */
const DEFAULT_OVERALL_TIMEOUT_MS = 30 * 60_000;

function readPositiveMsEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Resolves the idle and overall limits for an SDK planning call. Explicit options win over env. */
function resolvePlanningLimits(options?: { timeoutMs?: number; overallTimeoutMs?: number }): {
  idleMs: number;
  overallMs: number;
} {
  return {
    idleMs: options?.timeoutMs ?? readPositiveMsEnv("PLANNING_IDLE_TIMEOUT_MS") ?? DEFAULT_IDLE_TIMEOUT_MS,
    overallMs:
      options?.overallTimeoutMs ?? readPositiveMsEnv("PLANNING_OVERALL_TIMEOUT_MS") ?? DEFAULT_OVERALL_TIMEOUT_MS,
  };
}

interface PlanningWatchdog {
  /** Rejects with the limit error as soon as the idle or overall limit fires. */
  expired: Promise<never>;
  /** The limit error that ended the call, if a limit has fired. */
  readonly firedError: Error | undefined;
  /** Restarts the idle timer. The label describes the agent action for error messages. */
  touch(label?: string): void;
  /** Clears both timers. Call once the call has settled. */
  stop(): void;
}

/**
 * Tracks agent activity for one SDK planning call. The idle timer restarts on every touch();
 * the overall timer is set once and never restarts. Whichever limit fires first calls onExpire
 * (which aborts the SDK run) and rejects `expired`.
 */
function createPlanningWatchdog(
  limits: { idleMs: number; overallMs: number },
  onExpire: () => void,
): PlanningWatchdog {
  let lastActivity = "none yet";
  let firedError: Error | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectExpired: (error: Error) => void = () => {};

  const expired = new Promise<never>((_, reject) => {
    rejectExpired = reject;
  });
  // Nothing may be awaiting `expired` when a limit fires; avoid an unhandled rejection.
  expired.catch(() => {});

  function stop(): void {
    clearTimeout(idleTimer);
    clearTimeout(overallTimer);
  }

  function fire(error: Error): void {
    if (firedError) return;
    firedError = error;
    stop();
    onExpire();
    rejectExpired(error);
  }

  function armIdle(): void {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      fire(
        new Error(
          `Planning LLM request timed out after ${limits.idleMs}ms without agent activity (last: ${lastActivity}). Try again.`,
        ),
      );
    }, limits.idleMs);
  }

  const overallTimer = setTimeout(() => {
    fire(
      new Error(
        `Planning LLM request timed out: overall limit of ${limits.overallMs}ms reached (last: ${lastActivity}). Try again.`,
      ),
    );
  }, limits.overallMs);
  armIdle();

  return {
    expired,
    get firedError() {
      return firedError;
    },
    touch(label?: string) {
      if (firedError) return;
      if (label) lastActivity = label;
      armIdle();
    },
    stop,
  };
}

const CLI_DEFAULT_MODEL = "claude-sonnet-4-6";

/** Verify the claude binary exists and is authenticated (e.g. Max subscription). */
const CLI_VERSION_CHECK_TIMEOUT_MS = 3_000;

/** Process-lifetime cache for CLI probe (execFileSync). Windows resolves `claude` via `claude.cmd`; shell required for batch/cmd shims (CVE-2024-27980). */
let cliAvailableCache: boolean | null = null;

export function isClaudeCliAvailable(): boolean {
  if (cliAvailableCache !== null) return cliAvailableCache;
  try {
    execFileSync("claude", ["--version"], {
      stdio: "pipe",
      timeout: CLI_VERSION_CHECK_TIMEOUT_MS,
      shell: true,
      encoding: "utf-8",
    });
    cliAvailableCache = true;
    return true;
  } catch {
    cliAvailableCache = false;
    return false;
  }
}

/** Clear CLI availability cache (for tests). */
export function clearCliAvailabilityCache(): void {
  cliAvailableCache = null;
}

/**
 * Resolves auth method: API key (env or ~/.dossier/config or .claude/settings) vs CLI subprocess.
 * Use "api-key" path when any credential is present; use "cli" only when none and CLI is available.
 */
function resolveAuthMethod(apiKeyOverride?: string): "api-key" | "cli" {
  if (apiKeyOverride?.trim()) return "api-key";
  if (resolvePlanningCredential()) return "api-key";
  if (isClaudeCliAvailable()) return "cli";
  throw new Error(
    "No authentication configured. Set ANTHROPIC_API_KEY or install and authenticate Claude Code CLI.",
  );
}

/**
 * Run planning request via Claude Code CLI (-p). Uses machine credential (e.g. Max OAuth).
 * CLI does not support separate system prompt; we prepend it to the stdin payload.
 */
async function claudePlanningRequestViaCli(
  systemPrompt: string,
  userMessage: string,
  options?: { model?: string; timeoutMs?: number },
): Promise<ClaudePlanningResponse> {
  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? CLI_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdinPayload = `${systemPrompt}\n\n---\n\n${userMessage}`;

  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--model", model];
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`CLI planning request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { result?: string };
        resolve({
          text: parsed.result ?? stdout,
          stopReason: "end_turn",
          usage: { inputTokens: 0, outputTokens: 0 },
          model,
        });
      } catch {
        resolve({
          text: stdout.trim(),
          stopReason: "end_turn",
          usage: { inputTokens: 0, outputTokens: 0 },
          model,
        });
      }
    });

    proc.stdin.write(stdinPayload);
    proc.stdin.end();
  });
}

/**
 * Run streaming request via Claude Code CLI. Uses --output-format stream-json;
 * parses newline-delimited JSON and emits text deltas. Falls back to single chunk if needed.
 */
async function claudeStreamingRequestViaCli(
  systemPrompt: string,
  userMessage: string,
  options?: { model?: string; timeoutMs?: number },
): Promise<ReadableStream<string>> {
  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? CLI_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdinPayload = `${systemPrompt}\n\n---\n\n${userMessage}`;

  return new Promise((resolve) => {
    const args = ["-p", "--output-format", "stream-json", "--model", model];
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    let lineBuffer = "";
    let fullStdout = "";
    let hadChunk = false;

    const stream = new ReadableStream<string>({
      start(controller) {
        let done = false;

        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          if (error) {
            controller.error(error);
          } else {
            controller.close();
          }
        };

        const safeEnqueue = (text: string) => {
          if (done) return;
          controller.enqueue(text);
        };

        const timer = setTimeout(() => {
          proc.kill();
          if (!hadChunk && fullStdout.trim()) {
            hadChunk = true;
            safeEnqueue(fullStdout.trim());
          }
          if (!hadChunk) {
            finish(new Error(`CLI stream timed out after ${timeoutMs}ms`));
          } else {
            finish();
          }
        }, timeoutMs);

        proc.stdout.on("data", (chunk: Buffer) => {
          const str = chunk.toString();
          fullStdout += str;
          lineBuffer += str;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed) as { type?: string; text?: string; delta?: string };
              const text = parsed.text ?? parsed.delta ?? (typeof parsed === "string" ? parsed : "");
              if (text) {
                hadChunk = true;
                safeEnqueue(text);
              }
            } catch {
              // Not JSON or unknown shape; skip
            }
          }
        });

        proc.on("close", (code) => {
          clearTimeout(timer);
          if (lineBuffer.trim()) {
            try {
              const parsed = JSON.parse(lineBuffer.trim()) as { text?: string; delta?: string };
              const text = parsed.text ?? parsed.delta ?? lineBuffer.trim();
              if (text) {
                hadChunk = true;
                safeEnqueue(text);
              }
            } catch {
              // fall through to full buffer fallback
            }
          }
          if (!hadChunk && fullStdout.trim()) {
            hadChunk = true;
            safeEnqueue(fullStdout.trim());
          }
          if (code !== 0 && !hadChunk) {
            finish(new Error(`claude CLI exited with code ${code}`));
          } else {
            finish();
          }
        });

        proc.stderr.on("data", () => {});

        proc.stdin.write(stdinPayload);
        proc.stdin.end();
      },
    });

    resolve(stream);
  });
}

export interface ClaudeStreamingRequestInput {
  systemPrompt: string;
  userMessage: string;
}

export interface ClaudePlanningRequestInput {
  userRequest: string;
  mapSnapshot: PlanningState;
  linkedArtifacts?: ContextArtifact[];
  conversationHistory?: ConversationMessage[];
}

export interface ClaudePlanningResponse {
  text: string;
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

/**
 * Call Claude API for planning context engine.
 * Returns raw LLM response text for parsing into PlanningAction[].
 */
export async function claudePlanningRequest(
  input: ClaudePlanningRequestInput,
  options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    /** SDK paths: idle limit between agent actions (PLANNING_IDLE_TIMEOUT_MS, default 120s). CLI paths: fixed limit. */
    timeoutMs?: number;
    /** SDK paths: overall limit for the call (PLANNING_OVERALL_TIMEOUT_MS, default 30 min). */
    overallTimeoutMs?: number;
    systemPromptOverride?: string;
    userMessageOverride?: string;
    /** Working directory for SDK Read/Glob/Grep tools (e.g. cloned repo path). */
    cwd?: string;
    /** @internal Force CLI path for tests when child_process mock is not applied. */
    forceCliForTesting?: boolean;
  },
): Promise<ClaudePlanningResponse> {
  const auth = options?.forceCliForTesting === true ? "cli" : resolveAuthMethod(options?.apiKey);
  if (auth === "cli") {
    const systemPrompt = options?.systemPromptOverride ?? buildPlanningSystemPrompt();
    const history = input.conversationHistory ?? [];
    const userMessage = options?.userMessageOverride
      ? options.userMessageOverride
      : history.length > 0
        ? (() => {
            const messages = buildConversationMessages(
              input.userRequest,
              input.mapSnapshot,
              input.linkedArtifacts ?? [],
              history,
            );
            return messages
              .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
              .join("\n\n");
          })()
        : buildPlanningUserMessage(
            input.userRequest,
            input.mapSnapshot,
            input.linkedArtifacts ?? [],
          );
    return claudePlanningRequestViaCli(systemPrompt, userMessage, {
      model: options?.model,
      timeoutMs: options?.timeoutMs,
    });
  }

  const credential = options?.apiKey ?? resolvePlanningCredential();
  if (!credential) {
    throw new Error(
      "Anthropic credential required for planning. Set ANTHROPIC_API_KEY in .env.local or ~/.dossier/config, or use Claude Code (we use your installed CLI config when no key is set).",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const { idleMs, overallMs } = resolvePlanningLimits(options);

  const systemPrompt = options?.systemPromptOverride ?? buildPlanningSystemPrompt();
  const history = input.conversationHistory ?? [];
  const userMessage = options?.userMessageOverride
    ? options.userMessageOverride
    : history.length > 0
      ? (() => {
          const messages = buildConversationMessages(
            input.userRequest,
            input.mapSnapshot,
            input.linkedArtifacts ?? [],
            history,
          );
          return messages
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n\n");
        })()
      : buildPlanningUserMessage(
          input.userRequest,
          input.mapSnapshot,
          input.linkedArtifacts ?? [],
        );

  const controller = new AbortController();
  const watchdog = createPlanningWatchdog({ idleMs, overallMs }, () => controller.abort());
  try {
    const text = await Promise.race([
      runPlanningQuery({
        systemPrompt,
        userMessage,
        model,
        signal: controller.signal,
        ...(options?.cwd && { cwd: options.cwd }),
        apiKey: credential,
        onActivity: (label) => watchdog.touch(label),
      }),
      watchdog.expired,
    ]);
    return planningResponseFromSdkText(text, { model });
  } catch (error) {
    if (watchdog.firedError) throw watchdog.firedError;
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") {
      throw new Error(`Planning LLM request timed out after ${idleMs}ms. Try again.`);
    }
    if (error && typeof error === "object" && "status" in error && (error as { status: number }).status === 429) {
      throw new Error(
        "Planning service rate limit exceeded. Please try again in a moment.",
      );
    }
    throw error;
  } finally {
    watchdog.stop();
  }
}

/**
 * Call Claude API with streaming. Returns a ReadableStream that yields text deltas
 * as they arrive. Used for incremental parsing and live updates.
 *
 * Timeout behaviour: two limits, see resolvePlanningLimits. The idle limit restarts on every
 * agent action (SDK message, including tool calls and tool results), so a run that is reading
 * files is not treated as stalled. The overall limit caps the whole call. Either one aborts the run.
 */
export async function claudeStreamingRequest(
  input: ClaudeStreamingRequestInput,
  options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    /** SDK paths: idle limit between agent actions (PLANNING_IDLE_TIMEOUT_MS, default 120s). CLI paths: fixed limit. */
    timeoutMs?: number;
    /** SDK paths: overall limit for the call (PLANNING_OVERALL_TIMEOUT_MS, default 30 min). */
    overallTimeoutMs?: number;
    /** Working directory for SDK Read/Glob/Grep tools (e.g. cloned repo path). */
    cwd?: string;
  },
): Promise<ReadableStream<string>> {
  const auth = resolveAuthMethod(options?.apiKey);
  if (auth === "cli") {
    return claudeStreamingRequestViaCli(input.systemPrompt, input.userMessage, {
      model: options?.model,
      timeoutMs: options?.timeoutMs,
    });
  }

  const credential = options?.apiKey ?? resolvePlanningCredential();
  if (!credential) {
    throw new Error(
      "Anthropic credential required for planning. Set ANTHROPIC_API_KEY in .env.local or ~/.dossier/config, or use Claude Code (we use your installed CLI config when no key is set).",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const { idleMs, overallMs } = resolvePlanningLimits(options);

  const controller = new AbortController();
  const watchdog = createPlanningWatchdog({ idleMs, overallMs }, () => controller.abort());
  return new ReadableStream<string>({
    async start(streamController) {
      const iter = streamPlanningQuery({
        systemPrompt: input.systemPrompt,
        userMessage: input.userMessage,
        model,
        signal: controller.signal,
        ...(options?.cwd && { cwd: options.cwd }),
        apiKey: credential,
        onActivity: (label) => watchdog.touch(label),
      });
      try {
        while (true) {
          const result = (await Promise.race([iter.next(), watchdog.expired])) as IteratorResult<string>;
          if (result.done) break;
          watchdog.touch("final result");
          streamController.enqueue(result.value);
        }
        streamController.close();
      } catch (err) {
        streamController.error(
          watchdog.firedError ??
            (err && typeof err === "object" && (err as { name?: string }).name === "AbortError"
              ? new Error(`Planning LLM stream timed out after ${idleMs}ms. Try again.`)
              : err),
        );
      } finally {
        watchdog.stop();
      }
    },
    cancel() {
      watchdog.stop();
      controller.abort();
    },
  });
}
