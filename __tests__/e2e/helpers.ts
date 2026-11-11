/**
 * Shared E2E test utilities.
 *
 * Centralises SSE consumption, environment checks, seeding helpers,
 * and constants so individual E2E test files stay focused on scenario logic.
 */

import { it } from "vitest";

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

export const MARKETPLACE_PROMPT =
  "I want to build a trading card marketplace for canadian buyers and sellers of magic the gathering cards";

export function canRunLLMTests(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY &&
    process.env.NEXT_PUBLIC_PLANNING_LLM_ENABLED !== "false"
  );
}

export async function canReachServer(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/setup/status`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Drop-in replacement for `it.skipIf(...)` when the condition depends on state
 * set in `beforeAll` (e.g. `serverUp`).
 *
 * `it.skipIf(cond)` evaluates `cond` while the file is being collected, before
 * `beforeAll` runs, so a flag set there is always `false` and every test is
 * silently skipped. This helper evaluates `shouldRun` when the test executes
 * and calls `ctx.skip()` if it returns false, so the skip is reported honestly.
 */
export function itLive(
  shouldRun: () => boolean,
  name: string,
  fn: () => Promise<void>,
  timeout?: number,
): void {
  it(name, async (ctx) => {
    if (!shouldRun()) ctx.skip();
    await fn();
  }, timeout);
}

/** True when GET /api/projects returns a JSON array (Dossier API, not an HTML error page). */
export async function isDossierProjectsApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return false;
    const data: unknown = await res.json();
    return Array.isArray(data);
  } catch {
    return false;
  }
}

import { consumeSSEStream } from "@/lib/api/sse";

export async function consumeSSE(
  res: Response,
): Promise<{ event: string; data: unknown }[]> {
  return consumeSSEStream(res.body ?? null);
}

export interface MapCard {
  id: string;
  title: string;
  description: string | null;
}

export interface MapActivity {
  id: string;
  cards: MapCard[];
}

export interface MapWorkflow {
  id: string;
  title: string;
  activities: MapActivity[];
}

export interface MapSnapshot {
  project: { id: string; name: string };
  workflows: MapWorkflow[];
}

export interface PlannedFile {
  id: string;
  status: string;
}

export interface KnowledgeItem {
  id: string;
  text: string;
  status?: string;
  source?: string;
}

export async function fetchMapSnapshot(
  projectId: string
): Promise<MapSnapshot | null> {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/map`).catch(
    () => null
  );
  if (!res?.ok) return null;
  return res.json();
}

export async function fetchPlannedFiles(
  projectId: string,
  cardId: string
): Promise<PlannedFile[]> {
  const res = await fetch(
    `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/planned-files`
  ).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function getAllCards(map: MapSnapshot): MapCard[] {
  const cards: MapCard[] = [];
  for (const wf of map.workflows) {
    for (const act of wf.activities) {
      cards.push(...act.cards);
    }
  }
  return cards;
}

export function cardCount(wf: MapWorkflow): number {
  return wf.activities.reduce((sum, act) => sum + act.cards.length, 0);
}

// ---------------------------------------------------------------------------
// Seeding helpers — create project + map structure via API without LLM
// ---------------------------------------------------------------------------

export async function createProject(
  name?: string
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name ?? `E2E Test ${Date.now()}`,
      description: null,
    }),
  });
  if (!res.ok) throw new Error(`createProject failed: ${res.status}`);
  return res.json();
}

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Seed a project with a complete map structure (workflow → activity → card)
 * using the actions API. Returns all created IDs.
 */
export async function seedProjectWithMap(projectId: string): Promise<{
  workflowId: string;
  activityId: string;
  cardId: string;
}> {
  const workflowId = uuid();
  const activityId = uuid();
  const cardId = uuid();

  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actions: [
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createWorkflow",
          target_ref: { project_id: projectId },
          payload: { id: workflowId, title: "Core Features", position: 0 },
        },
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createActivity",
          target_ref: { workflow_id: workflowId },
          payload: { id: activityId, title: "User Management", color: "blue", position: 0 },
        },
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createCard",
          target_ref: { workflow_activity_id: activityId },
          payload: {
            id: cardId,
            title: "Sign Up Form",
            description: "User registration with email and password",
            status: "todo",
            priority: 1,
            position: 0,
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`seedProjectWithMap failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { workflowId, activityId, cardId };
}

/**
 * Seed a second workflow + activity + card in an existing project.
 */
export async function seedSecondWorkflow(projectId: string): Promise<{
  workflowId: string;
  activityId: string;
  cardId: string;
}> {
  const workflowId = uuid();
  const activityId = uuid();
  const cardId = uuid();

  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actions: [
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createWorkflow",
          target_ref: { project_id: projectId },
          payload: { id: workflowId, title: "Settings & Admin", position: 1 },
        },
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createActivity",
          target_ref: { workflow_id: workflowId },
          payload: { id: activityId, title: "Profile Settings", color: "green", position: 0 },
        },
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createCard",
          target_ref: { workflow_activity_id: activityId },
          payload: {
            id: cardId,
            title: "Edit Profile",
            description: "Allow users to update their profile information",
            status: "todo",
            priority: 1,
            position: 0,
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`seedSecondWorkflow failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { workflowId, activityId, cardId };
}

/**
 * Create a requirement on a card via the API.
 */
export async function createRequirement(
  projectId: string,
  cardId: string,
  text: string
): Promise<KnowledgeItem> {
  const res = await fetch(
    `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/requirements`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: "user" }),
    }
  );
  if (!res.ok) throw new Error(`createRequirement failed: ${res.status}`);
  return res.json();
}

/**
 * Create a planned file on a card and optionally approve it.
 */
export async function createAndApprovePlannedFile(
  projectId: string,
  cardId: string,
  fileName: string
): Promise<{ id: string }> {
  const createRes = await fetch(
    `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/planned-files`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logical_file_name: fileName,
        artifact_kind: "component",
        action: "create",
        intent_summary: `Implement ${fileName}`,
      }),
    }
  );
  if (!createRes.ok) throw new Error(`createPlannedFile failed: ${createRes.status}`);
  const file = await createRes.json();

  const patchRes = await fetch(
    `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/planned-files/${file.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    }
  );
  if (!patchRes.ok) throw new Error(`approvePlannedFile failed: ${patchRes.status}`);
  return file;
}
