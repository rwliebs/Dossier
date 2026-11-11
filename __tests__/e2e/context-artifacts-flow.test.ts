/**
 * E2E test: Context artifacts CRUD and card linking.
 *
 * Validates user-workflows-reference.md Workflow 2 success outcome:
 *   "Context linked via CardContextArtifact where relevant"
 *
 * Creates artifacts at the project level, links them to cards via the
 * linkContextArtifact planning action, and verifies the card's context
 * artifact list reflects the links.
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

  const project = await createProject("Context Artifacts Test");
  projectId = project.id;
  const seeded = await seedProjectWithMap(projectId);
  cardId = seeded.cardId;
});

describe("context artifacts flow", () => {
  let artifactId: string;

  itLive(() => serverUp,"creates a project-level context artifact", async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "auth-spec",
        type: "doc",
        title: "Authentication Specification",
        content: "Users authenticate via email/password. OAuth planned for v2.",
      }),
    });

    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("auth-spec");
    artifactId = created.id;
  });

  itLive(() => serverUp,"lists project artifacts", async () => {
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts`
    );
    expect(res.status).toBe(200);

    const artifacts = await res.json();
    expect(Array.isArray(artifacts)).toBe(true);
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    expect(artifacts.some((a: { id: string }) => a.id === artifactId)).toBe(true);
  });

  itLive(() => serverUp,"retrieves artifact by ID", async () => {
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts/${artifactId}`
    );
    expect(res.status).toBe(200);

    const artifact = await res.json();
    expect(artifact.id).toBe(artifactId);
    expect(artifact.content).toContain("email/password");
  });

  itLive(() => serverUp,"updates an artifact", async () => {
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts/${artifactId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Users authenticate via email/password or Google OAuth.",
        }),
      }
    );
    expect(res.status).toBe(200);

    const updated = await res.json();
    expect(updated.content).toContain("Google OAuth");
  });

  itLive(() => serverUp,
    "links artifact to card via linkContextArtifact action",
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: [
              {
                id: crypto.randomUUID(),
                project_id: projectId,
                action_type: "linkContextArtifact",
                target_ref: { card_id: cardId },
                payload: {
                  context_artifact_id: artifactId,
                  usage_hint: "auth requirements for sign-up card",
                },
              },
            ],
          }),
        }
      );

      expect(res.status).toBe(201);
    }
  );

  itLive(() => serverUp,
    "card's context-artifacts endpoint includes linked artifact",
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/context-artifacts`
      );
      expect(res.status).toBe(200);

      const artifacts = await res.json();
      expect(Array.isArray(artifacts)).toBe(true);
      expect(
        artifacts.some((a: { id: string }) => a.id === artifactId),
        "linked artifact should appear in card's context"
      ).toBe(true);
    }
  );

  itLive(() => serverUp,"creates artifact via createContextArtifact action", async () => {
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: [
            {
              id: crypto.randomUUID(),
              project_id: projectId,
              action_type: "createContextArtifact",
              target_ref: { project_id: projectId },
              payload: {
                name: "data-model-spec",
                type: "spec",
                title: "Data Model Specification",
                content: "Users table: id, email, password_hash, created_at",
              },
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(201);

    const listRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts`
    );
    const artifacts = await listRes.json();
    expect(
      artifacts.some((a: { name: string }) => a.name === "data-model-spec"),
      "artifact created via action should appear in project artifacts"
    ).toBe(true);
  });

  itLive(() => serverUp,"deletes an artifact", async () => {
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts/${artifactId}`,
      { method: "DELETE" }
    );
    expect(res.status).toBe(204);

    const verifyRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts/${artifactId}`
    );
    expect(verifyRes.status).toBe(404);
  });
});
