-- Athletes can already delete their own sessions and benchmarks; the
-- "start over" reset also needs to clear program weeks, strength loads and
-- aerobic progressions.
create policy program_weeks_delete_own on public.program_weeks
  for delete using (athlete_id = public.own_athlete_id());

create policy strength_loads_delete_own on public.strength_loads
  for delete using (athlete_id = public.own_athlete_id());

create policy aerobic_delete_own on public.aerobic_progressions
  for delete using (athlete_id = public.own_athlete_id());
