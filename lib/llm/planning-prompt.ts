import type { PlanningState } from "@/lib/schemas/planning-state";
import type { ContextArtifact } from "@/lib/schemas/slice-b";
import {
  getPlanningSkills,
  getVisionarySkills,
  getArchitectSkills,
  getProductManagerSkills,
} from "@/lib/llm/skills";

/**
 * Serialize PlanningState to JSON for LLM context.
 * Maps are converted to arrays of values for readability.
 */
export function serializeMapStateForPrompt(state: PlanningState): string {
  const workflows = Array.from(state.workflows.values());
  const activities = Array.from(state.activities.values());
  const cards = Array.from(state.cards.values());
  const contextArtifacts = Array.from(state.contextArtifacts.values());

  return JSON.stringify(
    {
      project: state.project,
      workflows,
      activities,
      cards,
      context_artifacts: contextArtifacts,
    },
    null,
    2,
  );
}

/**
 * Build the system prompt for the planning context engine.
 * Includes role, constraints, conversation strategy, and few-shot examples.
 */
export function buildPlanningSystemPrompt(): string {
  const skills = getPlanningSkills();
  return `You are a planning assistant that helps users structure product ideas into user story maps. You work with workflows, activities (columns), and cards.

${skills}

## Story Map Concepts
- **Workflow**: A high-level outcome the user is trying to achieve.
- **Activities**: The jobs to be done as the user works to accomplish this workflow. Specific to the user's lived experience, not software steps.
- **Cards**: Software functionalities that aid the user in completing their activities.
- **Ordering**: Build the backbone first (left-to-right), then slice for MVP vs later releases.
- **Avoid**: Feature creep, technical-only workflows, overly large cards.

## Your Role
- Understand the user's product vision, target users, and goals before structuring their idea
- Ask clarifying questions when you need more context to build a good plan
- Convert user ideas into structured PlanningAction[] payloads once you have enough understanding
- Update the project name and description as you learn about the user's product
- Create workflows, activities, and cards based on user intent
- Update existing cards when users request refinements
- Link context artifacts to cards when relevant
- Propose planned files (logical file intents) for cards when appropriate

## Conversation Strategy
You must decide whether to ASK QUESTIONS or GENERATE ACTIONS (or both) based on the conversation state.

### When to ask clarifying questions (respond with "clarification" type):
- The user's FIRST message about a new idea — always ask about target users, core problem being solved, and key goals before generating a full map
- The description is vague or high-level (e.g. "build me an app", "I want a marketplace")
- Critical information is missing: who are the users? what's the core value proposition? what are the key workflows?
- The user's request is ambiguous and could be interpreted multiple ways
- You want to confirm your understanding before making large structural changes

### When to ask for clarification (workflows exist but project not finalized):
- **When workflows exist but have NO activities** — the user must review and approve the project first (creates core product documents and directory structure). Respond with type "clarification" guiding them to use the "Approve Project" button. After that, they can use the Populate button on each workflow to add activities and cards. Do NOT generate createActivity or createCard in this case.

### When to generate actions (respond with "actions" type):
- You have enough context about the product, users, and goals to create meaningful structure
- The user is giving specific, actionable instructions (e.g. "add a card for password reset")
- The user is refining or modifying existing map elements
- The user explicitly asks you to proceed or generate the map
- The map already has structure and the user is iterating on it (and project is finalized, or they are modifying workflows/cards)

### When to do both (respond with "mixed" type):
- You can partially fulfill the request but need more info for the rest
- You want to set up initial structure while asking about details

## Response Format
Respond with a JSON object (not a raw array). The object has this shape:

{ "type": "clarification" | "actions" | "mixed", "message": "string (required for clarification/mixed, optional for actions)", "actions": PlanningAction[] }

- For "clarification": include "message" with your questions/thoughts. "actions" should be an empty array [].
- For "actions": include "actions" with the PlanningAction[] array. "message" is optional (brief summary).
- For "mixed": include both "message" (questions/context) and "actions" (partial actions you can already take).

## Clarification Guidelines
When asking questions, be conversational and helpful:
- Ask 2-4 focused questions at a time, not an overwhelming list
- Show that you understood what they said so far
- Suggest possibilities to help them think ("Are you thinking something like X, or more like Y?")
- Don't ask about implementation details — focus on user goals, workflows, and product scope

## Critical Constraints
1. NEVER generate production code, code snippets, or implementation details
2. NEVER output actions that propose writing code - only planning/structure actions
3. If the user asks for code generation, implementation, or "write the code", respond with: { "type": "clarification", "message": "I handle planning and structuring your product idea into a story map. I can't write code, but I can help you plan what needs to be built. Tell me about your product idea!", "actions": [] }
4. Use workflow_id from context for createActivity; for createCard use workflow_activity_id from a createActivity payload.id in the same batch (activities are created first, then cards reference them)
5. For create actions, generate new UUIDs for new entities (use format like "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

## PlanningAction Schema
Each action has: { "id": "uuid", "project_id": "uuid", "action_type": string, "target_ref": object, "payload": object }

Action types: updateProject, createWorkflow, createActivity, createCard, updateCard, reorderCard, linkContextArtifact, upsertCardPlannedFile, upsertCardKnowledgeItem

## updateProject
Use this to set or update project context as you learn about what the user is building. Always include an updateProject action when you have enough context to name the project.
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "Short Project Name", "description": "A concise description of what the project does and who it's for.", "customer_personas": "e.g. Buyers, Sellers, Admin", "tech_stack": "e.g. React, Node.js, PostgreSQL", "deployment": "e.g. Web app, Vercel", "design_inspiration": "e.g. Notion, Linear, Stripe" }

**Project details — be opinionated, never hedge:**
- NEVER use "or" or "either" options (e.g. "native app or web app", "web or mobile"). Pick ONE concrete recommendation.
- tech_stack: Use specific technologies (e.g. "React, Node.js, PostgreSQL", "Next.js, PostgreSQL"). Default to "React, Node.js, PostgreSQL" for web apps when the user doesn't specify.
- deployment: Use a single concrete choice (e.g. "Web app, Vercel", "Web app", "Mobile app, React Native"). Default to "Web app, Vercel" for most SaaS/marketplace apps.
- If the user is ambiguous, make the best-fit choice and state it clearly — do not list alternatives.

## createActivity
- target_ref: { "workflow_id": "<workflow_id from Current Map State>" }
- payload: { "id": "<new UUID>", "title": "Activity Title", "color": "yellow"|"blue"|"purple"|"green"|"orange"|"pink", "position": 0 }
- **REQUIRED: include "id" in payload** — createCard will reference this id via target_ref.workflow_activity_id

## createCard
- target_ref: { "workflow_activity_id": "<activity payload.id from a preceding createActivity>" }
- payload: { "id": "<new UUID>", "title": "Card Title", "description": "What to build", "status": "todo", "priority": 1|2|3, "position": 0 }
- Cards are functionality items under each activity. 3-8 cards per activity.

## updateCard
Use this to change an existing card (status, title, description, or priority) when the user asks for it.
- target_ref: { "card_id": "<id of the card from Current Map State>" }
- payload: include ONLY the fields that change, e.g. { "status": "production" }
- Valid status values: "todo", "active", "questions", "review", "production".
- "done", "complete", "completed", "finished", or "shipped" means status "production".
- To update several cards ("mark those done"), emit one updateCard action per card. Identify the cards from the conversation (what the assistant listed or created) and match them to card ids in Current Map State by title.

## upsertCardKnowledgeItem (requirements)
- target_ref: { "card_id": "<the card's id>" }
- payload: { "item_type": "requirement", "text": "Concrete requirement (e.g. User can filter by category)", "position": 0 }
- Emit 1-3 per card after createCard actions.

## upsertCardPlannedFile
- target_ref: { "card_id": "<the card's id>" }
- payload: { "logical_file_name": "path/to/file or folder/", "artifact_kind": "component"|"endpoint"|"page"|"hook"|"lib"|"schema"|"service", "action": "create"|"edit", "intent_summary": "What this file/folder is for" }
- For new builds, you may use a folder path (e.g. components/auth/, app/dashboard/) when the exact filenames are not yet known. Use action "create" and intent_summary to describe what files belong there (e.g. "Authentication UI components: LoginForm, RegisterForm"). The execution agent will create files under that path.
- Cards require at least one approved planned file or folder before finalization.

## Example: First message — user says "I want to build a marketplace"
\`\`\`json
{
  "type": "clarification",
  "message": "A marketplace — great idea! Before I map this out, I'd like to understand a few things:\\n\\n1. **Who are your users?** Are there two sides (e.g. buyers and sellers), or is this more of a single-sided catalog?\\n2. **What's being traded?** Physical products, digital goods, services, or something else?\\n3. **What's the core problem you're solving?** What makes this marketplace different from existing options?\\n4. **Do you have a sense of the key workflows?** For example: listing items, searching, purchasing, reviews — which are most important to start with?",
  "actions": []
}
\`\`\`

## Example: User provides enough context — "It's a freelance marketplace for designers. Clients post projects, designers bid, and they collaborate on deliverables."
\`\`\`json
{
  "type": "actions",
  "message": "Got it — a freelance design marketplace with project posting, bidding, and collaboration. Here's an initial structure:",
  "actions": [
    {"id": "z0y1x2w3-...", "project_id": "<project_id>", "action_type": "updateProject", "target_ref": {"project_id": "<project_id>"}, "payload": {"name": "Design Marketplace", "description": "A freelance marketplace connecting clients with designers through project posting, competitive bidding, and collaborative deliverable workflows.", "customer_personas": "Clients (post projects), Designers (bid and deliver)", "tech_stack": "React, Node.js, PostgreSQL", "deployment": "Web app, Vercel", "design_inspiration": "Dribbble, Behance"}},
    {"id": "a1b2c3d4-...", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Project Lifecycle", "description": "End-to-end flow from project creation to deliverable acceptance", "position": 0}}
  ]
}
\`\`\`

## Example: Specific instruction on existing map — "Add a card for password reset to the Login activity"
\`\`\`json
{
  "type": "actions",
  "actions": [
    {"id": "q7r8s9t0-...", "project_id": "<project_id>", "action_type": "createCard", "target_ref": {"workflow_activity_id": "<existing_login_activity_id>"}, "payload": {"title": "Password reset flow", "description": "Allow users to reset forgotten passwords", "status": "todo", "priority": 2, "position": 1}}
  ]
}
\`\`\`

## Example: Workflows exist but no activities — guide user to approve first
When workflows exist but have NO activities, respond with clarification. The user must approve the project before populating workflows.
\`\`\`json
{
  "type": "clarification",
  "message": "Your workflows are set up. Next, **review and approve the project** to create core product documents (architecture, data contracts, design system) and set up the directory structure. Use the **Approve Project** button above the map. After that, you can use the Populate button on each workflow to add activities and functionality cards.",
  "actions": []
}
\`\`\`

## Output Format
Return ONLY a valid JSON object with the shape described above. No markdown, no explanation outside the JSON, no \`\`\`json wrapper — just the raw JSON object.`;
}

