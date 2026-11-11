/**
 * Zod schemas for API request payload validation.
 * Reuses domain schemas where applicable; adds request-specific shapes.
 */

import * as z from "zod";
import {
  planningActionTypeSchema,
  artifactTypeSchema,
  plannedFileActionSchema,
  plannedFileKindSchema,
  plannedFileStatusSchema,
  knowledgeItemStatusSchema,
  knowledgeItemSourceSchema,
} from "@/lib/schemas";

/**
 * Git branch name supplied by a client. Stored as project.default_branch and
 * used in git commands, so keep it to a conservative charset.
 */
const gitBranchNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._/-]+$/, "Branch name may only contain letters, numbers, ., _, /, -")
  .refine((n) => !n.startsWith("-") && !n.includes(".."), "Invalid branch name");

// Project create/update
export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  customer_personas: z.string().nullable().optional(),
  tech_stack: z.string().nullable().optional(),
  deployment: z.string().nullable().optional(),
  design_inspiration: z.string().nullable().optional(),
  repo_url: z.string().url().nullable().optional(),
  default_branch: gitBranchNameSchema.optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  customer_personas: z.string().nullable().optional(),
  tech_stack: z.string().nullable().optional(),
  deployment: z.string().nullable().optional(),
  design_inspiration: z.string().nullable().optional(),
  repo_url: z.string().url().nullable().optional(),
  default_branch: gitBranchNameSchema.optional(),
});

// Action submission
export const submitActionsSchema = z.object({
  actions: z.array(z.object({
    id: z.string().guid().optional(),
    action_type: planningActionTypeSchema,
    target_ref: z.record(z.string(), z.unknown()).default({}),
    payload: z.record(z.string(), z.unknown()).default({}),
  })),
});

// Context artifact create/update
export const createArtifactSchema = z.object({
  name: z.string().min(1),
  type: artifactTypeSchema,
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  locator: z.string().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  integration_ref: z.record(z.string(), z.unknown()).nullable().optional(),
}).refine(
  (d) => d.content || d.uri || d.integration_ref,
  { message: "At least one of content, uri, or integration_ref is required" }
);

export const updateArtifactSchema = z.object({
  name: z.string().min(1).optional(),
  type: artifactTypeSchema.optional(),
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  locator: z.string().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  integration_ref: z.record(z.string(), z.unknown()).nullable().optional(),
});

// Link artifact to card
export const linkArtifactSchema = z.object({
  context_artifact_id: z.string().guid(),
  usage_hint: z.string().nullable().optional(),
});

// Knowledge item create
const knowledgeItemCreateBase = z.object({
  text: z.string().min(1),
  status: knowledgeItemStatusSchema.optional(),
  source: knowledgeItemSourceSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const createRequirementSchema = knowledgeItemCreateBase;
export const createFactSchema = knowledgeItemCreateBase.extend({
  evidence_source: z.string().nullable().optional(),
});
export const createAssumptionSchema = knowledgeItemCreateBase;
export const createQuestionSchema = knowledgeItemCreateBase;

// Knowledge item update
export const updateKnowledgeItemSchema = z.object({
  text: z.string().min(1).optional(),
  status: knowledgeItemStatusSchema.optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

// Planned file create/update
export const createPlannedFileSchema = z.object({
  logical_file_name: z.string().min(1),
  module_hint: z.string().nullable().optional(),
  artifact_kind: plannedFileKindSchema,
  action: plannedFileActionSchema,
  intent_summary: z.string().min(1),
  contract_notes: z.string().nullable().optional(),
  status: plannedFileStatusSchema.optional(),
  position: z.number().int().nonnegative().optional(),
});

export const updatePlannedFileSchema = z.object({
  logical_file_name: z.string().min(1).optional(),
  module_hint: z.string().nullable().optional(),
  artifact_kind: plannedFileKindSchema.optional(),
  action: plannedFileActionSchema.optional(),
  intent_summary: z.string().min(1).optional(),
  contract_notes: z.string().nullable().optional(),
  status: plannedFileStatusSchema.optional(),
  position: z.number().int().nonnegative().optional(),
});


// Chat request (non-streaming; supports scaffold, populate, finalize per ADR 0009)
export const chatRequestSchema = z
  .object({
    message: z.string().min(1, "Message is required").transform((s) => s.trim()),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "agent"]),
          content: z.string(),
        })
      )
      .optional()
      .default([]),
    mode: z.enum(["scaffold", "populate", "finalize"]).optional(),
    workflow_id: z.string().guid().optional(),
    /** Test-only: mock LLM response. Only used when PLANNING_MOCK_ALLOWED=1 */
    mock_response: z.string().optional(),
  })
  .refine((d) => d.mode !== "populate" || d.workflow_id != null, {
    message: "workflow_id is required when mode is populate",
  });

