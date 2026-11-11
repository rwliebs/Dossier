/**
 * E2E test: Map structure invariant — Workflow → Activity → Card.
 *
 * Validates the contract invariant from user-workflows-reference.md:
 *   "INVARIANT: Map structure is Workflow → Activity → Step → Card;
 *    all mutations via PlanningAction"
 *
 * Seeds a project with two workflows via the actions API, then verifies
 * the map snapshot reflects the correct hierarchy.
 *
 * Requires: dev server running (npm run dev). No LLM needed.
 */

import { describe, expect, beforeAll } from "vitest";
import {
  BASE_URL,
  canReachServer,
  itLive,
  createProject,
  seedProjectWithMap,
  seedSecondWorkflow,
  fetchMapSnapshot,
  getAllCards,
} from "./helpers";

let serverUp = false;
let projectId: string;
let firstWorkflowId: string;
let firstActivityId: string;
let firstCardId: string;
let secondWorkflowId: string;

beforeAll(async () => {
  serverUp = await canReachServer();
  if (!serverUp) return;

  const project = await createProject("Map Structure Test");
  projectId = project.id;

  const first = await seedProjectWithMap(projectId);
  firstWorkflowId = first.workflowId;
  firstActivityId = first.activityId;
  firstCardId = first.cardId;

  const second = await seedSecondWorkflow(projectId);
  secondWorkflowId = second.workflowId;
});

describe("map structure invariant (Workflow → Activity → Card)", () => {
  itLive(() => serverUp,"map has correct number of workflows", async () => {
    const map = await fetchMapSnapshot(projectId);
    expect(map).toBeTruthy();
    expect(map!.workflows.length).toBe(2);
  });

  itLive(() => serverUp,"each workflow has activities with cards nested", async () => {
    const map = await fetchMapSnapshot(projectId);
    expect(map).toBeTruthy();

    for (const wf of map!.workflows) {
      expect(wf.id).toBeTruthy();
      expect(wf.title).toBeTruthy();
      expect(Array.isArray(wf.activities)).toBe(true);
      expect(wf.activities.length).toBeGreaterThanOrEqual(1);

      for (const act of wf.activities) {
        expect(act.id).toBeTruthy();
        expect(Array.isArray(act.cards)).toBe(true);
      }
    }
  });

  itLive(() => serverUp,"cards have required fields (id, title)", async () => {
    const map = await fetchMapSnapshot(projectId);
    const allCards = getAllCards(map!);
    expect(allCards.length).toBeGreaterThanOrEqual(2);

    for (const card of allCards) {
      expect(card.id).toBeTruthy();
      expect(card.title).toBeTruthy();
      expect(card.title.length).toBeGreaterThan(0);
    }
  });

  itLive(() => serverUp,"workflow IDs match seeded values", async () => {
    const map = await fetchMapSnapshot(projectId);
    const wfIds = map!.workflows.map((wf) => wf.id);
    expect(wfIds).toContain(firstWorkflowId);
    expect(wfIds).toContain(secondWorkflowId);
  });

  itLive(() => serverUp,"adding a card via actions appears in map snapshot", async () => {
    const newCardId = crypto.randomUUID();
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions: [
          {
            id: crypto.randomUUID(),
            project_id: projectId,
            action_type: "createCard",
            target_ref: { workflow_activity_id: firstActivityId },
            payload: {
              id: newCardId,
              title: "Login Form",
              description: "Email + password login",
              status: "todo",
              priority: 2,
              position: 1,
            },
          },
        ],
      }),
    });
    expect(res.status).toBe(201);

    const map = await fetchMapSnapshot(projectId);
    const allCards = getAllCards(map!);
    const found = allCards.find((c) => c.id === newCardId);
    expect(found, "newly added card should appear in map").toBeTruthy();
    expect(found!.title).toBe("Login Form");
  });

  itLive(() => serverUp,"deleting a card via actions removes it from map", async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions: [
          {
            id: crypto.randomUUID(),
            project_id: projectId,
            action_type: "deleteCard",
            target_ref: { card_id: firstCardId },
            payload: {},
          },
        ],
      }),
    });
    expect(res.status).toBe(201);

    const map = await fetchMapSnapshot(projectId);
    const allCards = getAllCards(map!);
    const found = allCards.find((c) => c.id === firstCardId);
    expect(found, "deleted card should not appear in map").toBeFalsy();
  });

  itLive(() => serverUp,"project refreshes retain persisted state", async () => {
    const snap1 = await fetchMapSnapshot(projectId);
    const snap2 = await fetchMapSnapshot(projectId);

    expect(snap1!.workflows.length).toBe(snap2!.workflows.length);
    expect(getAllCards(snap1!).length).toBe(getAllCards(snap2!).length);
  });
});
