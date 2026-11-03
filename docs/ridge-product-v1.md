# Ridge — Issue Board (v1)

> Copy of the current `Aigerdata/ridge` product .md (README), as shared by the user on 2026-11-03.

Internal kanban issue board. Frontend: Vite/React on Cloudflare Pages.
Backend: Supabase (Postgres + Auth + Storage + Realtime + Edge Functions).
UI adapted from [Multica](https://github.com/multica-ai/multica) (Apache-2.0, see NOTICE).

Spec: `/home/dev1/aigerdata/ai-office-ecosystem-design.md`. Deploy runbook: see bottom of this file.

## Layout

- `board/` — Vite + React SPA (the kanban). `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm typecheck`.
- `supabase/` — migrations, seed, edge functions (`report` = programmatic issue intake).
- `docs/superpowers/plans/` — the implementation plan this was built from.

## Deploy

### Supabase (once)
1. Create a project at supabase.com (e.g. region ap-south-1).
2. `npx supabase login` · `npx supabase link --project-ref <ref>`
3. `npx supabase db push` (applies migrations) — then run `supabase/seed.sql` in the SQL editor.
4. `npx supabase secrets set REPORT_TOKEN=<random>` · `npx supabase functions deploy report`
5. Auth → Sign In / Up: keep Email enabled, **disable new user signups**; add internal users manually (Auth → Add user).

### Cloudflare Pages (git integration)
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `Aigerdata/ridge`.
2. Build settings: **Root directory `board`**, build command `pnpm build`, output directory `dist`.
3. Environment variables (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (Vite inlines them at build time).
4. Supabase → Auth → URL Configuration: add the `*.pages.dev` (and custom) URL as site/redirect URL.

Manual alternative: `cd board && pnpm build && npx wrangler pages deploy dist --project-name ridge`.

### Local dev
`npx supabase start` (needs docker access) → copy API URL + anon key into `board/.env.local`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) → create a user in Studio (http://127.0.0.1:54323)
→ `pnpm -C board dev`.

DB trigger integration tests (local stack running):
`cd board && SUPABASE_LOCAL=1 SUPABASE_SERVICE_ROLE_KEY=<key> pnpm vitest run src/test/db.integration.test.ts`

### Programmatic intake (`report` function)
```bash
curl -X POST "$SUPABASE_URL/functions/v1/report" \
  -H "x-report-token: $REPORT_TOKEN" -H "content-type: application/json" \
  -d '{"project_key":"GEN","title":"smoke from curl","priority":"high"}'
```
