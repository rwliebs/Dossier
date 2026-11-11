# Architecture Decision Records

This directory stores Architecture Decision Records (ADRs) for Dossier.

## Conventions

- File naming: `NNNN-short-title.md`
- Status values: `Proposed`, `Accepted`, `Superseded`
- Each ADR should include:
  - Context
  - Decision
  - Consequences
  - Alternatives considered

## Index

- [0001 - Lean Test Core and TDD-First](./0001-lean-test-core-tdd-first.md)
- [0002 - Claude-First Planning LLM (No Provider Adapter in MVP)](./0002-claude-first-no-provider-adapter.md)
- [0003 - Iterative Schema Rollout (Slice A/B/C)](./0003-iterative-schema-rollout.md)
- [0004 - No-Auth-First MVP Policy](./0004-no-auth-first-mvp.md)
- [0005 - Adaptive E2E Strategy with Stagehand](./0005-adaptive-e2e-stagehand.md)
- [0006 - Build Orchestration via Claude-Flow](./0006-claude-flow-execution-plane.md) (Superseded by 0008)
- [0007 - Production Release Gate Requires Auth and RLS](./0007-release-gate-auth-rls-required.md)
- [0008 - Build Orchestration via Agentic-Flow](./0008-agentic-flow-execution-plane.md)
- [0009 - Planning Non-Streaming](./0009-planning-non-streaming.md)
- [0010 - Finalization Phase Design](./0010-finalization-phase-design.md)
- [0011 - Push and Merge Flow](./0011-push-and-merge-flow.md)
- [0012 - Worktree Auto-Commit](./0012-worktree-auto-commit.md)
- [0013 - Single Card Build with Clone](./0013-single-card-build-with-clone.md)
- [0014 - Releases and Distribution](./0014-releases-and-distribution.md)
- [0015 - Runnable Project Scaffold](./0015-runnable-project-scaffold.md)
- [0016 - Planning Agent — Two Authentication Paths](./0016-planning-agent-two-auth-paths.md)
- [0017 - Planning Timeouts Are Activity-Based, With a Separate Overall Limit](./0017-planning-activity-based-timeouts.md)
