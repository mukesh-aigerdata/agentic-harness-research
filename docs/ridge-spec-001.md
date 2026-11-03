# RIDGE MULTI-AGENT SYSTEM (MAS) TECHNICAL SPECIFICATION

**DOCUMENT ID:** AIGER-RIDGE-SPEC-001
**STANDARD:** ASD-STE100 (Simplified Technical English)
**TARGET REPOSITORY:** `Aigerdata/ridge` (`@aigerdata/ridge-core`)

## 1. SYSTEM OVERVIEW

### 1.1 Purpose

Ridge is an autonomous issue tracking and software maintenance platform. Ridge uses a Multi-Agent System (MAS) to triage bugs, reproduce failures, write code fixes, execute tests, and deploy software updates.

### 1.2 Core Engineering Mandate

The current Ridge implementation couples the agent execution logic to the Kanban web interface. You must decouple the agent runtime from the user interface. Build the agent runtime as a standalone, plug-and-play library (`@aigerdata/ridge-core`). Clients and internal platforms must be able to import this library without modifications.

### 1.3 Primary Technical Objectives

* **Modularize the MAS Engine:** Package the Orchestrator Agent and Worker Agents into an independent Software Development Kit (SDK).
* **Isolate Parallel Execution:** Use Git Worktrees to run multiple Worker Agents on the same repository at the same time without file collisions.
* **Eliminate Context Bloat:** Compress 3,000-line raw execution transcripts into 2-line lessons.
* **Reduce Token Consumption:** Lower the token cost for recurring issue types from 50,000 tokens to 10,000 tokens.
* **Enforce Human-in-the-Loop (HITL) Gates:** Pause agent execution at defined checkpoints until an engineer approves the action.

## 2. SYSTEM COMPONENTS

### 2.1 Kanban State Machine

The Ridge board tracks tickets across five sequential states:

1. **`Backlog`:** Stores raw issues ingested from Jira, ServiceNow, or manual user input.
2. **`Triage / Ready`:** Holds issues that the Orchestrator Agent is actively analyzing or that await human plan approval.
3. **`In Progress`:** Holds issues that an isolated Worker Agent is actively fixing inside a Git Worktree.
4. **`Review`:** Holds completed code fixes that await Pull Request (PR) review or automated verification.
5. **`Done`:** Stores resolved, merged, and deployed tickets along with their extracted memory lessons.

### 2.2 The Orchestrator Agent (Manager Agent)

The Orchestrator Agent manages the ticket lifecycle. It does not write production feature fixes directly.

* **Input:** Ticket ID, title, text description, screenshot attachments, and target repository name.
* **Responsibilities:**
  * Query Project Memory and Global Memory for similar past tickets.
  * Inspect the target repository to locate the root cause.
  * Run reproduction scripts or tests to confirm the bug exists.
  * Generate a deterministic Execution Plan.
  * Spawn an on-demand Worker Agent inside an isolated Git Worktree after human approval.

### 2.3 The Worker Agent (Swarm Execution Unit)

The Worker Agent is an ephemeral execution instance. It operates strictly inside one assigned Git Worktree.

* **Input:** Approved Execution Plan, retrieved Memory Lessons, and the isolated Worktree file path.
* **Responsibilities:**
  * Write a failing regression test that reproduces the reported bug.
  * Modify the source code to fix the bug.
  * Run the test suite until all unit and regression tests pass.
  * Commit the changes to the worktree branch.
  * Execute the repository deployment policy (raise a Pull Request or merge to the CI/CD pipeline).

### 2.4 The Memory Curator

The Memory Curator is a post-processing module that runs when a ticket moves to `Done`.

* **Input:** The raw 3,000-line execution transcript (`SCG-bot transcript`) and the final Git diff.
* **Responsibilities:**
  * Strip out failed searches, raw terminal logs, and redundant file reads.
  * Extract a 1-to-2 line `LESSON` that explains the root cause and the required coding pattern.
  * Append the `LESSON` to the Project Memory store.

## 3. END-TO-END OPERATIONAL WORKFLOW

Execute every ticket in the following twelve sequential steps:

**Step 1: Ingest Ticket**
Read the ticket payload from the external webhook (Jira or ServiceNow) or the Ridge UI. Place the ticket in the `Backlog` column.

**Step 2: Gate 0 — Initial Triage Approval (Optional)**
If `requireInitialHumanTriage` is enabled for the project, wait for an engineer to move the ticket from `Backlog` to `Triage / Ready`. If disabled, move the ticket to `Triage / Ready` automatically.

**Step 3: Query Memory Hierarchy**
Trigger the Orchestrator Agent. Search the Project Memory and Global Memory stores using the ticket title, error codes, and component names. Inject matching lessons into the Orchestrator Agent context.

**Step 4: Reproduce the Bug**
Scan the target codebase. If the ticket includes screenshots, parse the visual state. Execute the test runner (for example, `vitest`) or headless browser tool to reproduce the exact failure. Record the root cause file path and line numbers.

