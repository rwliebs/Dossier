/**
 * E2E test: Card finalization validation and build gating.
 *
 * Validates contract invariants from user-workflows-reference.md:
 *   "INVARIANT: Build cannot trigger without finalized_at set"
 *   "INVARIANT: Build cannot trigger without card.finalized_at set"
 *
 * Tests:
 * - Finalization rejects cards without requirements
 * - Build rejects cards without finalized_at
 * - Finalization package (GET) returns expected structure
 *
 * Requires: dev server running (npm run dev). LLM needed only for full finalization.
 */

import { describe, expect, beforeAll } from "vitest";
import {
  BASE_URL,
  canReachServer,
  itLive,
  canRunLLMTests,
  createProject,
  seedProjectWithMap,
  createRequirement,
  createAndApprovePlannedFile,
  consumeSSE,
} from "./helpers";

let serverUp = false;
let projectId: string;
let cardId: string;

beforeAll(async () => {
  serverUp = await canReachServer();
  if (!serverUp) return;

  const project = await createProject("Finalize & Build Gate Test");
  projectId = project.id;
  const seeded = await seedProjectWithMap(projectId);
  cardId = seeded.cardId;
});

describe("card finalization and build gating", () => {
  itLive(() => serverUp,
    "finalize rejects card with no requirements",
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/finalize`,
        { method: "POST" }
      );

      expect(
        [400, 422].includes(res.status),
        `finalize without requirements should fail with 4xx, got ${res.status}`
      ).toBe(true);
    }
  );

  itLive(() => serverUp,
    "GET finalize package returns card data and empty artifacts",
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/finalize`
      );
      expect(res.status).toBe(200);

      const pkg = await res.json();
      expect(pkg.card).toBeTruthy();
      expect(pkg.card.id).toBe(cardId);
      expect(pkg.finalized_at).toBeNull();
      expect(Array.isArray(pkg.requirements)).toBe(true);
      expect(Array.isArray(pkg.planned_files)).toBe(true);
    }
  );

  itLive(() => serverUp,
    "build rejects card without finalized_at",
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/orchestration/build`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "card",
            card_id: cardId,
            trigger_type: "manual",
            initiated_by: "e2e-test",
          }),
        }
      );

      expect(
        res.status,
        "build should reject non-finalized card"
      ).toBeGreaterThanOrEqual(400);

      const body = await res.json();
      expect(
        body.error || body.message,
        "response should indicate validation failure"
      ).toBeTruthy();
    }
  );

  itLive(() => serverUp,
    "finalize package includes requirements after adding one",
    async () => {
      await createRequirement(projectId, cardId, "User can register with email and password");

      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/finalize`
      );
      const pkg = await res.json();

      expect(pkg.requirements.length).toBeGreaterThanOrEqual(1);
      expect(pkg.requirements[0].text).toContain("register");
    }
  );

  itLive(() => serverUp,
    "finalize package includes planned files after adding one",
    async () => {
      await createAndApprovePlannedFile(projectId, cardId, "src/signup.tsx");

      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/finalize`
      );
      const pkg = await res.json();

      expect(pkg.planned_files.length).toBeGreaterThanOrEqual(1);
    }
  );

  itLive(() => serverUp && canRunLLMTests(),
    "full finalization sets finalized_at via SSE stream",
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/finalize`,
        { method: "POST" }
      );

      expect(res.status).toBe(200);
      const events = await consumeSSE(res);

      const progressEvents = events.filter(
        (e) => e.event === "finalize_progress"
      );
      expect(progressEvents.length, "should emit progress events").toBeGreaterThanOrEqual(1);

      const phaseComplete = events.find(
        (e) =>
          e.event === "phase_complete" &&
          (e.data as { responseType?: string })?.responseType ===
            "card_finalize_complete"
      );
      expect(phaseComplete, "should emit card_finalize_complete").toBeTruthy();

      const completionData = phaseComplete!.data as {
        card_id?: string;
        finalized_at?: string;
      };
      expect(completionData.card_id).toBe(cardId);
      expect(completionData.finalized_at).toBeTruthy();

      const verifyRes = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/finalize`
      );
      const pkg = await verifyRes.json();
      expect(pkg.finalized_at).toBeTruthy();
    },
    120_000
  );
});
