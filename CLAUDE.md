# Agentic Harness Research — Project Rules

`AGENTS.md` is a symlink to this file. Edit `CLAUDE.md` only.

## Writing standard (80% ASD-STE100)

- Keep procedural sentences under 20 words.
- Keep descriptive sentences under 25 words.
- Use active voice.
- Use imperative verbs in procedures.
- Write one instruction per sentence.
- Use one term for one concept. Do not use synonyms.
- Apply this standard to docs, lessons, plans, and agent prompts.

## Agent rules

- Do not spawn sub-agents unless the user explicitly asks.
- Read `docs/` before you start design or code work.
- Write research output to `docs/`.
- Keep cloned reference repos in `repos/`. Git ignores this folder.

## Task 1 (primary): Productise Ridge

### Goal

Decouple the Ridge Multi-Agent System from the Ridge Kanban UI.
Package it as the plug-and-play library `@aigerdata/agent-core`.
The Orchestrator (Manager) Agent and the Worker Swarm live in this library.
The library contains zero UI code.

Note: spec `docs/ridge-spec-001.md` uses the name `@aigerdata/ridge-core`.
The newer name is `@aigerdata/agent-core`. Use `agent-core`.

### Workflow

1. Issue Ingest.
2. Memory Lookup.
3. Bug Reproduction.
4. Execution Plan.
5. Human Gate 1 (plan approval).
6. Isolated Git Worktree (`git worktree add`).
7. Failing Regression Test.
8. Code Fix.
9. Human Gate 2 (PR review) or CI/CD auto-deploy.
10. Lesson Extraction.

### 3-tier memory

Target: reduce repeat-ticket cost from 50k tokens to 10k tokens.

- **Tier 1 — Task Memory.** Offload raw transcripts and large tool outputs to disk (`trajectory.jsonl`).
- **Tier 2 — Project Memory.** Distill each solved ticket into a 2-line ASD-STE100 `LESSON` with exact file paths.
  Store lessons in `.ridge/memory/lessons.md`. Index them with SQLite FTS5 (BM25).
- **Tier 3 — Global Memory.** Promote generalized rules through human review.
  Store them in a central Postgres/Supabase database. Share them across all company repositories.

Note: the spec uses `lessons.jsonl`. The newer instruction uses `lessons.md`.
`docs/RESEARCH_PLAN.md` proposes one OKF Markdown file per lesson to satisfy both.

### Non-negotiable requirements

- Do not use RAG or vector databases. Rank existing knowledge (BM25 + small rerankers).
- Store knowledge in Google's Open Knowledge Format (OKF v0.1).
- Give every agent its own sandbox.
- Give every sandbox run a session ID.
- Return the session ID when the session closes.
- Let a human reviewer reopen any session with full context and continue the work.
- Do not build from scratch. Do not depend on one open-source project.

## Secondary roadmap

- **Task 2:** Multi-subscription Common Harness Router.
- **Task 3:** Migrate Ristara from GCP to a self-hosted Supabase/ClickHouse droplet.
- **Task 4:** Ristara Always-On OpenDots agents.

## Key documents

- `docs/ridge-spec-001.md` — full Ridge MAS specification.
- `docs/ridge-product-v1.md` — current Ridge product README.
- `docs/research-requirements.md` — extra research requirements.
- `docs/RESEARCH_PLAN.md` — architecture synthesis, deadlines, VM sizing.