**Step 5: Generate Execution Plan**
Compile the reproduction findings, root cause analysis, and proposed code changes into a structured Execution Plan. Post the Execution Plan as a comment on the Ridge ticket.

**Step 6: Gate 1 — Human Plan Review**
Pause the Orchestrator Agent. Notify the assigned engineer. Do not proceed until the engineer clicks **Approve Plan**.

**Step 7: Provision Git Worktree**
Move the ticket to `In Progress`. Execute the Git Worktree command on the host server:

```bash
git worktree add -b fix/<ticket-id> /var/ridge/worktrees/<repo-name>/<ticket-id> main
```

Bind the Worker Agent file-system tools strictly to `/var/ridge/worktrees/<repo-name>/<ticket-id>`.

**Step 8: Write Failing Regression Test**
Start the Worker Agent inside the worktree. Write a test case that targets the bug. Run the test suite. Verify that the new test fails on the unmodified code.

**Step 9: Implement Fix and Verify**
Edit the source files in the worktree to resolve the issue. Run the test suite again. Verify that the new regression test and all existing tests pass.

**Step 10: Execute Deployment Policy**
Move the ticket to `Review`. Check the project permission configuration:

* **Mode A (`PR_ONLY`):** Push the worktree branch to GitHub and open a Pull Request. Wait at **Gate 2** for a human engineer to review and merge the PR.
* **Mode B (`AUTO_DEPLOY_UAT`):** Merge the worktree branch into the target branch automatically. Trigger the CI/CD deployment pipeline.

**Step 11: Curate Project Memory**
Move the ticket to `Done`. Run the Memory Curator on the execution transcript. Write the distilled `LESSON` to the Project Memory file and commit the memory update.

**Step 12: Destroy Git Worktree**
Delete the temporary worktree to free disk space:

```bash
git worktree remove --force /var/ridge/worktrees/<repo-name>/<ticket-id>
```

## 4. THREE-TIER MEMORY ARCHITECTURE (CONTEXT BLOAT SOLUTION)

### 4.1 Problem Statement

A single Worker Agent run produces approximately 3,000 lines of logs and consumes up to 50,000 tokens. Loading raw transcripts into subsequent agent runs saturates the context window, increases API costs, and degrades reasoning accuracy.

### 4.2 Tier 1: Ephemeral Task Memory (Short-Term)

* **Scope:** One active ticket run (for example, `SCG-140`).
* **Storage Path:** `/var/ridge/worktrees/<repo-name>/<ticket-id>/trajectory.jsonl`
* **Retention Policy:** Delete the raw log from active memory after the ticket reaches `Done` (archive to cold storage for UI inspection only).
* **Context Compaction Rules:**
  * Never keep full file contents or raw test outputs in the active LLM message array for more than 3 turns.
  * When a tool output exceeds 100 lines, write the full output to `trajectory.jsonl` and return only the exit code and a 10-line summary to the active prompt.
  * Prune completed sub-steps from the active prompt window once the regression test passes.

### 4.3 Tier 2: Project Memory (Mid-Term)

* **Scope:** One specific repository (for example, `Aigerdata/scg-cash-management`).
* **Storage Path:** `.ridge/memory/lessons.jsonl` inside the repository root, indexed by a local SQLite FTS5 (BM25) database.
* **Data Schema:** Each entry must contain fewer than 150 tokens:

```json
{
  "ticket_id": "SCG-140",
  "component": "per-diem-readd-cap",
  "files": [
    "src/components/reimbursement/PerDiemForm.tsx",
    "src/components/reimbursement/__tests__/PerDiemForm.test.tsx"
  ],
  "symptom": "Removing and re-adding an employee resets the per-diem cap to hardcoded 300 instead of 500 from master data.",
  "root_cause": "defaultPerDiemRate() hardcoded DEFAULT_PRICE_PER_MEAL (300) on the add-back path and ignored policy.perMealCap.",
  "lesson": "A default-seeding helper called from both a mount effect and a user action must read live policy/master data directly. Never rely on a one-shot mount effect to correct state after mount."
}
```

* **Retrieval Mechanism:** When a new ticket arrives, run a BM25 query against `.ridge/memory/`. Inject the top 3 matching lessons into the Orchestrator Agent prompt. This bypasses full-repo exploration and reduces token usage from 50,000 tokens to 10,000 tokens.

### 4.4 Tier 3: Global Memory (Long-Term)

* **Scope:** All repositories and client projects across Aigerdata.
* **Storage Path:** Central PostgreSQL / Supabase database (`global_memory_rules` table).
* **Promotion Workflow (Weekly/Monthly Human Review):**
  1. Every week or month, Ridge aggregates all new Tier 2 Project Memory lessons into a **Memory Review Queue**.
  2. A lead engineer reviews each project lesson.
  3. The engineer clicks **Generalize to Global**.
  4. The system strips project-specific file names (`PerDiemForm.tsx`) and rewrites the lesson as a universal framework rule (for example, `[REACT-STATE-004]: Helpers invoked by both mount hooks and event handlers must read live store state directly`).
  5. Ridge pushes the updated Global Memory rules as a patch to all connected repositories.

