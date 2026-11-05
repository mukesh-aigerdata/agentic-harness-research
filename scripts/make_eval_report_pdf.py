"""Build docs/harness-eval-report.pdf: DSH vs Pi on 3 real scg-cash-management bug fixes.

Usage: .venv-pdf/bin/python scripts/make_eval_report_pdf.py docs/harness-eval-report.pdf
All numbers come from eval-logs/ (runs 20261105-092925, -093233, -093306, -100542).
"""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, Preformatted)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

out = sys.argv[1]
F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVM", F + "DejaVuSansMono.ttf"))
registerFontFamily("DV", normal="DV", bold="DVB", italic="DV", boldItalic="DVB")

INK = colors.HexColor("#1f2937")
ACCENT = colors.HexColor("#1d4ed8")
MUTED = colors.HexColor("#6b7280")
HEAD_BG = colors.HexColor("#e8eefc")
ROW_ALT = colors.HexColor("#f7f8fa")
GRID = colors.HexColor("#d1d5db")
PASS_C = colors.HexColor("#047857")
FAIL_C = colors.HexColor("#b91c1c")

ss = getSampleStyleSheet()
body = ParagraphStyle("body", parent=ss["Normal"], fontName="DV", fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=4)
small = ParagraphStyle("small", parent=body, fontSize=8.5, leading=11.5)
cell = ParagraphStyle("cell", parent=body, fontSize=8.3, leading=10.8, spaceAfter=0)
cellb = ParagraphStyle("cellb", parent=cell, fontName="DVB")
h1 = ParagraphStyle("h1", parent=body, fontName="DVB", fontSize=15, leading=19, textColor=ACCENT, spaceBefore=10, spaceAfter=6)
h2 = ParagraphStyle("h2", parent=body, fontName="DVB", fontSize=11.5, leading=15, textColor=INK, spaceBefore=8, spaceAfter=4)
h3 = ParagraphStyle("h3", parent=body, fontName="DVB", fontSize=10, leading=13, textColor=ACCENT, spaceBefore=6, spaceAfter=2)
title = ParagraphStyle("title", parent=body, fontName="DVB", fontSize=22, leading=27, textColor=INK, spaceAfter=4)
sub = ParagraphStyle("sub", parent=body, fontSize=11, leading=15, textColor=MUTED, spaceAfter=10)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=2)
callout = ParagraphStyle("callout", parent=body, backColor=colors.HexColor("#fff7e6"), borderColor=colors.HexColor("#f0c36d"),
                         borderWidth=0.6, borderPadding=6, spaceBefore=6, spaceAfter=10)
good = ParagraphStyle("good", parent=callout, backColor=colors.HexColor("#ecfdf5"), borderColor=colors.HexColor("#6ee7b7"))
bad = ParagraphStyle("bad", parent=callout, backColor=colors.HexColor("#fef2f2"), borderColor=colors.HexColor("#fca5a5"))
code = ParagraphStyle("code", parent=body, fontName="DVM", fontSize=7.4, leading=9.4, backColor=colors.HexColor("#f3f4f6"),
                      borderPadding=5, spaceBefore=3, spaceAfter=8)

W = A4[0] - 36 * mm


def P(t, s=body):
    return Paragraph(t, s)


def bl(items):
    return [Paragraph(i, bullet, bulletText="•") for i in items]


def res(t):
    c = PASS_C if t.startswith("PASS") else FAIL_C if t.startswith(("FAIL", "STOPPED")) else INK
    return Paragraph(f'<font color="{c.hexval().replace("0x", "#")}"><b>{t}</b></font>', cell)


def table(rows, widths, header=True, result_col=None):
    data = []
    for r_i, r in enumerate(rows):
        line = []
        for c_i, v in enumerate(r):
            if isinstance(v, str):
                if r_i == 0 and header:
                    v = Paragraph(v, cellb)
                elif result_col is not None and c_i == result_col:
                    v = res(v)
                else:
                    v = Paragraph(v, cell)
            line.append(v)
        data.append(line)
    t = Table(data, colWidths=[w * W for w in widths], repeatRows=1 if header else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.4, GRID), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
          ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if header:
        st.append(("BACKGROUND", (0, 0), (-1, 0), HEAD_BG))
    for i in range(1 if header else 0, len(data)):
        if i % 2 == 0:
            st.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(st))
    return t


