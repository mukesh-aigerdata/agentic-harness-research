import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

out = sys.argv[1]
F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVM", F + "DejaVuSansMono.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("DV", normal="DV", bold="DVB", italic="DV", boldItalic="DVB")

INK = colors.HexColor("#1f2937")
ACCENT = colors.HexColor("#1d4ed8")
MUTED = colors.HexColor("#6b7280")
HEAD_BG = colors.HexColor("#e8eefc")
ROW_ALT = colors.HexColor("#f7f8fa")
GRID = colors.HexColor("#d1d5db")

ss = getSampleStyleSheet()
body = ParagraphStyle("body", parent=ss["Normal"], fontName="DV", fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=4)
small = ParagraphStyle("small", parent=body, fontSize=8.5, leading=11.5)
cell = ParagraphStyle("cell", parent=body, fontSize=8.5, leading=11, spaceAfter=0)
cellb = ParagraphStyle("cellb", parent=cell, fontName="DVB")
h1 = ParagraphStyle("h1", parent=body, fontName="DVB", fontSize=15, leading=19, textColor=ACCENT, spaceBefore=10, spaceAfter=6)
h2 = ParagraphStyle("h2", parent=body, fontName="DVB", fontSize=11.5, leading=15, textColor=INK, spaceBefore=8, spaceAfter=4)
title = ParagraphStyle("title", parent=body, fontName="DVB", fontSize=22, leading=27, textColor=INK, spaceAfter=4)
sub = ParagraphStyle("sub", parent=body, fontSize=11, leading=15, textColor=MUTED, spaceAfter=10)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=2)
callout = ParagraphStyle("callout", parent=body, backColor=colors.HexColor("#fff7e6"), borderColor=colors.HexColor("#f0c36d"),
                         borderWidth=0.6, borderPadding=6, spaceBefore=6, spaceAfter=10)

W = A4[0] - 36 * mm


def P(t, s=body):
    return Paragraph(t, s)


def bullets(items):
    return [Paragraph(i, bullet, bulletText="•") for i in items]