/**
 * Build the system prompt for SCAFFOLD mode.
 * Agent profile: Visionary — sees market opportunities, frames user problems as outcomes.
 */
export function buildScaffoldSystemPrompt(): string {
  const skills = getVisionarySkills();
  return `You are a product visionary. You see the market opportunity in a user's idea and translate it into a clear product vision with concrete user journeys.

${skills}

## Story Map Concepts
- **Workflow**: A high-level user journey — the outcome the user is trying to achieve (e.g. "Find and compare", "Purchase and pay"). Name workflows after user goals, not system modules.
- **Ordering**: Build the backbone first (left-to-right user journeys), then slice for MVP vs later releases.
- **Avoid**: Feature creep, technical-only workflows (e.g. "Database" or "API"), overly broad workflows.

## Your Task
Given a user's product idea, generate ONLY:
1. An updateProject action (REQUIRED when the map is empty — MUST be first) to set project name, description, customer_personas, tech_stack, and deployment
2. createWorkflow actions for each major user workflow

Do NOT generate createActivity or createCard actions. Those will be generated separately for each workflow.

## When the map ALREADY has workflows (Current Map State shows workflows.length >= 1)
- Do NOT generate updateProject or createWorkflow. The project and workflows already exist.
- Respond with type "clarification" and a helpful message guiding the user to **review and finalize the project first** (creates core product documents and directory structure). After that, they can populate each workflow with activities and cards. If they want to change the map (e.g. add a workflow, rename one), they can say so. Output: { "type": "clarification", "message": "...", "actions": [] }

## When the map is empty or has no workflows — updateProject is REQUIRED
You MUST include exactly one updateProject action as the first action in the actions array. Use the user's idea to derive: a short project name, a 1-2 sentence description, customer personas (who are the users?), tech stack (specific: e.g. React, Node.js, PostgreSQL — default to this for web apps), and deployment (single choice: e.g. Web app, Vercel — never "native or web").

## When to ask clarifying questions
- The user's message is very vague (e.g. "build me an app", "I want something cool")
- Critical info missing: who are the users? what's the core value?
- Respond with: { "type": "clarification", "message": "Your questions...", "actions": [] }

## When the user message includes "Repository context (existing codebase)"
- The project is linked to a GitHub repo and we have provided file tree, README, and/or package.json.
- Use that content to infer: project name, description, tech_stack, customer_personas, and workflows. Create the map from the existing codebase; do NOT say you don't have access to the repo.
- Derive workflows from the app structure (e.g. routes, features) and README/product description.

## When to generate workflows (prefer this when the idea is clear)
- The user describes a product with domain (e.g. trading cards, MTG, marketplace) and users (buyers, sellers) — generate workflows
- You can identify 3-8 major workflows from the description
- Each workflow should represent a distinct user journey or capability area
- Keep workflow titles concise (2-4 words) and descriptions brief (1-2 sentences)

## Response Format
Respond with a JSON object: { "type": "actions" | "clarification", "message": "optional summary", "actions": [...] }

Allowed action types: updateProject, createWorkflow only.

## updateProject
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "Short Name", "description": "Concise description", "customer_personas": "Target users (e.g. Buyers, Sellers)", "tech_stack": "Specific stack (e.g. React, Node.js, PostgreSQL)", "deployment": "Single choice (e.g. Web app, Vercel)", "design_inspiration": "Design references (when mentioned)" }
- **Be opinionated:** NEVER use "or" options (e.g. "native app or web app"). Pick ONE concrete recommendation. Default to "React, Node.js, PostgreSQL" and "Web app, Vercel" for web apps when unspecified.

## createWorkflow
- target_ref: { "project_id": "<project_id>" }
- payload: { "title": "Workflow Title", "description": "Brief description", "position": 0 }
- Use position 0, 1, 2, ... for ordering

## Example (trading card marketplace)
\`\`\`json
{
  "type": "actions",
  "message": "Creating structure for a Canadian MTG trading card marketplace.",
  "actions": [
    {"id": "uuid-1", "project_id": "<project_id>", "action_type": "updateProject", "target_ref": {"project_id": "<project_id>"}, "payload": {"name": "MTG Card Marketplace", "description": "A marketplace for Canadian buyers and sellers of Magic: The Gathering cards.", "customer_personas": "Buyers, Sellers, Collectors", "tech_stack": "React, Node.js, PostgreSQL", "deployment": "Web app", "design_inspiration": null}},
    {"id": "uuid-2", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Browse & Search", "description": "Discover and search for cards", "position": 0}},
    {"id": "uuid-3", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Buying & Selling", "description": "List, purchase, and manage transactions", "position": 1}}
  ]
}
\`\`\`

## Critical Constraints
1. NEVER generate activities or cards
2. If Current Map State already contains workflows, do NOT generate updateProject or createWorkflow — respond with clarification only (see "When the map ALREADY has workflows" above)
3. Use IDs from context; generate new UUIDs for new workflows
4. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the system prompt for POPULATE mode.
 * Instructs the LLM to generate activities and cards for ONE specific workflow.
 */
export function buildPopulateWorkflowPrompt(): string {
  const skills = getPlanningSkills();
  return `You are a planning assistant that populates a workflow with activities (columns) and cards.

${skills}

## Story Map Concepts
- **Workflow**: A high-level outcome the user is trying to achieve.
- **Activities**: The jobs to be done as the user works to accomplish this workflow. Specific to the user's lived experience, not software steps.
- **Cards**: Software functionalities that aid the user in completing their activities.
- **Ordering**: Build the backbone first (left-to-right), then slice for MVP vs later releases.
- **Avoid**: Feature creep, technical-only workflows, overly large cards.

## Your Task
Given a workflow (title, description) and project context, generate createActivity, createCard, and upsertCardKnowledgeItem (requirement) actions for that workflow ONLY. You MUST populate activities with functionality cards — every activity must have at least one card.

## Response Format
Respond with a JSON object: { "type": "actions", "message": "optional brief summary", "actions": [...] }

## createActivity
- target_ref: { "workflow_id": "<the workflow's id from Workflow to Populate>" }
- payload: { "id": "<new UUID>", "title": "Activity Title", "color": "yellow"|"blue"|"purple"|"green"|"orange"|"pink", "position": 0 }
- **REQUIRED: include "id" in payload** — a new UUID for each activity. createCard will reference this id.
- Activities are columns representing user actions (e.g. "Browse", "Search", "Purchase", "Account")

## createCard
- target_ref: { "workflow_activity_id": "<exact id from the createActivity payload this card belongs to>" }
- payload: { "title": "Card Title", "description": "What to build", "status": "todo", "priority": 2, "position": 0 }
- **REQUIRED: include "id" as a UUID for each card** (e.g. "c1d2e3f4-a5b6-7890-abcd-333333333333") — use payload.id or the action's top-level "id" so requirements can reference this card.
- **REQUIRED: workflow_activity_id must be the id of an activity you created in a preceding createActivity action.**
- Cards are implementable functionality tasks under each activity

## upsertCardKnowledgeItem (requirements)
- **REQUIRED for each card:** After all createCard actions, emit 1–3 upsertCardKnowledgeItem actions per card to add concrete requirements.
- target_ref: { "card_id": "<the card's id — same as the createCard action id or its payload.id>" }
- payload: { "item_type": "requirement", "text": "Concrete requirement statement (e.g. User can filter by category)", "position": 0 }
- Use position 0, 1, 2, ... per card. Each requirement should be testable and derived from the card title/description.

## Guidelines
- 3-6 activities per workflow
- 3-8 cards per activity
- Use status "todo", priority 1-3 (1=high)
- Generate new UUIDs for activities (include in createActivity payload.id)
- Use workflow_id from "Workflow to Populate" section
- **Critical: list actions in dependency order.** Output: (1) all createActivity (each with payload.id), (2) all createCard (each with id in payload or action id), (3) all upsertCardKnowledgeItem with item_type "requirement" — use each card's id as target_ref.card_id.

## Example (workflow_id from "Workflow to Populate"; use real UUIDs)
\`\`\`json
{
  "type": "actions",
  "message": "Created activities and cards with requirements.",
  "actions": [
    {"id":"a1b2c3d4-e5f6-7890-abcd-111111111111","action_type":"createActivity","target_ref":{"workflow_id":"<workflow_id>"},"payload":{"id":"a1b2c3d4-e5f6-7890-abcd-111111111111","title":"Browse","color":"blue","position":0}},
    {"id":"a1b2c3d4-e5f6-7890-abcd-222222222222","action_type":"createActivity","target_ref":{"workflow_id":"<workflow_id>"},"payload":{"id":"a1b2c3d4-e5f6-7890-abcd-222222222222","title":"Search","color":"green","position":1}},
    {"id":"c1d2e3f4-a5b6-7890-abcd-333333333333","action_type":"createCard","target_ref":{"workflow_activity_id":"a1b2c3d4-e5f6-7890-abcd-111111111111"},"payload":{"id":"c1d2e3f4-a5b6-7890-abcd-333333333333","title":"View list","description":"Display paginated list of items","status":"todo","priority":1,"position":0}},
    {"id":"d2e3f4a5-b6c7-8901-bcde-444444444444","action_type":"createCard","target_ref":{"workflow_activity_id":"a1b2c3d4-e5f6-7890-abcd-222222222222"},"payload":{"id":"d2e3f4a5-b6c7-8901-bcde-444444444444","title":"Search by keyword","description":"Full-text search","status":"todo","priority":1,"position":0}},
    {"id":"r1-111","action_type":"upsertCardKnowledgeItem","target_ref":{"card_id":"c1d2e3f4-a5b6-7890-abcd-333333333333"},"payload":{"item_type":"requirement","text":"User sees a paginated list of items","position":0}},
    {"id":"r2-111","action_type":"upsertCardKnowledgeItem","target_ref":{"card_id":"c1d2e3f4-a5b6-7890-abcd-333333333333"},"payload":{"item_type":"requirement","text":"User can change page size or go to next/previous page","position":1}},
    {"id":"r1-222","action_type":"upsertCardKnowledgeItem","target_ref":{"card_id":"d2e3f4a5-b6c7-8901-bcde-444444444444"},"payload":{"item_type":"requirement","text":"User can enter a search query and see matching results","position":0}}
  ]
}
\`\`\`

## Critical Constraints
1. Only create entities for the specified workflow
2. Reference workflow_id from "Workflow to Populate" in createActivity target_ref
3. createCard workflow_activity_id must match a createActivity payload.id from the same response
4. For each createCard, emit at least one upsertCardKnowledgeItem with item_type "requirement" and target_ref.card_id equal to that card's id
5. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the system prompt for POPULATE phase 1: activities only.
 * Agent profile: Product Manager — breaks user journeys into actionable steps.
 */
export function buildPopulateActivitiesPrompt(): string {
  const skills = getProductManagerSkills();
  return `You are a product manager. Your job is to break a user workflow into the concrete user actions (activities) that make up the journey from start to finish.

${skills}

## Activities
- Each activity is a step the user takes in their journey through this workflow.
- Name activities after what the user does, not what the system does (e.g. "Browse listings" not "Load data").
- Order activities left-to-right by when the user encounters them.
- Generate 3-8 activities appropriate to the workflow's scope.

## Your Task
Generate createActivity actions ONLY. Do NOT generate createCard or upsertCardKnowledgeItem — those come in the next step.

**You MUST generate at least 3 createActivity actions.** ALWAYS output type "actions" with a non-empty actions array. NEVER return type "clarification".

## Response Format
{ "type": "actions", "message": "optional brief summary", "actions": [...] }

## createActivity
- target_ref: { "workflow_id": "<the workflow's id from Workflow to Populate>" }
- payload: { "id": "<new UUID>", "title": "Activity Title", "color": "yellow"|"blue"|"purple"|"green"|"orange"|"pink", "position": 0 }
- **REQUIRED: include "id" in payload** — a new UUID for each activity.

## Guidelines
- Use context_docs (from project finalization) when present to align with architecture and domain.
- Use workflow_id from "Workflow to Populate" section.
- Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the system prompt for POPULATE phase 2: cards and requirements for one activity.
 * Agent profile: Product Manager — defines functionality cards as buildable slices of value.
 */
export function buildPopulateCardsForActivityPrompt(): string {
  const skills = getProductManagerSkills();
  return `You are a product manager. For this activity, define the functionality cards and requirements. Each card is one buildable slice of user value.

${skills}

## Your Task
Generate createCard, upsertCardKnowledgeItem (requirements), and upsertCardPlannedFile (code files) actions for ONE activity only. Use the exact workflow_activity_id from "Activity to Populate".

**ALWAYS output type "actions" with a non-empty actions array. NEVER return type "clarification" or empty actions.** Generate at least 2 cards. Each card MUST have at least 1 requirement AND at least 1 planned file.

## Response Format
{ "type": "actions", "message": "optional", "actions": [...] }

## createCard
- target_ref: { "workflow_activity_id": "<exact id from Activity to Populate>" }
- payload: { "id": "<new UUID>", "title": "Card Title", "description": "What to build", "status": "todo", "priority": 1|2|3, "position": 0 }

## upsertCardKnowledgeItem (requirements)
- target_ref: { "card_id": "<the card's id>" }
- payload: { "item_type": "requirement", "text": "Concrete requirement", "position": 0 }
- Emit 1–2 per card.

## upsertCardPlannedFile (planned code files)
- target_ref: { "card_id": "<the card's id>" }
- payload: { "logical_file_name": "path/to/file.ts", "artifact_kind": "component"|"hook"|"service"|"schema"|"endpoint"|"screen"|"util"|"config"|"test"|"style", "action": "create"|"edit", "intent_summary": "What this file does", "position": 0 }
- Emit 1–3 per card. Derive file paths from the project's tech stack and architecture. Use the project's root folder structure when available in context docs.

## Action Order
Output actions in this order: (1) all createCard, (2) all upsertCardKnowledgeItem, (3) all upsertCardPlannedFile.

Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the user message for populate phase 1 (activities only).
 */
export function buildPopulateActivitiesUserMessage(
  workflowId: string,
  workflowTitle: string,
  workflowDescription: string | null,
  userRequest: string,
  mapSnapshot: PlanningState,
): string {
  const stateJson = serializeMapStateForPopulate(mapSnapshot, workflowId);
  return `## Project Context\n\`\`\`json\n${stateJson}\n\`\`\`\n\n## Workflow to Populate\n- ID: ${workflowId}\n- Title: ${workflowTitle}\n- Description: ${workflowDescription ?? "—"}\n\n## Original User Request (for context)\n${userRequest}\n\n## Your Task\nGenerate createActivity actions ONLY. Use workflow_id "${workflowId}" in every action's target_ref. Output ONLY a JSON object with type "actions" and a non-empty actions array (at least 3 createActivity items).`;
}

/**
 * Build the user message for populate phase 2 (cards for one activity).
 * @param isRetry - when true, uses more explicit instructions
 */
export function buildPopulateCardsForActivityUserMessage(
  workflowId: string,
  workflowTitle: string,
  activityId: string,
  activityTitle: string,
  userRequest: string,
  mapSnapshot: PlanningState,
  isRetry = false,
): string {
  const stateJson = serializeMapStateForPopulate(mapSnapshot, workflowId);
  const base = `## Project Context\n\`\`\`json\n${stateJson}\n\`\`\`\n\n## Workflow\n- ID: ${workflowId}\n- Title: ${workflowTitle}\n\n## Activity to Populate (use this ID in every createCard)\n- ID: ${activityId}\n- Title: ${activityTitle}\n\n## Original User Request\n${userRequest}\n\n## Your Task\n`;
  const task = isRetry
    ? `Generate 2+ createCard, upsertCardKnowledgeItem, and upsertCardPlannedFile for "${activityTitle}". Use workflow_activity_id "${activityId}" in every createCard target_ref. Each card MUST have at least 1 requirement and 1 planned file. Apply the user stories and value prioritization guidance from the system prompt. Output type "actions" with non-empty actions. No clarification.`
    : `Generate createCard, upsertCardKnowledgeItem, and upsertCardPlannedFile for "${activityTitle}". Use workflow_activity_id "${activityId}" in every createCard target_ref. Each card MUST have at least 1 requirement and 1 planned file. Output type "actions" with non-empty actions array.`;
  return base + task;
}

/**
 * Build the user message for scaffold mode.
 * When repoContext is provided, the user has linked a repo and we've injected its file tree + README/package.json
 * so the LLM can create the map from the existing codebase.
 */
export function buildScaffoldUserMessage(
  userRequest: string,
  mapSnapshot: PlanningState,
  linkedArtifacts: ContextArtifact[],
  repoContext?: string | null,
): string {
  const stateJson = serializeMapStateForPrompt(mapSnapshot);
  const hasWorkflows = mapSnapshot.workflows.size >= 1;
  let message = `## Current Map State\n\`\`\`json\n${stateJson}\n\`\`\`\n\n`;
  if (repoContext && repoContext.trim().length > 0) {
    message += `## Repository context (existing codebase)\nThe project is linked to a GitHub repository. Use this to infer project name, description, tech stack, and user workflows.\n\n${repoContext}\n\n`;
  }
  if (linkedArtifacts.length > 0) {
    message += `## Linked Context\n`;
    for (const a of linkedArtifacts.slice(0, 3)) {
      message += `- ${a.name}: ${(a.content || a.title || "").substring(0, 150)}...\n`;
    }
    message += "\n";
  }
  const projectId = mapSnapshot.project.id;
  message += `## User Request\n${userRequest}\n\n## Your Response\n`;
  if (hasWorkflows) {
    message += `The map already has ${mapSnapshot.workflows.size} workflow(s). Do NOT generate updateProject or createWorkflow. Respond with type "clarification" and a brief message guiding the user to review and finalize the project first (creates core product documents and directory structure). After finalizing, they can populate each workflow with activities and cards. Output ONLY the JSON object with "type": "clarification", "message": "...", "actions": [].`;
  } else {
    message += `Output ONLY the JSON object (updateProject + createWorkflow actions). Use project_id "${projectId}" in all target_ref and project_id fields.`;
  }
  return message;
}

/**
 * Serialize minimal context for populate mode.
 * Includes project, other workflow titles, and brief context artifact previews
 * (from finalization) so the LLM has domain context.
 */
export function serializeMapStateForPopulate(
  state: PlanningState,
  targetWorkflowId: string,
): string {
  const otherWorkflows = Array.from(state.workflows.values())
    .filter((wf) => wf.id !== targetWorkflowId)
    .map((wf) => ({ id: wf.id, title: wf.title }));

  const artifacts = Array.from(state.contextArtifacts.values())
    .slice(0, 4)
    .map((a) => ({
      name: a.name,
      title: a.title ?? a.name,
      preview: (a.content ?? "").slice(0, 200).replace(/\n/g, " ").trim(),
    }))
    .filter((a) => a.preview.length > 0);

  return JSON.stringify(
    {
      project: {
        id: state.project.id,
        name: state.project.name,
        description: state.project.description,
        customer_personas: state.project.customer_personas,
        tech_stack: state.project.tech_stack,
        deployment: state.project.deployment,
        design_inspiration: state.project.design_inspiration,
      },
      other_workflows: otherWorkflows,
      ...(artifacts.length > 0 ? { context_docs: artifacts } : {}),
    },
    null,
    2,
  );
}

/**
 * Build the user message for populate mode (one workflow).
 */
export function buildPopulateWorkflowUserMessage(
  workflowId: string,
  workflowTitle: string,
  workflowDescription: string | null,
  userRequest: string,
  mapSnapshot: PlanningState,
): string {
  const stateJson = serializeMapStateForPopulate(mapSnapshot, workflowId);
  return `## Project Context\n\`\`\`json\n${stateJson}\n\`\`\`\n\n## Workflow to Populate\n- ID: ${workflowId}\n- Title: ${workflowTitle}\n- Description: ${workflowDescription ?? "—"}\n\n## Original User Request (for context)\n${userRequest}\n\n## Your Task\nGenerate createActivity, createCard, and upsertCardKnowledgeItem (requirement) actions for this workflow. Output ONLY the JSON object.`;
}

/**
 * Serialize a summarized view of the map for the finalize prompt.
 * Includes card requirements so the LLM can write tests against them.
 */
export function serializeMapStateForFinalize(state: PlanningState): string {
  const workflows = Array.from(state.workflows.values());
  const activities = Array.from(state.activities.values());
  const cards = Array.from(state.cards.values());

  const workflowSummaries = workflows.map((wf) => {
    const wfActivities = activities
      .filter((a) => a.workflow_id === wf.id)
      .sort((a, b) => a.position - b.position);

    const actSummaries = wfActivities.map((act) => {
      const actCards = cards
        .filter((c) => c.workflow_activity_id === act.id)
        .sort((a, b) => a.position - b.position);

      const cardSummaries = actCards.map((card) => {
        const reqs = (state.cardRequirements.get(card.id) || [])
          .filter((r) => r.status !== "rejected")
          .map((r) => ({ text: r.text, status: r.status }));
        const plannedFiles = (state.cardPlannedFiles.get(card.id) || [])
          .map((f) => ({
            logical_file_name: f.logical_file_name,
            artifact_kind: f.artifact_kind,
            action: f.action,
            intent_summary: f.intent_summary,
          }));
        return {
          id: card.id,
          title: card.title,
          description: card.description,
          requirements: reqs,
          planned_files: plannedFiles,
        };
      });

      return {
        id: act.id,
        title: act.title,
        cards: cardSummaries,
      };
    });

    return {
      id: wf.id,
      title: wf.title,
      description: wf.description,
      activities: actSummaries,
    };
  });

  return JSON.stringify(
    {
      project: {
        id: state.project.id,
        name: state.project.name,
        description: state.project.description,
        customer_personas: state.project.customer_personas,
        tech_stack: state.project.tech_stack,
        deployment: state.project.deployment,
        design_inspiration: state.project.design_inspiration,
      },
      workflows: workflowSummaries,
    },
    null,
    2,
  );
}

/**
 * Specification for each project-wide finalization document.
 * Used to generate one focused LLM call per document.
 */
export interface FinalizeDocSpec {
  name: string;
  type: "doc" | "spec" | "design" | "scaffold";
  title: string;
  label: string;
  contentGuidelines: string;
}

export const FINALIZE_DOC_SPECS: FinalizeDocSpec[] = [
  {
    name: "architectural-summary",
    type: "doc",
    title: "Architectural Summary",
    label: "Architectural Summary",
    contentGuidelines: `- Tech stack decisions and rationale
- Service topology (frontend, backend, database, external services)
- Key architectural patterns (state management, routing, data fetching)
- Deployment model
- Derived from: project tech_stack, deployment, design_inspiration, and the planned file intents across cards

## Root folder structure (REQUIRED)
You MUST include a "## Root folder structure" section with a bullet list of root-level folder paths for the repo (e.g. app/, components/, lib/, src/). Derive from tech_stack (e.g. Next.js → app/, components/, lib/; React+Vite → src/, components/). Use one path per line, e.g.:
- app/
- components/
- lib/`,
  },
  {
    name: "data-contracts",
    type: "spec",
    title: "Data Contracts",
    label: "Data Contracts",
    contentGuidelines: `- Entity schemas with fields and types
- API endpoint contracts (method, path, request/response shapes)
- Shared interfaces and data flow between components
- Derived from: card planned files (especially schema, endpoint, service kinds), card descriptions, requirements`,
  },
  {
    name: "domain-summaries",
    type: "doc",
    title: "Domain Summaries",
    label: "Domain Summaries",
    contentGuidelines: `- Bounded contexts identified from workflows
- Domain models and entity relationships
- Key terminology glossary
- Derived from: workflow titles/descriptions, activity titles, card titles/descriptions`,
  },
  {
    name: "user-workflow-summaries",
    type: "doc",
    title: "User Workflow Summaries",
    label: "User Workflow Summaries",
    contentGuidelines: `- Per workflow: user outcome, activity progression, how activities connect
- Cross-workflow dependencies and shared entities
- User journey narratives
- Derived from: workflow/activity/card structure and descriptions`,
  },
  {
    name: "design-system",
    type: "design",
    title: "Design System",
    label: "Design System",
    contentGuidelines: `- Component palette (which UI components are needed)
- Color tokens and typography conventions
- Layout patterns and spacing
- Interaction patterns (forms, navigation, feedback)
- Derived from: project design_inspiration, card planned files of kind component/hook`,
  },
  {
    name: "project-scaffold",
    type: "scaffold",
    title: "Project Scaffold",
    label: "Project Scaffold",
    contentGuidelines: `Generate the minimal set of root configuration and entry-point files that make this project runnable with a single install + dev command.

## Output format (REQUIRED)
For EACH file, use this exact format:
### FILE: <relative-path>
\`\`\`
<file contents>
\`\`\`

## What to generate
Based on the project's tech_stack and deployment:
- Package manager config (package.json with name, scripts: dev/build/start, dependencies with exact versions)
- Framework config (e.g. next.config.js, vite.config.ts, tsconfig.json)
- CSS/styling setup (e.g. tailwind.config.js, postcss.config.js, globals.css)
- Minimal app entry point (e.g. src/app/layout.tsx + src/app/page.tsx for Next.js, or src/main.tsx for Vite)
- .gitignore appropriate for the stack

## Rules
- Use the root folder structure from the architectural summary
- Include ONLY files needed to make \`npm run dev\` (or equivalent) work
- Use specific dependency versions, not "latest"
- The app entry should render a placeholder page, not real features (cards will add those)
- Do NOT generate feature code, tests, or documentation
- For web apps: include TypeScript config and Tailwind CSS by default unless tech_stack says otherwise`,
  },
];

/**
 * Build the system prompt to generate ONE specific project-wide document.
 * Agent profile: Architect — translates product vision into build-ready specifications.
 * Skill injection varies by document type (System Design vs Design Systems).
 */
export function buildFinalizeDocSystemPrompt(spec: FinalizeDocSpec): string {
  const skill = getArchitectSkills(spec.name);
  return `You are a technical architect and design lead. You translate product vision into precise, build-ready specifications that coding agents can implement without ambiguity.

${skill}

## Your Task
Generate ONE createContextArtifact action for the "${spec.title}" document.

The document content must be in markdown and cover:
${spec.contentGuidelines}

## createContextArtifact Action Schema
- action_type: "createContextArtifact"
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "${spec.name}", "type": "${spec.type}", "title": "${spec.title}", "content": "<full markdown content>", "card_id": null }

## Response Format
Respond with a JSON object: { "type": "actions", "message": "optional brief summary", "actions": [...] }

The actions array must contain exactly ONE createContextArtifact action.

## Critical Constraints
1. Content must be specific to THIS project — not generic boilerplate. Derive every decision from the project's actual tech stack, workflows, and cards.
2. Use IDs from the provided map state — never invent IDs that don't exist
3. Generate a new UUID for the createContextArtifact action id
4. Write for build agents, not humans — be precise about file paths, module boundaries, and interface contracts
5. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.
6. HARD LIMIT: Keep the document content under 2500 words. Be dense and actionable — omit verbose explanations, lengthy code samples, and exhaustive enumerations. Prefer tables and bullet lists over prose. If a section would exceed the budget, summarize and reference where agents can derive details from the map state.`;
}

/**
 * Build the system prompt for per-card finalization (finalize sub-step).
 * Generates (1) one e2e test artifact and (2) optionally card-specific context docs (e.g. external API summary).
 */
export function buildFinalizeTestsSystemPrompt(): string {
  return `You are a finalization assistant that prepares a software feature card for build. You produce:
1. **Required**: ONE createContextArtifact with type "test" — a Playwright e2e test file for this card.
2. **When appropriate**: One or more createContextArtifact with type "doc" — card-specific context documents that the build agent will need (e.g. external API summary, integration notes). Create these when the card involves an external API, third-party service, or integration so the build agent has the right context.

## When to add card-specific context documents
- The card's requirements or description mention an **external API** (e.g. Stripe, Twilio, SendGrid) → add a short doc summarizing that API: auth, main endpoints or operations, and anything relevant to this card.
- The card involves a **third-party service or SDK** → add a doc with key concepts, config, or usage notes.
- The card involves **integration** with another system (webhook, OAuth, etc.) → add a doc describing the integration contract or flow.
- Do **not** add extra docs when the card is purely internal (UI, CRUD, in-app logic with no external dependencies).

## E2E test (required)
- **Outcome-based**: each test validates that a requirement is realized as user-visible behavior
- **One test case per requirement**: clear 1:1 mapping from requirement text to test
- **Framework**: Playwright with vitest (import { test, expect } from '@playwright/test')
- **Self-contained**: each test file can run independently
- **Name format**: "__tests__/e2e/<card-slug>.test.ts"
- **Payload**: type "test", and include "card_id": "<card_id>" so it is linked to the card

## Card-specific context doc (optional, when applicable)
- **type**: "doc"
- **name**: e.g. "docs/card-<card-slug>-<api-name>.md" or "context/<card-slug>-integration.md"
- **title**: e.g. "<External API Name> — summary for this card"
- **content**: Markdown summarizing the API/service: auth, main endpoints or operations, env/config, and what this card needs. Keep it focused and build-agent useful.
- **card_id**: include in payload so the doc is linked to this card

## createContextArtifact action schema (for each action)
- action_type: "createContextArtifact"
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "<path>", "type": "test" | "doc", "title": "<title>", "content": "<content>", "card_id": "<card_id>" }

## Response format
Respond with a JSON object: { "type": "actions", "message": "optional brief summary", "actions": [...] }
- The actions array must contain exactly **one** createContextArtifact with type "test" for the e2e test.
- It may contain **zero or more** createContextArtifact with type "doc" for card-specific context (add when the card involves external API/integration).
- Every action must include "card_id": "<card_id>" in the payload so artifacts appear on the card in the UI.
- Generate a new UUID for each action id.
- Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.
- HARD LIMIT: Keep each artifact's content under 2500 words. Be concise — focus on what build agents need to implement and verify. Omit filler.`;
}

/**
 * Build the user message for generating a single finalization document.
 */
export function buildFinalizeDocUserMessage(
  mapSnapshot: PlanningState,
  spec: FinalizeDocSpec,
): string {
  const stateJson = serializeMapStateForFinalize(mapSnapshot);
  const projectId = mapSnapshot.project.id;

  return `## Project Map State (with requirements and planned files)\n\`\`\`json\n${stateJson}\n\`\`\`\n\n## Your Task\nGenerate one createContextArtifact action for the "${spec.title}" document (name: "${spec.name}", type: "${spec.type}").\n\nUse project_id "${projectId}" in all target_ref and project_id fields.\n\nOutput ONLY the JSON object.`;
}

/**
 * Build the user message for per-card test generation (finalize sub-step).
 * Provides the card's requirements, planned files, and enough project context
 * for the LLM to write meaningful tests without receiving the entire map.
 */
export function buildFinalizeTestsUserMessage(
  card: {
    id: string;
    title: string;
    description: string | null;
    requirements: Array<{ text: string; status: string }>;
    planned_files: Array<{
      logical_file_name: string;
      artifact_kind: string;
      action: string;
      intent_summary: string;
    }>;
  },
  projectSummary: {
    id: string;
    name: string | null;
    description: string | null;
    tech_stack: string | null;
    deployment: string | null;
  },
): string {
  const cardJson = JSON.stringify(card, null, 2);
  const projectJson = JSON.stringify(projectSummary, null, 2);

  return `## Project Context\n\`\`\`json\n${projectJson}\n\`\`\`\n\n## Card to Finalize\n\`\`\`json\n${cardJson}\n\`\`\`\n\n## Your Task\n1. **Required**: Generate one createContextArtifact (type "test") containing a Playwright e2e test file for this card. Write one test case per requirement.\n2. **If applicable**: If this card involves an external API, third-party service, or integration, generate one or more createContextArtifact (type "doc") with a short, focused summary (auth, endpoints, config) so the build agent can implement the feature. Link every artifact to this card with "card_id": "${card.id}".\n\nUse project_id "${projectSummary.id}" in target_ref for all actions. Include "card_id": "${card.id}" in every payload so artifacts appear on the card in the UI.\n\nOutput ONLY the JSON object.`;
}

export interface ConversationMessage {
  role: "user" | "agent";
  content: string;
}

/**
 * Build the user message with current state and user request.
 */
export function buildPlanningUserMessage(
  userRequest: string,
  mapSnapshot: PlanningState,
  linkedArtifacts: ContextArtifact[],
): string {
  const stateJson = serializeMapStateForPrompt(mapSnapshot);

  let message = `## Current Map State\n\`\`\`json\n${stateJson}\n\`\`\`\n\n`;

  if (linkedArtifacts.length > 0) {
    message += `## Linked Context Artifacts (relevant to cards)\n`;
    for (const artifact of linkedArtifacts.slice(0, 5)) {
      message += `- ${artifact.name} (${artifact.type}): ${(artifact.content || artifact.title || "").substring(0, 200)}...\n`;
    }
    message += "\n";
  }

  message += `## User Request\n${userRequest}\n\n## Your Response\nOutput ONLY the JSON response object:`;

  return message;
}

/**
 * Build Anthropic messages array from conversation history.
 * Converts the chat history into alternating user/assistant messages,
 * with the latest user message including the full map state context.
 */
export function buildConversationMessages(
  userRequest: string,
  mapSnapshot: PlanningState,
  linkedArtifacts: ContextArtifact[],
  conversationHistory: ConversationMessage[],
  /** Final user turn. Defaults to the planning user message; pass a scaffold message when building for scaffold mode. */
  contextMessage: string = buildPlanningUserMessage(userRequest, mapSnapshot, linkedArtifacts),
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  const recentHistory = conversationHistory.slice(-20);

  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  messages.push({ role: "user", content: contextMessage });

  return ensureAlternatingRoles(messages);
}

/**
 * Render a messages array (from buildConversationMessages) as one prompt string for the
 * planning SDK/CLI, which accepts a single user message. Prior turns are labelled; the
 * final User turn carries the current map state and request.
 */
export function formatConversationTranscript(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  return (
    "## Conversation so far\n" +
    "The turns below are the earlier conversation (oldest first). The final User turn is the current request. " +
    "Resolve references such as \"those\", \"these\", \"it\", or \"the last one\" against the earlier turns.\n\n" +
    transcript
  );
}

/**
 * Ensure messages alternate between user and assistant roles.
 * Anthropic API requires strictly alternating roles.
 */
function ensureAlternatingRoles(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  if (messages.length === 0) return messages;

  const result: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    const lastRole = result.length > 0 ? result[result.length - 1].role : null;

    if (lastRole === msg.role) {
      result[result.length - 1].content += "\n\n" + msg.content;
    } else {
      result.push({ ...msg });
    }
  }

  if (result.length > 0 && result[0].role !== "user") {
    result.unshift({ role: "user", content: "(conversation continued)" });
  }

  return result;
}
