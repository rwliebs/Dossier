---
document_id: doc.testing
last_verified: 2026-06-01
tokens_estimate: 1050
tags:
  - testing
  - vitest
  - quality
anchors:
  - id: commands
    summary: "npm run test, test:watch, test:coverage, test:planning, test:e2e"
  - id: structure
    summary: "__tests__/ mirrors lib/; components, api, mutations, orchestration"
  - id: mocking
    summary: "Mock DbAdapter, PLANNING_MOCK_ALLOWED for LLM tests"
  - id: product-outcomes
    summary: "Tests aligned with user-workflows-reference.md and user-stories.md"
ttl_expires_on: null
---
# Testing Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [user-workflows-reference.md](product/user-workflows-reference.md)

## Contract

- INVARIANT: Tests use Vitest; jsdom for React components
- INVARIANT: Contract and integration tests are source of truth; E2E augments
- INVARIANT: DB tests use in-memory SQLite or mock adapter
- INVARIANT: Tests assert product outcomes from user-workflows-reference.md and user-stories.md

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | Run full suite once |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report (v8) |
| `npm run test:planning` | Planning LLM tests (mock allowed) |
| `npm run test:planning:e2e` | Planning E2E (trading card marketplace) |
| `npm run test:e2e:project-to-cards` | Full flow: create project → idea → cards for 2+ workflows |
| `npm run test:e2e:adaptive` | Adaptive E2E flows |
| `npm run test:db` | DB adapter and migration tests |

---

## Structure

```
__tests__/
├── setup.ts                 # @testing-library/jest-dom
├── lib/
│   ├── mock-db-adapter.ts   # Shared mock DbAdapter
│   ├── create-test-db.ts    # Test DB helpers
│   ├── memory/              # ingestion, retrieval, harvest, store, snapshots
│   ├── llm/                 # stream-action-parser, planning fixtures, credential/Agent SDK tests
│   └── ruvector-*           # RuVector client tests
├── components/              # workflow-block, activity-column, implementation-card, etc.
├── api/                     # projects, map, actions, chat-stream, GitHub OAuth, orchestration, dev utilities
├── mutations/               # apply-action, pipeline
├── orchestration/           # create-run, trigger-build, approval-gates, etc.
├── schemas/                 # slice-b, slice-c, core-planning
├── hooks/                   # use-submit-action, use-map-snapshot, etc.
└── e2e/                     # project-to-cards-flow, adaptive-flows, trading-card-marketplace-planning
```

---

## Patterns

### Mock DbAdapter
- Use `lib/mock-db-adapter.ts` for unit tests that need DB
- In-memory SQLite for integration tests via `createTestDb()` (when available)

### Planning LLM Tests
- Set `PLANNING_MOCK_ALLOWED=1` to skip real API calls
- Use `__tests__/llm/planning-fixtures.ts` for gold/adversarial examples
- Credential routing coverage:
  - `__tests__/llm/planning-credential.test.ts`
  - `__tests__/llm/planning-credential.integration.test.ts`
  - `__tests__/llm/planning-sdk-adapter.test.ts`
  - `__tests__/lib/llm/claude-client-cli-auth.test.ts`
  - `__tests__/setup/credential-oauth.test.ts`
- GitHub and local dev utility API coverage:
  - `__tests__/api/github-oauth-routes.test.ts`
  - `__tests__/api/restart-and-open.test.ts`

### Component Tests
- `@testing-library/react`, `@testing-library/user-event`
- `setup.ts` imports `@testing-library/jest-dom/vitest`

### RuVector Integration Tests
- Gate with `describe.skipIf(!ruvectorAvailable || !sqliteAvailable)`
- Each test block sets `DOSSIER_DATA_DIR` to a unique temp dir (`fs.mkdtempSync`) to prevent parallel file contention on `vectors.db`
- Clean up: `delete process.env.DOSSIER_DATA_DIR` in `afterEach`
- Timeout: 30s per test (model download from HuggingFace competes for bandwidth in parallel runs)
- Reset: call `resetRuvectorForTesting()` in `beforeEach` to clear the client singleton

### Coverage
- Provider: v8
- Reporters: text, html
- Run `npm run test:coverage` for report

---

## Product Outcome Alignment

Tests assert the following product invariants (from user-workflows-reference.md):

| Outcome | Test Location |
|--------|---------------|
| Build requires finalized_at + approved planned files | `trigger-build.test.ts` |
| Build rejects when card(s) lack finalized_at | `trigger-build.test.ts` |
| Build rejects when no cards have approved planned files | `trigger-build.test.ts` |
| artifact_kind excludes test (tests live as ContextArtifact type:test) | `slice-b.test.ts` |
| Per-card finalize validates requirements + planned files; sets finalized_at | `finalize.test.ts` |
| E2E: build-ready = approved planned files + finalized | `project-to-cards-flow.test.ts` |

## Verification
- [ ] All tests pass before commit
- [ ] Contract tests cover schema and action validation
- [ ] Integration tests cover API and orchestration boundaries
- [ ] Product outcome alignment table reflects current coverage

## Related
- [development-reference.md](development-reference.md)
- [domains/data-contracts-reference.md](domains/data-contracts-reference.md)
