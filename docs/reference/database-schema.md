---
document_id: doc.database-schema
last_verified: 2026-05-11
tokens_estimate: 900
tags:
  - database
  - schema
  - sqlite
anchors:
  - id: tables
    summary: "project, workflow, card, planning_action, context_artifact, memory_unit; finalization gates"
  - id: migrations
    summary: "lib/db/migrate.ts; 001-012; _migrations table"
ttl_expires_on: null
---
# Database Schema Reference

**Source of truth**: `lib/db/migrate.ts` and `lib/db/sqlite-migrations/`

**Anchors**: [domains/data-contracts-reference.md](domains/data-contracts-reference.md)

## Contract

- INVARIANT: Migrations run in order; tracked in `_migrations`
- INVARIANT: SQLite for self-deploy; Postgres for future hosted
- INVARIANT: DbAdapter is single seam; no direct DB access from business logic

---

## Table Summary

| Table | Purpose |
|-------|---------|
| project | Projects; name, repo_url, default_branch, action_sequence, finalized_at |
| workflow | Workflows per project; position-ordered |
| workflow_activity | Activities per workflow; color, position |
| step | (Migration 005: removed) |
| card | Cards per activity; status, priority, build_state, finalized_at, last_build_error |
| planning_action | Action log; idempotency_key for dedup |
| context_artifact | Project-level context; type, content, uri, integration_ref |
| card_context_artifact | Card ↔ artifact many-to-many |
| card_requirement, card_known_fact, card_assumption, card_question | Knowledge items |
| card_planned_file | Planned files per card; artifact_kind, action, status |
| system_policy_profile | Project policy; required_checks, paths |
| orchestration_run | Build runs; scope, snapshots |
| card_assignment | Per-card assignments; feature_branch, allowed_paths |
| agent_execution, agent_commit | Execution records |
| run_check | Quality gates |
| pull_request_candidate | Draft PR tracking |
| approval_request | PR approval lifecycle |
| event_log | Audit |
| memory_unit | Content + embedding_ref |
| memory_unit_relation | Scope mapping |
| memory_retrieval_log | Retrieval observability |

---

## Migrations

| Name | Purpose |
|------|---------|
| 001_schema.sql | Core planning + context + knowledge |
| 002_orchestration.sql | Runs, assignments, checks, approvals |
| 003_memory.sql | memory_unit, memory_unit_relation, memory_retrieval_log |
| 004_project_description.sql | Add project.description |
| 005_remove_steps.sql | Remove step table; cards direct to activity |
| 006_project_context_fields.sql | Add product/context fields to project |
| 007_project_design_inspiration.sql | Add project design inspiration |
| 008_finalization_phase.sql | Add `card.finalized_at`; allow test context artifacts |
| 009_card_last_build_error.sql | Add last build error to card |
| 010_project_finalized_at.sql | Add `project.finalized_at` for project-before-cards gate |
| 011_context_artifact_type_scaffold.sql | Allow scaffold context artifacts |
| 012_card_assignment_session_id.sql | Track agent session id on card assignment |

---

## Key Constraints

- `context_artifact`: at least one of content, uri, integration_ref
- `orchestration_run`: scope=workflow → workflow_id required; scope=card → card_id required
- `planning_action`: idempotency unique per (project_id, idempotency_key)
- `project.finalized_at`: set only after project finalize creates all required project artifacts
- `card.finalized_at`: set by card finalize POST after the project is finalized and card requirements/planned files exist

---

## Verification
- [ ] Migrations apply cleanly to fresh DB
- [ ] DbAdapter covers all tables

## Related
- [domains/data-contracts-reference.md](../domains/data-contracts-reference.md)
- [lib/db/migrate.ts](../../lib/db/migrate.ts)
