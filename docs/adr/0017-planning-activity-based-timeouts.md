# ADR 0017: Planning Timeouts Are Activity-Based, With a Separate Overall Limit

- Status: Accepted
- Date: 2026-11-10
- Relates to: [ADR 0016](./0016-planning-agent-two-auth-paths.md)

## Context

The planning agent runs on the Agent SDK (`query()`). A single planning call often takes several turns of Read/Glob/Grep/WebSearch before it produces its final JSON. Two timeouts governed it, and both misjudged a healthy run as a stall:

- **Streaming path** (`claudeStreamingRequest`): an idle timer reset only when a yielded text chunk arrived. `planning-sdk-runner.ts` yields only the final result, so the timer ran for the whole agent run. Reading files counted as silence.
- **Request path** (`claudePlanningRequest`): a fixed wall-clock `setTimeout` (120 s by default) raced the whole run.

Reproduced on 2026-11-10 with the real Agent SDK against this repo: with an 8 s limit, both paths failed while the agent was actively reading files (the runs took 14-16 s).

## Decision

1. **Idle limit, restarted by activity.** Every SDK message the agent emits (tool call, tool result, text turn) restarts the idle timer. The runner reports each message through an `onActivity` callback, labelled with the tool name where there is one. Default idle limit: 120 s, unchanged.
2. **Separate overall limit.** A hard ceiling on one planning call, regardless of activity. It is not reset by activity. Default: 30 minutes.
3. **Both limits apply to both SDK paths.** One shared watchdog (`createPlanningWatchdog` in `claude-client.ts`) serves both.
4. **Configuration.** Idle: `timeoutMs` option or `PLANNING_IDLE_TIMEOUT_MS`. Overall: `overallTimeoutMs` option or `PLANNING_OVERALL_TIMEOUT_MS`. Explicit options win over env vars. Values must be positive numbers; anything else falls back to the default.
5. **Errors name the limit and the last action.** Idle: `timed out after Nms without agent activity (last: tool Read)`. Overall: `timed out: overall limit of Nms reached (last: ...)`. Both keep the word "timed out" so the chat route's user-facing mapping still applies.
6. **Cancelling the stream stops the agent run** and clears the timers.

## Principles

- A limit should detect a stall, not a long piece of work. Progress is evidence of life.
- A stall limit and a runaway limit answer different questions, so they are separate settings.
- Errors should say which limit fired and what the agent last did, so failures are diagnosable.

## Risks and Mitigations

- **Risk:** a runaway agent that keeps making tool calls is never stopped by the idle limit. **Mitigation:** the 30-minute overall limit caps it.
- **Risk:** a 30-minute ceiling is long for a user waiting in the UI. **Mitigation:** configurable via `PLANNING_OVERALL_TIMEOUT_MS`; lower it per deployment if needed.
- **Risk:** timers left running after a call. **Mitigation:** `finally` blocks and the stream `cancel()` hook stop them; covered by tests.

## Scope Limits

- The CLI subprocess paths (`claudePlanningRequestViaCli`, `claudeStreamingRequestViaCli`) keep their fixed 120 s limits. They are the fallback for users with no credential (ADR 0016). The request CLI path only returns once the process exits, so it has no intermediate activity. The streaming CLI path emits output per event, but deciding what counts as agent activity there is a separate choice. Revisit both if the fallback needs the same behaviour.

## Consequences

- Long, healthy planning runs complete instead of failing at 120 s.
- Failures are specific: "silent for N s" versus "hit the overall ceiling", with the last action named.
- Two new environment variables (see `.env.example`).

## Alternatives Considered

- **Raise the single fixed timeout** (for example to 10 minutes). Rejected: it still kills a healthy run that takes longer and still waits a long time before detecting a real stall.
- **Stream every SDK message to the client as progress.** Rejected for now: it changes the stream contract the parser depends on. The `onActivity` callback gives the timing signal without changing what the client receives.
- **Apply the same limits to the CLI subprocess paths now.** Deferred: the CLI path is a fallback and its stdout is not parsed for agent actions in the same way.
