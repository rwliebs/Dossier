/**
 * Chat history threading into the planning prompt.
 * Covers buildConversationMessages (history + explicit context message),
 * formatConversationTranscript (single-string rendering for SDK/CLI), and the
 * updateCard guidance in the planning system prompt.
 */

import { describe, it, expect } from "vitest";
import {
  buildConversationMessages,
  buildPlanningSystemPrompt,
  formatConversationTranscript,
  type ConversationMessage,
} from "@/lib/llm/planning-prompt";
import type { PlanningState } from "@/lib/schemas/planning-state";

const emptyState = {
  project: { id: "p1", name: "P", description: "" },
  workflows: new Map(),
  activities: new Map(),
  cards: new Map(),
  contextArtifacts: new Map(),
} as unknown as PlanningState;

describe("buildConversationMessages", () => {
  it("returns only the context message when there is no history", () => {
    const messages = buildConversationMessages("hello", emptyState, [], []);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("## User Request\nhello");
  });

  it("maps prior turns to user/assistant roles, then the current request last", () => {
    const history: ConversationMessage[] = [
      { role: "user", content: "Plan a todo app" },
      { role: "agent", content: "Which users are involved?" },
    ];
    const messages = buildConversationMessages("Two users: admins and members", emptyState, [], history);

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0].content).toBe("Plan a todo app");
    expect(messages[1].content).toBe("Which users are involved?");
    expect(messages[2].content).toContain("## User Request\nTwo users: admins and members");
  });

  it("keeps only the last 20 history turns", () => {
    const history: ConversationMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "agent",
      content: `turn-${i}`,
    }));
    const messages = buildConversationMessages("now", emptyState, [], history);
    const all = messages.map((m) => m.content).join("\n");

    expect(all).not.toContain("turn-0\n");
    expect(all).not.toContain("turn-4\n");
    expect(all).toContain("turn-5");
    expect(all).toContain("turn-24");
  });

  it("uses an explicit contextMessage as the final user turn instead of the planning message", () => {
    const history: ConversationMessage[] = [{ role: "user", content: "earlier" }];
    const messages = buildConversationMessages("req", emptyState, [], history, "SCAFFOLD CONTEXT");

    // Trailing user history merges with the context turn so roles keep alternating.
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content.endsWith("SCAFFOLD CONTEXT")).toBe(true);
    expect(messages.some((m) => m.content.includes("## User Request"))).toBe(false);
  });

  it("merges consecutive same-role turns so roles alternate", () => {
    const history: ConversationMessage[] = [
      { role: "agent", content: "first agent reply" },
      { role: "agent", content: "second agent reply" },
    ];
    const messages = buildConversationMessages("next", emptyState, [], history, "CTX");

    expect(messages[0]).toEqual({ role: "user", content: "(conversation continued)" });
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toContain("first agent reply");
    expect(messages[1].content).toContain("second agent reply");
    expect(messages[2]).toEqual({ role: "user", content: "CTX" });
  });
});

describe("formatConversationTranscript", () => {
  it("labels turns User/Assistant and keeps the final request at the end", () => {
    const text = formatConversationTranscript([
      { role: "user", content: "Build a marketplace" },
      { role: "assistant", content: "Which workflows matter most?" },
      { role: "user", content: "CURRENT REQUEST" },
    ]);

    expect(text).toContain("User: Build a marketplace");
    expect(text).toContain("Assistant: Which workflows matter most?");
    expect(text.trimEnd().endsWith("User: CURRENT REQUEST")).toBe(true);
    expect(text.indexOf("Build a marketplace")).toBeLessThan(text.indexOf("CURRENT REQUEST"));
  });

  it("tells the model to resolve references against earlier turns", () => {
    const text = formatConversationTranscript([{ role: "user", content: "x" }]);
    expect(text).toMatch(/Resolve references such as "those"/);
  });
});

describe("buildPlanningSystemPrompt updateCard guidance", () => {
  const prompt = buildPlanningSystemPrompt();

  it("documents updateCard with card_id target and status payload", () => {
    expect(prompt).toContain("## updateCard");
    expect(prompt).toContain('"card_id": "<id of the card from Current Map State>"');
    expect(prompt).toContain('"todo", "active", "questions", "review", "production"');
  });

  it("maps done-like wording to the production status", () => {
    expect(prompt).toMatch(/"done"[^\n]*means status "production"/);
  });
});