def table(rows, widths, head=True, bold_first_col=False):
    data = []
    for r_i, r in enumerate(rows):
        row = []
        for c_i, c in enumerate(r):
            st = cellb if (head and r_i == 0) or (bold_first_col and c_i == 0) else cell
            row.append(Paragraph(str(c), st))
        data.append(row)
    t = Table(data, colWidths=[w * W for w in widths], repeatRows=1 if head else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if head:
        style.append(("BACKGROUND", (0, 0), (-1, 0), HEAD_BG))
    for i in range(1 if head else 0, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("DV", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Aigerdata · agent-core research · Session report 2026-11-03")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


s = []

# ---------- Cover / summary ----------
s += [P("agent-core: Session Report", title),
      P("Research summary, timeline, and VM sizing for productising Ridge as <b>@aigerdata/agent-core</b>", sub),
      table([["Item", "Value"],
             ["Date", "2026-11-03"],
             ["Repo", "github.com/mukesh-aigerdata/agentic-harness-research"],
             ["Commits pushed", "29c798b (research plan, spec, rules) · 57fd17a (detailed CLAUDE.md)"],
             ["MVP soft deadline", "<b>2026-12-19</b> (7 weeks, buffer to Dec 24)"],
             ["Start VM", "<b>4 vCPU · 16 GB RAM · 150 GB SSD</b> (Starter tier)"]],
            [0.28, 0.72], bold_first_col=True),
      Spacer(1, 8),
      P("Executive summary", h1),
      P("Ridge's agent logic is coupled to its Kanban UI. We will extract it into a standalone SDK, "
        "<b>@aigerdata/agent-core</b>. The SDK runs a Router, an Orchestrator, Worker swarms, an Auditor, and a Curator. "
        "Each agent runs in its own sandbox with its own session ID. A human reviewer can reopen any closed session and continue the work."),
      P("Memory uses no RAG and no vector database. Lessons are stored as Google <b>Open Knowledge Format (OKF)</b> Markdown files. "
        "They are ranked with SQLite BM25 plus small attention-based rerankers. The goal is to cut repeat-ticket cost from 50k to 10k tokens."),
      P("We studied five open-source harnesses and took the best piece from each, instead of depending on one."),
      ]

# ---------- What we did ----------
s += [P("1. What we did in this session", h1),
      table([["#", "Step", "Result"],
             ["1", "Checked for saved context", "No earlier memory existed. Repo had only a one-line README."],
             ["2", "Saved the requirements", "Ridge spec (AIGER-RIDGE-SPEC-001), Ridge README, and team-call requirements saved to <font name='DVM'>docs/</font> and to agent memory."],
             ["3", "Cloned reference harnesses", "DeepSeek DSH super-agent, Munder Difflin, Hermes agent, pi, OpenCode into <font name='DVM'>repos/</font> (git-ignored, ~1.2 GB). The private Ridge repo was not needed."],
             ["4", "Analysed each harness", "Read architecture, session, sandbox, memory, and compaction code and docs."],
             ["5", "Web research", "Confirmed OKF v0.1 (Google Cloud, June 2026); ACE paper (ICLR 2026) on context collapse; small rerankers; self-hosted sandboxes (gVisor, Kata, Firecracker)."],
             ["6", "Wrote project rules", "<font name='DVM'>CLAUDE.md</font> (detailed project context) with <font name='DVM'>AGENTS.md</font> symlink; ASD-STE100 writing rule added to global config."],
             ["7", "Wrote the research plan", "<font name='DVM'>docs/RESEARCH_PLAN.md</font>: architecture, ranking design, sessions, deadlines, VM sizing."],
             ["8", "Revised VM size", "Reduced after review: LLMs run on APIs, so the VM only runs builds, tests, and sandboxes."],
             ["9", "Pushed to GitHub", "Two commits on <font name='DVM'>main</font>."]],
            [0.05, 0.25, 0.70]),
      Spacer(1, 6),
      P("<b>Security action:</b> a GitHub personal access token was pasted into the chat to push. "
        "Revoke it at github.com/settings/tokens. Use <font name='DVM'>gh auth login</font> for future pushes.", callout),
      ]

# ---------- Best pieces ----------
s += [PageBreak(), P("2. Best pieces taken from each harness", h1),
      table([["Harness", "What we take", "Why"],
             ["DeepSeek DSH", "Router with a small tool set; one executor session per ticket; humans type directly into a worker session; 'store first, do after' outbox; reserved slot for human messages",
              "Matches our reopen-session requirement and gives crash-safe retries"],
             ["Munder Difflin", "Supervisor ('god') agent; typed messages with a hop limit; one git committer; each agent writes only its own folder",
              "Stops agent ping-pong loops and git lock races"],
             ["Hermes", "One sandbox interface over local, Docker, SSH, Modal, Daytona; SQLite Kanban with review/block tools; bounded memory; never edit past context",
              "Swap isolation strength without changing agents; protects prompt cache"],
             ["pi", "Session log as a branching tree with resume and fork; save each step before showing it; remote tool daemon keeps API keys on the host",
              "Reviewer can branch from any step; crash resumes at the same point"],
             ["OpenCode", "Worktree service stored in SQLite; per-step shadow-git snapshots with per-file restore; large tool output goes to a file",
              "Undo one bad step; keeps context small"]],
            [0.17, 0.53, 0.30], bold_first_col=True),
      P("Our own research adds: a 3-stage ranker (BM25 → MiniLM cross-encoder → our tiny attention reranker trained on past tickets), "
        "an Auditor role, and a fixed instruction-priority order (safety → human gate → global rules → project rules → plan → orchestrator → tool output as data).", small),
      ]

# ---------- Timeline ----------
s += [PageBreak(), P("3. Estimated timeline", h1),
      P("Assumption: one full-time engineer working with Claude Code, starting 2026-11-03. Dates are soft targets, reviewed every Friday."),
      table([["Week", "Dates", "Work", "Why it takes this long"],
             ["W1", "Nov 3–7", "Research, architecture decision records (ADRs), eval set from ≥50 old tickets, VM setup",
              "The eval set needs manual labelling: which lesson would have helped which ticket. ADRs need team-lead approval before code starts."],
             ["W2", "Nov 10–14", "WorktreeManager, SandboxManager (Docker + gVisor), SessionManager (open / close / resume / fork)",
              "Three managers, not one. The spec gives 6 h for worktrees only; sandboxes and session resume are new. Parallel-run and resume tests take time."],
             ["W3", "Nov 17–21", "Tier 1 log offload, OKF lesson store, SQLite FTS5 index, Curator prompt",
              "Spec gives 9 h. The Curator prompt must be tuned on real transcripts, and each lesson checked for lost detail (ACE warning)."],
             ["W4–W5", "Nov 24 – Dec 5", "Router, Orchestrator, Worker, Auditor loops in agent-core; HITL gates; outbox",
              "Largest block. LLM behaviour is non-deterministic, so each loop needs many real runs. Gates and crash recovery need end-to-end tests on a real ticket."],
             ["W6", "Dec 8–12", "Benchmark 3–4 rerankers; train first tiny attention reranker; Tier 3 global table + promotion API",
              "Model training depends on W1 labels. Each reranker needs latency and accuracy runs on our own data."],
             ["W7", "Dec 15–19", "End-to-end benchmark, prove ≤10k tokens per repeat ticket, hardening, docs",
              "Token savings must be measured on the same tickets with and without memory, several runs each, to remove noise."],
             ["Buffer", "Dec 22–24", "Slip recovery", "Covers provider outages, review delays, and unknown repo issues."]],
            [0.09, 0.13, 0.36, 0.42], bold_first_col=True),
      Spacer(1, 6),
      P("Why 7 weeks when the spec says 36 hours", h2),
      ] + bullets([
          "The spec's 36 h (≈4.5 days) covers only RIDGE-01 to RIDGE-05, and counts coding hours only.",
          "It does not include: per-agent sandboxes, session IDs with resume/fork, the Router and Auditor roles, OKF format work, or the ranker research.",
          "Agent systems need test runs on real tickets. Each run takes minutes and costs tokens, and results vary between runs.",
          "Research work (benchmarks, model training, evaluation) has no fixed coding time; it depends on results.",
          "With <b>two engineers</b>, W2 and W3 run in parallel. The MVP then moves to about <b>Dec 12</b>.",
      ])

# ---------- VM ----------
s += [PageBreak(), P("4. Virtual machine requirements", h1),
      P("Why we need a VM at all when the AI runs on APIs", h2),
      P("The LLM 'thinking' runs on external APIs, so we need <b>no GPU</b>. But every Worker executes real work on our machine, inside its own sandbox:"),
      ] + bullets([
          "<font name='DVM'>pnpm install</font> and the TypeScript build of the target repo.",
          "The <font name='DVM'>vitest</font> test suite, 2–3 times per ticket: fail first, pass after the fix, pass again after the rebase.",
          "Headless Chromium, when a bug needs a browser to reproduce.",
          "A separate container per agent (gVisor now, Kata/Firecracker later), plus a git worktree with its own <font name='DVM'>node_modules</font>.",
          "Shared services: local Supabase/Postgres, SQLite indexes, and the CPU reranker.",
      ]) + [
      P("Cost of one Worker (estimate; we measure the real number in W2)", h2),
      table([["Activity", "CPU", "RAM", "Disk"],
             ["Install + TypeScript build", "1–2 vCPU (bursts)", "1–2 GB", "2–3 GB (worktree + node_modules)"],
             ["vitest run (limited to 2 threads)", "2 vCPU", "1–2 GB", "—"],
             ["Headless Chromium (only some tickets)", "0.5–1 vCPU", "0.5–1 GB", "~0.5 GB"],
             ["Sandbox overhead (gVisor)", "small", "~0.1 GB", "shared image layers"],
             ["Logs (trajectory.jsonl, session.jsonl)", "—", "—", "50–200 MB per ticket"],
             ["<b>Budget per Worker</b>", "<b>~2 vCPU</b>", "<b>~3–4 GB</b>", "<b>~8–10 GB</b>"]],
            [0.40, 0.18, 0.15, 0.27]),
      Spacer(1, 4),
      P("Disk often fills before CPU does: each worktree has its own dependencies, and Docker images and archived logs grow every day.", small),

      P("Three tiers", h2),
      table([["", "A. Starter (from zero)", "B. Mid-range self-hosted test", "C. Full production"],
             ["Purpose", "Learn and build: first sandboxes, managers, memory store", "Run the real swarm on real tickets; benchmarks", "Serve the whole team every day"],
             ["Machine", "<b>1 VM: 4 vCPU · 16 GB RAM · 150 GB SSD</b>", "<b>1 VM: 8 vCPU · 32 GB RAM · 300 GB NVMe</b>, with /dev/kvm", "<b>Split cluster</b> (see below)"],
             ["Workers at once", "1–2", "3–4", "8–16 (add nodes to grow)"],
             ["Sandbox type", "Rootless Docker + gVisor (no KVM needed)", "gVisor + trial of Kata / Firecracker", "Kata or Firecracker microVMs"],
             ["Database", "Local Supabase in Docker", "Self-hosted Supabase on the same VM", "Managed Supabase or a dedicated DB VM"],
             ["Weeks", "W1–W3", "W4–W7", "After the MVP"],
             ["GPU", "None", "None (rent one by the hour only if tiny-model training is too slow)", "None"]],
            [0.15, 0.27, 0.29, 0.29], bold_first_col=True),
      Spacer(1, 6),
      P("Why each size", h2),
      P("<b>A. Starter, 4 vCPU / 16 GB / 150 GB.</b> One Worker needs ~2 vCPU and ~4 GB. Local Supabase in Docker needs ~2–3 GB. "
        "The harness, Router, and Orchestrator need ~2 GB. That leaves room for a second Worker. 150 GB holds repo clones, "
        "Docker images, two worktrees, and a few weeks of logs. The current machine has the CPU and RAM but only 14 GB free disk, "
        "so it qualifies only after the disk is enlarged or cleaned."),
      P("<b>B. Mid-range, 8 vCPU / 32 GB / 300 GB with KVM.</b> 3–4 Workers × (2 vCPU, 4 GB) = 6–8 vCPU and 12–16 GB, plus self-hosted Supabase (~4 GB), "
        "the reranker (~2 GB), and OS headroom. KVM lets us test microVM sandboxes before production. 300 GB holds four worktrees "
        "at once, benchmark datasets, and model files."),
      P("<b>C. Production, split cluster.</b> Untrusted agent code must not share a machine with the database and credentials. "
        "Workers also scale on their own. So production uses three parts:"),
      table([["Part", "Size", "Runs"],
             ["Control plane", "4 vCPU · 16 GB · 100 GB", "Router, Orchestrator, Auditor, Curator, SDK API, reranker"],
             ["Database", "Managed Supabase, or 4 vCPU · 16 GB · 200 GB", "Tier 3 global memory, tickets, session index"],
             ["Sandbox node (×1–2, add more to grow)", "16 vCPU · 64 GB · 500 GB NVMe, with KVM", "6–8 Worker microVMs per node"],
             ["Object storage", "Pay per GB", "Archived trajectories and session logs"]],
            [0.28, 0.34, 0.38], bold_first_col=True),
      Spacer(1, 4),
      P("Rule: start at tier A, measure real CPU and RAM per Worker in W2, and move up only when the measurements show a need. "
        "Prices depend on the provider; get quotes once the tier is chosen.", callout),
      ]

# ---------- Next steps ----------
s += [P("5. Next steps and open questions", h1),
      ] + bullets([
          "Revoke the GitHub token used in this session.",
          "Choose a provider and order the tier A VM (check that tier B sizes offer /dev/kvm).",
          "Confirm lesson storage: one OKF file per lesson in <font name='DVM'>.ridge/memory/lessons/</font> replaces <font name='DVM'>lessons.jsonl</font>.",
          "Name the owner who labels the eval set from old tickets.",
          "Decide which LLM providers and subscriptions Workers use (links to Task 2, the Harness Router).",
          "Start W1: write ADRs and build the eval set.",
      ]) + [
      Spacer(1, 6),
      P("Sources: Google Cloud OKF coverage (searchenginejournal.com, the-decoder.com, agentic-ai.readthedocs.io); "
        "ACE paper arXiv 2510.04618; Redis 2026 reranker overview; Helix self-hosted sandboxes; Kubernetes Agent Sandbox docs; "
        "reference repos listed in CLAUDE.md §10.", small),
      ]

doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title="agent-core Session Report", author="Aigerdata", subject="Research summary, timeline, VM sizing")
doc.build(s, onFirstPage=footer, onLaterPages=footer)
print("ok", out)
