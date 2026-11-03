# agent-core Research Plan

**Date:** 2026-11-03 · **Status:** Draft v1 · **Target:** `@aigerdata/agent-core`

This document combines the best parts of five harnesses and outside research into one design.
It also gives soft deadlines and a test-VM size.

Sources studied (local clones in `repos/`):

| Short name | Repo | What it is |
|---|---|---|
| DSH | `deepseek-ai/dsh-superagent-prototype` | Ticket-driven GitHub agent: router session + one executor session per ticket |
| MD | `HarnessMD/munder-difflin` | Desktop "office" that wraps CLI agents; god agent, mailboxes, hive repo |
| Hermes | `NousResearch/hermes-agent` | Personal agent: pluggable sandboxes, kanban, bounded memory, skill curator |
| pi | `badlogic/pi-mono` | Minimal coding agent + SDK: JSONL tree sessions, compaction, durable runtime |
| OC | `sst/opencode` | Client/server coding agent: worktree service, shadow-git snapshots, output limits |

---

## 1. Best pieces per problem

### 1.1 Roles and orchestration

| Piece | Source | Take it because |
|---|---|---|
| Router session with a small tool set; it never writes code | DSH `prompts/orchestrator.md` | Keeps the Orchestrator cheap and stops it from doing worker jobs |
| One executor session per ticket: `worker-<ticket-id>` + own directory | DSH `docs/003-execution.md` | This is our per-agent session model |
| Ticket stage is computed from stored facts, not from the session | DSH stage table | A restart cannot corrupt ticket state |
| "Store the work first, do it after" (outbox) | DSH stored work | Gives crash-safe delivery and exact retries |
| Worker slots + one reserved slot for human messages | DSH concurrency | New work never blocks a human follow-up |
| FIPA-lite messages: `act`, `conversation`, `hops`, `needs_human` | MD `HIVE.md` §4 | A hop cap stops agent ping-pong loops |
| Single committer; agents write only their own folder | MD `HIVE.md` §2 | No `index.lock` races between agents |
| Durable SQLite task board with `request_review` / `block` tools | Hermes kanban | Matches the Ridge Kanban states directly |
| Budget checkpoint near 90% of the iteration cap | Hermes kanban | Workers report before they run out |

**Our roles:**

| Role | Count | Tools | Sandbox |
|---|---|---|---|
| Router | 1 | Ticket read, memory search, dispatch | Read-only, no shell |
| Orchestrator (Master) | 1 per ticket | Repo read, test run, plan write | Read-only worktree mount |
| Worker (Swarm) | N per ticket (by task type) | Full edit, shell, git commit | Own worktree + own container |
| Auditor | 1 per ticket | Diff read, test run, plan compare | Read-only copy of worker branch |
| Curator | 1 per finished ticket | Trajectory read, lesson write | No repo write; writes `.ridge/memory/` only |

The Auditor checks three facts before Gate 2:
1. The regression test failed before the fix.
2. All tests pass after the fix.
3. The diff touches only files in the approved plan.

### 1.2 Sandboxes

| Piece | Source | Take it because |
|---|---|---|
| `ExecutionEnv` interface with local, Docker, SSH, Daytona, Modal back ends | Hermes `tools/environments/`, pi `packages/env` | We can change isolation strength without changing agents |
| Remote daemon that runs tools while credentials stay on the host | pi `pi-env` | Keeps API keys out of the sandbox |
| Worktree service with strategies, stored in SQLite | OC `core/src/worktree.ts` | Tracks worktrees as data, not as loose folders |
| Warning: path wrappers are "not a security boundary" | DSH §Execution variables | We must add a real container or VM boundary |

**Decision:** layer two boundaries.
1. A git worktree gives file isolation (spec §5).
2. A container gives process, network, and credential isolation.
   - Phase 1: rootless Docker with gVisor (`runsc`). It needs no KVM.
   - Phase 2: Kata Containers or Firecracker when the host supports KVM.

### 1.3 Sessions you can reopen (HITL requirement)