def snippet(txt):
    return Preformatted(txt.strip("\n"), code)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("DV", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Aigerdata · Harness evaluation: DSH vs Pi on scg-cash-management · 2026-11-05")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


S = []

# ---------------------------------------------------------------- Cover + summary
S += [P("Harness Evaluation Report", title),
      P("DeepSeek Harness (DSH) vs Pi on 3 real bug fixes from Aigerdata/scg-cash-management", sub),
      table([["Item", "Value"],
             ["Date", "2026-11-05"],
             ["Repository", "Aigerdata/scg-cash-management (1,504 commits, SAP BTP Node backend + React/Vite frontend)"],
             ["Harnesses", "DSH <font name='DVM'>@deepseek-ai/dsh 0.2.1-rc.3</font> (headless profile) · Pi <font name='DVM'>0.84.3</font> (print mode)"],
             ["Model", "<font name='DVM'>claude-sonnet-4-6</font> for both harnesses ($3 / 1M input, $15 / 1M output)"],
             ["Tasks", "3 real past bugs: 1 UI change, 1 DB change, 1 backend correction"],
             ["Budget", "$25 limit (Rohith). Spent $7.91 in total, including tests and the rerun."],
             ["Owner", "mukesh-aigerdata, with Claude Code"]], [0.22, 0.78]),
      Spacer(1, 8),
      P("1. Executive summary", h1)]

S += [table([["Harness", "Final accuracy", "Total time", "Total cost", "Tool calls"],
             ["DSH", "PASS 3 / 3", "1,147 s", "$3.5055", "97"],
             ["Pi", "PASS 3 / 3", "653 s", "$1.7078", "61"]],
            [0.16, 0.2, 0.2, 0.2, 0.24], result_col=1),
      Spacer(1, 6)]
S += bl([
    "<b>Both harnesses fixed all 3 bugs</b> after the UI prompt was corrected. Accuracy is a tie on this sample.",
    "<b>Pi was about 2x faster and 2x cheaper.</b> It used 57% of the time and 49% of the cost of DSH. "
    "Both harnesses used the same model, so the gap comes from the harness, not the model.",
    "<b>DSH reads much more context.</b> It read 2.7x to 3.6x more cached tokens per task. Cache reads were the largest part of the cost.",
    "<b>Failed cases are part of this report.</b> In the first full run, both harnesses failed the UI task. "
    "The main cause was a gap in our task prompt, not in the harnesses. Section 6 gives the full detail.",
    "<b>Both harness UI fixes were cleaner than the real human fix.</b> The real fix breaks 6 existing tests. "
    "Both harness fixes pass all 135 tests in the same folder.",
    "<b>The budget guard works.</b> Our cost total matched Pi's own cost report exactly. A forced test of the circuit breaker stopped a live run.",
])
S += [P("<b>Recommendation:</b> Pi is the better base for the agent-core Worker loop on cost and speed. "
        "Accuracy needs a larger task set (20 or more tasks) before the team decides.", callout)]

# ---------------------------------------------------------------- Where the bugs came from
S += [P("2. Where the bugs came from", h1),
      P("<b>We did not write any new bugs.</b> Each task is a real bug that an Aigerdata developer already found and fixed "
        "in the repository history. To make a task, we put the code back to the commit just <i>before</i> the fix. "
        "The harness gets a bug report and must find and fix the bug itself.", callout),
      P("This is the SWE-bench method. It gives real project difficulty and an exact answer key: the tests that the "
        "real developer added with the fix.", body),
      P("How we chose the 3 commits", h2)]
S += bl([
    "We read the fix commits from the last 4 months of history (more than 80 candidates).",
    "Each task must match one of Rohith's categories: UI change, DB change or backend correction.",
    "The fix commit must add or change a test. That test must <b>fail</b> on the old code and <b>pass</b> on the real fix. "
    "We proved this for all 3 tasks before any harness ran.",
    "The fix must be small enough to finish in 20 minutes and under $4 per run.",
])
S += [Spacer(1, 4),
      table([["Category", "Fix commit", "Start commit (before fix)", "Real fix size", "Hidden test"],
             ["UI Change", "b1716e69", "f7365a2b", "1 file, +36 / -15", "ReimbExpenseTab.removeLastBox.test.jsx (vitest, 4 tests)"],
             ["DB Change", "703e4984", "82056613", "3 source files + 8 generated files", "api-clear-advance.test.ts (node:test, 33 tests) + DB column check"],
             ["Backend Correction", "ca44c11b", "027eeb3f", "1 file, +6 / -1", "sap-stale-docs.test.ts (node:test)"]],
            [0.16, 0.12, 0.17, 0.2, 0.35])]

# ---------------------------------------------------------------- Method
S += [P("3. Test method", h1),
      P("3.1 Isolation and safety", h2)]
S += bl([
    "Each task has its own <font name='DVM'>git worktree</font> in <font name='DVM'>eval-worktrees/</font>, checked out at the start commit.",
    "Before every run, the script resets the worktree to the start commit. The reset command first checks that the target is a registered eval worktree.",
    "The scripts contain no <font name='DVM'>rm</font> commands. All paths are literal, and arguments use <font name='DVM'>${VAR:?}</font> guards.",
    "Each harness runs in a systemd scope with a 4 GB RAM cap and a 20-minute timeout. Runs are sequential, so only one harness uses the shared 16 GB VM at a time.",
    "Harnesses get a clean environment: only PATH, HOME and the Anthropic key. They never see the GitHub token. "
    "The key goes in through a file descriptor, so other VM users cannot see it with <font name='DVM'>ps</font>.",
])
S += [P("3.2 Grading", h2)]
S += bl([
    "The harness does not see the hidden test. After the run, the grader restores the real fix's test files. "
    "Then it runs them, so a harness cannot pass by editing or deleting tests.",
    "<b>UI:</b> PASS when the vitest exit code is 0 (all 4 sub-tests pass).",
    "<b>Backend:</b> PASS when the node:test exit code is 0.",
    "<b>DB:</b> PASS when the target test passes, no new test fails, and the generated HANA table "
    "<font name='DVM'>ClearAdvance.hdbtable</font> has the new <font name='DVM'>OSDOCUMENTS</font> column. "
    "3 other tests in that file already fail at both the start commit and the real fix, so the grader allows those 3 only.",
])
S += [P("3.3 Cost tracking and circuit breaker", h2)]
S += bl([
    "Cost comes from each harness's own JSON token log. Pi reports usage on <font name='DVM'>message_end</font>. DSH reports it on <font name='DVM'>step_end</font>.",
    "Prices per 1M tokens: input $3.00, output $15.00, cache write $3.75, cache read $0.30. Cache tokens are billed, so we count them.",
    "A watchdog reads the live log every 5 seconds. It stops a run at $4.00, and it stops the whole evaluation at $25.00 total.",
    "The evaluation also stops when a log has no usage data, so an unknown cost can never pass silently.",
])

# ---------------------------------------------------------------- Results
S += [PageBreak(), P("4. Final results", h1),
      P("Source: <font name='DVM'>docs/EVAL_RESULTS.md</font>. UI rows come from run 20261105-100542 (prompt v2). "
        "DB and backend rows come from run 20261105-093306.", small),
      table([["Task & Category", "Harness", "Accuracy", "Execution Time (s)", "Exact USD Cost"],
             ["log #274 remove last Transportation/Accommodation box (b1716e69) - UI Change", "DSH", "PASS", "671", "$1.7178"],
             ["log #274 remove last Transportation/Accommodation box (b1716e69) - UI Change", "Pi", "PASS", "410", "$0.9780"],
             ["persist OS review documents on ClearAdvance (703e4984) - DB Change", "DSH", "PASS", "345", "$1.2913"],
             ["persist OS review documents on ClearAdvance (703e4984) - DB Change", "Pi", "PASS", "157", "$0.4695"],
             ["log #243 keep posted SAP docs after resubmit (ca44c11b) - Backend Correction", "DSH", "PASS", "131", "$0.4964"],
             ["log #243 keep posted SAP docs after resubmit (ca44c11b) - Backend Correction", "Pi", "PASS", "86", "$0.2603"]],
            [0.46, 0.1, 0.12, 0.16, 0.16], result_col=2),
      Spacer(1, 8),
      P("4.1 Token detail", h2),
      table([["Task", "Harness", "Input", "Output", "Cache write", "Cache read", "Tool calls"],
             ["UI (v2)", "DSH", "40", "14,810", "126,901", "3,398,697", "38"],
             ["UI (v2)", "Pi", "26", "17,448", "91,649", "1,241,778", "24"],
             ["DB", "DSH", "35", "8,254", "97,313", "2,674,721", "36"],
             ["DB", "Pi", "27", "6,059", "41,348", "744,807", "28"],
             ["Backend", "DSH", "21", "6,405", "46,342", "755,024", "23"],
             ["Backend", "Pi", "10", "4,372", "36,448", "193,221", "9"]],
            [0.14, 0.11, 0.1, 0.13, 0.16, 0.2, 0.16]),
      Spacer(1, 4),
      P("Almost all input is served from the prompt cache, so input tokens are close to zero. Cache reads are 22% to 62% of each run's cost. "
        "DSH keeps a larger context per step and runs more steps, which explains most of its extra cost.", small)]

# ---------------------------------------------------------------- Per task
S += [PageBreak(), P("5. Each bug and how each harness handled it", h1)]

# Task 1 UI
S += [P("5.1 UI Change: the last Transportation / Accommodation box cannot be removed (log #274)", h2),
      P("<b>The bug.</b> On the trip reimbursement expense sheet (<font name='DVM'>web/src/components/reimbursement/ReimbExpenseTab.jsx</font>), "
        "the remove guard counted boxes with <font name='DVM'>prev.length &gt; 1</font>. "
        "So the only Transportation box had no remove button, and the only Accommodation box had a disabled one. "
        "A second problem: a saved sheet with no boxes got a new blank box every time it opened.", body),
      P("<b>The real fix (b1716e69).</b> It removes the length guard and always renders an enabled remove button with an "
        "<font name='DVM'>aria-label</font>. It seeds a blank box only when the sheet was never saved, meaning no expense array has items.", body),
      P("<b>Hidden test (4 sub-tests):</b> remove the only Transportation box; remove the only Accommodation box "
        "(button name <font name='DVM'>tooltip.removeLine</font>); a saved sheet opens with no blank boxes; a never-saved sheet opens with one of each.", body),
      P("How each harness handled it (prompt v2, final run)", h3),
      table([["", "DSH", "Pi"],
             ["Result", "PASS 4 / 4", "PASS 4 / 4"],
             ["Time / cost", "671 s / $1.7178 (38 tool calls)", "410 s / $0.9780 (24 tool calls)"],
             ["Approach", "Added a <font name='DVM'>sheetIsSaved</font> flag over the 5 expense arrays. Removed the length guard in both remove functions. "
                          "Added <font name='DVM'>aria-label</font> to both buttons.",
              "Same design: a <font name='DVM'>sheetIsSaved</font> flag over the 5 arrays, unconditional filter on remove, and labelled buttons."],
             ["Side effects", "Updated the existing test <font name='DVM'>ReimbExpenseTab.costObjectDefaults.test.jsx</font> to give its fixture a saved Transportation box.",
              "Updated the same existing test in the same way."],
             ["Wider check", "All 135 tests in the reimbursement test folder pass.", "All 135 tests in the reimbursement test folder pass."]],
            [0.16, 0.42, 0.42]),
      Spacer(1, 4),
      P("<b>Finding:</b> the real human fix fails 6 of those 135 tests, because it breaks <font name='DVM'>costObjectDefaults</font> "
        "and the developer did not update that test in the same commit. Both harnesses saw the break and updated the test fixture. "
        "So on this task, both harness fixes were more complete than the real commit.", good),
      snippet("""
// Both harnesses (prompt v2) — core of the change in ReimbExpenseTab.jsx
const sheetIsSaved =
  (Array.isArray(record?.transportations) && record.transportations.length > 0) ||
  (Array.isArray(record?.perdiems) && record.perdiems.length > 0) ||
  (Array.isArray(record?.accommodations) && record.accommodations.length > 0) ||
  (Array.isArray(record?.tripExpenses) && record.tripExpenses.length > 0) ||
  (Array.isArray(record?.entertainmentExpenses) && record.entertainmentExpenses.length > 0);
...
if (existing.length === 0) return sheetIsSaved ? [] : [defaultAccom()];
const removeAccommodation = (idx) => setAccommodations((prev) => prev.filter((_, i) => i !== idx));
""")]

# Task 2 DB
S += [KeepTogether([P("5.2 DB Change: OS review documents are lost on a clear advance", h2)]),
      P("<b>The bug.</b> In the clear-advance approval flow, the OS reviewer uploads supporting documents and sends them with the approve action "
        "(<font name='DVM'>POST /ClearAdvanceService/approve</font>, field <font name='DVM'>osDocuments</font>). "
        "The ClearAdvance table had no column for them, and the service did not save them. After a reload, the documents were gone.", body),
      P("<b>The real fix (703e4984).</b> It adds <font name='DVM'>osDocuments: { type: json, nullable: true }</font> to "
        "<font name='DVM'>app/spec/domain/clear-advance.domain.yaml</font> and regenerates <font name='DVM'>app/generated/</font>, "
        "which adds the <font name='DVM'>\"OSDOCUMENTS\" NCLOB</font> column to <font name='DVM'>ClearAdvance.hdbtable</font>. "
        "It also stores the array when the OS step approves.", body),
      P("<b>Why it is a real DB task:</b> the data model is generated. The harness must find the domain spec, change the schema and run the "
        "AppForge code generator (<font name='DVM'>pnpm gen</font>). Then it must change the service.", body),
      P("How each harness handled it", h3),
      table([["", "DSH", "Pi"],
             ["Result", "PASS (target test passes, no new failures, column present)", "PASS (target test passes, no new failures, column present)"],
             ["Time / cost", "345 s / $1.2913 (36 tool calls)", "157 s / $0.4695 (28 tool calls)"],
             ["Schema", "Added the <font name='DVM'>osDocuments</font> json column to the domain spec.", "Added the same column to the domain spec."],
             ["Codegen", "Ran <font name='DVM'>pnpm gen</font>. The same 8 generated files changed as in the real fix.", "Ran <font name='DVM'>pnpm gen</font>. The same 8 generated files changed as in the real fix."],
             ["Service", "Builds <font name='DVM'>extra</font> with <font name='DVM'>osDocuments</font> when "
                         "<font name='DVM'>step.reviewerType === 'os'</font> and the body has an array.",
              "Sets <font name='DVM'>extra['osDocuments']</font> under the same condition."],
             ["Own test", "Wrote a new test file <font name='DVM'>api-clear-advance-os.test.ts</font> (74 lines).",
              "Wrote a new test file <font name='DVM'>api-clear-advance-os.test.ts</font> (56 lines)."]],
            [0.16, 0.42, 0.42]),
      Spacer(1, 4),
      P("Both harnesses matched the real fix closely. One difference: the shared decision handler serves both approve and reject. "
        "The real fix stores the documents only when <font name='DVM'>kind === 'approve'</font>. Both harness fixes check only the OS step, "
        "so they would also store documents sent with an OS <i>reject</i>. The hidden test does not cover a reject, so both still pass. "
        "A code reviewer would ask for the extra condition.", small)]

# Task 3 Backend
S += [P("5.3 Backend Correction: posted SAP document numbers disappear after a resubmit (log #243)", h2),
      P("<b>The bug.</b> Payment request PAY-NPM0026100009 posted its JK/KR/AB documents to S/4. "
        "Then it was sent back and resubmitted. A \"stale document\" filter in <font name='DVM'>app/src/s4-write/stale-docs.ts</font> "
        "hid every row whose last attempt was older than the latest submit. The re-validation reused the posted documents without a new attempt, "
        "so the card showed no SAP document numbers.", body),
      P("<b>The real fix (ca44c11b).</b> Only an attempt that left nothing in S/4 can be stale. Rows that are "
        "<font name='DVM'>posted</font> or <font name='DVM'>pending</font>, or that have an <font name='DVM'>sapDocNumber</font>, always stay visible.", body),
      P("How each harness handled it", h3),
      table([["", "DSH", "Pi"],
             ["Result", "PASS", "PASS"],
             ["Time / cost", "131 s / $0.4964 (23 tool calls)", "86 s / $0.2603 (9 tool calls)"],
             ["Approach", "Added an early <font name='DVM'>return false</font> in <font name='DVM'>isStaleSapDoc</font> for posted/pending rows "
                          "and for a non-blank <font name='DVM'>sapDocNumber</font> (trims whitespace, like the real fix).",
              "Added the same early return. Its document-number check is <font name='DVM'>!= null &amp;&amp; !== ''</font>, "
              "so a whitespace-only number would count as present. The real fix trims it. No test covers that case."],
             ["Own test", "Added a regression test to <font name='DVM'>sap-stale-docs.test.ts</font>.", "Added a regression test to <font name='DVM'>sap-stale-docs.test.ts</font>."]],
            [0.16, 0.42, 0.42]),
      Spacer(1, 4),
      snippet("""
// Real fix (ca44c11b)
if (['posted', 'pending'].includes(String(row['status'] ?? ''))
    || String(row['sapDocNumber'] ?? '').trim()) return false;

// DSH
const status = String(row['status'] ?? '');
if (status === 'posted' || status === 'pending') return false;
if (String(row['sapDocNumber'] ?? '').trim()) return false;

// Pi
if (row['status'] === 'posted' || row['status'] === 'pending' ||
    (row['sapDocNumber'] != null && row['sapDocNumber'] !== '')) { return false; }
""")]

# ---------------------------------------------------------------- Failed cases
S += [PageBreak(), P("6. Failed cases and problems found", h1),
      P("This section records every failure and problem during the evaluation, including our own mistakes.", body),
      P("6.1 UI task, prompt v1: both harnesses FAILED (run 20261105-093306)", h2),
      table([["", "DSH", "Pi"],
             ["Result", "FAIL (2 of 4 sub-tests passed)", "FAIL (2 of 4 sub-tests passed)"],
             ["Time / cost", "579 s / $1.3837 (33 tool calls)", "389 s / $0.8453 (28 tool calls)"],
             ["Passed", "Remove the only Transportation box; never-saved sheet opens with one box of each.",
              "Remove the only Transportation box; never-saved sheet opens with one box of each."],
             ["Failed 1", "Remove the only Accommodation box: the test looks for a button named <font name='DVM'>tooltip.removeLine</font>. "
                          "The button had no matching accessible name.",
              "Same test failed. Pi labelled the Accommodation button <font name='DVM'>common.remove</font> (\"Remove\"), copying the Transportation label."],
             ["Failed 2", "Saved sheet opens without blank boxes: DSH treated a sheet as saved only when the <font name='DVM'>transportations</font> "
                          "or <font name='DVM'>accommodations</font> key existed. The test's saved sheet has only a <font name='DVM'>tripExpenses</font> item, so a blank box was still added.",
              "Same test failed, for the same reason. Pi also treated a sheet as saved only when the <font name='DVM'>transportations</font> or "
              "<font name='DVM'>accommodations</font> array existed. A missing key meant \"never saved\", so a blank box was still added."]],
            [0.14, 0.43, 0.43], result_col=None),
      Spacer(1, 4),
      P("<b>Root cause: our prompt, not the harnesses.</b> Both harnesses failed the same 2 sub-tests, which pointed at the task text. "
        "Prompt v1 gave the accessible name only for the Transportation button. It also said only \"a sheet that was already saved\", "
        "with no rule for what \"saved\" means. The hidden test needs <font name='DVM'>tooltip.removeLine</font> for the Accommodation button, "
        "and it counts a sheet as saved when any of 5 expense arrays has items. No harness could know the button name from the bug report.", bad),
      P("<b>Correction (prompt v2).</b> We added the two interface details the test checks: both button names, and the saved-sheet rule. "
        "We did not describe the code change. In the rerun, both harnesses passed 4 / 4. Prompt v1 is kept in "
        "<font name='DVM'>eval-logs/20261105-093306/ui-b1716e69.prompt-v1.md</font>.", body),
      P("<b>Lesson for the agent-core eval set:</b> a hidden-test task must state every interface name that the test looks up "
        "(labels, field names, routes), or the task measures guessing, not engineering.", callout)]

S += [P("6.2 Circuit breaker test: DSH run STOPPED on purpose (run 20261105-093233)", h2),
      P("To prove the breaker works on a live run, we ran DSH on the backend task with a $0.05 per-run limit and a $0.10 total limit.", body)]
S += bl([
    "Result: STOPPED after 20 s at $0.1161. The script killed the systemd scope, aborted the evaluation with exit code 2, and wrote the reason to the results file.",
    "No eval scope and no <font name='DVM'>dsh</font> process remained after the stop.",
    "It overshot the limit by $0.016, because DSH reports usage only at the end of each step. At a $25 limit, the overshoot is a few cents.",
    "This was an intended failure. It also proved that DSH reached Anthropic through our overlay config.",
])

S += [P("6.3 Problems in our own setup (found and fixed before the scored runs)", h2),
      table([["Problem", "Effect", "Fix"],
             ["The first sandbox plan used <font name='DVM'>git reset --hard</font> at the research repo root.",
              "It could wipe uncommitted research work.", "Resets run only inside verified eval worktrees."],
             ["Requested model <font name='DVM'>claude-3-5-sonnet-20241022</font> is retired (2025-10-28).",
              "Every API call would fail.", "Used <font name='DVM'>claude-sonnet-4-6</font>, which has the same $3 / $15 price."],
             ["<font name='DVM'>.env</font> was not ignored by git, and other users could read it (mode 664).",
              "The API key and GitHub token could be committed or read.", "Added it to <font name='DVM'>.gitignore</font> and set mode 600. It was never committed."],
             ["A setup command used <font name='DVM'>rm</font> with shell variables.",
              "The user stopped it as unsafe.", "Rewrote the scripts with literal paths, <font name='DVM'>${VAR:?}</font> guards and no <font name='DVM'>rm</font>."],
             ["A copied <font name='DVM'>vendor/appforge</font> submodule had a broken <font name='DVM'>.git</font> link.",
              "<font name='DVM'>git status</font> failed in the worktrees.", "Moved the link file aside (no delete) and made the framework copy read-only."],
             ["DB grader searched for <font name='DVM'>osDocuments</font>, but the HANA file writes <font name='DVM'>\"OSDOCUMENTS\"</font>.",
              "The real fix was graded FAIL during verification.", "Made the check case-insensitive. Verification then passed for all 3 tasks."],
             ["<font name='DVM'>(( n )) &amp;&amp; …</font> lines under <font name='DVM'>set -e</font>.",
              "The dry run exited early with no error message.", "Replaced them with <font name='DVM'>if</font> statements."],
             ["Passing the key as an <font name='DVM'>env</font> argument.", "The key would show in <font name='DVM'>ps</font> on the shared VM.",
              "Passed the key through a file descriptor."]],
            [0.36, 0.3, 0.34])]

# ---------------------------------------------------------------- Cost
S += [P("7. Cost: every dollar spent", h1),
      table([["Run ID", "What", "Runs", "Cost"],
             ["20261105-092925", "Step 2: cost check, Pi on the backend task (PASS)", "1", "$0.3506"],
             ["20261105-093233", "Step 2b: circuit breaker test, DSH with $0.10 limit (STOPPED)", "1", "$0.1161"],
             ["20261105-093306", "Full suite, UI prompt v1 (UI FAIL x2, DB PASS x2, backend PASS x2)", "6", "$4.7465"],
             ["20261105-100542", "UI rerun, prompt v2 (PASS x2)", "2", "$2.6958"],
             ["", "<b>Total</b>", "<b>10</b>", "<b>$7.9090</b>"]],
            [0.2, 0.56, 0.08, 0.16]),
      Spacer(1, 4)]
S += bl([
    "That is 32% of Rohith's $25 limit. Each run was counted against the remaining budget: the full suite ran with a $24.50 limit and the rerun with $19.50.",
    "Our parser's total for the Pi check run ($0.3506) matched Pi's own reported cost ($0.35065) exactly.",
    "Cost per solved task on the final scored runs: DSH $1.17, Pi $0.57.",
])

# ---------------------------------------------------------------- Limits + next
S += [P("8. Limits of this evaluation", h1)]
S += bl([
    "<b>Small sample.</b> 3 tasks show the speed and cost trend. They cannot show an accuracy difference. Both harnesses scored 3 / 3.",
    "<b>One run per task.</b> LLM agents are not deterministic. A second run can give a different time, cost or result.",
    "<b>Default settings.</b> Both harnesses ran with default thinking and tools. We did not tune either one.",
    "<b>No project context files.</b> Pi ran with <font name='DVM'>--no-context-files</font> so it would not load our research <font name='DVM'>CLAUDE.md</font>. "
    "Neither harness read the repo's own <font name='DVM'>CLAUDE.md</font> on purpose.",
    "<b>Process sandbox only.</b> The systemd scope limits RAM and time. It does not block file access outside the worktree. "
    "The agent-core design uses gVisor containers for that.",
    "<b>OpenCode was not tested.</b> It was in the first plan, but Rohith's scope named DSH and Pi.",
])
S += [P("9. Next steps", h1)]
S += bl([
    "Grow the set to 20 or more tasks from <font name='DVM'>scg-*</font> repos, with 2 runs per task. Estimated cost: $30 to $45 at today's rate. This needs a new budget approval.",
    "Check each new prompt against its hidden test before any paid run, using the 6.1 lesson.",
    "Add OpenCode as a third harness. The script needs one new entry in <font name='DVM'>harness_cmd</font> and <font name='DVM'>cost.mjs</font>.",
    "Feed the findings into the agent-core ADRs: Pi-style lean context for Workers, and a cost watchdog in SessionManager.",
])

# ---------------------------------------------------------------- Appendix
S += [P("Appendix A. Files and how to rerun", h1),
      table([["Path", "Purpose"],
             ["run_eval.sh", "Runs the harnesses, grades them, tracks cost, writes docs/EVAL_RESULTS.md"],
             ["eval/lib.sh", "Task table, literal paths, worktree guard, safe reset, graders"],
             ["eval/setup_worktrees.sh", "Creates worktrees at start commits, installs deps, --verify proves each grader"],
             ["eval/cost.mjs", "Sums tokens from Pi / DSH JSON logs and prices them"],
             ["eval/prompts/*.md", "The bug reports given to the harnesses (UI is v2)"],
             ["eval/dsh-anthropic.patch.yml", "Routes DSH to Anthropic through its built-in pi-ai adapter"],
             ["eval-logs/&lt;run-id&gt;/", "Raw JSON logs, stderr, grader output and diff for every run"],
             ["docs/EVAL_RESULTS.md", "The final results table"]],
            [0.32, 0.68]),
      Spacer(1, 6),
      snippet("""
eval/setup_worktrees.sh --verify               # $0: reset worktrees, prove graders
DRY_RUN=1 ./run_eval.sh                         # $0: print the plan and empty table
HARNESSES=pi TASK_IDS=be-ca44c11b ./run_eval.sh # one cheap run (~$0.30)
ABORT_AT_USD=25.00 ./run_eval.sh                # full suite (~$5)
""")]

doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title="Harness Evaluation Report: DSH vs Pi", author="Aigerdata")
doc.build(S, onFirstPage=footer, onLaterPages=footer)
print("wrote", out)
