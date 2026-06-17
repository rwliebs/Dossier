# Documentation

Single source for all Dossier documentation.

## Structure

```
docs/
├── SYSTEM_ARCHITECTURE.md    # Master architecture overview
├── docs-index.yaml           # Document registry
├── README.md                 # This file
├── testing-reference.md      # Test commands, structure, mocking
├── development-reference.md  # Setup, scripts, workflow
├── agentic-flow-install-notes.md  # Install warnings explained
│
├── domains/                  # Domain references
│   ├── api-reference.md
│   ├── data-contracts-reference.md
│   ├── map-reference.md
│   ├── memory-reference.md
│   ├── mutation-reference.md
│   ├── orchestration-reference.md
│   └── planning-reference.md
│
├── product/                  # Product & UX
│   ├── dossier-external-overview.md
│   ├── user-personas.md
│   ├── user-stories.md
│   └── user-workflows-reference.md
│
├── reference/                # Technical reference
│   ├── api-endpoints.md
│   ├── configuration-reference.md
│   ├── database-schema.md
│   ├── desktop-build-and-distribution.md
│   ├── memory-coordination-prompt.md
│   └── skillsmith.md
│
├── design/                   # Design system
│   └── design-system.md
│
├── adr/                      # Architecture Decision Records
│   └── 0001-*.md through 0015-*.md
│
├── Feature Plans/            # Future feature plans
│   ├── claude-plugin-packaging.md
│   ├── deferred-enhancements.md
│   ├── execution-agent-size-reduction.md
│   ├── hosted-multi-user.md
│   └── multi-agent-swarm.md
│
├── releases/                 # Release notes
│   └── v0.5.0-release-notes.md
│
├── investigations/           # Bug investigations (TTL: 2 weeks)
│   └── (active reports)
│
└── archive/                  # Historical / deprecated
    └── README.md
```

## Quick Links

- [System Architecture](SYSTEM_ARCHITECTURE.md)
- [Development](development-reference.md)
- [Testing](testing-reference.md)
- [Data Contracts](domains/data-contracts-reference.md)
- [User Workflows](product/user-workflows-reference.md)
- [Desktop Build & Distribution](reference/desktop-build-and-distribution.md)
