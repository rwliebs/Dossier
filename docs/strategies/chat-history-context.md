# Strategy: Chat History in the Planning Prompt

## Context

The sidebar agent chat sent only the latest message to `POST /api/projects/[projectId]/chat`. The route accepted a `conversationHistory` field but never used it, so follow-ups such as "now mark those done" had no referent. The planning prompt also had no way to change card status.

## Principles

1. **One source of truth for history formatting.** Reuse `buildConversationMessages` (last 20 turns, alternating roles) rather than adding a second formatter.
2. **Same history on every planning path.** Scaffold (no structure yet) and planning (structure exists) both receive history. Clarification answers before a map exists are the most common case for losing context.
3. **No behavior change without history.** Requests with no `conversationHistory` produce the same prompt as before.
4. **Keep the transport simple.** The UI sends its existing in-memory messages. Nothing is persisted server-side.

## Decision

- **Sidebar** sends the last 20 messages (pre-submit snapshot) as `conversationHistory`.
- **Route** builds the final user message as `formatConversationTranscript(buildConversationMessages(..., contextMessage))` when history is present. The scaffold-vs-planning choice is unchanged.
- **Planning prompt** documents `updateCard` (status change by `card_id`). "Done" and similar words map to `production`, the only done-equivalent status.
- **`claude-client.ts` is unchanged.** The route overrides its user message, so the existing history branch there stays unused by this path.

## Alternatives Considered

| Option | Why not |
|---|---|
| Pass `conversationHistory` into `claudePlanningRequest` and drop `userMessageOverride` | Breaks the scaffold path, which builds a different context message |
| Persist history server-side per project | Larger change; no requirement for cross-session memory |
| Add a `done` card status | Schema and UI change; `production` already renders as done/live |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Long prompts from 20 turns of long agent replies | `buildConversationMessages` caps at 20 turns; agent replies are short summaries |
| Model maps "done" to the wrong status | Explicit mapping in the prompt; `production` is the only green/done state |
| Model infers references from the map instead of history | Route tests assert the transcript is in the prompt. Live run also passed without history (see Status) |
| Consecutive same-role turns break the API | `ensureAlternatingRoles` merges them (existing behavior) |

## Status

- **Implemented:** sidebar, route, prompt formatter, `updateCard` docs.
- **Tests:** 12 new unit and route tests. Route test fails when the route change is reverted. Full suite passes.
- **Live check:** two-turn chat in the browser against the real LLM. "Now mark those done" marked the three cards from the prior turn as `production`.
- **Not isolated by the live check:** a no-history control also succeeded, because the map made the three cards identifiable. History is verified by the route test, not by the live run.
- **Out of scope:** the Populate button flow does not read chat history.
