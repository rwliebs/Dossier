/**
 * E2E test: Knowledge Items CRUD (requirements, facts, assumptions, questions).
 *
 * Validates the cross-cutting Knowledge Items contract from user-workflows-reference.md:
 *   "Knowledge items (requirements, facts, assumptions, questions) are used when
 *    they exist; no approval step"
 *
 * Seeds a project + card via the actions API, then exercises full CRUD on each
 * knowledge item type through the REST API.
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
} from "./helpers";

let serverUp = false;
let projectId: string;
let cardId: string;

beforeAll(async () => {
  serverUp = await canReachServer();
  if (!serverUp) return;

  const project = await createProject("Knowledge Items CRUD Test");
  projectId = project.id;
  const seeded = await seedProjectWithMap(projectId);
  cardId = seeded.cardId;
});

const ITEM_TYPES = ["requirements", "facts", "assumptions", "questions"] as const;

describe("knowledge items CRUD", () => {
  for (const itemType of ITEM_TYPES) {
    describe(itemType, () => {
      itLive(() => serverUp,`creates a ${itemType.slice(0, -1)}`, async () => {
        const body: Record<string, unknown> = {
          text: `Test ${itemType.slice(0, -1)}: user can sign up with email`,
          source: "user",
        };
        if (itemType === "facts") {
          body.evidence_source = "product spec";
        }

        const res = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        expect(res.status, `POST ${itemType} should return 201`).toBe(201);
        const created = await res.json();
        expect(created.id).toBeTruthy();
        expect(created.text).toContain("sign up");
      });

      itLive(() => serverUp,`lists ${itemType}`, async () => {
        const res = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}`
        );

        expect(res.status, `GET ${itemType} should return 200`).toBe(200);
        const items = await res.json();
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThanOrEqual(1);
      });

      itLive(() => serverUp,`updates a ${itemType.slice(0, -1)}`, async () => {
        const listRes = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}`
        );
        const items = await listRes.json();
        const itemId = items[0]?.id;
        expect(itemId, `need at least one ${itemType.slice(0, -1)} to update`).toBeTruthy();

        const updatedText = `Updated: user must verify email before sign up`;
        const patchRes = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}/${itemId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: updatedText }),
          }
        );

        expect(patchRes.status, `PATCH ${itemType} should return 200`).toBe(200);
        const updated = await patchRes.json();
        expect(updated.text).toBe(updatedText);
      });

      itLive(() => serverUp,`deletes a ${itemType.slice(0, -1)}`, async () => {
        const listRes = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}`
        );
        const items = await listRes.json();
        const itemId = items[0]?.id;
        expect(itemId, `need at least one ${itemType.slice(0, -1)} to delete`).toBeTruthy();

        const delRes = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}/${itemId}`,
          { method: "DELETE" }
        );

        expect(delRes.status, `DELETE ${itemType} should return 204`).toBe(204);

        const verifyRes = await fetch(
          `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/${itemType}`
        );
        const remaining = await verifyRes.json();
        const stillExists = remaining.some(
          (i: { id: string }) => i.id === itemId
        );
        expect(stillExists, `deleted ${itemType.slice(0, -1)} should be gone`).toBe(false);
      });
    });
  }
});
