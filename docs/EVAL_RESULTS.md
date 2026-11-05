# Harness Eval Results

- Repo: `Aigerdata/scg-cash-management` · Model: `claude-sonnet-4-6` for both harnesses · Date: 2026-11-05
- Pricing per 1M tokens: input $3.00, output $15.00, cache write $3.75, cache read $0.30
- Budget: abort at $25.00 overall, kill a run at $4.00. RAM cap 4G, timeout 20m per run. Runs are sequential.
- Accuracy: the real fix's hidden tests are restored, then run (vitest for UI, node:test for app). DB also needs the `OSDOCUMENTS` column in `ClearAdvance.hdbtable`.
- Sources: UI rows are from run `20261105-100542` (UI prompt v2). DB and Backend rows are from run `20261105-093306`.

| Task & Category | Harness | Accuracy | Execution Time (s) | Exact USD Cost |
|---|---|---|---|---|
| log #274 remove last Transportation/Accommodation box (b1716e69) - UI Change | DSH | PASS | 671 | $1.7178 |
| log #274 remove last Transportation/Accommodation box (b1716e69) - UI Change | Pi | PASS | 410 | $0.9780 |
| persist OS review documents on ClearAdvance (703e4984) - DB Change | DSH | PASS | 345 | $1.2913 |
| persist OS review documents on ClearAdvance (703e4984) - DB Change | Pi | PASS | 157 | $0.4695 |
| log #243 keep posted SAP docs after resubmit (ca44c11b) - Backend Correction | DSH | PASS | 131 | $0.4964 |
| log #243 keep posted SAP docs after resubmit (ca44c11b) - Backend Correction | Pi | PASS | 86 | $0.2603 |

## Summary per harness

| Harness | Accuracy | Total time (s) | Total cost |
|---|---|---|---|
| DSH | 3 / 3 | 1,147 | $3.5055 |
| Pi | 3 / 3 | 653 | $1.7078 |

Pi solved the same tasks in 57% of the time and at 49% of the cost. Both used the same model, so the difference comes from the harnesses. DSH read 2.7–3.6x more cached context per task.

## Token detail

| Task | Harness | Input | Output | Cache write | Cache read | Steps without usage | Log |
|---|---|---|---|---|---|---|---|
| ui-b1716e69 | DSH | 40 | 14810 | 126901 | 3398697 | 0 | `eval-logs/20261105-100542/ui-b1716e69-dsh.jsonl` |
| ui-b1716e69 | Pi | 26 | 17448 | 91649 | 1241778 | 0 | `eval-logs/20261105-100542/ui-b1716e69-pi.jsonl` |
| db-703e4984 | DSH | 35 | 8254 | 97313 | 2674721 | 0 | `eval-logs/20261105-093306/db-703e4984-dsh.jsonl` |
| db-703e4984 | Pi | 27 | 6059 | 41348 | 744807 | 0 | `eval-logs/20261105-093306/db-703e4984-pi.jsonl` |
| be-ca44c11b | DSH | 21 | 6405 | 46342 | 755024 | 0 | `eval-logs/20261105-093306/be-ca44c11b-dsh.jsonl` |
| be-ca44c11b | Pi | 10 | 4372 | 36448 | 193221 | 0 | `eval-logs/20261105-093306/be-ca44c11b-pi.jsonl` |

## Notes

- **UI prompt v1 was missing details.** It did not name the Accommodation remove button (`tooltip.removeLine`), and it did not say when a sheet counts as saved. Both harnesses failed the same 2 of 4 sub-tests (DSH $1.3837, Pi $0.8453). Prompt v2 adds both details, and both harnesses pass 4/4. The v1 prompt and results are in `eval-logs/20261105-093306/`.
- **All spending, including test runs:**

  | Run | Cost |
  |---|---|
  | Cost check (pi, backend) | $0.3506 |
  | Breaker test (DSH, $0.10 limit) | $0.1161 |
  | Full run with UI v1 | $4.7465 |
  | UI rerun with v2 | $2.6958 |
  | **Total** | **$7.909** |

- **The cost tracker is checked.** Its total for pi matched pi's own cost report exactly ($0.3506). The breaker stopped a live DSH run at its limit and left no processes running.
- **This sample is small.** 3 tasks per harness show the trend in speed and cost, but they cannot measure accuracy differences. Both harnesses scored 3/3.