## 5. GIT WORKTREE CONCURRENCY & COLLISION RULES

### 5.1 Directory Structure

Maintain a bare or clean primary clone of each repository on the host VM, and spawn isolated worktrees for every active ticket:

```text
/var/ridge/
├── repos/
│   └── scg-cash-management/          # Primary clean clone (tracks main)
└── worktrees/
    └── scg-cash-management/
        ├── SCG-140/                  # Isolated worktree for Worker 1 (branch: fix/SCG-140)
        └── SCG-158/                  # Isolated worktree for Worker 2 (branch: fix/SCG-158)
```

### 5.2 Collision Prevention Rules

* **Rule 1 (No Shared Working Directory):** Never allow two Worker Agents to execute inside the same directory path.
* **Rule 2 (Chroot Path Jail):** Validate every file-read and file-write tool call. Reject any path that resolves outside `/var/ridge/worktrees/<repo-name>/<ticket-id>`.
* **Rule 3 (File Lock Arbitration):** Before the Orchestrator Agent approves a worktree creation, compare the target files in the Execution Plan against all currently active `In Progress` tickets. If two tickets modify the exact same file, place the second ticket in `On Hold` until the first ticket merges.
* **Rule 4 (Pre-Merge Rebase):** Before a Worker Agent opens a Pull Request or auto-merges, run `git fetch origin main && git rebase origin/main` inside the worktree. Run the full test suite again after the rebase. If a merge conflict occurs, halt the Worker Agent and alert a human engineer.

## 6. PLUG-AND-PLAY CORE LIBRARY SPECIFICATION (`@aigerdata/ridge-core`)

### 6.1 Package Architecture

Structure the codebase as a monorepo or decoupled workspace so the core engine contains zero UI dependencies:

```text
ridge/
├── packages/
│   ├── ridge-core/                   # Plug-and-play MAS SDK (Zero UI code)
│   │   ├── src/
│   │   │   ├── orchestrator/         # Manager Agent triage & planning loop
│   │   │   ├── worker/               # Worker Agent test-driven fix loop
│   │   │   ├── worktree/             # Git worktree creation, locking & cleanup
│   │   │   ├── memory/               # Tier 1, Tier 2 (SQLite FTS5), Tier 3 (Postgres)
│   │   │   ├── sandbox/              # Tool execution & path validation
│   │   │   └── index.ts              # Public SDK exports
│   └── ridge-ui/                     # Kanban board, ticket modals, memory review UI
```

### 6.2 Public SDK Interface

Expose a clean TypeScript interface in `@aigerdata/ridge-core` so any external system (Jira webhook, CLI, or internal chat router) can invoke Ridge programmatically:

```typescript
export interface TicketInput {
  ticketId: string;
  repoId: string;
  title: string;
  description: string;
  attachments?: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  deploymentPolicy: 'PR_ONLY' | 'AUTO_DEPLOY_UAT';
}

export interface RidgeCoreEngine {
  triageTicket(ticket: TicketInput): Promise<ExecutionPlan>;
  executeApprovedPlan(ticketId: string, planId: string): Promise<WorkerRunResult>;
  curateMemory(ticketId: string, runId: string): Promise<ProjectLesson>;
  promoteLessonToGlobal(lessonId: string, tags: string[]): Promise<GlobalRule>;
}
```

## 7. IMPLEMENTATION TASKS & TIME ESTIMATES

Use the standard 3-point estimation formula defined by leadership:

$$\text{Estimate} = \frac{\text{Best Case} + \text{Average Case} + \text{Worst Case}}{3}$$

| Task ID | Deliverable Description | Best Case | Avg Case | Worst Case | Final Estimate |
| --- | --- | --- | --- | --- | --- |
| **RIDGE-01** | Audit `Aigerdata/ridge` codebase and map existing `SCG-bot` execution and memory hooks. | 2h | 3h | 4h | **3.0 Hours** |
| **RIDGE-02** | Build the `WorktreeManager` module (create, jail paths, detect file collisions, rebase, and remove). | 4h | 6h | 8h | **6.0 Hours** |
| **RIDGE-03** | Build the 3-Tier Memory Engine (Tier 1 disk offloading, Tier 2 SQLite FTS5 index, and Curator prompt). | 6h | 8h | 13h | **9.0 Hours** |
| **RIDGE-04** | Extract Orchestrator and Worker loops into the standalone `@aigerdata/ridge-core` library with HITL pause states. | 8h | 12h | 16h | **12.0 Hours** |
| **RIDGE-05** | Build Tier 3 Global Memory Postgres table and the Weekly/Monthly Human Promotion API endpoint. | 4h | 6h | 8h | **6.0 Hours** |
| **TOTAL** | **Complete Ridge Core Productization MVP** | **24h** | **35h** | **49h** | **36.0 Hours (~4.5 Days)** |
