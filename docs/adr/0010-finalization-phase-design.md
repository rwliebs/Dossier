# ADR 0010: Finalization Phase Design

**Date**: 2026-02-20
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#data-flow, docs/domains/planning-reference.md#modes

## Context

After planning produces a complete story map (workflows, activities, cards), the system needs a preparation step that synthesizes build-ready context before code execution. The question was whether to finalize everything at once or in stages, and what outputs finalization should produce.

## Decision

Two-stage finalization: project-wide first, then per-card.

**Project finalization** (user clicks "Finalize Project"):
- Runs one LLM sub-step per required `FINALIZE_DOC_SPECS` entry: architectural summary, data contracts, domain summaries, workflow summaries, design system, and project scaffold
- Parses root folder structure from architectural summary; creates folders + `.gitkeep` in repo clone
- Parses project scaffold artifact; writes root files (package.json, configs, app entry) to repo clone
- Sets `project.finalized_at` only after every required artifact is created

**Per-card finalization** (user clicks "Finalize" on a card):
- Assembles context: project-wide docs + card knowledge + e2e tests + linked artifacts
- `GET /cards/[cardId]/finalize` returns the current package for review: project docs, linked card artifacts, requirements, planned files, and `finalized_at`
- `POST /cards/[cardId]/finalize` is the approval action; it validates gates, returns SSE progress, links docs, generates test/context artifacts, and sets `card.finalized_at`
- Ingests card context into memory (RuVector + SQLite) when the memory plane is enabled

**Test code exception**: Finalize mode may produce e2e test code as `ContextArtifact` with `type: 'test'`. Tests are specifications, not implementation code. `CardPlannedFile.artifact_kind` excludes test artifacts.

**Workflow population is incremental**: one workflow at a time via streaming populate mode. No bulk "accept all" step.

**Implementation note (verified 2026-05-11)**: There is no separate `/finalize/confirm` route. The card finalize POST endpoint performs confirmation after validation and emits `finalize_progress`, `action`, `error`, `phase_complete`, and `done` events.

## Consequences

- Build agents receive oriented briefings from required project artifacts, not a search index dump
- User controls the gate at both project and card level
- Scaffold files make the repo immediately runnable after project finalization
- Per-card finalize ensures memory is seeded before build dispatch

## Rollback

Revert to unfinalized builds where agents receive raw card data without synthesized context.