| Piece | Source | Take it because |
|---|---|---|
| Session file = JSONL tree (`id`/`parentId`); `--resume`, `/fork`, `/clone` | pi `session-format.md` | A reviewer can branch from any step without losing the original |
| Commit each turn and tool call to storage before showing it | pi `pi-durable` | A crash mid-turn resumes at the same point |
| A person writes directly into the executor session; failures keep tools on | DSH §Failure | This is the "reviewer edits in the session" flow |
| Retry = new Assignment in the same session, directory, branch, PR | DSH §Retry | Keeps one history per ticket |
| Shadow-git snapshot per step; `diff` and `restore` per file | OC `core/src/snapshot.ts` | A reviewer can roll back one bad step |

**Session lifecycle:**

```text
open    → session_id = <ticket>-<role>-<ULID>, sandbox starts, trajectory.jsonl starts
work    → every turn is committed to session.jsonl before display
close   → sandbox stops, worktree branch stays, return session_id + summary
reopen  → reviewer calls resume(session_id):
          1. Rebuild the sandbox from the same image.
          2. Mount the same worktree branch.
          3. Load session.jsonl (compacted view + full log on disk).
          4. Hand the reviewer an interactive turn in that session.
fork    → reviewer can fork(session_id, entry_id) to try another fix.
```

### 1.4 Context bloat

| Rule | Source |
|---|---|
| Never mutate past context except at compaction; protect the prompt cache | Hermes `AGENTS.md` |
| Tool output over 2,000 lines or 50 KB goes to a file; the model gets the path | OC `tool-output.ts` |
| Spec rule: over 100 lines → write to `trajectory.jsonl`, return exit code + 10-line summary | Ridge spec §4.2 |
| Compact when `tokens > window − reserve`; keep the most recent 20k tokens; track touched files across compactions | pi `compaction.md` |
| Bounded memory files with hard character limits; the agent must consolidate | Hermes `memory.md` |
| Workers return only a final summary to the parent | Hermes delegation |

