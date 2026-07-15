-- Mobility sessions, part 2: give every existing program 2 mobility sessions
-- per week (weeks 1-13). Mobility can be done on any day — the scheduling
-- validator exempts it from every rule. New programs get these rows from the
-- app at generation time; this backfill covers athletes who already onboarded.
-- Idempotent: weeks that already have mobility sessions are skipped.

insert into public.sessions (athlete_id, week_number, type, is_extra)
select w.athlete_id, w.week_number, 'mobility'::session_type, false
from public.program_weeks w
cross join generate_series(1, 2)
where not exists (
  select 1
  from public.sessions s
  where s.athlete_id = w.athlete_id
    and s.week_number = w.week_number
    and s.type = 'mobility'
);
