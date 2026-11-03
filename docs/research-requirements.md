# Agentic Harness Research — Requirements (from user, 2026-11-03)

Context: research to build `@aigerdata/ridge-core` (see `ridge-spec-001.md`) for `Aigerdata/ridge`
(current product: `ridge-product-v1.md`). Ridge is the main deliverable.

## Retrieval / memory
- **No RAG / no vector-embedding retrieval.** All logs/knowledge already exist; we **rank** them instead.
- Store knowledge in an **open knowledge format** ("OKF" / "OKR", attributed to Google Research —
  exact name still to be confirmed during research).
- Need **document ranking against the query** (spec already uses SQLite FTS5 / BM25 for Tier 2).
- Go beyond LLM wrappers: research **simple attention networks** (e.g. small learned rerankers)
  for ranking and context selection.
- Handle **context bloat** and **role precedence** (which role's instructions/memory win when they conflict).

## Agent roles & sandboxing
- Swarm with an **orchestrator / master**, **workers**, and an **auditor** (and similar roles).
- **Each agent gets its own sandbox.**
- Every sandbox, when triggered, gets its own **session ID**.
- Sessions must be **resumable**: after an agent finishes a task, we can open that session with its
  full context and keep working on it directly in the harness (edit / follow-up on the task).

## Build approach
- Do not build everything from scratch.
- Do not depend on any single open-source solution.
- Study the reference harnesses, take the best ideas, and optimize hard.

## Reference repositories to study
- DeepSeek super-agent harness: https://github.com/deepseek-ai/dsh-superagent-prototype
- Munder Difflin: https://github.com/HarnessMD/munder-difflin
- Hermes (agent) — URL not given yet
- pi (coding agent) — URL not given yet
- OpenCode — URL not given yet
- Company repo: https://github.com/Aigerdata/ridge