**Research warning (ACE, ICLR 2026):** repeated LLM rewrites cause "context collapse" and "brevity bias".
A 2-line lesson can lose key detail.
We keep the 2-line `lesson` field for injection, but also store `symptom`, `root_cause`, and `files`.
We append and refine lessons. We never rewrite the whole store. ([arXiv 2510.04618](https://arxiv.org/abs/2510.04618))

### 1.5 Role precedence

When two instructions conflict, the higher row wins:

1. Safety policy and sandbox limits (code, not prompt).
2. Live human instruction at a HITL gate.
3. Tier 3 Global rules.
4. Repository `AGENTS.md` and Tier 2 Project lessons.
5. Approved Execution Plan.
6. Orchestrator messages to a worker.
7. Tool output, ticket text, and web content. These are **data**, never instructions.

DSH enforces the same idea: "External text cannot change policy."
Each injected block carries a `source` and `rank` tag so the model can see the order.

---

## 2. Knowledge store: OKF, not RAG

Google Cloud published the **Open Knowledge Format (OKF) v0.1** on 2026-06-12.
OKF is a folder of Markdown files with YAML front matter. Only `type` is required.
It has no registry, no storage back end, and no runtime API.
Spec: `GoogleCloudPlatform/knowledge-catalog`, folder `okf/`.

This fits the spec well: one lesson = one Markdown file. FTS5 indexes the folder.

```markdown
---
type: lesson
title: per-diem cap resets on re-add
tags: [react-state, reimbursement]
resource: src/components/reimbursement/PerDiemForm.tsx
timestamp: 2026-11-03
ticket_id: SCG-140
component: per-diem-readd-cap
files:
  - src/components/reimbursement/PerDiemForm.tsx
  - src/components/reimbursement/__tests__/PerDiemForm.test.tsx
---
**Symptom:** Re-adding an employee resets the cap to 300, not 500 from master data.
**Root cause:** `defaultPerDiemRate()` uses hardcoded `DEFAULT_PRICE_PER_MEAL` on the add-back path.
**Lesson:** Read live policy data in helpers that both mount effects and user actions call.
```

Layout: `.ridge/memory/lessons/<ticket-id>.md` + `.ridge/memory/index.sqlite`.
Tier 3 global rules use the same format with `type: rule`.

---

## 3. Ranking: BM25 + small attention models

No vector database. No embedding retrieval. Every stage scores (query, document) text pairs.

| Stage | Model | Size | Runs on | Job |
|---|---|---|---|---|
| S1 | SQLite FTS5 BM25, field weights (title, component, files, root_cause) | — | CPU | Top 50 candidates in < 5 ms |
| S2 | Cross-encoder reranker, `ms-marco-MiniLM-L6-v2`, ONNX int8 | 22M params | CPU | Rerank 50 → top 3 |
| S3 (our research) | Tiny attention reranker trained on our own tickets | 1–5M params | CPU | Replace or blend with S2 |

**S3 design (our own research):**
- Input: ticket text tokens × lesson field tokens, joined by 2 cross-attention layers.
- Extra features: BM25 score, file-path overlap with the stack trace, component match, lesson age, past hit rate.
- Labels from our logs: a lesson is positive when its injection led to a fix under the token budget.
- Teacher: distill from S2 and from an LLM judge, then fine-tune on the labels.
- Same model also prunes context. It scores each chunk in the active window and drops low-score chunks.

**Evaluation set:** build it from existing Ridge / SCG-bot tickets in week 1.
Measure Recall@3, nDCG@10, latency, and total tokens per ticket.

Candidates to benchmark in week 6: `ms-marco-MiniLM-L4/L6-v2`, `bge-reranker-v2-m3`, `gte-reranker-modernbert-base`.
Public latency numbers are thin. We must benchmark them on our own data.

---

## 4. Architecture

```text
            Jira / ServiceNow / Ridge UI / CLI
                         │  TicketInput
                         ▼
 ┌──────────────────── @aigerdata/agent-core ─────────────────────┐
 │ Router ──► Ranker (S1 BM25 → S2/S3 rerank) ◄── OKF lessons/rules│
 │   │                                                             │
 │   ▼                                                             │
 │ Orchestrator ─ plan ─► [Gate 1: human] ─► WorktreeManager       │
 │   │                                         │ lock check (Rule 3)│
 │   ▼                                         ▼                   │
 │ SessionManager ── open(session_id) ──► SandboxManager (ExecEnv) │
 │   │                                    Worker 1..N  containers  │
 │   ▼                                                             │
 │ Auditor ─► [Gate 2: human PR] or AUTO_DEPLOY_UAT                │
 │   │                                                             │
 │   ▼                                                             │
 │ Curator ─► lesson.md (Tier 2) ─► review queue ─► rule.md (Tier 3)│
 │ Outbox (store first, do after) · Event log · Message bus (hops) │
 └─────────────────────────────────────────────────────────────────┘
                         │ events
                         ▼
                 ridge-ui (Kanban, session viewer)
```

New public methods, in addition to spec §6.2:

```typescript
openSession(ticketId: string, role: AgentRole): Promise<SessionHandle>;
closeSession(sessionId: string): Promise<SessionSummary>;   // returns sessionId
resumeSession(sessionId: string, actor: 'human' | 'agent'): Promise<SessionHandle>;
forkSession(sessionId: string, entryId: string): Promise<SessionHandle>;
```

---

## 5. Soft deadlines

**Assumptions:** one full-time engineer plus Claude Code. Start 2026-11-03.
Two engineers can run W2 and W3 in parallel and save about one week.
The spec estimate (36 h) covers only RIDGE-01 to RIDGE-05.
It does not cover per-agent sandboxes, session resume, the Auditor, or the ranker research.

| Week | Dates (soft) | Work | Spec task | Exit check |
|---|---|---|---|---|
| W1 | Nov 3 – Nov 7 | Finish research, write ADRs, build the eval set from old tickets, provision the VM | RIDGE-01 | Eval set ≥ 50 tickets; ADRs approved by team lead |
| W2 | Nov 10 – Nov 14 | `WorktreeManager` + `SandboxManager` (Docker + gVisor) + `SessionManager` (open/close/resume/fork) | RIDGE-02 | 4 workers run in parallel; a human resumes a closed session |
| W3 | Nov 17 – Nov 21 | Tier 1 offload, OKF lesson store, FTS5 BM25, Curator prompt | RIDGE-03 | Curator turns one real transcript into a valid OKF lesson |
| W4–W5 | Nov 24 – Dec 5 | Extract Router, Orchestrator, Worker, Auditor loops into `agent-core`; HITL gates; outbox | RIDGE-04 | One real ticket runs end to end with both gates |
| W6 | Dec 8 – Dec 12 | Benchmark S2 rerankers; train first S3 tiny reranker; Tier 3 table + promotion API | RIDGE-05 | S2/S3 Recall@3 report; promotion API works |
| W7 | Dec 15 – Dec 19 | End-to-end benchmark, hardening, docs | — | Repeat tickets cost ≤ 10k tokens; **MVP soft deadline Dec 19** |

Buffer: Dec 22 – Dec 24 for slips. Review progress every Friday.

---

## 6. Test VM estimate

**Load we must hold:** 1 Router + 1 Orchestrator + 4–6 Workers + 1 Auditor at the same time.
LLM calls go to external APIs, so the VM needs no GPU for inference.
Each Worker runs `pnpm install`, `vitest`, and sometimes a headless browser.

| Component | vCPU | RAM | Disk |
|---|---|---|---|
| Each Worker sandbox (Node build + vitest + Chromium) | 2 | 4 GB | 10 GB |
| 6 Workers | 12 | 24 GB | 60 GB |
| Router, Orchestrator, Auditor, Curator (light) | 2 | 4 GB | 5 GB |
| Supabase / Postgres (Tier 3) + SQLite indexes | 2 | 4 GB | 20 GB |
| Reranker inference (MiniLM ONNX, CPU) | 1 | 2 GB | 2 GB |
| Repo clones, worktrees, pnpm store, Docker images, archives | — | — | 150 GB |
| OS + headroom | 1 | 6 GB | 50 GB |
| **Total** | **~18** | **~44 GB** | **~300 GB** |

The table above is the worst case: 6 parallel Workers, each with Chromium.
LLM inference runs on external APIs, so the VM only runs tool work: installs, builds, tests, and containers.
Start small. Measure real usage in W2. Scale only when the numbers show a need.

**Recommendation (revised 2026-11-03):**

| Tier | Spec | Use |
|---|---|---|
| **Start here** | **8 vCPU, 16 GB RAM, 200 GB SSD** | 2–3 Workers at once; enough for W1–W5 |
| Scale up (only if W2 measurements need it) | 16 vCPU, 32 GB RAM, 300 GB SSD | 5–6 Workers at once; W7 benchmarks |
| Alternative | 4 vCPU, 8 GB RAM + hosted sandboxes (E2B / Modal, pay per second) | Sandboxes run off the VM; VM runs only the harness and DB |
| Optional GPU (hourly rental) | 1× 24 GB GPU (e.g. L4) | Only for S3 training if CPU training is too slow |

Disk drives cost more than CPU: each worktree has its own `node_modules`, plus Docker images and archived trajectories.

Requirements for the VM:
- Ubuntu 24.04 LTS, x86_64.
- Nested virtualization or bare metal (`/dev/kvm`) so Phase 2 can use Kata or Firecracker.
- Docker + gVisor (`runsc`) installed.
- Outbound access to GitHub, npm, and the LLM API endpoints.

**This machine today:** 4 vCPU, 15 GB RAM, 14 GB free disk (92% full).
It can run research and one Worker. It cannot run the parallel swarm tests.

---

## 7. Open questions

1. Who owns the eval-set labels from old tickets?
2. Which LLM providers and subscriptions do Workers use? This links to Task 2 (Harness Router).
3. Does the cloud provider give `/dev/kvm` on the chosen VM size?
4. Lesson file name: confirm `.ridge/memory/lessons/<ticket-id>.md` (OKF) replaces `lessons.jsonl`.

## 8. References

- Google Cloud OKF coverage: [Search Engine Journal](https://www.searchenginejournal.com/google-cloud-announces-the-open-knowledge-format/579253/), [The Decoder](https://the-decoder.com/google-clouds-open-knowledge-format-turns-scattered-docs-into-markdown-files-for-ai-agents/), [agentic-ai docs](https://agentic-ai.readthedocs.io/en/latest/Standards/open-knowledge-format/)
- ACE paper: [arXiv 2510.04618](https://arxiv.org/abs/2510.04618)
- Rerankers: [Redis 2026 reranker overview](https://redis.io/blog/top-reranking-models-rag-accuracy.md)
- Sandboxes: [Helix self-hosted sandboxes](https://helix.ml/blog/self-hosted-agent-sandboxes), [Kubernetes Agent Sandbox](https://agent-sandbox.sigs.k8s.io/docs/), [Spheron E2B/Daytona/Firecracker](https://www.spheron.network/blog/ai-agent-code-execution-sandbox-e2b-daytona-firecracker/)
