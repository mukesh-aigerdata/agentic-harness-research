Bug report (log #243) - SAP document numbers disappear after a resubmit (backend, `app/`).

Payment request PAY-NPM0026100009 posted its JK/KR/AB documents to S/4. It was then sent
back and resubmitted. After the resubmit, the request card shows no SAP document numbers.

The "stale document" filter in `app/src/s4-write/stale-docs.ts` (`isStaleSapDoc` /
`activeSapDocs`) hides every row whose last attempt predates the latest submit. The
re-validation reused the existing documents without a new attempt, so all rows were hidden.

Expected: only an attempt that left nothing in S/4 can be stale. A row that is `posted`,
a row that is `pending` (a clearing in flight), or any row that carries an `sapDocNumber`
must always stay on the card. Failed rows from before the latest submit stay hidden.

Run backend tests with `cd app && npx tsx --test test/<file>.test.ts`.
Do not commit. Do not push.
