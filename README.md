# Climbing Program

A coach prescribes individualised 13-week sport-climbing programs (12 weeks + deload) to a
small, fixed group of athletes. Athletes benchmark (MVC + Critical Force Test), schedule their
week by drag-and-drop against a hard rules engine, log strength sessions, and watch their CFT
decay curves move between baseline and retest. The coach sees everything, read-only.

- **Backend:** Supabase (Postgres + Auth + RLS + Storage) — no custom server
- **Frontend:** React 18 + Vite + TypeScript + Tailwind, `dnd-kit` scheduling, Recharts graphs
- **Hosting:** GitHub Pages via GitHub Actions
- **Domain engine:** framework-free `src/domain/` (program generator, progression engine,
  scheduling validator, CFT parser) with Vitest coverage — this is the part that matters

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

`npm test` runs the domain unit tests (47 tests; no Supabase needed).

## Supabase setup (one-time)

1. Create a project at [supabase.com](https://supabase.com). Note the **Project URL** and
   **anon key** (Project Settings → API) — these are the two env vars.
2. **Apply the migration.** Either:
   - `supabase link --project-ref <ref> && supabase db push`, or
   - paste `supabase/migrations/0001_init.sql` into the SQL editor and run it.
   It creates all tables, enums, constraints, **RLS policies**, and the private `cft-files`
   storage bucket with per-user folder policies. Migration order: files in
   `supabase/migrations/` sorted by filename (only one exists today).
3. **Create the three auth users** (Authentication → Users → Add user, "auto-confirm" on):
   Ross (coach + athlete), Jade, Maks. Email + password.
4. **Seed the athlete rows:** edit the placeholder emails in `supabase/seed.sql` to match the
   accounts you just created, then run it in the SQL editor. It links each auth user to an
   `athletes` row with the right role flags and prints the 3 rows as a sanity check.
5. Auth settings: password sign-in is all the app uses, so no redirect URL setup is strictly
   required. If you later enable magic links, add your Pages URL
   (`https://<user>.github.io/<repo>/`) to Authentication → URL Configuration → Redirect URLs —
   the app uses `HashRouter` and the implicit auth flow, so tokens survive the Pages subpath.

## Deploy (GitHub Pages)

1. Push this repo to GitHub with default branch `main`.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Repo → Settings → Secrets and variables → Actions: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
4. Push to `main`. The workflow runs the domain tests, builds with
   `VITE_BASE=/<repo-name>/` (derived automatically), and deploys.

The anon key is public by design; every data rule is enforced by Postgres RLS, not the client.

## How the program works

- **Benchmark (round 1)** — bodyweight, MVC total load per grip (7s hang, 20 mm edge), and 4
  CFT JSON files (grip × hand, explicitly assigned to slots — the file's `hand` field only
  triggers a mismatch warning, never slot inference). Saving generates the full 13-week
  program. Training load per grip = **90% of MVC total load** (bodyweight + added weight);
  the UI shows the resulting added weight, or an **assisted/pulley** figure when the training
  load is below bodyweight. Loads display rounded to 0.5 kg but are stored unrounded.
- **Strength (weeks 1–10, 1×/wk)** — 8 sets (4 per grip), 1 rep × 7 s, 5 min rest. A grip's
  load moves up by `athletes.strength_progression_kg` (default **+2.0 kg**, tunable per athlete
  in the DB without a redeploy) only when **both** sessions of the just-finished fortnight were
  clean for that grip. Failed sets or silence (unlogged sessions) → hold. Never regresses.
  Progression stops entirely at week 11. Every fortnight's per-grip load is persisted to
  `strength_loads` with `progressed`/`hold_reason` so athlete and coach can see why it moved
  or didn't.
- **Aerobic (weeks 1–12)** — the app prescribes only the zone (easy, continuous, no pump).
  Baseline grade/length/TUT is recorded in weeks 1–2; every new fortnight the app prompts to
  bump exactly ONE variable (fixed calendar, no completion gate). Extra aerobic sessions are
  unlimited, subject to scheduling rules.
- **Power endurance (weeks 9–12)** — guidance text only, nothing tracked beyond a done-tick.
- **Week 13 (deload)** — unstructured easy climbing + a prompt to run the retest (round 2),
  which overlays the round-1 CFT curves and states the CF delta.

## Scheduling rules (validator, not auto-scheduler)

Enforced at drop time by `src/domain/scheduling.ts` (pure function
`validatePlacement(currentPlacements, candidate, windowContext)`), evaluated over a rolling
window that includes the adjacent weeks — rules 1 and 3 cross week boundaries:

1. **Block** — strength requires a completely session-free day immediately before it (both
   directions: you also can't drop anything onto the day before an existing strength session).
2. **Hint** — aerobic the day after strength is allowed and actively encouraged.
3. **Block** — max 3 consecutive climbing days; same-day sessions count as one climbing day.
4. Extra aerobic sessions: unlimited, but subject to rules 1–3.
5. **Block** — extra strength sessions, no exceptions, no override.
6. Nothing is auto-rescheduled; unplaced sessions simply lapse at the end of the week.

## RLS: proving athletes can't read each other's rows

Policies live in `supabase/migrations/0001_init.sql`. All tables key access off
`athletes.user_id = auth.uid()` (via `security definer` helpers) with a coach read-everything
clause; writes are owner-only (coach is read-only in v1), and a trigger blocks role-flag
self-promotion through the API.

Manual check (run once after seeding):

1. In the SQL editor:
   ```sql
   -- Impersonate Jade (get her user id from auth.users)
   select set_config('request.jwt.claims',
     json_build_object('sub', '<jade-user-uuid>', 'role', 'authenticated')::text, true),
     set_config('role', 'authenticated', true);
   select count(*) from sessions;            -- only Jade's rows
   select count(*) from athletes;            -- 1 row (her own)
   ```
2. Or via the API: sign in as Jade in the app, open dev tools, and run
   `await supabase.from('sessions').select('*')` — every returned row has Jade's
   `athlete_id`. Repeat signed in as Maks. Signed in as Ross (coach), all athletes' rows are
   visible but `update`/`insert` against another athlete's rows returns zero rows affected /
   an RLS error.
3. Storage: as Jade, `supabase.storage.from('cft-files').list('<maks-user-id>')` returns empty.

## Project layout

```
supabase/migrations/0001_init.sql   schema + constraints + RLS + storage policies
supabase/seed.sql                   3 athlete profiles (edit emails first)
src/domain/                         pure domain engine + tests (no React, no Supabase)
src/lib/                            supabase client, typed data access, auth context
src/pages/                          Onboarding/Retest, WeekBoard, StrengthSession,
                                    Progress, CoachDashboard, CoachAthlete, Login
src/components/                     layout, CFT decay chart, load history
.github/workflows/deploy.yml        tests + build + Pages deploy on push to main
```

## Touch drag

The week board uses `dnd-kit` with both `PointerSensor` (6 px activation distance) and
`TouchSensor` (150 ms hold) and `touch-none` on drag handles, so dragging works on phones
without hijacking scroll. Verify on a real device after deploying: press-hold a session card,
drag onto a day; invalid drops flash the day red and explain why.
