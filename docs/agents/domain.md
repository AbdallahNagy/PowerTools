# Domain Docs

How engineering skills consume this repository’s domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- `CONTEXT-MAP.md` if it exists; read each context relevant to the task.
- Relevant decisions under `docs/adr/`.

If these files do not exist, proceed silently. Domain-modeling workflows create them lazily when terminology or durable decisions are resolved.

## Layout

This repository uses a single-context layout:

/
├── CONTEXT.md
├── docs/
│   └── adr/
└── …

## Use the glossary’s vocabulary

Use terms as defined in `CONTEXT.md` in specifications, issues, tests, and implementation discussions. If a necessary concept is missing, reconsider the terminology or record the gap for domain modeling.

## Flag ADR conflicts

If proposed work conflicts with an existing ADR, surface the conflict explicitly instead of silently overriding it.