// Chat stream request (scaffold or populate mode)
export const chatStreamRequestSchema = z.object({
  message: z.string().min(1, "Message is required").transform((s) => s.trim()),
  mode: z.enum(["scaffold", "populate", "finalize"]).optional().default("scaffold"),
  workflow_id: z.string().guid().optional(),
  /** Test-only: mock LLM response. Only used when PLANNING_MOCK_ALLOWED=1 */
  mock_response: z.string().optional(),
}).refine(
  (d) => d.mode !== "populate" || d.workflow_id != null,
  { message: "workflow_id is required when mode is populate" }
);

// Orchestration: create run (POST body; project_id from params)
export const createRunRequestSchema = z
  .object({
    scope: z.enum(["workflow", "card"]),
    workflow_id: z.string().guid().nullable().optional(),
    card_id: z.string().guid().nullable().optional(),
    trigger_type: z.enum(["card", "workflow", "manual"]).optional(),
    initiated_by: z.string().min(1),
    repo_url: z.string().url(),
    base_branch: z.string().min(1),
    run_input_snapshot: z.record(z.string(), z.unknown()),
    worktree_root: z.string().nullable().optional(),
  })
  .refine(
    (d) => {
      if (d.scope === "workflow") return d.workflow_id != null && d.card_id == null;
      if (d.scope === "card") return d.card_id != null;
      return true;
    },
    { message: "scope=workflow requires workflow_id; scope=card requires card_id" }
  );

// Orchestration: create assignment (POST body; run_id from params)
export const createAssignmentRequestSchema = z.object({
  card_id: z.string().guid(),
  agent_role: z.enum(["planner", "coder", "reviewer", "integrator", "tester"]),
  agent_profile: z.string().min(1),
  feature_branch: z.string().min(1),
  worktree_path: z.string().nullable().optional(),
  allowed_paths: z.array(z.string()).min(1),
  forbidden_paths: z.array(z.string()).nullable().optional(),
  assignment_input_snapshot: z.record(z.string(), z.unknown()).optional(),
});

// Orchestration: trigger build (POST body; project_id from params)
export const triggerBuildRequestSchema = z
  .object({
    scope: z.enum(["workflow", "card"]),
    workflow_id: z.string().guid().nullable().optional(),
    card_id: z.string().guid().nullable().optional(),
    trigger_type: z.enum(["card", "workflow", "manual"]).optional(),
    initiated_by: z.string().min(1),
  })
  .refine(
    (d) => {
      if (d.scope === "workflow") return d.workflow_id != null && d.card_id == null;
      if (d.scope === "card") return d.card_id != null;
      return true;
    },
    { message: "scope=workflow requires workflow_id; scope=card requires card_id" }
  );

// Orchestration: resume blocked build (POST body; project_id from params)
export const resumeBlockedRequestSchema = z.object({
  card_id: z.string().guid(),
  actor: z.string().min(1).optional(),
});

// Orchestration: create approval request (POST body)
export const createApprovalRequestSchema = z.object({
  run_id: z.string().guid(),
  approval_type: z.enum(["create_pr", "merge_pr"]),
  requested_by: z.string().min(1),
});
